import { beforeAll, describe, expect, it, vi } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Password sign-in opens the session in a workspace the user is still an active
 * member of: the one they joined first. A workspace they were removed from is
 * skipped, the way SSO sign-in already does.
 */
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined),
    set: (k: string, v: string) => {
      jar.set(k, v);
    },
    delete: (k: string) => {
      jar.delete(k);
    },
  }),
}));

describe("workspace chosen at password sign-in", () => {
  const PASSWORD = "correcthorse";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let createUser: typeof import("@/lib/auth").createUser;
  let getSessionUser: typeof import("@/lib/auth").getSessionUser;
  let newId: typeof import("@/lib/id").newId;
  let login: typeof import("@/app/api/auth/login/route");

  const signIn = (email: string) =>
    login.POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: PASSWORD }),
      }),
    );
  const join = (workspaceId: string, userId: string, createdAt: number, deactivatedAt: number | null = null) =>
    db.insert(tables.workspaceMembers).values({ id: newId(), workspaceId, userId, role: "member", createdAt, deactivatedAt });

  beforeAll(async () => {
    await resetDb();
    jar.clear();
    ({ db, tables } = await import("@/db"));
    ({ createUser, getSessionUser } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    login = await import("@/app/api/auth/login/route");
  });

  it("skips a workspace the user was removed from", async () => {
    const removedFrom = await createWorkspace();
    const stillIn = await createWorkspace();
    const user = await createUser("moved@test.dev", "Moved", PASSWORD);
    await join(removedFrom, user, 1_000, 5_000);
    await join(stillIn, user, 2_000);

    expect((await signIn("moved@test.dev")).status).toBe(200);
    expect((await getSessionUser())?.workspaceId).toBe(stillIn);
  });

  it("opens the workspace joined first when several are active", async () => {
    const later = await createWorkspace();
    const earlier = await createWorkspace();
    const user = await createUser("both@test.dev", "Both", PASSWORD);
    await join(later, user, 9_000);
    await join(earlier, user, 3_000);

    expect((await signIn("both@test.dev")).status).toBe(200);
    expect((await getSessionUser())?.workspaceId).toBe(earlier);
  });
});
