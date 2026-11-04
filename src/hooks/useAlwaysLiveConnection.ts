import { useEffect } from 'react';

/**
 * Keeps the API session warm while the app is in the foreground.
 * Mobile browsers suspend timers in the background, so we revalidate immediately
 * on resume instead of pretending a background WebSocket can stay alive forever.
 */
export function useAlwaysLiveConnection() {
  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let inFlight = false;
    const apiBase = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');
    const check = async () => {
      if (stopped || document.visibilityState === 'hidden' || inFlight) return;
      if (!navigator.onLine) {
        document.documentElement.dataset.afgConnection = 'offline';
        window.dispatchEvent(new CustomEvent('afg-connection-state', { detail: 'offline' }));
        return;
      }
      inFlight = true;
      try {
        const response = await fetch(apiBase + '/api/health', { method: 'HEAD', cache: 'no-store', credentials: 'include', signal: AbortSignal.timeout(8000) });
        const state = response.ok ? 'live' : 'degraded';
        document.documentElement.dataset.afgConnection = state;
        window.dispatchEvent(new CustomEvent('afg-connection-state', { detail: state }));
      } catch {
        document.documentElement.dataset.afgConnection = 'offline';
        window.dispatchEvent(new CustomEvent('afg-connection-state', { detail: 'offline' }));
      } finally { inFlight = false; }
    };
    const schedule = () => { if (timer) window.clearInterval(timer); void check(); timer = window.setInterval(check, 45_000); };
    const onVisibility = () => { if (document.visibilityState === 'visible') schedule(); };
    const onOnline = () => { void check(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOnline);
    schedule();
    return () => { stopped = true; if (timer) window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOnline); };
  }, []);
}
