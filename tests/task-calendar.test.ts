import { describe, expect, it } from "vitest";
import { monthGrid, tasksByDay } from "@/lib/task-calendar";
import { toDateInputValue, fromDateInputValue } from "@/lib/format";

/**
 * Phase 21 (D12): the month view of tasks. Weeks start on Monday; a month
 * takes five or six rows; a task sits on the local day it is due.
 */
describe("task calendar", () => {
  const days = (grid: number[][]) => grid.map((week) => week.map((d) => toDateInputValue(d)));

  it("lays out October 2026 from Monday 28 September to Sunday 1 November", () => {
    const grid = days(monthGrid(2026, 9));
    expect(grid).toHaveLength(5);
    expect(grid[0]![0]).toBe("2026-09-28");
    expect(grid[0]![3]).toBe("2026-10-01");
    expect(grid[4]![6]).toBe("2026-11-01");
  });

  it("takes six rows for a month that starts on Sunday and runs 31 days", () => {
    const grid = days(monthGrid(2026, 2));
    expect(grid).toHaveLength(6);
    expect(grid[0]![6]).toBe("2026-03-01");
    expect(grid[5]![1]).toBe("2026-03-31");
  });

  it("puts each task on the day it is due, and leaves out tasks with no due date", () => {
    const due = fromDateInputValue("2026-10-14")!;
    const byDay = tasksByDay([
      { id: "a", dueDate: due },
      { id: "b", dueDate: due + 3 * 3_600_000 },
      { id: "c", dueDate: null },
    ]);
    expect(byDay.get("2026-10-14")?.map((t) => t.id)).toEqual(["a", "b"]);
    expect([...byDay.values()].flat()).toHaveLength(2);
  });
});
