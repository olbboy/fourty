import { createHash } from "node:crypto";
import { z } from "zod";
import { asc, eq, sql } from "drizzle-orm";
import { currentStore, db, tables } from "@/db";
import { ensureDefaultPipeline } from "@/db/seed";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const pipelineInput = z.object({
  name: z.string().trim().min(1).max(200),
});

export const pipelinePatch = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.isDefault !== undefined, {
    message: "at least one field is required",
  });

export const stageInput = z.object({
  name: z.string().trim().min(1).max(200),
  winProbability: z.number().int().min(0).max(100).optional(),
  type: z.enum(["open", "won", "lost"]).optional(),
  color: z.string().regex(HEX_COLOR, "must be a six-digit hex color").optional(),
});

export const stagePatch = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    winProbability: z.number().int().min(0).max(100).optional(),
    type: z.enum(["open", "won", "lost"]).optional(),
    color: z.string().regex(HEX_COLOR, "must be a six-digit hex color").optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field is required",
  });

export const stageReorder = z.object({
  stageIds: z.array(z.string().trim().min(1)).min(1),
});

export type StageType = "open" | "won" | "lost";

/**
 * Serialize operations that validate or change pipeline/stage membership.
 *
 * The caller must already be inside `withWorkspace()`. Using the ambient
 * transaction directly is deliberate: a pool-level advisory lock would be
 * released when the connection is returned, while this xact lock survives
 * exactly until the RLS-scoped request transaction commits or rolls back.
 */
export async function lockPipelineWorkspace(workspaceId?: string): Promise<void> {
  const store = currentStore();
  if (!store.tx || !store.workspaceId) {
    throw new Error("Pipeline operations require an active withWorkspace transaction");
  }
  if (workspaceId !== undefined && workspaceId !== store.workspaceId) {
    throw new Error("Pipeline lock workspace does not match the active transaction");
  }
  const key = createHash("sha256")
    .update(`fourty:pipeline-membership:${store.workspaceId}`)
    .digest()
    .readBigInt64BE(0)
    .toString();
  await store.tx.execute(sql`select pg_advisory_xact_lock(${key}::bigint)`);
}

/** Return the canonical probability for terminal stages, or an input error. */
export function validateStageSemantics(type: StageType, winProbability: number): string | null {
  if (type === "won" && winProbability !== 100) {
    return "won stages must have winProbability 100";
  }
  if (type === "lost" && winProbability !== 0) {
    return "lost stages must have winProbability 0";
  }
  return null;
}

/**
 * Resolve a stage payload against the current row. Terminal stages get their
 * canonical probability when the caller changes type without sending one.
 */
export function resolveStageValues(input: {
  type?: StageType;
  winProbability?: number;
}, current?: { type: StageType; winProbability: number }): { type: StageType; winProbability: number; error?: string } {
  const type = input.type ?? current?.type ?? "open";
  let winProbability = input.winProbability ?? current?.winProbability ?? 50;
  if (input.type !== undefined && input.winProbability === undefined) {
    if (type === "won") winProbability = 100;
    if (type === "lost") winProbability = 0;
  }
  const error = validateStageSemantics(type, winProbability);
  return error ? { type, winProbability, error } : { type, winProbability };
}

export async function loadPipeline(id: string) {
  return (await db.select().from(tables.pipelines).where(eq(tables.pipelines.id, id)).limit(1))[0];
}

export async function loadPipelineWithStages(id: string) {
  const pipeline = await loadPipeline(id);
  if (!pipeline) return undefined;
  const stages = await db
    .select()
    .from(tables.stages)
    .where(eq(tables.stages.pipelineId, id))
    .orderBy(asc(tables.stages.order));
  return { ...pipeline, stages };
}

/**
 * Resolve the workspace's selected pipeline for deal creation. Legacy rows may
 * have no default flag, so the oldest pipeline is a stable fallback; a new
 * workspace delegates creation to the existing seed helper.
 *
 * Callers that use this for a write must hold `lockPipelineWorkspace` first.
 */
export async function ensureSelectedPipeline(): Promise<string> {
  const selected = (
    await db
      .select()
      .from(tables.pipelines)
      .where(eq(tables.pipelines.isDefault, 1))
      .orderBy(asc(tables.pipelines.createdAt))
      .limit(1)
  )[0];
  if (selected) return selected.id;
  const fallback = (await db.select().from(tables.pipelines).orderBy(asc(tables.pipelines.createdAt)).limit(1))[0];
  if (fallback) return fallback.id;
  return ensureDefaultPipeline();
}
