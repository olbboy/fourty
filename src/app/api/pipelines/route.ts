import { db, tables } from "@/db";
import { createPipelineWithDefaultStages } from "@/db/seed";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import {
  listPipelinesWithStages,
  loadPipelineWithStages,
  lockPipelineWorkspace,
  pipelineInput,
} from "@/lib/services/pipelines";

export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "pipelines", "read");
    if (denied) return denied;
    return json({ pipelines: await listPipelinesWithStages() });
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "pipelines", "create");
    if (denied) return denied;
    const body = await parseBody(req, pipelineInput);
    if (!body.ok) return body.response;

    await lockPipelineWorkspace(auth.workspaceId);
    const existing = await db.select().from(tables.pipelines);
    const isDefault =
      existing.length === 0 ||
      !existing.some((pipeline) => pipeline.isDefault === 1)
        ? 1
        : 0;
    const id = await createPipelineWithDefaultStages(body.data.name, isDefault);
    await audit(auth.user?.id, "pipeline.created", {
      objectType: "pipeline",
      objectId: id,
    });
    const pipeline = await loadPipelineWithStages(id);
    if (!pipeline) return apiError("Pipeline not found after creation", 500);
    return json({ pipeline }, { status: 201 });
  });
}
