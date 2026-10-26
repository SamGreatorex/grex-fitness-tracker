// Shared by the client. Signed-out users are sent to sign in with
// ?redirect=<where they were>, and taken back there afterwards.

// Only paths on this site are followed: "/reports?week=2" yes; "//evil.com",
// "/\evil.com" or "https://…" (which browsers would treat as another site) no.
export function safeRedirect(value, fallback = "/") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}

// The sign-in page, set to come back to `path` (default: the current page).
export function loginHref(path) {
  const here = path ?? (typeof window === "undefined" ? "/" : window.location.pathname + window.location.search);
  const target = safeRedirect(here);
  if (target === "/" || target === "/login" || target.startsWith("/login?")) return "/login";
  return `/login?redirect=${encodeURIComponent(target)}`;
}
