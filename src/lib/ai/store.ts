import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";

/**
 * Persistence for the AI agent (Phase 2). Every function runs inside a
 * withWorkspace() scope (like src/lib/custom-objects.ts) so RLS confines it to
 * the active workspace. On top of that, each reader/mutator takes the caller's
 * `userId` and enforces per-user ownership: RLS isolates tenants, but a
 * workspace's members share its RLS scope, so a workspace-mate must not read or
 * act on another user's thread (RT-C). A mismatch returns null/none — never
 * another user's data.
 */

export type AiRole = "user" | "assistant" | "tool";
export type AiStatus = "complete" | "pending_confirmation" | "executing" | "rejected";

/** A tool call as persisted on an assistant message + replayed to the provider. */
export type StoredToolCall = { id: string; name: string; arguments: Record<string, unknown> };

export type NewMessage = {
  conversationId: string;
  role: AiRole;
  content?: string;
  toolCalls?: StoredToolCall[] | null;
  toolCallId?: string | null;
  status?: AiStatus;
};

export type AiMessage = {
  id: string;
  conversationId: string;
  role: AiRole;
  content: string;
  toolCalls: StoredToolCall[] | null;
  toolCallId: string | null;
  status: AiStatus;
  createdAt: number;
};

export type AiConversation = typeof tables.aiConversations.$inferSelect;

function shape(row: typeof tables.aiMessages.$inferSelect): AiMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as AiRole,
    content: row.content,
    toolCalls: row.toolCalls ? (JSON.parse(row.toolCalls) as StoredToolCall[]) : null,
    toolCallId: row.toolCallId,
    status: row.status as AiStatus,
    createdAt: row.createdAt,
  };
}

/** The conversation row IFF it exists and is owned by `userId` (RT-C), else undefined. */
async function ownedConversation(
  id: string,
  userId: string | null,
): Promise<AiConversation | undefined> {
  const row = (
    await db.select().from(tables.aiConversations).where(eq(tables.aiConversations.id, id)).limit(1)
  )[0];
  if (!row) return undefined;
  return row.userId === userId ? row : undefined;
}

/** Insert a message + bump the conversation's updatedAt (both under the caller's tx). */
export async function appendMessage(msg: NewMessage): Promise<AiMessage> {
  const now = Date.now();
  const id = newId();
  await db.insert(tables.aiMessages).values({
    id,
    conversationId: msg.conversationId,
    role: msg.role,
    content: msg.content ?? "",
    toolCalls: msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
    toolCallId: msg.toolCallId ?? null,
    status: msg.status ?? "complete",
    createdAt: now,
  });
  await db
    .update(tables.aiConversations)
    .set({ updatedAt: now })
    .where(eq(tables.aiConversations.id, msg.conversationId));
  return {
    id,
    conversationId: msg.conversationId,
    role: msg.role,
    content: msg.content ?? "",
    toolCalls: msg.toolCalls ?? null,
    toolCallId: msg.toolCallId ?? null,
    status: msg.status ?? "complete",
    createdAt: now,
  };
}

/**
 * Create the conversation AND its first message atomically. Because the caller
 * wraps this in a single withWorkspace() transaction, there is no window where a
 * conversation exists without its first message (RT-K).
 */
export async function createConversationWithFirstMessage(
  userId: string | null,
  firstMsg: Omit<NewMessage, "conversationId">,
): Promise<{ conversationId: string }> {
  const now = Date.now();
  const conversationId = newId();
  await db.insert(tables.aiConversations).values({
    id: conversationId,
    userId,
    title: null,
    createdAt: now,
    updatedAt: now,
  });
  await appendMessage({ ...firstMsg, conversationId });
  return { conversationId };
}

/** The conversation IFF owned by `userId` (RT-C). */
export function getConversation(id: string, userId: string | null): Promise<AiConversation | undefined> {
  return ownedConversation(id, userId);
}

/** The active (most recently updated) conversation for `userId`, if any. */
export async function latestConversation(userId: string | null): Promise<AiConversation | undefined> {
  if (userId === null) return undefined;
  return (
    await db
      .select()
      .from(tables.aiConversations)
      .where(eq(tables.aiConversations.userId, userId))
      .orderBy(desc(tables.aiConversations.updatedAt))
      .limit(1)
  )[0];
}

/** Messages of a conversation in insertion order — empty if not owned by `userId` (RT-C). */
export async function listMessages(conversationId: string, userId: string | null): Promise<AiMessage[]> {
  const conv = await ownedConversation(conversationId, userId);
  if (!conv) return [];
  const rows = await db
    .select()
    .from(tables.aiMessages)
    .where(eq(tables.aiMessages.conversationId, conversationId))
    .orderBy(asc(tables.aiMessages.seq));
  return rows.map(shape);
}

/**
 * The persisted proposal for a `pending_confirmation` message owned by `userId`.
 * The approve path executes ONLY from this server-side state (never the client
 * decision body) so tampered client args are ignored (RT-D).
 */
export async function getPendingMessage(
  id: string,
  userId: string | null,
): Promise<{ conversationId: string; toolCalls: StoredToolCall[]; status: AiStatus } | undefined> {
  const row = (await db.select().from(tables.aiMessages).where(eq(tables.aiMessages.id, id)).limit(1))[0];
  if (!row || row.status !== "pending_confirmation") return undefined;
  const conv = await ownedConversation(row.conversationId, userId);
  if (!conv) return undefined;
  return {
    conversationId: row.conversationId,
    toolCalls: row.toolCalls ? (JSON.parse(row.toolCalls) as StoredToolCall[]) : [],
    status: row.status as AiStatus,
  };
}

/**
 * Atomically claim a pending proposal for execution: a single CAS UPDATE flips
 * `pending_confirmation` → `executing` and returns its tool calls. A second /
 * concurrent / replayed confirm sees the row no longer pending and gets null, so
 * a proposal executes at most once (RT-B). Ownership is enforced by requiring the
 * message's conversation to belong to `userId`.
 */
export async function claimPendingMessage(
  id: string,
  userId: string | null,
): Promise<{ toolCalls: StoredToolCall[]; conversationId: string } | null> {
  // Verify ownership first (join-free: RLS already scopes workspace; this adds the
  // per-user ACL). The status CAS itself is the atomic guard against double-run.
  const row = (await db.select().from(tables.aiMessages).where(eq(tables.aiMessages.id, id)).limit(1))[0];
  if (!row) return null;
  const conv = await ownedConversation(row.conversationId, userId);
  if (!conv) return null;
  const claimed = await db
    .update(tables.aiMessages)
    .set({ status: "executing" })
    .where(and(eq(tables.aiMessages.id, id), eq(tables.aiMessages.status, "pending_confirmation")))
    .returning({ toolCalls: tables.aiMessages.toolCalls, conversationId: tables.aiMessages.conversationId });
  if (claimed.length === 0) return null;
  const tc = claimed[0].toolCalls;
  return { toolCalls: tc ? (JSON.parse(tc) as StoredToolCall[]) : [], conversationId: claimed[0].conversationId };
}

/** Finalize a message's status (e.g. executing → complete, or pending → rejected). */
export async function setMessageStatus(id: string, status: AiStatus): Promise<void> {
  await db.update(tables.aiMessages).set({ status }).where(eq(tables.aiMessages.id, id));
}

/**
 * Fill a proposal message with its executed tool result (or a decline note) and
 * finalize its status. A pending write is stored as a `tool` message with empty
 * content; on confirm/reject we write the tool result here so the assistant's
 * tool_call gets its matching `tool` result and history stays well-formed (RT-F).
 */
export async function setToolResult(id: string, content: string, status: AiStatus): Promise<void> {
  await db.update(tables.aiMessages).set({ content, status }).where(eq(tables.aiMessages.id, id));
}

/**
 * True while the conversation (owned by `userId`) has a write awaiting the user:
 * a `pending_confirmation` or `executing` message. The route uses this to reject
 * a new user turn until the pending write is resolved (RT-F) — otherwise an
 * assistant-with-tool_calls would be followed by a user message with no matching
 * tool result, which the provider rejects with a 400 and which wedges the thread.
 */
export async function hasUnresolvedPending(conversationId: string, userId: string | null): Promise<boolean> {
  const conv = await ownedConversation(conversationId, userId);
  if (!conv) return false;
  const open = await db
    .select({ status: tables.aiMessages.status })
    .from(tables.aiMessages)
    .where(
      and(
        eq(tables.aiMessages.conversationId, conversationId),
        inArray(tables.aiMessages.status, ["pending_confirmation", "executing"]),
      ),
    )
    .limit(1);
  return open.length > 0;
}
