"use client";

import { Button } from "./button";
import type { ReactNode } from "react";

export type AsyncErrorProps = {
  message: ReactNode;
  hint?: ReactNode;
  onRetry: () => void;
  retryLabel?: ReactNode;
};

/** Recoverable request failure with an announced message and an explicit retry. */
export function AsyncError({ message, hint, onRetry, retryLabel = "Retry" }: AsyncErrorProps) {
  return (
    <div role="alert" className="surface surface-danger flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{message}</p>
        {hint ? <p className="mt-1 text-sm text-ink-muted">{hint}</p> : null}
      </div>
      <Button type="button" variant="neutral" size="compact" onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}
