import { z } from "zod";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { objectByApiName, getRecord, updateRecord, deleteRecord } from "@/lib/custom-objects";

type Params = { params: Promise<{ object: string; id: string }> };

const patch = z.object({ data: z.record(z.string(), z.unknown()).default({}) });

export async function GET(req: Request, { params }: Params) {
  return withAuth(req, async () => {
    const { object: apiName, id } = await params;
    const object = await objectByApiName(apiName);
    if (!object) return apiError("Object not found", 404);
    const record = await getRecord(object.id, id);
    if (!record) return apiError("Record not found", 404);
    return json({ record });
  });
}

export async function PATCH(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "objects", "update");
    if (denied) return denied;
    const { object: apiName, id } = await params;
    const object = await objectByApiName(apiName);
    if (!object) return apiError("Object not found", 404);
    const body = await parseBody(req, patch);
    if (!body.ok) return body.response;
    const result = await updateRecord(object.id, id, body.data.data);
    if (result === undefined) return apiError("Record not found", 404);
    if (!result.ok) return apiError(result.error, 400);
    await audit(auth.user?.id, "record.updated", { objectType: object.apiName, objectId: id });
    return json({ record: result.record });
  });
}

export async function DELETE(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "objects", "delete");
    if (denied) return denied;
    const { object: apiName, id } = await params;
    const object = await objectByApiName(apiName);
    if (!object) return apiError("Object not found", 404);
    if (!(await deleteRecord(object.id, id))) return apiError("Record not found", 404);
    await audit(auth.user?.id, "record.deleted", { objectType: object.apiName, objectId: id });
    return json({ ok: true });
  });
}
