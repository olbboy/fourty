import { z } from "zod";
import { json, apiError, parseBody } from "@/lib/api";
import { withWorkspace } from "@/db";
import { createSession, createUser, createWorkspace, isFreshInstall } from "@/lib/auth";
import { ensureDefaultPipeline, seedDemoData } from "@/db/seed";

const schema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  seedDemo: z.boolean().optional(),
});

export async function POST(req: Request) {
  if (!(await isFreshInstall())) return apiError("Workspace already set up", 403);
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;

  const userId = await createUser(body.data.email, body.data.name, body.data.password, "admin");
  const workspaceId = await createWorkspace(`${body.data.name}'s workspace`, userId);
  // Pipeline + demo data are workspace-scoped (RLS) — create them in context.
  await withWorkspace(workspaceId, async () => {
    await ensureDefaultPipeline();
    if (body.data.seedDemo) await seedDemoData();
  });
  await createSession(userId, workspaceId);
  return json({ ok: true });
}
