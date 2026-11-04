import type { IncomingMessage } from 'http';
import { authenticateRequest } from './auth.ts';
import { pool } from './database.ts';

const TIER_RANK: Record<string, number> = { free: 0, starter: 1, pro: 2, max: 3, ultra: 4, enterprise: 5 };

function rank(value: unknown): number {
  const key = String(value || 'free').toLowerCase();
  return TIER_RANK[key] ?? 0;
}

async function accountTier(req: IncomingMessage): Promise<string> {
  const account = await authenticateRequest(req).catch(() => null);
  if (!account || !pool) return 'free';
  try {
    const result = await pool.query(
      `SELECT p.plan_key FROM user_subscriptions s
         JOIN subscription_plans p ON p.id=s.plan_id
        WHERE s.user_id=$1 AND s.status IN ('active','trialing')
          AND (s.ends_at IS NULL OR s.ends_at>now())
        ORDER BY s.starts_at DESC LIMIT 1`,
      [account.id],
    );
    return String(result.rows[0]?.plan_key || 'free').toLowerCase();
  } catch {
    return 'free';
  }
}

/** Enriches the live provider catalogue with optional database-managed plan gates.
 * Older installations without required_tier remain compatible and do not invent paywalls.
 */
export async function applyModelAccess(req: IncomingMessage, snapshot: any): Promise<any> {
  const tier = await accountTier(req);
  let metadata = new Map<string, any>();
  if (pool) {
    try {
      const columns = await pool.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema=current_schema() AND table_name='model_catalog'`,
      );
      const available = new Set(columns.rows.map((row: any) => String(row.column_name)));
      const tierColumn = available.has('required_tier') ? 'required_tier'
        : available.has('access_tier') ? 'access_tier' : null;
      const priceColumns = ['input_cost_per_million','output_cost_per_million'].filter((name) => available.has(name));
      const selected = ['provider_key','model_key', ...(tierColumn ? [tierColumn] : []), ...priceColumns];
      if (selected.length > 2) {
        const rows = await pool.query(`SELECT ${selected.join(',')} FROM model_catalog`);
        metadata = new Map(rows.rows.map((row: any) => [
          String(row.provider_key) + '::' + String(row.model_key), row,
        ]));
      }
    } catch {
      metadata = new Map();
    }
  }
  const models = Array.isArray(snapshot?.modelDescriptors) ? snapshot.modelDescriptors.map((model: any) => {
    const row = metadata.get(String(model.providerId) + '::' + String(model.id));
    const requiredTier = String(row?.required_tier ?? row?.access_tier ?? 'free').toLowerCase();
    const requiresSubscription = requiredTier !== 'free' && requiredTier !== 'unknown';
    const hasAccess = !requiresSubscription || rank(tier) >= rank(requiredTier);
    const input = row?.input_cost_per_million;
    const output = row?.output_cost_per_million;
    return {
      ...model,
      pricing: model.pricing ?? (input != null || output != null
        ? { inputPerMillion: input == null ? null : Number(input), outputPerMillion: output == null ? null : Number(output), currency: 'USD' }
        : undefined),
      requiresSubscription,
      accessTier: requiredTier,
      selectable: model.selectable === true && hasAccess,
      disabledReason: model.enabled === false ? 'Disabled by administrator.'
        : (!hasAccess ? 'Premium subscription required: ' + requiredTier.toUpperCase()
          : model.disabledReason),
    };
  }) : [];
  return { ...snapshot, modelDescriptors: models, account: { tier, authenticated: tier !== 'free' } };
}

/** Enforces optional model_catalog.required_tier/access_tier on the server before provider use. */
export async function enforceModelSubscription(userId: string | null, providerId: string, modelId: string): Promise<void> {
  if (!pool || !userId) return;
  const columns = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name='model_catalog'`,
  );
  const available = new Set(columns.rows.map((row: any) => String(row.column_name)));
  const tierColumn = available.has('required_tier') ? 'required_tier'
    : available.has('access_tier') ? 'access_tier' : null;
  if (!tierColumn) return;
  const model = await pool.query(
    `SELECT ${tierColumn} AS required_tier FROM model_catalog WHERE provider_key=$1 AND model_key=$2 LIMIT 1`,
    [providerId, modelId],
  );
  const required = String(model.rows[0]?.required_tier || 'free').toLowerCase();
  if (required === 'free' || required === 'unknown') return;
  const subscription = await pool.query(
    `SELECT p.plan_key FROM user_subscriptions s
       JOIN subscription_plans p ON p.id=s.plan_id
      WHERE s.user_id=$1 AND s.status IN ('active','trialing')
        AND (s.ends_at IS NULL OR s.ends_at>now())
      ORDER BY s.starts_at DESC LIMIT 1`,
    [userId],
  );
  const current = String(subscription.rows[0]?.plan_key || 'free').toLowerCase();
  if (rank(current) < rank(required)) {
    const { ProviderAdapterError } = await import('../providers/providerTypes.ts');
    throw new ProviderAdapterError('A ' + required + ' subscription is required to use this model.', 402, 'premium_required');
  }
}
