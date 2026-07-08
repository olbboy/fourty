import pino, { type Logger } from "pino";
import { currentStore } from "@/db";

/**
 * Structured logging (Gate B4, ADR-004/observability).
 *
 * One base pino logger per process. `log()` returns a request-scoped child that
 * carries `request_id` + `workspace_id` pulled from the AsyncLocalStorage store
 * (set by withAuth/withWorkspace), so every line emitted while handling a request
 * is correlatable without threading a logger argument through the call graph.
 *
 * Level is `LOG_LEVEL` (default `info`; `silent` under NODE_ENV=test so the suite
 * stays quiet). No pretty-printing dependency — JSON lines are what log shippers
 * and `pino-pretty` both consume.
 */
const level =
  process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info");

const globalForLog = globalThis as unknown as { __fourtyLogger?: Logger };

export const baseLogger: Logger =
  globalForLog.__fourtyLogger ??
  pino({
    level,
    base: { service: "fourty" },
    // Emit ISO timestamps; log collectors prefer them over epoch millis.
    timestamp: pino.stdTimeFunctions.isoTime,
  });
if (process.env.NODE_ENV !== "production") globalForLog.__fourtyLogger = baseLogger;

/**
 * A logger bound to the current request's context. Outside a request (workers,
 * scripts) it returns the base logger. Pass extra bindings to merge them in.
 */
export function log(bindings: Record<string, unknown> = {}): Logger {
  const store = currentStore();
  const ctx: Record<string, unknown> = { ...bindings };
  if (store.requestId) ctx.request_id = store.requestId;
  if (store.workspaceId) ctx.workspace_id = store.workspaceId;
  return Object.keys(ctx).length ? baseLogger.child(ctx) : baseLogger;
}
