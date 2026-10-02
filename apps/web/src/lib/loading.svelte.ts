import { untrack } from 'svelte';
import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';

export const loadingState = $state({ requests: 0, scopes: 0 });

/** Counts concurrent foreground operations without changing fetch responses or errors. */
export function trackLoading() {
  untrack(() => loadingState.requests++);
  let ended = false;
  return () => { if (!ended) { ended = true; untrack(() => { loadingState.requests = Math.max(0, loadingState.requests - 1); }); } };
}

export function installLoadingTracker() {
  if (!browser) return () => {};
  const original = window.fetch;
  const apiOrigin = new URL(env.PUBLIC_API_URL || 'http://localhost:3000', window.location.href).origin;
  const appOrigin = new URL(env.PUBLIC_APP_URL || window.location.origin, window.location.href).origin;
  const tracked = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    const quiet = /\/(?:get-session|unread-count|activity|status)$/.test(url.pathname) && !url.pathname.includes('/privacy/');
    if (![window.location.origin, apiOrigin, appOrigin].includes(url.origin) || !url.pathname.startsWith('/api/') || quiet) return original(input, init);
    const done = trackLoading();
    try { return await original(input, init); } finally { done(); }
  }) as typeof window.fetch;
  window.fetch = tracked;
  return () => { if (window.fetch === tracked) window.fetch = original; };
}
