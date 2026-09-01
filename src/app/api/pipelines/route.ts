import { z } from "zod";
import { withAuth, authorize, json, parseBody } from "@/lib/api";
import { createPipelineWithDefaultStages, ensureDefaultPipeline } from "@/db/seed";
import { listPipelinesWithStages } from "@/lib/services/pipelines";
import { audit } from "@/lib/audit";

const createInput = z.object({
  name: z.string().min(1).max(80),
});

export async function GET(req: Request) {
  return withAuth(req, async () => {
    return json({ pipelines: await listPipelinesWithStages() });
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "pipelines", "create");
    if (denied) return denied;
    const body = await parseBody(req, createInput);
    if (!body.ok) return body.response;
    await ensureDefaultPipeline();
    const id = await createPipelineWithDefaultStages(body.data.name, 0);
    await audit(auth.user?.id, "pipeline.created", { objectType: "pipeline", objectId: id });
    const pipeline = (await listPipelinesWithStages()).find((p) => p.id === id)!;
    return json({ pipeline }, { status: 201 });
  });
}
