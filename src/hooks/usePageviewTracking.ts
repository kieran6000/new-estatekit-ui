import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { usePostHog } from "@posthog/react";

/** Fires a PostHog $pageview on every route change. Call once, high in the
 * tree (AppShell), so every dashboard route is covered without each page
 * needing its own effect. */
export function usePageviewTracking() {
  const location = useLocation();
  const posthog = usePostHog();

  useEffect(() => {
    posthog.capture("$pageview");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
}
