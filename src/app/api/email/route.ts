import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { emailSend } from "@/lib/actions/email";

/** POST `{ entityType, entityId, contactId, subject, body }`: email a contact from their page or a deal. */
const sendEmail = toRouteHandler(emailSend, { body: (sent) => ({ sent }) });

export const POST = (req: Request) => sendEmail(req);
