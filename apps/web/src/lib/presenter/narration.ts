import type {
  DeveloperAllocation,
  EstimationDriftPoint,
  FeaturesCompletedPerWeek,
  ProjectSummary,
} from "@isidore/db";
import { formatDrift, formatHours } from "@/lib/format";

export const MAX_ITEMS_PER_SECTION = 5;

export type PresenterSectionId = "projects" | "completions" | "drift" | "allocation";

export interface PresenterSection {
  id: PresenterSectionId;
  title: string;
  narration: string;
  highlightIds: string[];
}

export interface PresenterData {
  projects: ProjectSummary[];
  completedPerWeek: FeaturesCompletedPerWeek[];
  estimationDrift: EstimationDriftPoint[];
  allocation: DeveloperAllocation[];
}

function overflowClause(totalCount: number, shownCount: number): string {
  const remaining = totalCount - shownCount;
  return remaining > 0 ? ` ...and ${remaining} more, not detailed here.` : "";
}

export function buildProjectsSection(rows: ProjectSummary[]): PresenterSection {
  if (rows.length === 0) {
    return { id: "projects", title: "Projects", narration: "No projects onboarded yet.", highlightIds: [] };
  }
  const shown = rows.slice(0, MAX_ITEMS_PER_SECTION);
  const sentences = shown.map((project) => {
    const staleClause =
      project.staleTodoCount > 0
        ? `, with ${project.staleTodoCount} stale todo${project.staleTodoCount === 1 ? "" : "s"}`
        : ", with no stale todos";
    return `${project.name} has completed ${project.featuresDone} of ${project.featuresTotal} features${staleClause}.`;
  });
  const narration = `Here are the tracked projects. ${sentences.join(" ")}${overflowClause(rows.length, shown.length)}`;
  return {
    id: "projects",
    title: "Projects",
    narration,
    highlightIds: shown.map((project) => `${project.provider}/${project.repoId}`),
  };
}

export function buildCompletionsSection(rows: FeaturesCompletedPerWeek[]): PresenterSection {
  if (rows.length === 0) {
    return {
      id: "completions",
      title: "Completions / week",
      narration: "No completions recorded yet.",
      highlightIds: [],
    };
  }
  const shown = rows.slice(-MAX_ITEMS_PER_SECTION);
  const sentences = shown.map(
    (row) => `In week ${row.week}, ${row.repoId} completed ${row.count} feature${row.count === 1 ? "" : "s"}.`,
  );
  const narration = `Now, feature completions by week. ${sentences.join(" ")}${overflowClause(rows.length, shown.length)}`;
  return {
    id: "completions",
    title: "Completions / week",
    narration,
    highlightIds: shown.map((row) => `${row.provider}/${row.repoId}/${row.week}`),
  };
}

export function buildDriftSection(rows: EstimationDriftPoint[]): PresenterSection {
  if (rows.length === 0) {
    return {
      id: "drift",
      title: "Estimation drift",
      narration: "No estimate or actual history yet.",
      highlightIds: [],
    };
  }
  const shown = rows.slice(-MAX_ITEMS_PER_SECTION);
  const sentences = shown.map(
    (row) =>
      `In week ${row.week}, ${row.repoId} estimated ${formatHours(row.estimateHours)} hours and logged ${formatHours(row.hoursLogged)} hours, a drift of ${formatDrift(row.drift)} hours.`,
  );
  const narration = `Next, estimation drift. ${sentences.join(" ")}${overflowClause(rows.length, shown.length)}`;
  return {
    id: "drift",
    title: "Estimation drift",
    narration,
    highlightIds: shown.map((row) => `${row.provider}/${row.repoId}/${row.week}`),
  };
}

export function buildAllocationSection(rows: DeveloperAllocation[]): PresenterSection {
  if (rows.length === 0) {
    return { id: "allocation", title: "Allocation", narration: "No open todos.", highlightIds: [] };
  }
  const shown = [...rows]
    .sort((a, b) => b.openEstimateHours - a.openEstimateHours)
    .slice(0, MAX_ITEMS_PER_SECTION);
  const sentences = shown.map(
    (row) =>
      `${row.owner} has ${row.openTodoCount} open todo${row.openTodoCount === 1 ? "" : "s"}, totaling ${formatHours(row.openEstimateHours)} hours.`,
  );
  const narration = `Finally, developer allocation. ${sentences.join(" ")}${overflowClause(rows.length, shown.length)}`;
  return {
    id: "allocation",
    title: "Allocation",
    narration,
    highlightIds: shown.map((row) => row.owner),
  };
}

export function buildPresenterSections(data: PresenterData): PresenterSection[] {
  return [
    buildProjectsSection(data.projects),
    buildCompletionsSection(data.completedPerWeek),
    buildDriftSection(data.estimationDrift),
    buildAllocationSection(data.allocation),
  ];
}
