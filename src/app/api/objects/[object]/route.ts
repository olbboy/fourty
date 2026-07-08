import { z } from "zod";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { objectByApiName, listRecords, createRecord } from "@/lib/custom-objects";

type Params = { params: Promise<{ object: string }> };

const input = z.object({ data: z.record(z.string(), z.unknown()).default({}) });

export async function GET(req: Request, { params }: Params) {
  return withAuth(req, async () => {
    const { object: apiName } = await params;
    const object = await objectByApiName(apiName);
    if (!object) return apiError("Object not found", 404);
    const limit = Number(new URL(req.url).searchParams.get("limit")) || 200;
    return json({ object: object.apiName, records: await listRecords(object.id, limit) });
  });
}

export async function POST(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "objects", "create");
    if (denied) return denied;
    const { object: apiName } = await params;
    const object = await objectByApiName(apiName);
    if (!object) return apiError("Object not found", 404);
    const body = await parseBody(req, input);
    if (!body.ok) return body.response;
    const result = await createRecord(object.id, body.data.data);
    if (!result.ok) return apiError(result.error, 400);
    await audit(auth.user?.id, "record.created", {
      objectType: object.apiName,
      objectId: result.record.id,
    });
    return json({ record: result.record }, { status: 201 });
  });
}
