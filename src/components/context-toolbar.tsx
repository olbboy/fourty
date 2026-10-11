"use client";

import type { ReactNode } from "react";

export type ContextToolbarProps = {
  search?: ReactNode;
  filters?: ReactNode;
  view?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
};

function joinClasses(...classes: Array<string | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Layout-only slots for page-owned search, filtering, view, action, and meta
 * controls. It does not own query state, data fetching, or navigation.
 */
export function ContextToolbar({
  search,
  filters,
  view,
  actions,
  meta,
  className,
}: ContextToolbarProps) {
  return (
    <div className={joinClasses("context-toolbar", className)} role="toolbar" aria-label="Context toolbar">
      {search ? <div className="context-toolbar-search">{search}</div> : null}
      {filters ? <div className="context-toolbar-filters">{filters}</div> : null}
      {view ? <div className="context-toolbar-view">{view}</div> : null}
      {actions ? <div className="context-toolbar-actions">{actions}</div> : null}
      {meta ? <div className="context-toolbar-meta">{meta}</div> : null}
    </div>
  );
}
