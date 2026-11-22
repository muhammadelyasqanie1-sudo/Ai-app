import type { Client } from 'pg';
import { createDedicatedDatabaseClient, pool } from '../api/database.ts';

/**
 * Cross-instance live event hub.
 *
 * Transport: PostgreSQL LISTEN/NOTIFY. The platform already requires a real
 * PostgreSQL for every deployment, so multi-instance fan-out needs no new
 * infrastructure: every application instance LISTENs on the shared channel
 * and any instance can NOTIFY it. Notifications are delivered after the
 * publishing transaction commits, which keeps fan-out consistent with the
 * database state that triggered it.
 *
 * Reliability:
 *  - The LISTEN connection is a dedicated client (never pooled, so the lease
 *    cannot be returned to the pool mid-listen).
 *  - Listener failures reconnect with exponential backoff (1s..30s) and the
 *    backoff resets after a healthy (re)connection.
 *  - Without a database the hub degrades to in-process fan-out only
 *    (single-instance mode); this is reported honestly via hubStatus().
 *
 * Payload safety: pg_notify payloads are capped at 8000 bytes. Publishes that
 * exceed the safe budget are sent as `{ kind, truncated: true }` and
 * subscribers refetch authoritative state instead of trusting the payload.
 *
 * Events (initial set):
 *  - 'catalog.updated'  provider/model/catalog state changed; subscribers
 *                       must refetch the capability snapshot.
 *  - 'system.health'    health-relevant state changed (provider health check,
 *                       integration status). Payload: { reason }.
 */

const CHANNEL = 'afg_ai_live_events';
const MAX_NOTIFY_BYTES = 7500; // PostgreSQL hard limit is 8000; keep headroom.

export type LiveEventKind = 'catalog.updated' | 'system.health';

export interface LiveEvent {
  kind: LiveEventKind;
  payload: Record<string, unknown>;
  origin: string;
  at: string;
}

type Listener = (event: LiveEvent) => void;

const listeners = new Set<Listener>();
const instanceOrigin = `inst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

interface HubState {
  listening: boolean;
  connected: boolean;
  reconnectAttempt: number;
  lastError: string | null;
  lastEventAt: string | null;
  received: number;
  published: number;
}

const hubState: HubState = { listening: false, connected: false, reconnectAttempt: 0, lastError: null, lastEventAt: null, received: 0, published: 0 };

let listenerClient: Client | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let stopping = false;

function fanOutLocal(event: LiveEvent) {
  hubState.lastEventAt = event.at;
  hubState.received++;
  for (const listener of listeners) {
    try { listener(event); } catch (error) {
      console.warn('AFG_LIVE_EVENT_LISTENER_ERROR', JSON.stringify({
        error: error instanceof Error ? error.message.slice(0, 200) : 'unknown_error',
      }));
    }
  }
}

function parseNotifyPayload(raw: string | undefined): LiveEvent | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LiveEvent>;
    if (!parsed || (parsed.kind !== 'catalog.updated' && parsed.kind !== 'system.health')) return null;
    return {
      kind: parsed.kind,
      payload: typeof parsed.payload === 'object' && parsed.payload !== null ? parsed.payload as Record<string, unknown> : {},
      origin: typeof parsed.origin === 'string' ? parsed.origin : 'unknown',
      at: typeof parsed.at === 'string' ? parsed.at : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function startListener(): Promise<void> {
  if (stopping || !pool) return;
  const client = createDedicatedDatabaseClient();
  if (!client) return;
  try {
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    listenerClient = client;
    hubState.connected = true;
    hubState.reconnectAttempt = 0;
    hubState.lastError = null;
    client.on('notification', (message: { payload?: string }) => {
      const event = parseNotifyPayload(message.payload);
      if (event) fanOutLocal(event);
    });
    client.on('error', (error: Error) => {
      hubState.connected = false;
      hubState.lastError = error instanceof Error ? error.message.slice(0, 200) : 'unknown_error';
      scheduleReconnect();
    });
    client.on('end', () => {
      if (!hubState.connected) return; // error path already scheduled reconnect
      hubState.connected = false;
      scheduleReconnect();
    });
    console.info('AFG_LIVE_EVENT_HUB_LISTENING', JSON.stringify({ channel: CHANNEL, origin: instanceOrigin }));
  } catch (error) {
    hubState.connected = false;
    hubState.lastError = error instanceof Error ? error.message.slice(0, 200) : 'unknown_error';
    try { await client.end(); } catch { /* already closed */ }
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (stopping || reconnectTimer) return;
  hubState.reconnectAttempt++;
  const delay = Math.min(30_000, 1000 * Math.pow(2, Math.min(hubState.reconnectAttempt - 1, 5)));
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void startListener();
  }, delay);
}

/**
 * Publish a live event to every application instance (including this one).
 * With a database: NOTIFY (transactionally safe). Without one: local
 * fan-out so single-instance deployments still push events.
 */
export async function publishLiveEvent(kind: LiveEventKind, payload: Record<string, unknown> = {}): Promise<void> {
  const event: LiveEvent = { kind, payload, origin: instanceOrigin, at: new Date().toISOString() };
  const serialized = JSON.stringify(event);
  if (pool) {
    try {
      if (Buffer.byteLength(serialized, 'utf8') > MAX_NOTIFY_BYTES) {
        // Too large for NOTIFY: announce a truncated envelope; subscribers refetch.
        await pool.query('SELECT pg_notify($1, $2)', [CHANNEL, JSON.stringify({ ...event, payload: {}, truncated: true })]);
      } else {
        await pool.query('SELECT pg_notify($1, $2)', [CHANNEL, serialized]);
      }
      hubState.published++;
      return;
    } catch (error) {
      hubState.lastError = error instanceof Error ? error.message.slice(0, 200) : 'unknown_error';
      // fall through to local fan-out
    }
  }
  fanOutLocal(event);
}

/** Register an in-process listener. Returns an unsubscribe function. */
export function subscribeLiveEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Start the cross-instance listener. Safe to call once per process. */
export function startLiveEventHub(): void {
  if (hubState.listening) return;
  hubState.listening = true;
  stopping = false;
  if (!pool) {
    console.warn('AFG_LIVE_EVENT_HUB_LOCAL_ONLY', JSON.stringify({
      reason: 'database_unavailable',
      note: 'Live events fan out within this process only.',
    }));
    return;
  }
  void startListener();
}

export function hubStatus(): HubState {
  return { ...hubState };
}

// (no direct env parsing here: connection config lives in database.ts)

/** Test helper: stop the hub and reset state between suite runs. */
export function stopLiveEventHub(): void {
  stopping = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (listenerClient) { void listenerClient.end().catch(() => {}); listenerClient = null; }
  listeners.clear();
  hubState.listening = false;
  hubState.connected = false;
}
