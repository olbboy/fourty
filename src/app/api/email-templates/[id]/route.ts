import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { emailTemplatesDelete, emailTemplatesUpdate } from "@/lib/actions/email-templates";

type Params = { params: Promise<{ id: string }> };

const updateTemplate = toRouteHandler(emailTemplatesUpdate, { body: (template) => ({ template }) });
const deleteTemplate = toRouteHandler(emailTemplatesDelete, { body: () => ({ ok: true }) });

export const PATCH = (req: Request, ctx: Params) => updateTemplate(req, ctx);
export const DELETE = (req: Request, ctx: Params) => deleteTemplate(req, ctx);
