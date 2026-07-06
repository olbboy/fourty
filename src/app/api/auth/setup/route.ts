import { z } from "zod";
import { json, apiError, parseBody } from "@/lib/api";
import { createSession, createUser, isFreshInstall } from "@/lib/auth";
import { ensureDefaultPipeline, seedDemoData } from "@/db/seed";

const schema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  seedDemo: z.boolean().optional(),
});

export async function POST(req: Request) {
  if (!isFreshInstall()) return apiError("Workspace already set up", 403);
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  const userId = createUser(body.data.email, body.data.name, body.data.password, "admin");
  ensureDefaultPipeline();
  if (body.data.seedDemo) seedDemoData();
  await createSession(userId);
  return json({ ok: true });
}
