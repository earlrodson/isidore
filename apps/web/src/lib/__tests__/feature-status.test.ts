import { describe, expect, it } from "vitest";
import { isStatusStale } from "../feature-status";

function todo(done: boolean) {
  return { todoId: "t1", title: "todo", done, owner: "a", estimateHours: 1, due: null };
}

describe("isStatusStale", () => {
  it("flags an in-flight status with every todo done", () => {
    expect(isStatusStale({ status: "implementing", todos: [todo(true), todo(true)] })).toBe(true);
  });

  it("does not flag when a todo is still open", () => {
    expect(isStatusStale({ status: "implementing", todos: [todo(true), todo(false)] })).toBe(false);
  });

  it("does not flag a done feature", () => {
    expect(isStatusStale({ status: "done", todos: [todo(true)] })).toBe(false);
  });

  it("does not flag a blocked feature", () => {
    expect(isStatusStale({ status: "blocked", todos: [todo(true)] })).toBe(false);
  });

  it("does not flag a feature with no todos", () => {
    expect(isStatusStale({ status: "implementing", todos: [] })).toBe(false);
  });
});
