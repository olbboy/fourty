"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Pipeline, Stage } from "@/lib/types";
import { EmptyState, Field, Spinner, useConfirm } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IconChevronDown,
  IconChevronUp,
  IconEdit,
  IconPlus,
  IconTrash,
} from "@/components/icons";
import { useT } from "@/lib/i18n/provider";

type StageType = "open" | "won" | "lost";

type Mutation =
  | "pipeline:create"
  | "pipeline:rename"
  | "pipeline:default"
  | "pipeline:delete"
  | "stage:create"
  | "stage:update"
  | "stage:delete"
  | "stage:reorder"
  | "stage:save";

type PipelineResponse = { pipeline?: Pipeline };
type PipelinesResponse = { pipelines?: Pipeline[] };
type StageResponse = { stage?: Stage };
type StagesResponse = { stages?: Stage[] };

type StageDraft = {
  name: string;
  winProbability: string;
  color: string;
};

const DEFAULT_STAGE_COLOR = "#a89f99";

function errorMessage(value: unknown, fallback: string): string {
  if (value && typeof value === "object" && "error" in value) {
    const error = value.error;
    if (typeof error === "string" && error.trim()) return error;
  }
  return fallback;
}

async function responseError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  return errorMessage(body, `Request failed (${response.status})`);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(await responseError(response));
  return (await response.json().catch(() => ({}))) as T;
}

function normalizeStageType(type: string): StageType {
  return type === "won" || type === "lost" ? type : "open";
}

function defaultStage(): { name: string; winProbability: number; color: string } {
  return { name: "", winProbability: 50, color: DEFAULT_STAGE_COLOR };
}

function stagePayload(form: FormData): {
  name: string;
  winProbability: number;
  color: string;
} {
  const name = String(form.get("name") ?? "").trim();
  const parsedProbability = Number(form.get("winProbability"));
  const probability = Number.isFinite(parsedProbability)
    ? Math.max(0, Math.min(100, Math.round(parsedProbability)))
    : 50;

  return {
    name,
    winProbability: probability,
    color: String(form.get("color") ?? DEFAULT_STAGE_COLOR),
  };
}

function stageDraftPayload(draft: StageDraft): {
  name: string;
  winProbability: number;
  color: string;
} {
  const parsedProbability = Number(draft.winProbability);
  return {
    name: draft.name.trim(),
    winProbability: Number.isFinite(parsedProbability)
      ? Math.max(0, Math.min(100, Math.round(parsedProbability)))
      : 0,
    color: draft.color,
  };
}

export function PipelinesSection({ canManagePipelines = false }: { canManagePipelines?: boolean }) {
  const t = useT();
  const [askConfirm, confirmDialog] = useConfirm();
  const [pipelines, setPipelines] = useState<Pipeline[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Mutation | null>(null);
  const busyRef = useRef<Mutation | null>(null);
  const confirmingRef = useRef(false);
  const [pipelineName, setPipelineName] = useState("");
  const [pipelineDraft, setPipelineDraft] = useState<Record<string, string>>({});
  const [stageDraft, setStageDraft] = useState<Record<string, StageDraft>>({});
  const [newStageName, setNewStageName] = useState("");
  const [newStageProbability, setNewStageProbability] = useState("50");
  const [newStageColor, setNewStageColor] = useState(DEFAULT_STAGE_COLOR);
  const [showNewPipeline, setShowNewPipeline] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [showNewStage, setShowNewStage] = useState(false);
  const [editingStage, setEditingStage] = useState<Stage | null>(null);

  const load = useCallback(
    async (preferredId?: string): Promise<void> => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await requestJson<PipelinesResponse>("/api/pipelines");
        const next = Array.isArray(data.pipelines) ? data.pipelines : [];
        const nextPipelineDraft: Record<string, string> = {};
        const nextStageDraft: Record<string, StageDraft> = {};

        for (const pipeline of next) {
          nextPipelineDraft[pipeline.id] = pipeline.name;
          for (const stage of pipeline.stages) {
            nextStageDraft[stage.id] = {
              name: stage.name,
              winProbability: String(stage.winProbability),
              color: stage.color || DEFAULT_STAGE_COLOR,
            };
          }
        }

        setPipelines(next);
        setPipelineDraft(nextPipelineDraft);
        setStageDraft(nextStageDraft);
        setSelectedId((current) => {
          if (preferredId && next.some((pipeline) => pipeline.id === preferredId)) return preferredId;
          if (current && next.some((pipeline) => pipeline.id === current)) return current;
          return next.find((pipeline) => pipeline.isDefault === 1)?.id ?? next[0]?.id ?? null;
        });
      } catch (caught) {
        setLoadError(caught instanceof Error ? caught.message : t("settings.pipelinesLoadError"));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const selectedPipeline = useMemo(
    () => pipelines?.find((pipeline) => pipeline.id === selectedId) ?? null,
    [pipelines, selectedId],
  );
  const hasOpenDialog = showNewPipeline || showRename || showNewStage || editingStage !== null;
  const visibleError = loadError ?? (!hasOpenDialog ? mutationError : null);

  function clearMutationError(): void {
    setMutationError(null);
  }

  function beginMutation(next: Mutation): boolean {
    if (busyRef.current) return false;
    busyRef.current = next;
    setBusy(next);
    setMutationError(null);
    return true;
  }

  function endMutation(): void {
    busyRef.current = null;
    setBusy(null);
  }

  function closeDialog(close: () => void): void {
    close();
    clearMutationError();
  }

  async function createPipeline(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busyRef.current) return;
    const name = new FormData(event.currentTarget).get("name");
    if (typeof name !== "string" || !name.trim()) return;
    if (!beginMutation("pipeline:create")) return;
    try {
      const data = await requestJson<PipelineResponse>("/api/pipelines", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      setPipelineName("");
      setShowNewPipeline(false);
      await load(data.pipeline?.id);
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : t("settings.pipelineCreateError"));
    } finally {
      endMutation();
    }
  }

  async function renamePipeline(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedPipeline || busyRef.current) return;
    const name = new FormData(event.currentTarget).get("name");
    if (typeof name !== "string" || !name.trim()) return;
    if (!beginMutation("pipeline:rename")) return;
    try {
      await requestJson<PipelineResponse>(`/api/pipelines/${selectedPipeline.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      setShowRename(false);
      await load(selectedPipeline.id);
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : t("settings.pipelineUpdateError"));
    } finally {
      endMutation();
    }
  }

  async function setDefault(): Promise<void> {
    if (!selectedPipeline || selectedPipeline.isDefault === 1 || busyRef.current) return;
    if (!beginMutation("pipeline:default")) return;
    try {
      await requestJson<PipelineResponse>(`/api/pipelines/${selectedPipeline.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      await load(selectedPipeline.id);
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : t("settings.pipelineUpdateError"));
    } finally {
      endMutation();
    }
  }

  async function deletePipeline(target?: Pipeline): Promise<void> {
    const pipeline = target ?? selectedPipeline;
    if (!pipeline || pipeline.isDefault === 1 || busyRef.current || confirmingRef.current) return;
    confirmingRef.current = true;
    const confirmed = await askConfirm({
      title: t("settings.pipelineDeleteConfirm", { name: pipeline.name }),
      body: t("settings.pipelinesDeletePipelineBody"),
    });
    confirmingRef.current = false;
    if (!confirmed || busyRef.current) return;
    if (!beginMutation("pipeline:delete")) return;
    try {
      await requestJson<{ ok?: boolean }>(`/api/pipelines/${pipeline.id}`, { method: "DELETE" });
      await load();
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : t("settings.pipelineDeleteError"));
    } finally {
      endMutation();
    }
  }

  async function addStage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedPipeline || busyRef.current) return;
    const payload = stagePayload(new FormData(event.currentTarget));
    if (!payload.name) return;
    if (!beginMutation("stage:create")) return;
    try {
      await requestJson<StageResponse>(`/api/pipelines/${selectedPipeline.id}/stages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      setNewStageName("");
      setNewStageProbability("50");
      setNewStageColor(DEFAULT_STAGE_COLOR);
      setShowNewStage(false);
      await load(selectedPipeline.id);
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : t("settings.stageCreateError"));
    } finally {
      endMutation();
    }
  }

  async function updateStage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedPipeline || !editingStage || busyRef.current) return;
    const payload = stagePayload(new FormData(event.currentTarget));
    if (!payload.name) return;
    if (!beginMutation("stage:update")) return;
    try {
      await requestJson<StageResponse>(
        `/api/pipelines/${selectedPipeline.id}/stages/${editingStage.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      setEditingStage(null);
      await load(selectedPipeline.id);
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : t("settings.stageUpdateError"));
    } finally {
      endMutation();
    }
  }

  async function saveStage(stage: Stage): Promise<void> {
    if (!selectedPipeline || busyRef.current) return;
    const draft = stageDraft[stage.id];
    if (!draft || !draft.name.trim()) return;
    if (!beginMutation("stage:save")) return;
    try {
      await requestJson<StageResponse>(
        `/api/pipelines/${selectedPipeline.id}/stages/${stage.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(stageDraftPayload(draft)),
        },
      );
      await load(selectedPipeline.id);
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : t("settings.stageUpdateError"));
    } finally {
      endMutation();
    }
  }

  async function deleteStage(stage: Stage): Promise<void> {
    if (!selectedPipeline || busyRef.current || confirmingRef.current) return;
    const openStageCount = selectedPipeline.stages.filter(
      (current) => normalizeStageType(current.type) === "open",
    ).length;
    if (normalizeStageType(stage.type) !== "open" || openStageCount <= 1) return;
    const pipeline = selectedPipeline;
    confirmingRef.current = true;
    const confirmed = await askConfirm({
      title: t("settings.stageDeleteConfirm", { name: stage.name }),
      body: t("settings.pipelinesDeleteBody"),
    });
    confirmingRef.current = false;
    if (!confirmed || busyRef.current) return;
    if (!beginMutation("stage:delete")) return;
    try {
      await requestJson<{ ok?: boolean }>(
        `/api/pipelines/${pipeline.id}/stages/${stage.id}`,
        { method: "DELETE" },
      );
      await load(pipeline.id);
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : t("settings.stageDeleteError"));
    } finally {
      endMutation();
    }
  }

  async function moveStage(stage: Stage, direction: -1 | 1): Promise<void> {
    if (!selectedPipeline || busyRef.current) return;
    const index = selectedPipeline.stages.findIndex((current) => current.id === stage.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= selectedPipeline.stages.length) return;
    const stageIds = selectedPipeline.stages.map((current) => current.id);
    [stageIds[index], stageIds[target]] = [stageIds[target], stageIds[index]];
    if (!beginMutation("stage:reorder")) return;
    try {
      await requestJson<StagesResponse>(`/api/pipelines/${selectedPipeline.id}/stages`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageIds }),
      });
      await load(selectedPipeline.id);
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : t("settings.stageReorderError"));
    } finally {
      endMutation();
    }
  }

  function updateDraft(stage: Stage, field: keyof StageDraft, value: string): void {
    setStageDraft((current) => ({
      ...current,
      [stage.id]: {
        ...(current[stage.id] ?? {
          name: stage.name,
          winProbability: String(stage.winProbability),
          color: stage.color || DEFAULT_STAGE_COLOR,
        }),
        [field]: value,
      },
    }));
  }

  const pipelineList = pipelines ?? [];
  const selectedStages = selectedPipeline?.stages ?? [];
  const selectedOpenStageCount = selectedStages.filter(
    (stage) => normalizeStageType(stage.type) === "open",
  ).length;

  return (
    <Card
      size="flush"
      className="p-4"
      role="region"
      aria-labelledby="pipeline-settings-title"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="pipeline-settings-title" className="text-sm font-semibold">
            {t("settings.pipelines")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-muted">{t("settings.pipelinesHint")}</p>
          {!canManagePipelines && !loading && (
            <p className="mt-1 text-sm text-ink-muted" role="status">
              {t("settings.pipelinesReadOnly")}
            </p>
          )}
        </div>
        {canManagePipelines && (
          <Button
            type="button"
            onClick={() => {
              clearMutationError();
              setShowNewPipeline(true);
            }}
            disabled={busy !== null}
          >
            <IconPlus width={15} height={15} /> {t("settings.pipelineNew")}
          </Button>
        )}
      </div>

      {visibleError && (
        <div
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-feedback-error/25 bg-feedback-error-wash px-3 py-2.5 text-sm text-feedback-error"
          role="alert"
        >
          <span>{visibleError}</span>
          {loadError && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load(selectedId ?? undefined)}
              disabled={loading}
            >
              {loading ? t("common.loading") : t("action.retry")}
            </Button>
          )}
        </div>
      )}

      {loading && pipelines === null ? (
        <div aria-busy="true">
          <Spinner label={t("common.loading")} />
        </div>
      ) : pipelineList.length === 0 ? (
        <EmptyState
          title={t("settings.pipelinesEmpty")}
          hint={t("settings.pipelinesEmptyHint")}
          action={
            canManagePipelines ? (
              <Button
                type="button"
                onClick={() => {
                  clearMutationError();
                  setShowNewPipeline(true);
                }}
                disabled={busy !== null}
              >
                <IconPlus width={15} height={15} /> {t("settings.pipelineNew")}
              </Button>
            ) : undefined
          }
        />
      ) : selectedPipeline ? (
        <>
          <div className="grid gap-4 sm:grid-cols-[minmax(11rem,0.34fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <div className="sm:hidden">
                <Field label={t("settings.pipelineSelect")}>
                  <Select
                    value={selectedPipeline.id}
                    onValueChange={setSelectedId}
                    disabled={busy !== null}
                  >
                    <SelectTrigger aria-label={t("settings.pipelineSelect")} className="w-full max-w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-w-[calc(100vw-2rem)]">
                      {pipelineList.map((pipeline) => (
                        <SelectItem
                          key={pipeline.id}
                          value={pipeline.id}
                          className="max-w-full truncate"
                        >
                          {pipeline.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="hidden space-y-1 sm:block" aria-label={t("settings.pipelineList")}>
                {pipelineList.map((pipeline) => (
                  <div
                    key={pipeline.id}
                    data-testid={pipeline.id === selectedPipeline.id ? undefined : "pipeline"}
                    data-pipeline-name={pipeline.name}
                    className="flex items-center gap-1"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      aria-pressed={pipeline.id === selectedPipeline.id}
                      onClick={() => setSelectedId(pipeline.id)}
                      disabled={busy !== null}
                      className={`h-auto min-w-0 flex-1 justify-between rounded-md px-3 py-2 text-left text-sm ${
                        pipeline.id === selectedPipeline.id
                          ? "bg-accent-600/10 font-semibold text-accent-700 dark:text-accent-300"
                          : "text-ink-muted hover:text-ink"
                      }`}
                    >
                      <span className="min-w-0 truncate">{pipeline.name}</span>
                      {pipeline.isDefault === 1 && (
                        <span className="chip shrink-0">{t("settings.pipelineDefault")}</span>
                      )}
                    </Button>
                    {canManagePipelines && pipeline.id !== selectedPipeline.id && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 text-feedback-error"
                        aria-label={t("settings.pipelinesDeletePipelineAria", { name: pipeline.name })}
                        disabled={busy !== null || pipeline.isDefault === 1}
                        onClick={() => void deletePipeline(pipeline)}
                      >
                        <IconTrash width={14} height={14} />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div
              className="min-w-0 rounded-lg border border-line/70 p-3 sm:p-4"
              data-testid="pipeline"
              data-pipeline-name={selectedPipeline.name}
            >
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold">{selectedPipeline.name}</h3>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {selectedStages.length} {t("settings.stagesCount")}
                  </p>
                </div>
                {canManagePipelines && (
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        clearMutationError();
                        setShowRename(true);
                      }}
                      disabled={busy !== null}
                    >
                      <IconEdit width={14} height={14} /> {t("settings.pipelineRename")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void setDefault()}
                      disabled={busy !== null || selectedPipeline.isDefault === 1}
                      title={selectedPipeline.isDefault === 1 ? t("settings.pipelineAlreadyDefault") : undefined}
                    >
                      {t("settings.pipelineSetDefault")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void deletePipeline()}
                      disabled={busy !== null || selectedPipeline.isDefault === 1}
                      aria-label={t("settings.pipelinesDeletePipelineAria", { name: selectedPipeline.name })}
                      title={selectedPipeline.isDefault === 1 ? t("settings.pipelineCannotDeleteDefault") : undefined}
                      className="text-feedback-error"
                    >
                      <IconTrash width={14} height={14} /> {t("action.delete")}
                    </Button>
                  </div>
                )}
              </div>

              {canManagePipelines && (
                <form onSubmit={renamePipeline} className="mb-5 flex flex-wrap items-end gap-2 border-b border-line/60 pb-4">
                  <Field label={t("settings.pipelinesName")} className="min-w-[10rem] flex-1">
                    <Input
                      name="name"
                      aria-label={t("settings.pipelinesName")}
                      value={pipelineDraft[selectedPipeline.id] ?? selectedPipeline.name}
                      onChange={(event) =>
                        setPipelineDraft((current) => ({
                          ...current,
                          [selectedPipeline.id]: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={busy !== null}
                    aria-label={t("settings.pipelinesSavePipelineAria", { name: selectedPipeline.name })}
                  >
                    {busy === "pipeline:rename" ? t("common.saving") : t("action.save")}
                  </Button>
                </form>
              )}

              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">{t("settings.stages")}</h4>
                {canManagePipelines && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      clearMutationError();
                      setShowNewStage(true);
                    }}
                    disabled={busy !== null}
                  >
                    <IconPlus width={14} height={14} /> {t("settings.stageNew")}
                  </Button>
                )}
              </div>

              {selectedStages.length === 0 ? (
                <p className="py-4 text-sm text-ink-muted">{t("settings.stagesEmpty")}</p>
              ) : (
                <ul className="divide-y divide-line/60" aria-label={t("settings.stages")}>
                  {selectedStages.map((stage, index) => {
                    const draft = stageDraft[stage.id] ?? {
                      name: stage.name,
                      winProbability: String(stage.winProbability),
                      color: stage.color || DEFAULT_STAGE_COLOR,
                    };
                    const stageType = normalizeStageType(stage.type);
                    const canDelete = stageType === "open" && selectedOpenStageCount > 1;
                    return (
                      <li
                        key={stage.id}
                        className="flex flex-wrap items-end gap-2 py-3"
                        aria-label={stage.name}
                        data-testid="pipeline-stage"
                        data-stage-name={stage.name}
                        data-stage-type={stageType}
                      >
                        <Field label={stage.name} className="min-w-[10rem] flex-1">
                          <Input
                            aria-label={stage.name}
                            value={draft.name}
                            onChange={(event) => updateDraft(stage, "name", event.target.value)}
                            disabled={busy !== null}
                          />
                        </Field>
                        <Field
                          label={t("settings.pipelinesWinProbAria", { name: stage.name })}
                          className="w-28"
                        >
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            aria-label={t("settings.pipelinesWinProbAria", { name: stage.name })}
                            value={draft.winProbability}
                            onChange={(event) => updateDraft(stage, "winProbability", event.target.value)}
                            disabled={busy !== null}
                          />
                        </Field>
                        <Field
                          label={t("settings.pipelinesColorAria", { name: stage.name })}
                          className="w-14"
                        >
                          <Input
                            type="color"
                            aria-label={t("settings.pipelinesColorAria", { name: stage.name })}
                            value={draft.color}
                            onChange={(event) => updateDraft(stage, "color", event.target.value)}
                            className="h-8 cursor-pointer p-1"
                            disabled={busy !== null}
                          />
                        </Field>
                        <span className="mb-1 text-xs text-ink-muted">
                          {stage.winProbability}% · {stageTypeLabel(t, stageType)}
                        </span>
                        {canManagePipelines && (
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-sm"
                              onClick={() => void moveStage(stage, -1)}
                              disabled={busy !== null || index === 0}
                              aria-label={t("settings.stageMoveUp", { name: stage.name })}
                            >
                              <IconChevronUp width={14} height={14} />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-sm"
                              onClick={() => void moveStage(stage, 1)}
                              disabled={busy !== null || index === selectedStages.length - 1}
                              aria-label={t("settings.stageMoveDown", { name: stage.name })}
                            >
                              <IconChevronDown width={14} height={14} />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => {
                                clearMutationError();
                                setEditingStage(stage);
                              }}
                              disabled={busy !== null}
                              aria-label={t("settings.stageEdit", { name: stage.name })}
                            >
                              <IconEdit width={14} height={14} />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void saveStage(stage)}
                              disabled={busy !== null}
                              aria-label={t("settings.pipelinesSaveAria", { name: stage.name })}
                            >
                              {busy === "stage:save" ? t("common.saving") : t("action.save")}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="text-feedback-error"
                              onClick={() => void deleteStage(stage)}
                              disabled={busy !== null || !canDelete}
                              aria-label={t("settings.stageDelete", { name: stage.name })}
                              title={!canDelete ? t("settings.stageCannotDeleteLast") : undefined}
                            >
                              <IconTrash width={14} height={14} />
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {canManagePipelines && (
                <form onSubmit={addStage} className="mt-3 flex flex-wrap items-end gap-2 border-t border-line/60 pt-3">
                  <Field label={t("settings.pipelinesNewName")} className="min-w-[10rem] flex-1">
                    <Input
                      name="name"
                      aria-label={t("settings.pipelinesNewName")}
                      value={newStageName}
                      onChange={(event) => setNewStageName(event.target.value)}
                      disabled={busy !== null}
                    />
                  </Field>
                  <Field label={t("settings.pipelinesNewWinProb")} className="w-28">
                    <Input
                      name="winProbability"
                      type="number"
                      min={0}
                      max={100}
                      aria-label={t("settings.pipelinesNewWinProb")}
                      value={newStageProbability}
                      onChange={(event) => setNewStageProbability(event.target.value)}
                      disabled={busy !== null}
                    />
                  </Field>
                  <Field label={t("settings.pipelinesNewColor")} className="w-14">
                    <Input
                      name="color"
                      type="color"
                      aria-label={t("settings.pipelinesNewColor")}
                      value={newStageColor}
                      onChange={(event) => setNewStageColor(event.target.value)}
                      className="h-8 cursor-pointer p-1"
                      disabled={busy !== null}
                    />
                  </Field>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={busy !== null || !newStageName.trim()}
                    aria-label={t("settings.pipelinesAddAria", { name: selectedPipeline.name })}
                  >
                    <IconPlus width={15} height={15} /> {t("settings.pipelinesAdd")}
                  </Button>
                </form>
              )}
            </div>
          </div>

          {canManagePipelines && (
            <form onSubmit={createPipeline} className="mt-4 flex flex-wrap items-end gap-2 border-t border-line/60 pt-3">
              <Field label={t("settings.pipelinesNewPipeline")} className="min-w-[10rem] flex-1">
                <Input
                  name="name"
                  aria-label={t("settings.pipelinesNewPipeline")}
                  value={pipelineName}
                  onChange={(event) => setPipelineName(event.target.value)}
                  disabled={busy !== null}
                />
              </Field>
              <Button
                type="submit"
                size="sm"
                disabled={busy !== null || !pipelineName.trim()}
                aria-label={t("settings.pipelinesAddPipelineAria")}
              >
                <IconPlus width={15} height={15} /> {t("settings.pipelinesAddPipeline")}
              </Button>
            </form>
          )}
        </>
      ) : null}

      {canManagePipelines && (
        <>
          <Dialog open={showNewPipeline} onOpenChange={(open) => !open && closeDialog(() => setShowNewPipeline(false))}>
            <DialogContent className="max-h-[92dvh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("settings.pipelineNew")}</DialogTitle>
                <DialogDescription className="sr-only">{t("settings.pipelineNew")}</DialogDescription>
              </DialogHeader>
              <form onSubmit={createPipeline} className="space-y-4">
                <Field label={t("settings.pipelineName")}>
                  <Input name="name" required autoFocus />
                </Field>
                <FormError error={mutationError} />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => closeDialog(() => setShowNewPipeline(false))}>
                    {t("action.cancel")}
                  </Button>
                  <Button type="submit" disabled={busy !== null}>
                    {busy === "pipeline:create" ? t("common.saving") : t("settings.pipelineCreate")}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={showRename} onOpenChange={(open) => !open && closeDialog(() => setShowRename(false))}>
            <DialogContent className="max-h-[92dvh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("settings.pipelineRename")}</DialogTitle>
                <DialogDescription className="sr-only">{t("settings.pipelineRename")}</DialogDescription>
              </DialogHeader>
              <form onSubmit={renamePipeline} className="space-y-4">
                <Field label={t("settings.pipelineName")}>
                  <Input name="name" required defaultValue={selectedPipeline?.name ?? ""} autoFocus />
                </Field>
                <FormError error={mutationError} />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => closeDialog(() => setShowRename(false))}>
                    {t("action.cancel")}
                  </Button>
                  <Button type="submit" disabled={busy !== null}>
                    {busy === "pipeline:rename" ? t("common.saving") : t("action.save")}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={showNewStage} onOpenChange={(open) => !open && closeDialog(() => setShowNewStage(false))}>
            <DialogContent className="max-h-[92dvh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("settings.stageNew")}</DialogTitle>
                <DialogDescription className="sr-only">{t("settings.stageNew")}</DialogDescription>
              </DialogHeader>
              <StageForm
                key="new-stage"
                initial={defaultStage()}
                labels={stageLabels(t)}
                error={mutationError}
                busy={busy === "stage:create"}
                submitLabel={busy === "stage:create" ? t("common.saving") : t("settings.stageCreate")}
                onSubmit={addStage}
                onCancel={() => closeDialog(() => setShowNewStage(false))}
              />
            </DialogContent>
          </Dialog>

          <Dialog open={editingStage !== null} onOpenChange={(open) => !open && closeDialog(() => setEditingStage(null))}>
            <DialogContent className="max-h-[92dvh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("settings.stageEdit", { name: editingStage?.name ?? "" })}</DialogTitle>
                <DialogDescription className="sr-only">
                  {t("settings.stageEdit", { name: editingStage?.name ?? "" })}
                </DialogDescription>
              </DialogHeader>
              {editingStage && (
                <StageForm
                  key={editingStage.id}
                  initial={{
                    name: editingStage.name,
                    winProbability: editingStage.winProbability,
                    color: editingStage.color || DEFAULT_STAGE_COLOR,
                  }}
                  labels={stageLabels(t)}
                  error={mutationError}
                  busy={busy === "stage:update"}
                  submitLabel={busy === "stage:update" ? t("common.saving") : t("action.save")}
                  onSubmit={updateStage}
                  onCancel={() => closeDialog(() => setEditingStage(null))}
                />
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
      {confirmDialog}
    </Card>
  );
}

function StageForm({
  initial,
  labels,
  error,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: { name: string; winProbability: number; color: string };
  labels: {
    name: string;
    probability: string;
    color: string;
    cancel: string;
  };
  error: string | null;
  busy: boolean;
  submitLabel: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const [winProbability, setWinProbability] = useState(String(initial.winProbability));

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label={labels.name}>
        <Input name="name" required defaultValue={initial.name} autoFocus />
      </Field>
      <Field label={labels.probability}>
        <Input
          name="winProbability"
          type="number"
          min={0}
          max={100}
          step={1}
          required
          value={winProbability}
          onChange={(event) => setWinProbability(event.target.value)}
        />
      </Field>
      <Field label={labels.color}>
        <Input name="color" type="color" defaultValue={initial.color} className="h-10 w-16 cursor-pointer p-1" />
      </Field>
      <FormError error={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {labels.cancel}
        </Button>
        <Button type="submit" disabled={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function FormError({ error }: { error: string | null }): React.ReactNode {
  if (!error) return null;
  return (
    <p className="rounded-lg border border-feedback-error/25 bg-feedback-error-wash px-3 py-2 text-sm text-feedback-error" role="alert">
      {error}
    </p>
  );
}

function stageTypeLabel(t: ReturnType<typeof useT>, type: StageType): string {
  if (type === "won") return t("settings.stageTypeWon");
  if (type === "lost") return t("settings.stageTypeLost");
  return t("settings.stageTypeOpen");
}

function stageLabels(t: ReturnType<typeof useT>): {
  name: string;
  probability: string;
  color: string;
  cancel: string;
} {
  return {
    name: t("settings.stageName"),
    probability: t("settings.stageWinProbability"),
    color: t("settings.stageColor"),
    cancel: t("action.cancel"),
  };
}
