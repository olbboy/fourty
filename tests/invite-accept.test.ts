import { beforeAll, describe, expect, it, vi } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * An invite link works once. Opening it again after joining must say so, not
 * claim the invite expired: people who were already in read "expired" as
 * "I am not in" (seen on crm.example.com, 13/10/2026).
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

describe("invite acceptance", () => {
  let accept: typeof import("@/app/api/members/accept/route");
  let invite: (opts: { email: string; expiresAt: number; role?: string; revokedAt?: number }) => Promise<string>;
  let ws: string;

  const post = (body: Record<string, unknown>) =>
    accept.POST(
      new Request("http://localhost/api/members/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  beforeAll(async () => {
    await resetDb();
    jar.clear();
    const { db, tables, withWorkspace } = await import("@/db");
    const { sha256 } = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    accept = await import("@/app/api/members/accept/route");
    ws = await createWorkspace();
    invite = async ({ email, expiresAt, role = "member", revokedAt }) => {
      const token = `${ws}.${newId()}${newId()}`;
      await withWorkspace(ws, () =>
        db.insert(tables.invites).values({
          id: newId(), workspaceId: ws, email, role, tokenHash: sha256(token), expiresAt, revokedAt, createdAt: Date.now(),
        }),
      );
      return token;
    };
  });

  it("tells someone who already joined that the invite was used", async () => {
    const token = await invite({ email: "binh@test.dev", expiresAt: Date.now() + 86_400_000 });
    const first = await post({ token, name: "Binh", password: "correcthorse" });
    expect(first.status).toBe(200);

    jar.clear(); // a later visit, e.g. the email button clicked again
    const again = await post({ token, name: "Binh", password: "correcthorse" });
    expect(again.status).toBe(409);
    expect((await again.json()).error).toBe("Invite already accepted");
  });

  it("tells the accept page which email the new account signs in with, while the invite is live", async () => {
    const { inviteEmail } = await import("@/lib/invites");
    const live = await invite({ email: "lthoa@test.dev", expiresAt: Date.now() + 86_400_000 });
    expect(await inviteEmail(live)).toBe("lthoa@test.dev");

    const used = await invite({ email: "used@test.dev", expiresAt: Date.now() + 86_400_000 });
    jar.clear();
    expect((await post({ token: used, name: "Used", password: "correcthorse" })).status).toBe(200);
    expect(await inviteEmail(used)).toBeNull();

    const late = await invite({ email: "late2@test.dev", expiresAt: Date.now() - 1_000 });
    expect(await inviteEmail(late)).toBeNull();
    expect(await inviteEmail("no-dot-token")).toBeNull();
  });

  it("leaves a member who opens someone else's invite as they are, and the link usable", async () => {
    const { roleInWorkspace, getSessionUser } = await import("@/lib/auth");
    // The admin opens the link they just made for a new hire, in their own browser.
    const own = await invite({ email: "dat@test.dev", expiresAt: Date.now() + 86_400_000, role: "admin" });
    jar.clear();
    expect((await post({ token: own, name: "Dat", password: "correcthorse" })).status).toBe(200);
    const admin = (await getSessionUser())!;
    const forHire = await invite({ email: "btduc@test.dev", expiresAt: Date.now() + 86_400_000 });

    const res = await post({ token: forHire });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Already a member of this workspace");
    expect(await roleInWorkspace(admin.id, ws)).toBe("admin");

    jar.clear(); // the new hire, later, from their own browser
    expect((await post({ token: forHire, name: "Bac", password: "correcthorse" })).status).toBe(200);
  });

  it("lands a removed member who accepts a new invite in the workspace, without signing in again", async () => {
    const { db, tables } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const { getSessionUser } = await import("@/lib/auth");
    const login = await import("@/app/api/auth/login/route");
    const first = await invite({ email: "linh@test.dev", expiresAt: Date.now() + 86_400_000 });
    jar.clear();
    expect((await post({ token: first, name: "Linh", password: "correcthorse" })).status).toBe(200);
    const linh = (await getSessionUser())!;
    await db.update(tables.workspaceMembers).set({ deactivatedAt: Date.now() }).where(eq(tables.workspaceMembers.userId, linh.id));

    // Removed, Linh signs in again: there is no workspace to open yet.
    jar.clear();
    const signIn = await login.POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "linh@test.dev", password: "correcthorse" }),
      }),
    );
    expect(signIn.status).toBe(200);
    expect((await getSessionUser())!.workspaceId).toBeNull();

    const again = await invite({ email: "linh@test.dev", expiresAt: Date.now() + 86_400_000 });
    expect((await post({ token: again })).status).toBe(200);
    expect((await getSessionUser())!.workspaceId).toBe(ws);
  });

  it("refuses an invite the admin took back, like an expired one", async () => {
    const token = await invite({ email: "revoked@test.dev", expiresAt: Date.now() + 86_400_000, revokedAt: Date.now() });
    jar.clear();
    const res = await post({ token, name: "Revoked", password: "correcthorse" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invite is invalid or expired");
  });

  it("still reports an unused invite past its date as expired", async () => {
    const token = await invite({ email: "late@test.dev", expiresAt: Date.now() - 1_000 });
    const res = await post({ token, name: "Late", password: "correcthorse" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invite is invalid or expired");
  });
});
