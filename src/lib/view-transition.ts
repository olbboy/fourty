import { flushSync } from "react-dom";

/**
 * Run a DOM-mutating update inside a View Transition, when there is one to be
 * had. Falls through to a plain call in two cases, and both are ordinary rather
 * than exceptional: a browser without the API, and a user who has asked for
 * less motion. The caller sees the same end state either way — the transition
 * is decoration on top of an update that already works.
 *
 * The update is flushed synchronously because the API photographs the "after"
 * DOM the moment this callback settles. A React state change scheduled the
 * normal way would still be queued at that point, so the transition would
 * capture two identical frames and animate nothing.
 */
export function withViewTransition(update: () => void): void {
  const doc = document as Document & {
    startViewTransition?: (callback: () => void) => unknown;
  };

  if (
    typeof doc.startViewTransition !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }

  doc.startViewTransition(() => flushSync(update));
}
