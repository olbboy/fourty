import { and, desc, eq, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { defineAction } from "../define";
import { listNotesInput } from "../schemas";
import type { Note } from "./shared";

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 500;

export const notesList = defineAction({
  name: "notes.list",
  object: "notes",
  verb: "read",
  description:
    "List notes on a record. Requires entityType (contact, company, deal, or a custom-object apiName) and entityId. Newest first.",
  input: listNotesInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async (input): Promise<Note[]> => {
    const entityType = input.entityType?.trim();
    const entityId = input.entityId?.trim();
    // A list without both keys has never returned workspace-wide notes on REST.
    if (!entityType || !entityId) return [];
    const where: SQL[] = [eq(tables.notes.entityType, entityType), eq(tables.notes.entityId, entityId)];
    return db
      .select()
      .from(tables.notes)
      .where(and(...where))
      .orderBy(desc(tables.notes.createdAt))
      .limit(Math.min(Number(input.limit) || DEFAULT_LIMIT, MAX_LIMIT));
  },
});
