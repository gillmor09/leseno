/**
 * Nested-safe body scroll lock for modal / wait dialogs.
 * Restoring `document.body.style.overflow` from a captured previous value
 * breaks when two overlays stack (inner cleanup re-applies "hidden").
 */

let lockCount = 0;
let savedOverflow = "";

/**
 * Lock document scrolling. Call the returned function to release.
 * Idempotent per caller: each lock() needs exactly one unlock().
 */
export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") {
    return () => {};
  }
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      const restore = savedOverflow === "hidden" ? "" : savedOverflow;
      document.body.style.overflow = restore;
      savedOverflow = "";
    }
  };
}
