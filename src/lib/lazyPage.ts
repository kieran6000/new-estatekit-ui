import { lazy, type ComponentType } from "react";

// Pages load the first time they're opened, so a seller tapping an ad
// downloads the lead form, not every screen of the dashboard.
//
// The catch: after a deploy, a tab that was already open asks for files the
// new version no longer has. Then the page reloads once (picking up the new
// version) instead of going blank. If it still can't load (no signal), the
// error boundary shows a plain message with a Reload button.

const RELOADED_AT = "ek-reloaded-for-update";

// Same constraint as React's own lazy(): any component.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().then(
      (m) => m,
      (err: unknown) => {
        let last = 0;
        try {
          last = Number(sessionStorage.getItem(RELOADED_AT) || 0);
        } catch {
          // Storage blocked: still reload once.
        }
        if (Date.now() - last > 30_000) {
          try {
            sessionStorage.setItem(RELOADED_AT, String(Date.now()));
          } catch {
            // ignore
          }
          window.location.reload();
          // Keep showing the loader until the reload takes over.
          return new Promise<{ default: T }>(() => {});
        }
        throw err;
      },
    ),
  );
}

/** Start downloading pages in the background (when the browser is idle), so
 *  opening them later is instant. Failures are ignored: they load on open. */
export function preloadPages(loaders: (() => Promise<unknown>)[]): void {
  const run = () => loaders.forEach((l) => void l().catch(() => {}));
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}
