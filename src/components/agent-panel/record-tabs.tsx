"use client";

import { useState } from "react";
import { Timeline } from "@/components/record-panels";
import { useAiEnabled } from "@/components/ai-enabled";
import { AgentPanel } from "./index";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n/provider";

/**
 * The record's middle column: **Timeline | Agent** (Phase 4).
 *
 * Both panes stay mounted for the life of the page and the inactive one is
 * hidden. Unmounting the agent pane on a tab switch would abort a stream
 * mid-answer and leave the reply with nothing to arrive into — "I went to
 * another tab and the answer never came back". Hiding costs one DOM subtree.
 *
 * The agent pane still does no work until the tab is opened once; after that it
 * keeps whatever it loaded.
 */
export function RecordTabs({
  entityType,
  entityId,
  refreshKey,
  onChanged,
}: {
  entityType: string;
  entityId: string;
  refreshKey: number;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<"timeline" | "agent">("timeline");
  const aiEnabled = useAiEnabled();
  const t = useT();

  return (
    <Card size="flush" className="p-4">
      <div role="tablist" aria-label={t("record.tabsAria")} className="mb-3 flex gap-1">
        {(["timeline", "agent"] as const).map((key) => (
          <button
            key={key}
            role="tab"
            id={`record-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`record-panel-${key}`}
            onClick={() => setTab(key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab === key ? "bg-accent-600/10 text-accent-700 dark:text-accent-400" : "text-ink-muted hover:bg-surface-2"
            }`}
          >
            {key === "timeline" ? t("record.timeline") : t("record.agent")}
          </button>
        ))}
      </div>

      <div id="record-panel-timeline" role="tabpanel" aria-labelledby="record-tab-timeline" hidden={tab !== "timeline"}>
        <Timeline entityType={entityType} entityId={entityId} refreshKey={refreshKey} />
      </div>
      <div id="record-panel-agent" role="tabpanel" aria-labelledby="record-tab-agent" hidden={tab !== "agent"}>
        <AgentPanel
          entityType={entityType}
          entityId={entityId}
          aiEnabled={aiEnabled}
          hidden={tab !== "agent"}
          onChanged={onChanged}
          refreshKey={refreshKey}
        />
      </div>
    </Card>
  );
}
