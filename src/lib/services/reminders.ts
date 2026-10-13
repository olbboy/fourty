import { and, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { db, tables } from "@/db";
import { enqueue, claimJob } from "@/lib/queue";
import { mailEnabled } from "@/lib/mail";
import { taskReminderEmail } from "@/lib/mail-templates";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";
import { isReminderWindow, isTimeZone, localDay, remindersFor } from "@/lib/reminders";

/**
 * Reminder settings (Q78), one JSON value in `settings`. `appUrl` is where the
 * app was reached when an admin last saved them: the worker has no request to
 * learn it from, and the email links back to the task list.
 */
export type ReminderSettings = { enabled: boolean; timeZone: string; locale: Locale; appUrl: string | null };

const SETTINGS_KEY = "reminders";
export const DEFAULT_REMINDERS: ReminderSettings = {
  enabled: false,
  timeZone: "Asia/Ho_Chi_Minh",
  locale: "en",
  appUrl: null,
};

export const reminderPatch = z.object({
  enabled: z.boolean().optional(),
  timeZone: z.string().refine(isTimeZone, "not a known time zone").optional(),
  locale: z.enum(SUPPORTED_LOCALES as [Locale, ...Locale[]]).optional(),
});

export async function loadReminderSettings(): Promise<ReminderSettings> {
  const row = (
    await db.select({ value: tables.settings.value }).from(tables.settings).where(eq(tables.settings.key, SETTINGS_KEY)).limit(1)
  )[0];
  if (!row) return DEFAULT_REMINDERS;
  try {
    return { ...DEFAULT_REMINDERS, ...(JSON.parse(row.value) as Partial<ReminderSettings>) };
  } catch {
    return DEFAULT_REMINDERS;
  }
}

export async function saveReminderSettings(
  patch: z.infer<typeof reminderPatch>,
  appUrl: string,
): Promise<ReminderSettings> {
  const settings: ReminderSettings = { ...(await loadReminderSettings()), ...patch, appUrl };
  const value = JSON.stringify(settings);
  await db
    .insert(tables.settings)
    .values({ key: SETTINGS_KEY, value })
    .onConflictDoUpdate({ target: [tables.settings.workspaceId, tables.settings.key], set: { value } });
  return settings;
}

/**
 * One worker tick's worth of reminding, inside the workspace's transaction.
 * Nothing happens while reminders are off, mail is not set up, or it is
 * outside 8:00–12:00 local time. The first tick in the window claims the day,
 * so later ticks (and a second worker) send nothing more; each email also
 * carries a per-person, per-day idempotency key.
 */
export async function dispatchReminders(workspaceId: string, now = Date.now()): Promise<void> {
  const settings = await loadReminderSettings();
  if (!settings.enabled || !mailEnabled() || !isReminderWindow(now, settings.timeZone)) return;
  const today = localDay(now, settings.timeZone);
  if (!(await claimJob(`reminders:${workspaceId}:${today}`, "reminders.dispatch"))) return;

  // Anything due by the end of tomorrow UTC covers "today" in every zone.
  const tasks = await db
    .select({
      id: tables.tasks.id,
      title: tables.tasks.title,
      ownerId: tables.tasks.ownerId,
      dueDate: tables.tasks.dueDate,
      completedAt: tables.tasks.completedAt,
    })
    .from(tables.tasks)
    .where(and(isNull(tables.tasks.completedAt), isNotNull(tables.tasks.ownerId), lte(tables.tasks.dueDate, now + 2 * 86_400_000)));
  const reminders = remindersFor(tasks, now, settings.timeZone);
  if (reminders.length === 0) return;

  const people = await db
    .select({ id: tables.users.id, name: tables.users.name, email: tables.users.email })
    .from(tables.users)
    .where(inArray(tables.users.id, reminders.map((r) => r.ownerId)));
  const tasksUrl = `${settings.appUrl ?? ""}/tasks`;
  for (const reminder of reminders) {
    const person = people.find((p) => p.id === reminder.ownerId);
    if (!person) continue;
    const message = taskReminderEmail({
      name: person.name,
      dueToday: reminder.dueToday,
      overdue: reminder.overdue,
      tasksUrl,
      locale: settings.locale,
    });
    await enqueue("mail.send", { to: person.email, ...message }, {
      workspaceId,
      idempotencyKey: `reminder:${workspaceId}:${person.id}:${today}`,
    });
  }
}
