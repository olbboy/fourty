"use client";

import { useCallback, useEffect, useState } from "react";
import { Field, Spinner, LoadError, useConfirm } from "@/components/ui";
import { IconChevronDown, IconChevronUp, IconPlus, IconTrash } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n/provider";

type Stage = {
  id: string;
  name: string;
  winProbability: number;
  type: string;
  order: number;
  color: string;
};

type Pipeline = {
  id: string;
  name: string;
  stages: Stage[];
};

export function PipelinesSection() {
  const t = useT();
  const [askConfirm, confirmDialog] = useConfirm();
  const [pipelines, setPipelines] = useState<Pipeline[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { name: string; winProbability: string; color: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [newName, setNewName] = useState<Record<string, string>>({});
  const [newProb, setNewProb] = useState<Record<string, string>>({});
  const [newColor, setNewColor] = useState<Record<string, string>>({});
  const [pipelineName, setPipelineName] = useState("");
  const [pipeDraft, setPipeDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/pipelines");
      if (!res.ok) throw new Error("pipelines");
      const list = ((await res.json()).pipelines ?? []) as Pipeline[];
      setPipelines(list);
      const next: Record<string, { name: string; winProbability: string; color: string }> = {};
      const names: Record<string, string> = {};
      for (const p of list) {
        names[p.id] = p.name;
        for (const s of p.stages) {
          next[s.id] = {
            name: s.name,
            winProbability: String(s.winProbability),
            color: s.color || "#a89f99",
          };
        }
      }
      setDraft(next);
      setPipeDraft(names);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveStage(stage: Stage) {
    const row = draft[stage.id];
    if (!row) return;
    const name = row.name.trim();
    const winProbability = Number(row.winProbability);
    const color = row.color;
    setError(null);
    setSaving(stage.id);
    const res = await fetch(`/api/stages/${stage.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, winProbability, color }),
    });
    setSaving(null);
    if (!res.ok) {
      setError(t("settings.pipelinesFailedSave"));
      return;
    }
    load();
  }

  async function moveStage(stage: Stage, dir: -1 | 1) {
    const pipeline = pipelines?.find((p) => p.stages.some((s) => s.id === stage.id));
    if (!pipeline) return;
    const sorted = pipeline.stages.slice().sort((a, b) => a.order - b.order);
    const i = sorted.findIndex((s) => s.id === stage.id);
    const neighbor = sorted[i + dir];
    if (!neighbor) return;
    setError(null);
    setSaving(stage.id);
    const res = await fetch(`/api/stages/${stage.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order: neighbor.order }),
    });
    setSaving(null);
    if (!res.ok) {
      setError(t("settings.pipelinesFailedSave"));
      return;
    }
    load();
  }

  async function addStage(pipeline: Pipeline) {
    const name = (newName[pipeline.id] ?? "").trim();
    const winProbability = Number(newProb[pipeline.id] ?? "50");
    const color = newColor[pipeline.id] ?? "#a89f99";
    if (!name) return;
    setError(null);
    setSaving(pipeline.id);
    const res = await fetch("/api/stages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pipelineId: pipeline.id, name, winProbability, color }),
    });
    setSaving(null);
    if (!res.ok) {
      setError(t("settings.pipelinesFailedAdd"));
      return;
    }
    setNewName((d) => ({ ...d, [pipeline.id]: "" }));
    setNewProb((d) => ({ ...d, [pipeline.id]: "50" }));
    setNewColor((d) => ({ ...d, [pipeline.id]: "#a89f99" }));
    load();
  }

  async function addPipeline() {
    const name = pipelineName.trim();
    if (!name) return;
    setError(null);
    setSaving("__pipeline__");
    const res = await fetch("/api/pipelines", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setSaving(null);
    if (!res.ok) {
      setError(t("settings.pipelinesFailedAddPipeline"));
      return;
    }
    setPipelineName("");
    load();
  }

  async function savePipeline(pipeline: Pipeline) {
    const name = (pipeDraft[pipeline.id] ?? pipeline.name).trim();
    if (!name) return;
    setError(null);
    setSaving(pipeline.id);
    const res = await fetch(`/api/pipelines/${pipeline.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setSaving(null);
    if (!res.ok) {
      setError(t("settings.pipelinesFailedSavePipeline"));
      return;
    }
    load();
  }

  async function removePipeline(pipeline: Pipeline) {
    const ok = await askConfirm({
      title: t("settings.pipelinesDeletePipelineTitle", { name: pipeline.name }),
      body: t("settings.pipelinesDeletePipelineBody"),
    });
    if (!ok) return;
    setError(null);
    setSaving(pipeline.id);
    const res = await fetch(`/api/pipelines/${pipeline.id}`, { method: "DELETE" });
    setSaving(null);
    if (!res.ok) {
      const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error;
      setError(
        msg === "Move deals out of this pipeline first"
          ? t("settings.pipelinesDeletePipelineHasDeals")
          : msg === "A workspace needs at least one pipeline"
            ? t("settings.pipelinesDeleteLastPipeline")
            : t("settings.pipelinesFailedDeletePipeline"),
      );
      return;
    }
    load();
  }

  async function removeStage(stage: Stage) {
    const ok = await askConfirm({
      title: t("settings.pipelinesDeleteTitle", { name: stage.name }),
      body: t("settings.pipelinesDeleteBody"),
    });
    if (!ok) return;
    setError(null);
    setSaving(stage.id);
    const res = await fetch(`/api/stages/${stage.id}`, { method: "DELETE" });
    setSaving(null);
    if (!res.ok) {
      const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error;
      setError(
        msg === "Move deals out of this stage first"
          ? t("settings.pipelinesDeleteHasDeals")
          : msg === "Won and lost stages cannot be deleted"
            ? t("settings.pipelinesDeleteClosed")
            : msg === "A pipeline needs at least one open stage"
              ? t("settings.pipelinesDeleteLastOpen")
              : t("settings.pipelinesFailedDelete"),
      );
      return;
    }
    load();
  }

  return (
    <Card size="flush" className="p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{t("settings.pipelines")}</h2>
        <p className="text-sm text-ink-muted">{t("settings.pipelinesHint")}</p>
      </div>
      {error && <p className="mb-3 text-sm text-feedback-error">{error}</p>}
      {failed ? (
        <LoadError
          onRetry={() => {
            setPipelines(null);
            void load();
          }}
        />
      ) : !pipelines ? (
        <Spinner />
      ) : (
        <>
        {pipelines.map((p, i) => (
          <div
            key={p.id}
            className={i === 0 ? "space-y-2" : "mt-6 space-y-2 border-t border-line/60 pt-4"}
            data-testid="pipeline"
            data-pipeline-name={p.name}
          >
            <div className="flex flex-wrap items-end gap-2">
              <Field label={t("settings.pipelinesName")} className="min-w-[10rem] flex-1">
                <Input
                  value={pipeDraft[p.id] ?? p.name}
                  onChange={(e) => setPipeDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                />
              </Field>
              <Button
                type="button"
                size="sm"
                disabled={saving === p.id}
                aria-label={t("settings.pipelinesSavePipelineAria", { name: p.name })}
                onClick={() => void savePipeline(p)}
              >
                {t("action.save")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="text-feedback-error"
                disabled={saving === p.id || pipelines.length <= 1}
                aria-label={t("settings.pipelinesDeletePipelineAria", { name: p.name })}
                onClick={() => void removePipeline(p)}
              >
                <IconTrash width={15} height={15} />
              </Button>
            </div>
            <ul className="divide-y divide-line/60">
              {p.stages
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((s, i, sorted) => {
                  const row = draft[s.id] ?? {
                    name: s.name,
                    winProbability: String(s.winProbability),
                    color: s.color || "#a89f99",
                  };
                  const busy = saving === s.id;
                  const openCount = sorted.filter((x) => x.type === "open").length;
                  const canDelete = s.type === "open" && openCount > 1;
                  return (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-end gap-2 py-2"
                      data-testid="pipeline-stage"
                      data-stage-name={s.name}
                      data-stage-type={s.type}
                    >
                      <Field label={s.name} className="min-w-[10rem] flex-1">
                        <Input
                          value={row.name}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, [s.id]: { ...row, name: e.target.value } }))
                          }
                        />
                      </Field>
                      <Field label={t("settings.pipelinesWinProbAria", { name: s.name })} className="w-28">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={row.winProbability}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, [s.id]: { ...row, winProbability: e.target.value } }))
                          }
                        />
                      </Field>
                      <Field label={t("settings.pipelinesColorAria", { name: s.name })} className="w-14">
                        <Input
                          type="color"
                          value={row.color}
                          onChange={(e) => setDraft((d) => ({ ...d, [s.id]: { ...row, color: e.target.value } }))}
                          className="h-8 w-10 cursor-pointer p-1"
                        />
                      </Field>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        disabled={busy || i === 0}
                        aria-label={t("settings.pipelinesMoveUpAria", { name: s.name })}
                        onClick={() => void moveStage(s, -1)}
                      >
                        <IconChevronUp width={15} height={15} />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        disabled={busy || i === sorted.length - 1}
                        aria-label={t("settings.pipelinesMoveDownAria", { name: s.name })}
                        onClick={() => void moveStage(s, 1)}
                      >
                        <IconChevronDown width={15} height={15} />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        aria-label={t("settings.pipelinesSaveAria", { name: s.name })}
                        onClick={() => void saveStage(s)}
                      >
                        {t("action.save")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        className="text-feedback-error"
                        disabled={busy || !canDelete}
                        aria-label={t("settings.pipelinesDeleteAria", { name: s.name })}
                        onClick={() => void removeStage(s)}
                      >
                        <IconTrash width={15} height={15} />
                      </Button>
                    </li>
                  );
                })}
            </ul>
            <div className="flex flex-wrap items-end gap-2 pt-2">
              <Field label={t("settings.pipelinesNewName")} className="min-w-[10rem] flex-1">
                <Input
                  value={newName[p.id] ?? ""}
                  onChange={(e) => setNewName((d) => ({ ...d, [p.id]: e.target.value }))}
                />
              </Field>
              <Field label={t("settings.pipelinesNewWinProb")} className="w-28">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={newProb[p.id] ?? "50"}
                  onChange={(e) => setNewProb((d) => ({ ...d, [p.id]: e.target.value }))}
                />
              </Field>
              <Field label={t("settings.pipelinesNewColor")} className="w-14">
                <Input
                  type="color"
                  value={newColor[p.id] ?? "#a89f99"}
                  onChange={(e) => setNewColor((d) => ({ ...d, [p.id]: e.target.value }))}
                  className="h-8 w-10 cursor-pointer p-1"
                />
              </Field>
              <Button
                type="button"
                size="sm"
                disabled={saving === p.id || !(newName[p.id] ?? "").trim()}
                aria-label={t("settings.pipelinesAddAria", { name: p.name })}
                onClick={() => void addStage(p)}
              >
                <IconPlus width={15} height={15} /> {t("settings.pipelinesAdd")}
              </Button>
            </div>
          </div>
        ))}
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line/60 pt-3">
          <Field label={t("settings.pipelinesNewPipeline")} className="min-w-[10rem] flex-1">
            <Input value={pipelineName} onChange={(e) => setPipelineName(e.target.value)} />
          </Field>
          <Button
            type="button"
            size="sm"
            disabled={saving === "__pipeline__" || !pipelineName.trim()}
            aria-label={t("settings.pipelinesAddPipelineAria")}
            onClick={() => void addPipeline()}
          >
            <IconPlus width={15} height={15} /> {t("settings.pipelinesAddPipeline")}
          </Button>
        </div>
        </>
      )}
      {confirmDialog}
    </Card>
  );
}
