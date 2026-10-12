"use client";

/**
 * App-level primitives.
 *
 * These keep the signatures the pages have always called, but the mechanics
 * underneath (focus trapping, labelling, dismissal) now come from shadcn/Base UI
 * instead of hand-rolled effects. Call sites did not have to change.
 */

import { cloneElement, isValidElement, useCallback, useId, useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Spinner as ShadcnSpinner } from "@/components/ui/spinner";
import { Avatar as ShadcnAvatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";
import { initials } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { dealHealthLabel } from "@/lib/deal-scoring";

export { Button } from "@/components/ui/button";

export type AsyncErrorProps = {
  message: React.ReactNode;
  hint?: React.ReactNode;
  onRetry: () => void;
  retryLabel?: React.ReactNode;
};

/** Recoverable request failure with an announced message and explicit retry. */
export function AsyncError({
  message,
  hint,
  onRetry,
  retryLabel,
}: AsyncErrorProps) {
  const t = useT();
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-feedback-error/25 bg-feedback-error-wash p-4"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{message}</p>
        {hint ? <p className="mt-1 text-sm text-ink-muted">{hint}</p> : null}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        {retryLabel ?? t("action.retry")}
      </Button>
    </div>
  );
}

export type ContextToolbarProps = {
  search?: React.ReactNode;
  filters?: React.ReactNode;
  view?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
};

/** Responsive layout slots for page-owned search, filters, views and actions. */
export function ContextToolbar({
  search,
  filters,
  view,
  actions,
  meta,
  className,
}: ContextToolbarProps) {
  return (
    <div
      className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}
      role="toolbar"
      aria-label="Context toolbar"
    >
      {search ? <div className="min-w-0 basis-full sm:flex-1 sm:basis-64">{search}</div> : null}
      {filters ? <ButtonGroup className="flex-wrap">{filters}</ButtonGroup> : null}
      {view ? <ButtonGroup>{view}</ButtonGroup> : null}
      {actions ? <ButtonGroup className="flex-wrap">{actions}</ButtonGroup> : null}
      {meta ? <div className="text-xs text-ink-muted">{meta}</div> : null}
    </div>
  );
}

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
  return (
    <Dialog open={open} onOpenChange={(next: boolean) => !next && onClose()}>
      <DialogContent
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
 * Compatibility wrapper for the existing preview call sites.
 *
 * The panel is a Base UI Sheet, so focus management, dismissal, and labelling
 * stay in the shared design-system primitive rather than a second drawer stack.
 */
export function Drawer({
  title,
  open,
  onClose,
  children,
  side = "right",
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  side?: "left" | "right";
}) {
  return (
    <Sheet open={open} onOpenChange={(next: boolean) => !next && onClose()}>
      <SheetContent
        side={side}
        showCloseButton
        className="w-full max-w-md overflow-y-auto border-line bg-surface p-5"
      >
        <SheetHeader className="p-0">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">{title}</SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
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
  const t = useT();
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
          {t("action.cancel")}
        </Button>
        <Button variant="destructive" onClick={() => answer(true)}>
          {request?.confirmLabel ?? t("action.delete")}
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
  id,
  hint,
  description,
  error,
  required,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
  hint?: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
}) {
  const generatedId = useId().replace(/:/g, "");
  const child = isValidElement(children) ? children : null;
  const childProps = (child?.props ?? {}) as {
    id?: string;
    required?: boolean;
    [key: string]: unknown;
  };
  const hintContent = hint ?? description;
  const hasError = error !== undefined && error !== null && error !== false && error !== "";
  const controlId =
    id ??
    childProps.id ??
    (hintContent || hasError || required ? "field-" + generatedId : undefined);
  const hintId = hintContent && controlId ? controlId + "-hint" : undefined;
  const errorId = hasError && controlId ? controlId + "-error" : undefined;
  const describedBy = [childProps["aria-describedby"], hintId, errorId]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
  const control = child
    ? cloneElement(child, {
        ...(controlId ? { id: controlId } : {}),
        ...(required !== undefined ? { required } : {}),
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(hasError ? { "aria-invalid": true } : {}),
      })
    : children;

  return (
    <label htmlFor={controlId} className={"block " + (className ?? "")}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </span>
      {control}
      {hintContent && hintId ? (
        <span id={hintId} className="mt-1 block text-xs text-ink-muted">
          {hintContent}
        </span>
      ) : null}
      {hasError && errorId ? (
        <span id={errorId} role="alert" className="mt-1 block text-xs text-feedback-error">
          {error}
        </span>
      ) : null}
    </label>
  );
}

const STATUS_STYLES: Record<string, string> = {
  lead: "bg-status-lead-wash text-status-lead",
  qualified: "bg-status-qualified-wash text-status-qualified",
  customer: "bg-status-customer-wash text-status-customer",
  churned: "bg-status-churned-wash text-status-churned",
};

const STATUS_KEYS: Record<string, MessageKey> = {
  lead: "status.lead",
  qualified: "status.qualified",
  customer: "status.customer",
  churned: "status.churned",
};

export function StatusChip({ status }: { status: string | null | undefined }) {
  const t = useT();
  if (!status) return null;
  const key = STATUS_KEYS[status];
  return (
    <span
      className={cn("chip", !key && "capitalize", STATUS_STYLES[status] ?? "bg-status-lead-wash text-status-lead")}
    >
      {key ? t(key) : status}
    </span>
  );
}

export function ScoreBadge({ score }: { score: number | null | undefined }) {
  const t = useT();
  if (score == null) return null;
  const band = score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
  // The band scale runs red → amber → blue, not orange → amber → sky: an orange
  // "hot" chip sitting beside the brand-orange primary button stops meaning
  // anything. Each chip is a 10% wash behind saturated text, never a solid fill.
  const style =
    band === "hot"
      ? "bg-score-hot-wash text-score-hot"
      : band === "warm"
        ? "bg-score-warm-wash text-score-warm"
        : "bg-score-cold-wash text-score-cold";
  const labelKey = band === "hot" ? "score.hot" : band === "warm" ? "score.warm" : "score.cold";
  // The band is named, not drawn as an emoji: an OS-rendered glyph has its own
  // stroke voice and its own advance width, so the score after it never lines up
  // down a column. The wash already carries the band; the word removes the guess.
  return (
    <span
      className={`chip capitalize tabular-nums ${style}`}
      title={t("score.leadTitle", { score })}
    >
      {t(labelKey)} {score}
    </span>
  );
}

const HEALTH_STYLES: Record<ReturnType<typeof dealHealthLabel>, string> = {
  healthy: "bg-feedback-ok-wash text-feedback-ok",
  at_risk: "bg-feedback-warn-wash text-feedback-warn",
  stalled: "bg-feedback-error-wash text-feedback-error",
};

const HEALTH_KEYS = {
  healthy: "health.healthy",
  at_risk: "health.at_risk",
  stalled: "health.stalled",
} as const;

export function HealthBadge({ score }: { score: number | null | undefined }) {
  const t = useT();
  if (score == null) return null;
  const band = dealHealthLabel(score);
  return (
    <span
      data-testid="health-badge"
      data-band={band}
      className={`chip capitalize tabular-nums ${HEALTH_STYLES[band]}`}
      title={t("health.title", { score })}
    >
      {t(HEALTH_KEYS[band])} {score}
    </span>
  );
}

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-priority-high-wash text-priority-high",
  medium: "bg-priority-medium-wash text-priority-medium",
  low: "bg-priority-low-wash text-priority-low",
};

const PRIORITY_KEYS: Record<string, MessageKey> = {
  high: "priority.high",
  medium: "priority.medium",
  low: "priority.low",
};

export function PriorityChip({ priority }: { priority: string }) {
  const t = useT();
  const key = PRIORITY_KEYS[priority];
  return (
    <span className={cn("chip", !key && "capitalize", PRIORITY_STYLES[priority])}>
      {key ? t(key) : priority}
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

/** A failed client fetch: retry instead of spinning forever. */
export function LoadError({ onRetry, compact }: { onRetry: () => void; compact?: boolean }) {
  const t = useT();
  const retry = (
    <Button onClick={onRetry} variant={compact ? "outline" : "default"} size={compact ? "sm" : "default"}>
      {t("action.retry")}
    </Button>
  );
  if (compact) {
    return (
      <div role="alert" className="flex flex-col items-center gap-2 py-4 text-center">
        <p className="text-sm text-ink-muted">{t("error.loadFailed")}</p>
        {retry}
      </div>
    );
  }
  return (
    <div role="alert">
      <EmptyState
        title={t("error.loadFailed")}
        hint={t("error.loadFailedHint")}
        action={retry}
      />
    </div>
  );
}

export function Spinner({ label }: { label?: string } = {}) {
  const t = useT();
  const accessibleLabel = label ?? t("common.loading");
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={accessibleLabel}
      className="flex justify-center py-10"
    >
      <ShadcnSpinner aria-hidden="true" className="size-6 text-accent-700" />
      <span className="sr-only">{accessibleLabel}</span>
    </div>
  );
}
