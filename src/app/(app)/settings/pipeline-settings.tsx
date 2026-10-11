"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Pipeline, Stage } from "@/lib/types";
import { Field, EmptyState, Modal, Spinner } from "@/components/ui";
import { Select } from "@/components/select";
import { IconEdit, IconPlus, IconTrash } from "@/components/icons";
import { useT } from "@/lib/i18n/provider";

type Mutation =
  | "pipeline:create"
  | "pipeline:rename"
  | "pipeline:default"
  | "pipeline:delete"
  | "stage:create"
  | "stage:update"
  | "stage:delete"
  | "stage:reorder";

type PipelineResponse = { pipeline?: Pipeline };
type StageResponse = { stage?: Stage };
type PipelinesResponse = { pipelines?: Pipeline[] };
type StagesResponse = { stages?: Stage[] };

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

function defaultStage(): { name: string; winProbability: number; type: Stage["type"]; color: string } {
  return { name: "", winProbability: 50, type: "open", color: "#6366f1" };
}

export function PipelineSettings({ canManagePipelines }: { canManagePipelines: boolean }) {
  const t = useT();
  const [pipelines, setPipelines] = useState<Pipeline[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Mutation | null>(null);
  const busyRef = useRef<Mutation | null>(null);
  const [showNewPipeline, setShowNewPipeline] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [showNewStage, setShowNewStage] = useState(false);

  const load = useCallback(async (preferredId?: string): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await requestJson<PipelinesResponse>("/api/pipelines");
      const next = Array.isArray(data.pipelines) ? data.pipelines : [];
      setPipelines(next);
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
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedPipeline = useMemo(
    () => pipelines?.find((pipeline) => pipeline.id === selectedId) ?? null,
    [pipelines, selectedId],
  );
  const hasOpenModal = showNewPipeline || showRename || showNewStage || editingStage !== null;
  const visibleError = loadError ?? (!hasOpenModal ? mutationError : null);

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

  async function deletePipeline(): Promise<void> {
    if (!selectedPipeline || selectedPipeline.isDefault === 1 || busyRef.current) return;
    if (!window.confirm(t("settings.pipelineDeleteConfirm", { name: selectedPipeline.name }))) return;
    if (!beginMutation("pipeline:delete")) return;
    try {
      await requestJson<{ ok?: boolean }>(`/api/pipelines/${selectedPipeline.id}`, { method: "DELETE" });
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
    const form = new FormData(event.currentTarget);
    const payload = stagePayload(form);
    if (!payload.name) return;
    if (!beginMutation("stage:create")) return;
    try {
      await requestJson<StageResponse>(`/api/pipelines/${selectedPipeline.id}/stages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
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
    const form = new FormData(event.currentTarget);
    const payload = stagePayload(form);
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

  async function deleteStage(stage: Stage): Promise<void> {
    if (!selectedPipeline || selectedPipeline.stages.length <= 1 || busyRef.current) return;
    if (!window.confirm(t("settings.stageDeleteConfirm", { name: stage.name }))) return;
    if (!beginMutation("stage:delete")) return;
    try {
      await requestJson<{ ok?: boolean }>(
        `/api/pipelines/${selectedPipeline.id}/stages/${stage.id}`,
        { method: "DELETE" },
      );
      await load(selectedPipeline.id);
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : t("settings.stageDeleteError"));
    } finally {
      endMutation();
    }
  }

  async function moveStage(stage: Stage, direction: -1 | 1): Promise<void> {
    if (!selectedPipeline || busyRef.current) return;
    const index = selectedPipeline.stages.findIndex((item) => item.id === stage.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= selectedPipeline.stages.length) return;
    const stageIds = selectedPipeline.stages.map((item) => item.id);
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

  return (
    <section className="card p-4" aria-labelledby="pipeline-settings-title" role="region">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="pipeline-settings-title" className="text-sm font-semibold">
            {t("settings.pipelines")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">{t("settings.pipelinesHint")}</p>
          {!canManagePipelines && (
            <p className="mt-1 text-sm text-ink-muted" role="status">
              {t("settings.pipelinesReadOnly")}
            </p>
          )}
        </div>
        {canManagePipelines && (
          <button
            type="button"
            onClick={() => {
              clearMutationError();
              setShowNewPipeline(true);
            }}
            disabled={busy !== null}
            className="btn-primary"
          >
            <IconPlus width={15} height={15} /> {t("settings.pipelineNew")}
          </button>
        )}
      </div>

      {visibleError && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2.5 text-sm text-red-600 dark:text-red-300" role="alert">
          <span>{visibleError}</span>
          {loadError && (
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="btn-ghost !px-2 !py-1 text-xs"
            >
              {loading ? t("common.loading") : t("action.retry")}
            </button>
          )}
        </div>
      )}

      {loading && pipelines === null ? (
        <div aria-busy="true" aria-label={t("common.loading")} role="status">
          <Spinner />
        </div>
      ) : pipelines?.length === 0 ? (
        <EmptyState
          title={t("settings.pipelinesEmpty")}
          hint={t("settings.pipelinesEmptyHint")}
          action={canManagePipelines ? (
            <button
              type="button"
              onClick={() => {
                clearMutationError();
                setShowNewPipeline(true);
              }}
              disabled={busy !== null}
              className="btn-primary"
            >
              <IconPlus width={15} height={15} /> {t("settings.pipelineNew")}
            </button>
          ) : undefined}
        />
      ) : selectedPipeline ? (
        <div className="grid gap-4 sm:grid-cols-[minmax(11rem,0.34fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <label className="sr-only" htmlFor="pipeline-select">
              {t("settings.pipelineSelect")}
            </label>
            <Select
              id="pipeline-select"
              aria-label={t("settings.pipelineSelect")}
              value={selectedPipeline.id}
              onValueChange={setSelectedId}
              disabled={busy !== null}
              className="mb-2 w-full sm:hidden"
              options={
                pipelines?.map((pipeline) => ({
                  value: pipeline.id,
                  label: `${pipeline.name}${pipeline.isDefault === 1 ? ` — ${t("settings.pipelineDefault")}` : ""}`,
                })) ?? []
              }
            />
            <div className="hidden space-y-1 sm:block" aria-label={t("settings.pipelineList")}>
              {pipelines?.map((pipeline) => (
                <button
                  type="button"
                  key={pipeline.id}
                  aria-pressed={pipeline.id === selectedPipeline.id}
                  onClick={() => setSelectedId(pipeline.id)}
                  disabled={busy !== null}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                    pipeline.id === selectedPipeline.id
                      ? "bg-accent-600/10 font-semibold text-accent-700 dark:text-accent-300"
                      : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  <span className="min-w-0 truncate">{pipeline.name}</span>
                  {pipeline.isDefault === 1 && <span className="chip shrink-0">{t("settings.pipelineDefault")}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-0 rounded-lg border border-line/70 p-3 sm:p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold">{selectedPipeline.name}</h3>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {selectedPipeline.stages.length} {t("settings.stagesCount")}
                </p>
              </div>
              {canManagePipelines && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      clearMutationError();
                      setShowRename(true);
                    }}
                    disabled={busy !== null}
                    className="btn-ghost !px-2.5 !py-1.5 text-xs"
                  >
                    <IconEdit width={14} height={14} /> {t("settings.pipelineRename")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void setDefault()}
                    disabled={busy !== null || selectedPipeline.isDefault === 1}
                    className="btn-ghost !px-2.5 !py-1.5 text-xs"
                    title={selectedPipeline.isDefault === 1 ? t("settings.pipelineAlreadyDefault") : undefined}
                  >
                    {t("settings.pipelineSetDefault")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deletePipeline()}
                    disabled={busy !== null || selectedPipeline.isDefault === 1}
                    className="btn-ghost !px-2.5 !py-1.5 text-xs !text-red-500"
                    title={selectedPipeline.isDefault === 1 ? t("settings.pipelineCannotDeleteDefault") : undefined}
                  >
                    <IconTrash width={14} height={14} /> {t("action.delete")}
                  </button>
                </div>
              )}
            </div>

            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">{t("settings.stages")}</h4>
              {canManagePipelines && (
                <button
                  type="button"
                  onClick={() => {
                    clearMutationError();
                    setShowNewStage(true);
                  }}
                  disabled={busy !== null}
                  className="btn-primary !px-2.5 !py-1.5 text-xs"
                >
                  <IconPlus width={14} height={14} /> {t("settings.stageNew")}
                </button>
              )}
            </div>

            {selectedPipeline.stages.length === 0 ? (
              <p className="py-4 text-sm text-ink-muted">{t("settings.stagesEmpty")}</p>
            ) : (
              <ul className="divide-y divide-line/60" aria-label={t("settings.stages")}>
                {selectedPipeline.stages.map((stage, index) => (
                  <li key={stage.id} className="flex flex-wrap items-center gap-2 py-3" aria-label={stage.name}>
                    <span className="h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: stage.color }} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{stage.name}</p>
                      <p className="text-xs text-ink-muted">
                        {stage.winProbability}% · {stageTypeLabel(t, stage.type)}
                      </p>
                    </div>
                    {canManagePipelines && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void moveStage(stage, -1)}
                          disabled={busy !== null || index === 0}
                          className="btn-ghost !px-2 !py-1 text-xs"
                          aria-label={t("settings.stageMoveUp", { name: stage.name })}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => void moveStage(stage, 1)}
                          disabled={busy !== null || index === selectedPipeline.stages.length - 1}
                          className="btn-ghost !px-2 !py-1 text-xs"
                          aria-label={t("settings.stageMoveDown", { name: stage.name })}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            clearMutationError();
                            setEditingStage(stage);
                          }}
                          disabled={busy !== null}
                          className="btn-ghost !px-2 !py-1 text-xs"
                          aria-label={t("settings.stageEdit", { name: stage.name })}
                        >
                          <IconEdit width={14} height={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteStage(stage)}
                          disabled={busy !== null || selectedPipeline.stages.length <= 1}
                          className="btn-ghost !px-2 !py-1 text-xs !text-red-500"
                          aria-label={t("settings.stageDelete", { name: stage.name })}
                          title={selectedPipeline.stages.length <= 1 ? t("settings.stageCannotDeleteLast") : undefined}
                        >
                          <IconTrash width={14} height={14} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {canManagePipelines && (
        <>
          <Modal title={t("settings.pipelineNew")} open={showNewPipeline} onClose={() => setShowNewPipeline(false)}>
            <form onSubmit={createPipeline} className="space-y-4">
              <Field label={t("settings.pipelineName")}>
                <input name="name" required className="input" autoFocus />
              </Field>
              <ModalError error={mutationError} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowNewPipeline(false)} className="btn-ghost">
                  {t("action.cancel")}
                </button>
                <button type="submit" disabled={busy !== null} className="btn-primary">
                  {busy === "pipeline:create" ? t("common.saving") : t("settings.pipelineCreate")}
                </button>
              </div>
            </form>
          </Modal>

          <Modal title={t("settings.pipelineRename")} open={showRename} onClose={() => setShowRename(false)}>
            <form onSubmit={renamePipeline} className="space-y-4">
              <Field label={t("settings.pipelineName")}>
                <input name="name" required className="input" defaultValue={selectedPipeline?.name ?? ""} autoFocus />
              </Field>
              <ModalError error={mutationError} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowRename(false)} className="btn-ghost">
                  {t("action.cancel")}
                </button>
                <button type="submit" disabled={busy !== null} className="btn-primary">
                  {busy === "pipeline:rename" ? t("common.saving") : t("action.save")}
                </button>
              </div>
            </form>
          </Modal>

          <Modal title={t("settings.stageNew")} open={showNewStage} onClose={() => setShowNewStage(false)}>
            <StageForm
              key="new-stage"
              initial={defaultStage()}
              labels={stageLabels(t)}
              error={mutationError}
              busy={busy === "stage:create"}
              submitLabel={busy === "stage:create" ? t("common.saving") : t("settings.stageCreate")}
              onSubmit={addStage}
              onCancel={() => setShowNewStage(false)}
            />
          </Modal>

          <Modal title={t("settings.stageEdit", { name: editingStage?.name ?? "" })} open={!!editingStage} onClose={() => setEditingStage(null)}>
            {editingStage && (
              <StageForm
                key={editingStage.id}
                initial={editingStage}
                labels={stageLabels(t)}
                error={mutationError}
                busy={busy === "stage:update"}
                submitLabel={busy === "stage:update" ? t("common.saving") : t("action.save")}
                onSubmit={updateStage}
                onCancel={() => setEditingStage(null)}
              />
            )}
          </Modal>
        </>
      )}
    </section>
  );
}

function stagePayload(form: FormData): { name: string; winProbability: number; type: Stage["type"]; color: string } {
  const name = String(form.get("name") ?? "").trim();
  const parsedProbability = Number(form.get("winProbability"));
  const typeValue = String(form.get("type") ?? "open");
  const type: Stage["type"] = typeValue === "won" || typeValue === "lost" ? typeValue : "open";
  const probability = Number.isFinite(parsedProbability)
    ? Math.max(0, Math.min(100, Math.round(parsedProbability)))
    : 0;
  return {
    name,
    winProbability: type === "won" ? 100 : type === "lost" ? 0 : probability,
    type,
    color: String(form.get("color") ?? "#6366f1"),
  };
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
  initial: { name: string; winProbability: number; type: Stage["type"]; color: string };
  labels: {
    name: string;
    probability: string;
    type: string;
    color: string;
    open: string;
    won: string;
    lost: string;
    cancel: string;
  };
  error: string | null;
  busy: boolean;
  submitLabel: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const [stageType, setStageType] = useState<Stage["type"]>(initial.type);
  const [winProbability, setWinProbability] = useState(String(initial.winProbability));

  function changeType(value: string): void {
    const nextType: Stage["type"] = value === "won" || value === "lost" ? value : "open";
    setStageType(nextType);
    if (nextType === "won") setWinProbability("100");
    if (nextType === "lost") setWinProbability("0");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label={labels.name}>
        <input name="name" required className="input" defaultValue={initial.name} autoFocus />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={labels.probability}>
          <input
            name="winProbability"
            type="number"
            min={0}
            max={100}
            step={1}
            required
            className="input"
            value={winProbability}
            onChange={(event) => setWinProbability(event.target.value)}
          />
        </Field>
        <Field label={labels.type}>
          <Select
            name="type"
            value={stageType}
            onValueChange={changeType}
            aria-label={labels.type}
            options={[
              { value: "open", label: labels.open },
              { value: "won", label: labels.won },
              { value: "lost", label: labels.lost },
            ]}
          />
        </Field>
      </div>
      <Field label={labels.color}>
        <input name="color" type="color" defaultValue={initial.color} className="h-10 w-16 cursor-pointer rounded border border-line bg-surface p-1" />
      </Field>
      <ModalError error={error} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost">
          {labels.cancel}
        </button>
        <button type="submit" disabled={busy} className="btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function ModalError({ error }: { error: string | null }): React.ReactNode {
  if (!error) return null;
  return (
    <p className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300" role="alert">
      {error}
    </p>
  );
}

function stageTypeLabel(t: ReturnType<typeof useT>, type: Stage["type"]): string {
  if (type === "won") return t("settings.stageTypeWon");
  if (type === "lost") return t("settings.stageTypeLost");
  if (type === "open") return t("settings.stageTypeOpen");
  return type;
}

function stageLabels(t: ReturnType<typeof useT>): {
  name: string;
  probability: string;
  type: string;
  color: string;
  open: string;
  won: string;
  lost: string;
  cancel: string;
} {
  return {
    name: t("settings.stageName"),
    probability: t("settings.stageWinProbability"),
    type: t("settings.stageType"),
    color: t("settings.stageColor"),
    open: t("settings.stageTypeOpen"),
    won: t("settings.stageTypeWon"),
    lost: t("settings.stageTypeLost"),
    cancel: t("action.cancel"),
  };
}
