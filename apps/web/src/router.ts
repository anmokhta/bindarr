import { useCallback, useEffect, useState } from "react";

export type Route =
  | "/binders/planner"
  | "/bank/cards"
  | "/bank/wishlist"
  | "/bank/bulk-add"
  | "/bank/tags"
  | "/bank/collections"
  | "/binders/manage"
  | "/extras/artist-search"
  | "/settings";

const ROUTES: Route[] = [
  "/binders/planner",
  "/bank/cards",
  "/bank/wishlist",
  "/bank/bulk-add",
  "/bank/tags",
  "/bank/collections",
  "/binders/manage",
  "/extras/artist-search",
  "/settings",
];

/** Canonical route for the current URL, applying legacy redirects. */
export function currentRoute(): Route {
  const path = window.location.pathname;
  if (path === "/extras/nav-styles") return "/settings";
  if (ROUTES.includes(path as Route)) return path as Route;
  switch (path) {
    case "/":
    case "/binders/planner":
      return "/binders/planner";
    case "/bank":
      return "/bank/cards";
    case "/wishlist":
      return "/bank/wishlist";
    case "/binders":
      return "/binders/manage";
    case "/artist-search":
      return "/extras/artist-search";
    default:
      return "/binders/planner";
  }
}

/** If the URL is a legacy alias, replace it with the canonical route (preserving query). */
function applyRedirect(): boolean {
  const path = window.location.pathname;
  if (path === "/extras/nav-styles") {
    window.history.replaceState({}, "", "/settings?tab=nav-styles");
    return true;
  }
  const canonical = currentRoute();
  if (path !== canonical) {
    window.history.replaceState({}, "", canonical + window.location.search);
    return true;
  }
  return false;
}

export function useRoute(): [Route, (to: string, opts?: { replace?: boolean }) => void] {
  const [route, setRoute] = useState<Route>(() => {
    applyRedirect();
    return currentRoute();
  });

  useEffect(() => {
    applyRedirect();
    setRoute(currentRoute());
    const onPop = () => {
      applyRedirect();
      setRoute(currentRoute());
    };
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
    applyRedirect();
    setRoute(currentRoute());
    window.scrollTo(0, 0);
  }, []);

  return [route, navigate];
}

/** Where Settings' back arrow / gear-again should go. */
export function previousRoute(): string {
  try {
    return sessionStorage.getItem("bindarr-prev-route") || "/binders/planner";
  } catch {
    return "/binders/planner";
  }
}
