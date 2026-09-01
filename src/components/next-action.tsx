"use client";

import type { NextAction } from "@/lib/next-action";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n/provider";

export function NextActionCard({ suggestion }: { suggestion: NextAction }) {
  const t = useT();
  return (
    <Card size="flush" className="p-4" data-testid="next-best-action">
      <h2 className="text-sm font-semibold">{t("nba.title")}</h2>
      <p className="mt-1 text-sm font-medium">{t(suggestion.action)}</p>
      <p className="mt-0.5 text-xs text-ink-muted">{t(suggestion.reason, suggestion.vars)}</p>
    </Card>
  );
}
