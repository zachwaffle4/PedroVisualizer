// src/utils/platform.ts

/**
 * True when running inside the Tauri desktop shell. Tauri v2 exposes
 * `__TAURI_INTERNALS__` on the window before any app code runs.
 */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
