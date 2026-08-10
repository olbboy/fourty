"use client";

/**
 * App-level primitives.
 *
 * These keep the signatures the pages have always called, but the mechanics
 * underneath (focus trapping, labelling, dismissal) now come from shadcn/Base UI
 * instead of hand-rolled effects. Call sites did not have to change.
 */

import { useCallback, useEffect, useRef, useState } from "react";

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
import { Button } from "@/components/ui/button";
import { Spinner as ShadcnSpinner } from "@/components/ui/spinner";
import { Avatar as ShadcnAvatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { Card } from "@/components/ui/card";

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
        {/* `font-display` names the brand and editorial register — the page
            title and the KPI figure are the two places this product speaks in
            it. It resolves to the body face today, so this changes nothing on
            screen; it is what makes a real display face a one-line change
            rather than a hunt through every heading. */}
        <h1 className="font-display text-xl font-bold tracking-tight md:text-2xl">
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

/**
 * A confirmation the design system can actually reach.
 *
 * `window.confirm` is the one surface in this product no token touches: an OS
 * dialog, in the OS font, with OS buttons, in whatever language the browser
 * chose. It also blocks the main thread and cannot say which of two buttons is
 * the destructive one.
 *
 * The shape keeps call sites nearly as short as the built-in — one `await`:
 *
 * ```tsx
 * const [askConfirm, confirmDialog] = useConfirm();
 * async function remove() {
 *   if (!(await askConfirm({ title: "Delete this deal?", body: "…" }))) return;
 * }
 * return <>{confirmDialog}…</>;
 * ```
 *
 * NOTE: this replaces the *mechanism*, not the interaction. Several of these
 * confirmations guard reversible actions and would be better as an optimistic
 * write plus an Undo — which needs restore endpoints the API does not have yet.
 */
export function useConfirm(): [
  (request: ConfirmRequest) => Promise<boolean>,
  React.ReactNode,
] {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const settle = useRef<((confirmed: boolean) => void) | null>(null);

  const askConfirm = useCallback((next: ConfirmRequest) => {
    setRequest(next);
    return new Promise<boolean>((resolve) => {
      settle.current = resolve;
    });
  }, []);

  const answer = useCallback((confirmed: boolean) => {
    setRequest(null);
    settle.current?.(confirmed);
    settle.current = null;
  }, []);

  const confirmDialog = (
    <Modal
      title={request?.title ?? ""}
      open={request !== null}
      onClose={() => answer(false)}
    >
      {request?.body && <p className="text-sm text-ink-muted">{request.body}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={() => answer(false)}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={() => answer(true)}>
          {request?.confirmLabel ?? "Delete"}
        </Button>
      </div>
    </Modal>
  );

  return [askConfirm, confirmDialog];
}

export type ConfirmRequest = {
  /** The question, as the dialog's heading. */
  title: string;
  /** What happens if they go ahead — the part people actually need. */
  body?: string;
  /** Names the action, never "OK". Defaults to "Delete". */
  confirmLabel?: string;
};

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
  // The band is named, not drawn as an emoji: an OS-rendered glyph has its own
  // stroke voice and its own advance width, so the score after it never lines up
  // down a column. The wash already carries the band; the word removes the guess.
  return (
    <span
      className={`chip capitalize tabular-nums ${style}`}
      title={`Lead score: ${score}/100 (auto-computed)`}
    >
      {label} {score}
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

/**
 * The dashboard metric tile: an eyebrow, one number, and the context that makes
 * the number mean something.
 *
 * `hint` is not decoration. A bare figure is the thing this product refuses to
 * ship — a win rate carries its window, a forecast its method — so the hint is
 * where that qualification goes.
 */
export function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card size="flush" className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 font-display text-xl font-bold tracking-tight tabular-nums md:text-2xl">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </Card>
  );
}

/**
 * The 8px pipeline dot. The colour is workspace data, so it arrives as a prop
 * rather than a class — a stage can be recoloured per workspace.
 *
 * Decorative on its own: the stage name always sits beside it, so the dot is
 * hidden from assistive tech rather than announced as an unnamed graphic.
 */
export function StageDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-2 shrink-0 rounded-full ${className ?? ""}`}
      style={{ background: color }}
    />
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
    <Card size="flush" className="px-6 py-14">
      <Empty className="p-0">
        <EmptyHeader>
          <EmptyTitle className="font-medium">{title}</EmptyTitle>
          {hint && (
            <EmptyDescription className="max-w-sm">{hint}</EmptyDescription>
          )}
        </EmptyHeader>
        {action && <EmptyContent>{action}</EmptyContent>}
      </Empty>
    </Card>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <ShadcnSpinner className="size-6 text-accent-700" />
    </div>
  );
}
