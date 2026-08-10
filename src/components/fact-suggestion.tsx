"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Suggestions from the evidence ledger (ADR-018), shown under the fields they
 * are about.
 *
 * A rep asked to accept a suggestion needs to read *why*, not a number — so the
 * rationale is the evidence text itself ("their signature on 14 July reads …"),
 * and the score is a quiet second-order detail. Evidence is rendered as text,
 * never as HTML: it comes from mail somebody else wrote.
 *
 * Dismiss is permanent for that exact value, and the button says so.
 */
export type RecordFact = {
  id: string;
  entityType: string;
  entityId: string;
  field: string;
  value: string;
  previousValue: string | null;
  score: number;
  band: string;
  evidence: { kind: string; detail: string; sourceUrl?: string }[];
  status: string;
  method: string;
  decidedBy: string | null;
  observedAt: number;
};

type Props = {
  entityType: "contact" | "company";
  entityId: string;
  /** Called after a decision lands, so the record reloads with the new value. */
  onDecided: () => void;
};

/**
 * Fetch this record's suggestions plus what the pass has already applied.
 *
 * `enabled` exists for surfaces that are mounted before they are looked at — a
 * tab renders long before anyone opens it, and two callers on one page would
 * otherwise ask the same question twice on every record view.
 */
export function useFacts(entityType: string, entityId: string, refreshKey: number, enabled = true) {
  const [proposed, setProposed] = useState<RecordFact[]>([]);
  const [applied, setApplied] = useState<RecordFact[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const load = async (status: string) => {
      const res = await fetch(
        `/api/facts?entityType=${entityType}&entityId=${entityId}&status=${status}`,
      );
      if (!res.ok) return [];
      return ((await res.json()).facts ?? []) as (Omit<RecordFact, "evidence"> & { evidence: string })[];
    };
    Promise.all([load("PROPOSED"), load("APPLIED")]).then(([p, a]) => {
      if (!live) return;
      setProposed(p.map(parseEvidence));
      setApplied(a.map(parseEvidence));
    });
    return () => {
      live = false;
    };
  }, [entityType, entityId, refreshKey, enabled]);

  return { proposed, applied };
}

function parseEvidence(row: Omit<RecordFact, "evidence"> & { evidence: string }): RecordFact {
  return { ...row, evidence: typeof row.evidence === "string" ? JSON.parse(row.evidence) : row.evidence };
}

async function decide(id: string, decision: "accept" | "dismiss" | "revert"): Promise<void> {
  await fetch(`/api/facts/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision }),
  });
}

/** One proposal: the value, why it is believed, and the two decisions. */
export function FactSuggestion({ fact, onDecided }: { fact: RecordFact; onDecided: () => void }) {
  const [busy, setBusy] = useState(false);
  const act = useCallback(
    async (decision: "accept" | "dismiss") => {
      setBusy(true);
      await decide(fact.id, decision);
      setBusy(false);
      onDecided();
    },
    [fact.id, onDecided],
  );

  return (
    <div className="mt-1 rounded-lg border border-dashed border-line bg-surface-2/60 px-2.5 py-2">
      <p className="text-sm font-medium">{fact.value}</p>
      <ul className="mt-0.5 space-y-0.5">
        {fact.evidence.map((e, i) => (
          <li key={i} className="text-xs text-ink-muted">
            {e.detail}
            {e.sourceUrl && (
              <>
                {" — "}
                <a href={e.sourceUrl} rel="noreferrer noopener" target="_blank" className="underline">
                  source
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-1.5 flex items-center gap-2">
        <Button
          onClick={() => act("accept")}
          disabled={busy}
          aria-label={`Accept ${fact.value}`} size="xs">
          Accept
        </Button>
        <Button
          onClick={() => act("dismiss")}
          disabled={busy}
          aria-label={`Dismiss ${fact.value} permanently`} variant="outline" size="xs">
          Dismiss
        </Button>
        <span className="text-[11px] text-ink-muted">
          {fact.band === "VERIFIED" ? "Verified" : "Probable"} · {Math.round(fact.score * 100)}%
        </span>
      </div>
    </div>
  );
}

/**
 * An applied fact: what filled the field, and the one click that undoes it.
 * Every APPLIED fact carries a Revert (ADR-018 §5), including one a person
 * accepted — Revert undoes *this ledger write*, and who made it is not what
 * decides whether it can be taken back.
 */
export function AppliedFact({ fact, onDecided }: { fact: RecordFact; onDecided: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-muted">
      <span>
        {fact.decidedBy ? "Accepted from" : "Filled from"}{" "}
        {fact.evidence[0]?.detail ?? "mailbox evidence"}
      </span>
      <button
        onClick={async () => {
          setBusy(true);
          await decide(fact.id, "revert");
          setBusy(false);
          onDecided();
        }}
        disabled={busy}
        aria-label={`Revert ${fact.field}`}
        className="underline"
      >
        Revert
      </button>
    </p>
  );
}

/**
 * The block a record page drops under a field. Renders nothing at all when the
 * pass has no opinion about it, which is the common case.
 */
export function FactsForField({
  field,
  proposed,
  applied,
  onDecided,
}: {
  field: string;
  proposed: RecordFact[];
  applied: RecordFact[];
} & Pick<Props, "onDecided">) {
  const suggestions = proposed.filter((f) => f.field === field);
  const filled = applied.filter((f) => f.field === field);
  if (suggestions.length === 0 && filled.length === 0) return null;
  return (
    <>
      {filled.map((f) => (
        <AppliedFact key={f.id} fact={f} onDecided={onDecided} />
      ))}
      {suggestions.map((f) => (
        <FactSuggestion key={f.id} fact={f} onDecided={onDecided} />
      ))}
    </>
  );
}
