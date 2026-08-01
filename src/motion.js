// Shared prefers-reduced-motion flag for the JS side (CSS handles itself).
// Read once at load: the OS toggle is a settings-app trip, and a reload is a
// cheaper contract than every effect subscribing to a media query.

export const REDUCED = typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
