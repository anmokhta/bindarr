import { useCallback, useEffect, useState } from "react";

export type Route = "/" | "/bank" | "/wishlist" | "/binders" | "/artist-search" | "/settings";

const ROUTES: Route[] = ["/", "/bank", "/wishlist", "/binders", "/artist-search", "/settings"];

export function currentRoute(): Route {
  const path = window.location.pathname as Route;
  return ROUTES.includes(path) ? path : "/";
}

export function useRoute(): [Route, (to: string, opts?: { replace?: boolean }) => void] {
  const [route, setRoute] = useState<Route>(() => currentRoute());

  useEffect(() => {
    const onPop = () => setRoute(currentRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    // Remember where Settings was opened from, for its back behavior.
    if (to.startsWith("/settings") && !window.location.pathname.startsWith("/settings")) {
      try { sessionStorage.setItem("bindarr-prev-route", window.location.pathname + window.location.search); } catch { /* noop */ }
    }
    if (opts?.replace) window.history.replaceState({}, "", to);
    else window.history.pushState({}, "", to);
    setRoute(currentRoute());
    window.scrollTo(0, 0);
  }, []);

  return [route, navigate];
}

/** Where Settings' back arrow / gear-again should go. */
export function previousRoute(): string {
  try {
    return sessionStorage.getItem("bindarr-prev-route") || "/";
  } catch {
    return "/";
  }
}
