import { describe, expect, it } from "vitest";
import { isReminderWindow, localDay, remindersFor, type ReminderTask } from "@/lib/reminders";

/**
 * The morning reminder (Phase 9): each owner's open tasks due today or
 * already overdue, by the calendar of the workspace's time zone; sent from
 * 8 in the morning until noon there.
 */
const TZ = "Asia/Ho_Chi_Minh";
// A due date picked in the form is stored at local noon; 05:00 UTC is noon in Hanoi.
const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 5);
const now = Date.UTC(2026, 9, 14, 1, 30); // 14/10/2026 08:30 in Hanoi

const task = (id: string, over: Partial<ReminderTask>): ReminderTask => ({
  id, title: id, ownerId: "binh", dueDate: null, completedAt: null, ...over,
});
const tasks: ReminderTask[] = [
  task("today", { dueDate: day(2026, 10, 14) }),
  task("yesterday", { dueDate: day(2026, 10, 13) }),
  task("tomorrow", { dueDate: day(2026, 10, 15) }),
  task("done", { dueDate: day(2026, 10, 13), completedAt: day(2026, 10, 13) }),
  task("nobody", { dueDate: day(2026, 10, 14), ownerId: null }),
  task("undated", { dueDate: null }),
  task("dai-late", { dueDate: day(2026, 10, 1), ownerId: "dai" }),
  task("lan-later", { dueDate: day(2026, 10, 20), ownerId: "lan" }),
];

describe("morning reminders", () => {
  it("finds each owner's tasks due today and overdue, leaving out done, unowned and later ones", () => {
    expect(remindersFor(tasks, now, TZ)).toEqual([
      { ownerId: "binh", dueToday: [tasks[0]], overdue: [tasks[1]] },
      { ownerId: "dai", dueToday: [], overdue: [tasks[6]] },
    ]);
  });

  it("reads the day where the team is: 23:30 UTC is already the next day in Hanoi", () => {
    expect(localDay(Date.UTC(2026, 9, 13, 23, 30), TZ)).toBe("2026-10-14");
    expect(localDay(Date.UTC(2026, 9, 13, 16, 59), TZ)).toBe("2026-10-13");
  });

  it("sends from 8 in the morning until noon, local time", () => {
    expect(isReminderWindow(Date.UTC(2026, 9, 14, 0, 59), TZ)).toBe(false); // 07:59
    expect(isReminderWindow(Date.UTC(2026, 9, 14, 1, 0), TZ)).toBe(true); // 08:00
    expect(isReminderWindow(Date.UTC(2026, 9, 14, 4, 59), TZ)).toBe(true); // 11:59
    expect(isReminderWindow(Date.UTC(2026, 9, 14, 5, 0), TZ)).toBe(false); // 12:00
  });
});
