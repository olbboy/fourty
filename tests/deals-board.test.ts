import { describe, expect, it } from "vitest";
import { pipelineBoard } from "@/lib/deals-board";
import type { Stage } from "@/lib/types";

const stage = (id: string, pipelineId = "p1"): Stage => ({
  id,
  pipelineId,
  name: id,
  order: 0,
  winProbability: 50,
  type: "open",
  color: "#000",
});

const stages = [stage("s1"), stage("s2")];

describe("pipelineBoard", () => {
  it("groups visible deals into their stage columns", () => {
    const deals = [
      { id: "a", pipelineId: "p1", stageId: "s1" },
      { id: "b", pipelineId: "p1", stageId: "s2" },
      { id: "c", pipelineId: "p2", stageId: "s9" },
    ];
    const board = pipelineBoard(deals, "p1", stages);
    expect(board.filterByPipeline).toBe(true);
    expect(board.groupByStage).toBe(true);
    expect(board.deals.map((d) => d.id)).toEqual(["a", "b"]);
    expect(board.columns.map((c) => [c.stage?.id ?? null, c.deals.map((d) => d.id)])).toEqual([
      ["s1", ["a"]],
      ["s2", ["b"]],
    ]);
  });

  it("keeps a deal with an unknown stageId in an unassigned column", () => {
    const deals = [{ id: "a", pipelineId: "p1", stageId: "gone" }];
    const board = pipelineBoard(deals, "p1", stages);
    expect(board.columns.at(-1)).toEqual({ stage: null, deals });
  });

  it("does not drop deals whose stageId was redacted", () => {
    const deals = [
      { id: "a", pipelineId: "p1" },
      { id: "b", pipelineId: "p1" },
    ];
    const board = pipelineBoard(deals, "p1", stages);
    expect(board.groupByStage).toBe(false);
    expect(board.columns).toEqual([{ stage: null, deals }]);
  });

  it("does not filter away deals whose pipelineId was redacted", () => {
    const deals = [
      { id: "a", stageId: "s1" },
      { id: "b", stageId: "s2" },
    ];
    const board = pipelineBoard(deals, "p1", stages);
    expect(board.filterByPipeline).toBe(false);
    expect(board.groupByStage).toBe(false);
    expect(board.deals).toEqual(deals);
    expect(board.columns).toEqual([{ stage: null, deals }]);
  });
});
