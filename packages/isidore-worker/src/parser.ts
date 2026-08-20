import { parse as parseYaml } from "yaml";

/**
 * Parser for docs/features/<slug>.md item files, per
 * docs/features/GUIDELINES.md. Read-only: never queries Isidore, never
 * makes decisions, never calls an LLM (TECHSTACK.md §3 design constraints).
 */

export type FeatureType = "feature" | "enabler" | "defect" | "spike";
export type FeatureFileStatus =
  | "planned"
  | "in-progress"
  | "blocked"
  | "done"
  | "cancelled";

export interface FeatureFrontmatter {
  schema_version: number;
  id: string;
  title: string;
  type: FeatureType;
  status: FeatureFileStatus;
  priority?: "low" | "medium" | "high";
  severity?: "low" | "medium" | "high" | "critical";
  ado_id?: string | number;
  prd_ref?: string;
  owners: string[];
  estimate_hours?: number;
  timebox_hours?: number;
  created: string;
  target_date?: string;
  updated: string;
  relates_to?: string[];
}

export interface FeatureTodo {
  description: string;
  owner: string;
  estimateHours: number;
  due: string | null;
  done: boolean;
  doneDate: string | null;
}

export interface FeatureDailyLogEntry {
  date: string;
  owner: string;
  hours: number;
  summary: string;
}

export interface ParsedFeatureFile {
  frontmatter: FeatureFrontmatter;
  /** Raw markdown of the "## Description" section, trimmed; "" if absent. */
  description: string;
  /** Raw markdown of the "## Acceptance criteria" section, trimmed; "" if absent. */
  acceptanceCriteria: string;
  todos: FeatureTodo[];
  dailyLog: FeatureDailyLogEntry[];
  /**
   * Derived per GUIDELINES.md rule 1: the sum of every Daily log line's
   * hours, never the (possibly stale) authored frontmatter value.
   */
  hoursLogged: number;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

const TODO_LINE_RE =
  /^- \[( |x)\] (.+?) \(@([^,]+), est (\d+(?:\.\d+)?)h(?:, due (\d{4}-\d{2}-\d{2}))?(?:, done (\d{4}-\d{2}-\d{2}))?\)$/;

const DAILY_LOG_LINE_RE =
  /^- (\d{4}-\d{2}-\d{2}) \(@([^,]+), (\d+(?:\.\d+)?)h\): (.+)$/;

export class FeatureFileParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeatureFileParseError";
  }
}

/**
 * True for files a report/worker should parse as a work item. Excludes
 * GUIDELINES.md and TEMPLATE-*.md per GUIDELINES.md "Report tooling notes"
 * — those carry placeholder frontmatter, not real items — and any non-`.md`
 * file, since `isi init` scaffolds `.isidore-templates.json` alongside them.
 */
export function isFeatureFile(filename: string): boolean {
  const base = filename.split("/").pop() ?? filename;
  return base.endsWith(".md") && base !== "GUIDELINES.md" && !base.startsWith("TEMPLATE-");
}

function findSection(body: string, heading: string): string | null {
  const padded = `\n${body}`;
  const marker = `\n## ${heading}\n`;
  const markerStart = padded.indexOf(marker);
  if (markerStart === -1) return null;

  const contentStart = markerStart + marker.length;
  const nextHeadingStart = padded.indexOf("\n## ", contentStart);
  const contentEnd = nextHeadingStart === -1 ? padded.length : nextHeadingStart;

  return padded.slice(contentStart, contentEnd).trim();
}

/**
 * Item lines may be hard-wrapped across multiple raw lines for readability
 * (indented continuation lines with no leading `- `). Rejoins each into a
 * single logical line before matching against the fixed formats.
 */
function reflowItems(section: string): string[] {
  const items: string[] = [];
  for (const rawLine of section.split("\n")) {
    if (!rawLine.trim()) continue;
    if (/^- /.test(rawLine)) {
      items.push(rawLine.trim());
    } else if (items.length > 0) {
      items[items.length - 1] += ` ${rawLine.trim()}`;
    }
  }
  return items;
}

function parseTodos(section: string | null): FeatureTodo[] {
  if (!section) return [];
  const todos: FeatureTodo[] = [];
  for (const trimmed of reflowItems(section)) {
    const match = trimmed.match(TODO_LINE_RE);
    if (!match) {
      throw new FeatureFileParseError(`Malformed todo line: ${trimmed}`);
    }
    const [, doneMark, description, owner, est, due, done] = match;
    todos.push({
      description,
      owner,
      estimateHours: Number(est),
      due: due ?? null,
      done: doneMark === "x",
      doneDate: done ?? null,
    });
  }
  return todos;
}

function parseDailyLog(section: string | null): FeatureDailyLogEntry[] {
  if (!section) return [];
  const entries: FeatureDailyLogEntry[] = [];
  for (const trimmed of reflowItems(section)) {
    const match = trimmed.match(DAILY_LOG_LINE_RE);
    if (!match) {
      throw new FeatureFileParseError(`Malformed daily log line: ${trimmed}`);
    }
    const [, date, owner, hours, summary] = match;
    entries.push({ date, owner, hours: Number(hours), summary });
  }
  return entries;
}

/** Parses a single docs/features/<slug>.md file's raw text content. */
export function parseFeatureFile(content: string): ParsedFeatureFile {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    throw new FeatureFileParseError("Missing frontmatter block");
  }
  const [, rawFrontmatter, body] = match;

  const frontmatter = parseYaml(rawFrontmatter) as FeatureFrontmatter;
  if (!frontmatter || typeof frontmatter !== "object") {
    throw new FeatureFileParseError("Frontmatter did not parse to an object");
  }

  const description = findSection(body, "Description") ?? "";
  const acceptanceCriteria = findSection(body, "Acceptance criteria") ?? "";
  const todos = parseTodos(findSection(body, "Todos"));
  const dailyLog = parseDailyLog(findSection(body, "Daily log"));
  const hoursLogged = dailyLog.reduce((sum, entry) => sum + entry.hours, 0);

  return { frontmatter, description, acceptanceCriteria, todos, dailyLog, hoursLogged };
}
