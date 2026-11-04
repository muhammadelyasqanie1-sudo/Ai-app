import { useEffect } from 'react';

/** Preloads the verified catalogue and keeps live status synchronized without claiming
 * that a suspended mobile browser can hold a permanent background socket.
 */
export function useAlwaysLiveConnection() {
  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let inFlight = false;
    const apiBase = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');
    const publish = (state: string) => {
      document.documentElement.dataset.afgConnection = state;
      window.dispatchEvent(new CustomEvent('afg-connection-state', { detail: state }));
    };
    const warmCatalog = async () => {
      try {
        const response = await fetch(apiBase + '/api/bootstrap', {
          credentials: 'include', cache: 'no-store',
          signal: AbortSignal.timeout(25_000),
        });
        if (!response.ok) throw new Error('Catalogue unavailable');
        const data = await response.json();
        if (!stopped) {
          window.dispatchEvent(new CustomEvent('afg-model-catalog', { detail: data }));
          publish(data.verified === true ? 'live' : 'degraded');
        }
      } catch {
        if (!stopped) publish(navigator.onLine ? 'degraded' : 'offline');
      }
    };
    const check = async () => {
      if (stopped || document.visibilityState === 'hidden' || inFlight) return;
      if (!navigator.onLine) { publish('offline'); return; }
      inFlight = true;
      try {
        const response = await fetch(apiBase + '/api/health', {
          method: 'GET', cache: 'no-store', credentials: 'include',
          signal: AbortSignal.timeout(8_000),
        });
        publish(response.ok ? 'live' : 'degraded');
      } catch { publish('offline'); }
      finally { inFlight = false; }
    };
    const schedule = () => {
      if (timer) window.clearInterval(timer);
      void check();
      void warmCatalog();
      timer = window.setInterval(check, 45_000);
    };
    const events = typeof EventSource !== 'undefined'
      ? new EventSource(apiBase + '/api/events', { withCredentials: true })
      : null;
    events?.addEventListener('catalog.updated', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        window.dispatchEvent(new CustomEvent('afg-model-catalog', { detail: data }));
        publish('live');
      } catch { publish('degraded'); }
    });
    events?.addEventListener('system.health', (event) => {
      try { publish(JSON.parse((event as MessageEvent).data).status || 'degraded'); }
      catch { publish('degraded'); }
    });
    events?.addEventListener('error', () => publish('degraded'));
    const onVisibility = () => { if (document.visibilityState === 'visible') schedule(); };
    const onOnline = () => { void check(); void warmCatalog(); };
    const onOffline = () => publish('offline');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    schedule();
    return () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
      events?.close();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);
}
