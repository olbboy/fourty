"use client";

import { useMemo, useState } from "react";
import type { Task } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { inMonth, monthGrid, startOfToday, tasksByDay } from "@/lib/task-calendar";
import { DATE_TAGS, toDateInputValue } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/provider";


/**
 * Tasks on a month calendar (D12): each on the day it is due, overdue open
 * ones in red, done ones struck through. Choosing one opens it for editing.
 */
export function TaskCalendar({ tasks, onOpen }: { tasks: Task[]; onOpen: (task: Task) => void }) {
  const t = useT();
  const locale = useLocale();
  const tag = DATE_TAGS[locale] ?? "en-US";
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const byDay = useMemo(() => tasksByDay(tasks), [tasks]);
  const undated = tasks.filter((task) => task.dueDate === null).length;
  const todayMs = startOfToday();
  const title = new Date(cursor.year, cursor.month, 1).toLocaleDateString(tag, { month: "long", year: "numeric" });
  const weekdays = grid[0]!.map((day) => new Date(day).toLocaleDateString(tag, { weekday: "short" }));
  const shift = (months: number) =>
    setCursor(({ year, month }) => {
      const next = new Date(year, month + months, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-semibold capitalize" aria-live="polite">
          {title}
        </h2>
        <Button size="sm" variant="outline" onClick={() => shift(-1)} aria-label={t("calendar.prev")}>
          ‹
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const now = new Date();
            setCursor({ year: now.getFullYear(), month: now.getMonth() });
          }}
        >
          {t("calendar.today")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => shift(1)} aria-label={t("calendar.next")}>
          ›
        </Button>
      </div>
      <Card size="flush" className="overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-xs" aria-label={title}>
          <thead>
            <tr>
              {weekdays.map((day) => (
                <th key={day} scope="col" className="border-b border-line px-2 py-1.5 text-left font-semibold text-ink-muted">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((week) => (
              <tr key={week[0]}>
                {week.map((day) => {
                  const due = byDay.get(toDateInputValue(day)) ?? [];
                  const outside = !inMonth(day, cursor.month);
                  return (
                    <td
                      key={day}
                      aria-label={new Date(day).toLocaleDateString(tag, { day: "numeric", month: "long" })}
                      className={`h-24 border-b border-r border-line/60 p-1 align-top ${outside ? "bg-surface-2/50 text-ink-muted" : ""}`}
                    >
                      <span
                        className={`mb-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 ${day === todayMs ? "bg-accent-600 font-semibold text-white" : ""}`}
                      >
                        {new Date(day).getDate()}
                      </span>
                      <ul className="space-y-0.5">
                        {due.map((task) => {
                          const late = !task.completedAt && day < todayMs;
                          return (
                            <li key={task.id}>
                              <button
                                type="button"
                                onClick={() => onOpen(task)}
                                title={task.title}
                                className={`block w-full truncate rounded px-1 py-0.5 text-left hover:bg-surface-2 ${
                                  task.completedAt ? "text-ink-muted line-through" : late ? "font-medium text-feedback-error" : ""
                                }`}
                              >
                                {task.title}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {undated > 0 && <p className="text-xs text-ink-muted">{t("calendar.undated", { count: undated })}</p>}
    </div>
  );
}
