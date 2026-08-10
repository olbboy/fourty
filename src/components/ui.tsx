"use client";

/**
 * App-level primitives.
 *
 * These keep the signatures the pages have always called, but the mechanics
 * underneath (focus trapping, labelling, dismissal) now come from shadcn/Base UI
 * instead of hand-rolled effects. Call sites did not have to change.
 */

import { useEffect, useRef } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner as ShadcnSpinner } from "@/components/ui/spinner";
import { Avatar as ShadcnAvatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
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
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>
        )}
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
  const contentRef = useRef<HTMLDivElement>(null);

  // Base UI leaves focus behind the overlay when this dialog opens. That is not
  // just an announcement problem: Base UI binds Escape-to-dismiss to the focused
  // popup, so without this the modal also stops closing on Escape. One frame of
  // delay lets the popup mount before we reach for it.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => contentRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        ref={contentRef}
        className={cn(
          "max-h-[92dvh] overflow-y-auto",
          wide ? "sm:max-w-2xl" : "sm:max-w-md",
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {/* Every dialog needs a description for screen readers; these dialogs
              carry their own body copy, so it stays visually hidden. */}
          <DialogDescription className="sr-only">{title}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
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
  // Wrapping the control in <label> gives an implicit label association without
  // threading an id through every field (a11y, Gate C5).
  //
  // Deliberately NOT built on shadcn's Field/FieldLabel: those compose a label,
  // description and error message around a control, and their `flex w-fit` label
  // fights the full-width inputs every form here uses. New forms that want
  // descriptions and inline errors should use @/components/ui/field directly.
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

const STATUS_STYLES: Record<string, string> = {
  lead: "bg-status-lead-wash text-status-lead",
  qualified: "bg-status-qualified-wash text-status-qualified",
  customer: "bg-status-customer-wash text-status-customer",
  churned: "bg-status-churned-wash text-status-churned",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`chip capitalize ${STATUS_STYLES[status] ?? "bg-status-lead-wash text-status-lead"}`}
    >
      {status}
    </span>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const label = score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
  // The band scale runs red → amber → blue, not orange → amber → sky: an orange
  // "hot" chip sitting beside the brand-orange primary button stops meaning
  // anything. Each chip is a 10% wash behind saturated text, never a solid fill.
  const style =
    label === "hot"
      ? "bg-score-hot-wash text-score-hot"
      : label === "warm"
        ? "bg-score-warm-wash text-score-warm"
        : "bg-score-cold-wash text-score-cold";
  return (
    <span
      className={`chip ${style}`}
      title={`Lead score: ${score}/100 (auto-computed)`}
    >
      {label === "hot" ? "🔥" : label === "warm" ? "🌤" : "❄️"} {score}
    </span>
  );
}

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-priority-high-wash text-priority-high",
  medium: "bg-priority-medium-wash text-priority-medium",
  low: "bg-priority-low-wash text-priority-low",
};

export function PriorityChip({ priority }: { priority: string }) {
  return (
    <span className={`chip capitalize ${PRIORITY_STYLES[priority] ?? ""}`}>
      {priority}
    </span>
  );
}

export function Avatar({ name, size = 8 }: { name: string; size?: number }) {
  return (
    <ShadcnAvatar
      className="shrink-0"
      style={{ width: size * 4, height: size * 4 }}
    >
      <AvatarFallback className="bg-accent-600/15 text-xs font-bold text-accent-700 dark:text-accent-400">
        {initials(name || "?")}
      </AvatarFallback>
    </ShadcnAvatar>
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
    <Empty className="card px-6 py-14">
      <EmptyHeader>
        <EmptyTitle className="font-medium">{title}</EmptyTitle>
        {hint && (
          <EmptyDescription className="max-w-sm">{hint}</EmptyDescription>
        )}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <ShadcnSpinner className="size-6 text-accent-700" />
    </div>
  );
}
