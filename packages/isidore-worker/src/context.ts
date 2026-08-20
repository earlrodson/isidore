import { loadFeatureFiles } from "./core.js";
import { parseFeatureFile, type FeatureTodo, type ParsedFeatureFile } from "./parser.js";

/**
 * `isi context` (TECHSTACK.md §3.1): dumps open docs/features/ items as a
 * self-contained markdown blob on stdout, so any CLI-based coding agent
 * (not just Claude) can be pointed at "the remaining work" via a plain
 * pipe, e.g. `isi context | claude -p "implement the above"`.
 */

const OPEN_STATUSES = new Set(["planned", "in-progress", "blocked"]);

export class UnknownFeatureIdError extends Error {
  constructor(id: string) {
    super(`No docs/features/ item with id "${id}"`);
    this.name = "UnknownFeatureIdError";
  }
}

function remainingTodos(todos: FeatureTodo[]): FeatureTodo[] {
  return todos.filter((todo) => !todo.done);
}

function formatTodo(todo: FeatureTodo): string {
  const due = todo.due ? `, due ${todo.due}` : "";
  return `- [ ] ${todo.description} (@${todo.owner}, est ${todo.estimateHours}h${due})`;
}

function formatItem(parsed: ParsedFeatureFile): string {
  const { frontmatter } = parsed;
  const open = remainingTodos(parsed.todos);
  const todosBlock =
    open.length > 0
      ? open.map(formatTodo).join("\n")
      : "_No remaining todos — all complete._";

  return [
    `## ${frontmatter.title} (\`${frontmatter.id}\`)`,
    `type: ${frontmatter.type} · status: ${frontmatter.status}` +
      (frontmatter.priority ? ` · priority: ${frontmatter.priority}` : ""),
    "",
    "### Description",
    parsed.description || "_none_",
    "",
    "### Acceptance criteria",
    parsed.acceptanceCriteria || "_none_",
    "",
    "### Remaining todos",
    todosBlock,
  ].join("\n");
}

export interface BuildContextParams {
  featuresDir: string;
  /** Scope to a single item's frontmatter `id` instead of every open item. */
  id?: string;
  loadFeatures?: (featuresDir: string) => { filename: string; content: string }[];
}

/**
 * Builds the markdown context blob. Throws `UnknownFeatureIdError` if
 * `id` is given and no item matches — the caller (CLI) turns that into a
 * clean exit rather than a stack trace.
 */
export function buildContext(params: BuildContextParams): string {
  const loadFeatures = params.loadFeatures ?? loadFeatureFiles;
  const sources = loadFeatures(params.featuresDir);
  const parsed = sources.map(({ filename, content }) => {
    try {
      return parseFeatureFile(content);
    } catch (error) {
      throw new Error(`Failed to parse ${filename}: ${(error as Error).message}`);
    }
  });

  if (params.id) {
    const match = parsed.find((file) => file.frontmatter.id === params.id);
    if (!match) {
      throw new UnknownFeatureIdError(params.id);
    }
    return formatItem(match);
  }

  const open = parsed.filter(
    (file) =>
      OPEN_STATUSES.has(file.frontmatter.status) &&
      remainingTodos(file.todos).length > 0,
  );

  if (open.length === 0) {
    return "No remaining todos across docs/features/*.md.";
  }

  return open.map(formatItem).join("\n\n---\n\n");
}
