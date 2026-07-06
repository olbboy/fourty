"use client";

import { useEffect } from "react";
import { IconX } from "./icons";
import { initials } from "@/lib/format";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({
  title,
  open,
  onClose,
  children,
  wide,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className={`card max-h-[92dvh] w-full animate-fade-up overflow-y-auto rounded-b-none p-5 shadow-2xl sm:rounded-xl ${
          wide ? "sm:max-w-2xl" : "sm:max-w-md"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="btn-ghost !border-0 !px-2" aria-label="Close">
            <IconX width={16} height={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  lead: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  qualified: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
  customer: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  churned: "bg-red-500/10 text-red-500 dark:text-red-300",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span className={`chip capitalize ${STATUS_STYLES[status] ?? "bg-slate-500/10 text-slate-500"}`}>
      {status}
    </span>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const label = score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
  const style =
    label === "hot"
      ? "bg-orange-500/10 text-orange-600 dark:text-orange-300"
      : label === "warm"
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-300"
        : "bg-sky-500/10 text-sky-600 dark:text-sky-300";
  return (
    <span className={`chip ${style}`} title={`Lead score: ${score}/100 (auto-computed)`}>
      {label === "hot" ? "🔥" : label === "warm" ? "🌤" : "❄️"} {score}
    </span>
  );
}

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-500/10 text-red-500 dark:text-red-300",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
  low: "bg-slate-500/10 text-slate-500 dark:text-slate-300",
};

export function PriorityChip({ priority }: { priority: string }) {
  return (
    <span className={`chip capitalize ${PRIORITY_STYLES[priority] ?? ""}`}>{priority}</span>
  );
}

export function Avatar({ name, size = 8 }: { name: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-accent-600/15 text-xs font-bold text-accent-600 dark:text-accent-400"
      style={{ width: size * 4, height: size * 4 }}
    >
      {initials(name || "?")}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="max-w-sm text-sm text-ink-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent-600" />
    </div>
  );
}
