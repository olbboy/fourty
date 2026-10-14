import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { emailTemplatesCreate, emailTemplatesList } from "@/lib/actions/email-templates";

const listTemplates = toRouteHandler(emailTemplatesList, { body: (templates) => ({ templates }) });
const createTemplate = toRouteHandler(emailTemplatesCreate, { status: 201, body: (template) => ({ template }) });

export const GET = (req: Request) => listTemplates(req);
export const POST = (req: Request) => createTemplate(req);
