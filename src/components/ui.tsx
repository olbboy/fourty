"use client";

import { useEffect, useId, useRef } from "react";
import { IconX } from "./icons";
import { initials } from "@/lib/format";

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const dialogStack: HTMLElement[] = [];

function isActuallyVisible(element: HTMLElement): boolean {
  if (
    element.hidden ||
    element.getAttribute("aria-hidden") === "true" ||
    element.getAttribute("aria-disabled") === "true"
  ) {
    return false;
  }

  const styles = window.getComputedStyle(element);
  return (
    styles.display !== "none" &&
    styles.visibility !== "hidden" &&
    element.getClientRects().length > 0
  );
}

function isActuallyFocusable(element: HTMLElement): boolean {
  return !element.hasAttribute("disabled") && isActuallyVisible(element) && element.tabIndex >= 0;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isActuallyFocusable);
}

function canRestoreFocus(element: HTMLElement | null): element is HTMLElement {
  if (!element || element === document.body || element === document.documentElement) return false;
  if (!element.isConnected || element.hasAttribute("disabled") || !isActuallyVisible(element)) return false;

  // A modal surface is intentionally `tabIndex={-1}`: it must be focusable by
  // script for nested-close restore, while its tabbable children still remain
  // governed by `focusableElements` above.
  const isLiveDialog =
    dialogStack.includes(element) &&
    element.getAttribute("role") === "dialog" &&
    element.getAttribute("aria-modal") === "true";
  return element.tabIndex >= 0 || element.hasAttribute("tabindex") || isLiveDialog;
}

function focusDialogFallback(): void {
  const fallback = document.querySelector<HTMLElement>(
    "[data-dialog-focus-fallback], main#main, [role=main], [data-list-container]",
  );
  if (!fallback) return;
  if (!fallback.hasAttribute("tabindex")) fallback.setAttribute("tabindex", "-1");
  fallback.focus();
}

function restoreFocus(trigger: HTMLElement | null): void {
  if (canRestoreFocus(trigger)) {
    trigger.focus();
    return;
  }
  focusDialogFallback();
}

function useDialogFocusTrap(
  dialogRef: React.RefObject<HTMLDivElement | null>,
  open: boolean,
  onClose: () => void,
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogStack.push(dialog);
    dialog.focus();

    function onKeyDown(event: KeyboardEvent): void {
      if (dialogStack[dialogStack.length - 1] !== dialog) return;
      if (event.defaultPrevented) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (event.shiftKey) {
        if (current === first || current === dialog || !dialog.contains(current)) {
          event.preventDefault();
          last.focus();
        }
      } else if (current === last || !dialog.contains(current)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const wasTop = dialogStack[dialogStack.length - 1] === dialog;
      const index = dialogStack.lastIndexOf(dialog);
      if (index >= 0) dialogStack.splice(index, 1);
      if (!wasTop) return;

      const remainingTop = dialogStack[dialogStack.length - 1] ?? null;
      if (remainingTop) {
        if (trigger && remainingTop.contains(trigger) && canRestoreFocus(trigger)) {
          trigger.focus();
        } else if (canRestoreFocus(remainingTop)) {
          remainingTop.focus();
        } else {
          focusDialogFallback();
        }
        return;
      }

      restoreFocus(trigger);
    };
  }, [dialogRef, open]);
}

/**
 * Shared focus scope for modal surfaces. It keeps a stack so nested dialogs only
 * respond to Escape and Tab while they are the topmost surface.
 */
export function DialogFocusScope({
  open,
  onClose,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(dialogRef, open, onClose);
  return (
    <div ref={dialogRef} {...props}>
      {children}
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useDialogFocusTrap(dialogRef, open, onClose);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`card max-h-[92dvh] w-full animate-fade-up overflow-y-auto rounded-b-none p-5 shadow-2xl outline-none sm:rounded-xl ${
          wide ? "sm:max-w-2xl" : "sm:max-w-md"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <button onClick={onClose} className="btn-ghost !border-0 !px-2" aria-label="Close">
            <IconX width={16} height={16} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useDialogFocusTrap(dialogRef, open, onClose);

  if (!open) return null;
  return (
    <div
      className="dialog-backdrop fixed inset-0 z-40 flex bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`drawer-panel h-full w-full max-w-xl overflow-y-auto border-line bg-surface p-5 shadow-2xl outline-none ${
          side === "left" ? "mr-auto border-r" : "ml-auto border-l"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <button onClick={onClose} className="btn-ghost !border-0 !px-2" aria-label="Close">
            <IconX width={16} height={16} aria-hidden="true" />
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
  // Wrapping the control in <label> gives an implicit label association without
  // threading an id through every field (a11y, Gate C5).
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
