/**
 * The morning task reminder (Phase 9, Q78): for each owner, their open tasks
 * due today or already overdue, read by the calendar of the workspace's time
 * zone, sent once a day from 8 in the morning until noon there. Pure: the
 * caller loads tasks and settings and sends the mail.
 */

export type ReminderTask = {
  id: string;
  title: string;
  ownerId: string | null;
  dueDate: number | null;
  completedAt: number | null;
};

export type OwnerReminder = { ownerId: string; dueToday: ReminderTask[]; overdue: ReminderTask[] };

/** First hour of the day reminders go out, local time, and the hour they stop. */
export const REMINDER_FROM_HOUR = 8;
export const REMINDER_UNTIL_HOUR = 12;

/** The calendar day ("2026-10-14") a moment falls on in a time zone. */
export function localDay(ts: number, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(ts);
}

/** The hour (0–23) of a moment in a time zone. */
function localHour(ts: number, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(ts);
  return Number(hour);
}

/**
 * True from 8:00 until 12:00 local time. A worker that was down at 8 still
 * sends when it comes back during the morning; after noon the day is skipped
 * rather than reminding someone in the evening.
 */
export function isReminderWindow(now: number, timeZone: string): boolean {
  const hour = localHour(now, timeZone);
  return hour >= REMINDER_FROM_HOUR && hour < REMINDER_UNTIL_HOUR;
}

/** Owners with something due today or overdue, by owner id; nobody else. */
export function remindersFor(tasks: readonly ReminderTask[], now: number, timeZone: string): OwnerReminder[] {
  const today = localDay(now, timeZone);
  const byOwner = new Map<string, OwnerReminder>();
  for (const task of tasks) {
    if (!task.ownerId || task.completedAt || task.dueDate === null) continue;
    const due = localDay(task.dueDate, timeZone);
    if (due > today) continue;
    let entry = byOwner.get(task.ownerId);
    if (!entry) {
      entry = { ownerId: task.ownerId, dueToday: [], overdue: [] };
      byOwner.set(task.ownerId, entry);
    }
    (due === today ? entry.dueToday : entry.overdue).push(task);
  }
  return [...byOwner.values()].sort((a, b) => a.ownerId.localeCompare(b.ownerId));
}

/** True when a time zone name is one this runtime knows. */
export function isTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}
