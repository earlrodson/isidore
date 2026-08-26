import type { ProjectDetailFeature } from "@isidore/db";

/** Every lifecycle stage except the terminal/paused ones — mirrors
 * isidore-worker's `isi lint` (packages/isidore-worker/src/lint.ts). */
const ADVANCING_STATUSES = new Set([
  "new",
  "analyzing",
  "ready",
  "implementing",
  "validating",
  "deploying",
  "releasing",
]);

/**
 * True when every todo is done but the spec's `status` was never bumped
 * forward — the author forgot to update the frontmatter, not an ingest
 * failure. The isi lint check catches this at the source repo; this is the
 * same signal surfaced on an already-ingested feature.
 */
export function isStatusStale(feature: Pick<ProjectDetailFeature, "status" | "todos">): boolean {
  return (
    feature.todos.length > 0 &&
    ADVANCING_STATUSES.has(feature.status) &&
    feature.todos.every((todo) => todo.done)
  );
}
