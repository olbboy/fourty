import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { emailTemplatesRender } from "@/lib/actions/email-templates";

/** POST `{ entityType, entityId, contactId }`: the template filled for that contact. */
const render = toRouteHandler(emailTemplatesRender);

type Params = { params: Promise<{ id: string }> };
export const POST = (req: Request, ctx: Params) => render(req, ctx);
