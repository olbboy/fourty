import type { Stage } from "@/lib/types";

export type BoardColumn<T> = { stage: Stage | null; deals: T[] };

export type PipelineBoard<T> = {
  deals: T[];
  columns: BoardColumn<T>[];
  /** False when grouping by stage would drop cards or leak a hidden pipeline. */
  groupByStage: boolean;
  filterByPipeline: boolean;
};

/**
 * Place deals onto the Kanban without treating a redacted key as "not in this
 * pipeline / stage". `redact()` deletes the key; missing is unknown, not empty.
 */
export function pipelineBoard<T extends object>(
  deals: T[],
  pipelineId: string,
  stages: Stage[],
): PipelineBoard<T> {
  if (deals.length === 0) {
    return { deals, columns: [{ stage: null, deals }], groupByStage: true, filterByPipeline: true };
  }

  const filterByPipeline = deals.some((d) => Object.hasOwn(d, "pipelineId"));
  const scoped = filterByPipeline
    ? deals.filter((d) => pipelineIdOf(d) === pipelineId)
    : deals;

  // Stage columns of *this* pipeline would sort hidden-pipeline deals into
  // "in column" vs "unplaced" and leak membership. Ungroup instead.
  const groupByStage = filterByPipeline && scoped.some((d) => Object.hasOwn(d, "stageId"));
  if (!groupByStage) {
    return {
      deals: scoped,
      columns: [{ stage: null, deals: scoped }],
      groupByStage: false,
      filterByPipeline,
    };
  }

  const stageIds = new Set(stages.map((s) => s.id));
  const columns: BoardColumn<T>[] = stages.map((stage) => ({
    stage,
    deals: scoped.filter((d) => stageIdOf(d) === stage.id),
  }));
  const unplaced = scoped.filter((d) => {
    const id = stageIdOf(d);
    return !id || !stageIds.has(id);
  });
  if (unplaced.length) columns.push({ stage: null, deals: unplaced });
  return { deals: scoped, columns, groupByStage: true, filterByPipeline };
}

function pipelineIdOf(row: object): string | undefined {
  return Object.hasOwn(row, "pipelineId") ? (row as { pipelineId?: string }).pipelineId : undefined;
}

function stageIdOf(row: object): string | undefined {
  return Object.hasOwn(row, "stageId") ? (row as { stageId?: string }).stageId : undefined;
}
