import { describe, expect, it } from "vitest";
import { translator } from "@/lib/i18n";
import { WORKFLOW_EVENTS, workflowEventLabel, workflowFieldLabel } from "@/lib/workflow-field-display";
import type { WorkflowEvent } from "@/lib/workflows/types";

describe("workflowFieldLabel", () => {
  const en = translator("en");
  const vi = translator("vi");

  it("translates known workflow field tokens", () => {
    expect(workflowFieldLabel("firstName", en)).toBe("First name");
    expect(workflowFieldLabel("firstName", vi)).toBe("Tên");
    expect(workflowFieldLabel("jobTitle", vi)).toBe("Chức danh");
    expect(workflowFieldLabel("stageName", en)).toBe("Stage");
    expect(workflowFieldLabel("score", vi)).toBe("Điểm");
  });

  it("leaves unknown field tokens unchanged", () => {
    expect(workflowFieldLabel("customFoo", en)).toBe("customFoo");
  });
});

describe("workflowEventLabel", () => {
  const en = translator("en");
  const vi = translator("vi");

  it("translates known trigger tokens", () => {
    expect(workflowEventLabel("contact.created", en)).toBe("Contact created");
    expect(workflowEventLabel("deal.won", vi)).toBe("Cơ hội thắng");
    expect(workflowEventLabel("task.completed", vi)).toBe("Việc hoàn thành");
  });

  it("covers every WorkflowEvent token", () => {
    const all: WorkflowEvent[] = [
      "contact.created",
      "contact.updated",
      "company.created",
      "deal.created",
      "deal.stage_changed",
      "deal.won",
      "deal.lost",
      "task.completed",
    ];
    expect(WORKFLOW_EVENTS).toEqual(all);
    for (const event of all) expect(workflowEventLabel(event, en)).not.toBe(event);
  });

  it("leaves unknown event tokens unchanged", () => {
    expect(workflowEventLabel("lead.qualified", en)).toBe("lead.qualified");
  });
});
