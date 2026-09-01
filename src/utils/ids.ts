/**
 * Identifier generation.
 *
 * Kept dependency-free so that any module can use it without creating an
 * import cycle (config/defaults, for instance, sits upstream of most utils).
 */

/** A unique, opaque id for a path segment. */
export function makeLineId(): string {
  return `line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
