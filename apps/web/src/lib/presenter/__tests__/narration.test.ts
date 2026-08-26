import { describe, expect, it } from "vitest";
import {
  MAX_ITEMS_PER_SECTION,
  buildAllocationSection,
  buildCompletionsSection,
  buildDriftSection,
  buildProjectsSection,
} from "@/lib/presenter/narration";

describe("buildProjectsSection", () => {
  it("returns empty-state narration when there are no projects", () => {
    const section = buildProjectsSection([]);
    expect(section.narration).toBe("No projects onboarded yet.");
    expect(section.highlightIds).toEqual([]);
  });

  it("narrates feature progress and stale todos for each project", () => {
    const section = buildProjectsSection([
      {
        provider: "github",
        repoId: "1",
        name: "Isidore",
        featuresDone: 3,
        featuresTotal: 5,
        staleTodoCount: 2,
        lastReceivedAt: null,
      },
    ]);
    expect(section.narration).toContain("Isidore has completed 3 of 5 features, with 2 stale todos.");
    expect(section.highlightIds).toEqual(["github/1"]);
  });

  it("truncates to MAX_ITEMS_PER_SECTION and mentions the remainder", () => {
    const rows = Array.from({ length: MAX_ITEMS_PER_SECTION + 3 }, (_, i) => ({
      provider: "github",
      repoId: String(i),
      name: `Project ${i}`,
      featuresDone: 1,
      featuresTotal: 1,
      staleTodoCount: 0,
      lastReceivedAt: null,
    }));
    const section = buildProjectsSection(rows);
    expect(section.highlightIds).toHaveLength(MAX_ITEMS_PER_SECTION);
    expect(section.narration).toContain("...and 3 more, not detailed here.");
  });
});

describe("buildCompletionsSection", () => {
  it("returns empty-state narration when there are no completions", () => {
    const section = buildCompletionsSection([]);
    expect(section.narration).toBe("No completions recorded yet.");
  });

  it("narrates the most recent weeks", () => {
    const section = buildCompletionsSection([
      { provider: "github", repoId: "1", week: "2026-W01", count: 4 },
    ]);
    expect(section.narration).toContain("In week 2026-W01, 1 completed 4 features.");
  });
});

describe("buildDriftSection", () => {
  it("returns empty-state narration when there is no history", () => {
    const section = buildDriftSection([]);
    expect(section.narration).toBe("No estimate or actual history yet.");
  });

  it("formats hours consistently with formatDrift/formatHours", () => {
    const section = buildDriftSection([
      { provider: "github", repoId: "1", week: "2026-W01", estimateHours: 10, hoursLogged: 13.5, drift: 3.5 },
    ]);
    expect(section.narration).toContain("estimated 10 hours and logged 13.5 hours, a drift of +3.5 hours.");
  });
});

describe("buildAllocationSection", () => {
  it("returns empty-state narration when there are no open todos", () => {
    const section = buildAllocationSection([]);
    expect(section.narration).toBe("No open todos.");
  });

  it("orders owners by open estimate hours descending", () => {
    const section = buildAllocationSection([
      { owner: "alice", openTodoCount: 1, openEstimateHours: 2 },
      { owner: "bob", openTodoCount: 3, openEstimateHours: 10 },
    ]);
    expect(section.highlightIds).toEqual(["bob", "alice"]);
  });
});
