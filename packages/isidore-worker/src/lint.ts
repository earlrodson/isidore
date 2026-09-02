import { loadFeatureFiles, type FeatureFileSource } from "./core.js";
import { parseFeatureFile, type FeatureFileStatus } from "./parser.js";

/**
 * `isi lint` (GUIDELINES.md rule 4: "status moves forward only" — but
 * nothing enforces that a human actually moves it). Flags items where every
 * Todo is checked `[x]` yet `status` is still an in-flight stage, which is
 * silent authoring drift: the work is done, the frontmatter just never
 * caught up. `blocked` and the two terminal stages (`done`, `removed`) are
 * excluded — they're not "in flight" in the sense this check cares about.
 */
const ADVANCING_STATUSES: ReadonlySet<FeatureFileStatus> = new Set([
  "new",
  "analyzing",
  "ready",
  "implementing",
  "validating",
  "deploying",
  "releasing",
]);

export interface StatusDriftItem {
  id: string;
  title: string;
  status: FeatureFileStatus;
  filename: string;
}

export interface FindStatusDriftParams {
  featuresDir: string;
  loadFeatures?: (featuresDir: string) => FeatureFileSource[];
}

/** Items with at least one Todo, every Todo done, and a still-advancing status. */
export function findStatusDrift(params: FindStatusDriftParams): StatusDriftItem[] {
  const loadFeatures = params.loadFeatures ?? loadFeatureFiles;
  const sources = loadFeatures(params.featuresDir);

  const drifted: StatusDriftItem[] = [];
  for (const { filename, content } of sources) {
    let parsed;
    try {
      parsed = parseFeatureFile(content);
    } catch (error) {
      // Same "warn never block" contract as buildSnapshot (core.ts) — one
      // malformed doc must never stop drift-checking every other feature.
      console.warn(
        `isidore-worker: skipping ${filename} — failed to parse: ${(error as Error).message}`,
      );
      continue;
    }

    const { frontmatter, todos } = parsed;
    if (todos.length === 0) continue;
    if (!ADVANCING_STATUSES.has(frontmatter.status)) continue;
    if (todos.some((todo) => !todo.done)) continue;

    drifted.push({
      id: frontmatter.id,
      title: frontmatter.title,
      status: frontmatter.status,
      filename,
    });
  }

  return drifted;
}

export function formatStatusDrift(items: StatusDriftItem[]): string {
  if (items.length === 0) return "isi lint: no status drift found.";

  const lines = items.map(
    (item) =>
      `  - ${item.filename}: all todos done, status still "${item.status}" (${item.id})`,
  );
  return [
    `isi lint: ${items.length} item(s) with every todo done but status not advanced:`,
    ...lines,
    "",
    "Bump `status` (and `updated`) once the work is actually complete, or add",
    "a new todo if there's more coming — see GUIDELINES.md rule 4.",
  ].join("\n");
}
