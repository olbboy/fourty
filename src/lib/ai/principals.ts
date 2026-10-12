/**
 * Who a chat request is, in the two senses that differ.
 *
 * - `auditUserId` is the **audit actor**, and is null for an API key: no path
 *   invents a user, so a key's writes audit as a key.
 * - `ownerId` is the **thread ACL principal**, and is never null: RLS puts a
 *   workspace-mate's conversation within reach, and this is what keeps them out
 *   of it. Two API keys in one workspace must not share a thread either, so the
 *   caller kind is part of the id.
 *
 * Shared by the chat route and the conversation routes because a thread written
 * under one rule and read under another is a thread that leaks.
 */
export type Principals = { identity: string; ownerId: string; auditUserId: string | null };

export function principals(auth: { viaApiKey: boolean; callerId: string }): Principals {
  const identity = `${auth.viaApiKey ? "key" : "user"}:${auth.callerId}`;
  return { identity, ownerId: identity, auditUserId: auth.viaApiKey ? null : auth.callerId };
}
