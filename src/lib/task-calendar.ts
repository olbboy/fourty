import { toDateInputValue } from "@/lib/format";

/**
 * The month view of tasks (D12), as pure functions of dates: the grid of
 * local days a month spans, Monday first, and tasks grouped by the local day
 * they are due. A due date is stored at local noon, so its local day is the
 * one the person picked.
 */


/** Weeks (Monday to Sunday) covering `month` (0-based) of `year`: local midnights. */
export function monthGrid(year: number, month: number): number[][] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const start = new Date(year, month, 1 - offset);
  const last = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((offset + last) / 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d).getTime()),
  );
}

/** Tasks with a due date, keyed by that local day ("YYYY-MM-DD"), in the order given. */
export function tasksByDay<T extends { dueDate: number | null }>(tasks: readonly T[]): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  for (const task of tasks) {
    if (task.dueDate === null) continue;
    const key = toDateInputValue(task.dueDate);
    byDay.set(key, [...(byDay.get(key) ?? []), task]);
  }
  return byDay;
}

/** Whether `day` (a local midnight) falls in `month` (0-based). */
export const inMonth = (day: number, month: number) => new Date(day).getMonth() === month;

/** Today's local midnight. */
export const today = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
};
