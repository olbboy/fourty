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
  let invite: (opts: { email: string; expiresAt: number }) => Promise<string>;

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
    const ws = await createWorkspace();
    invite = async ({ email, expiresAt }) => {
      const token = `${ws}.${newId()}${newId()}`;
      await withWorkspace(ws, () =>
        db.insert(tables.invites).values({
          id: newId(), workspaceId: ws, email, role: "member", tokenHash: sha256(token), expiresAt, createdAt: Date.now(),
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

  it("still reports an unused invite past its date as expired", async () => {
    const token = await invite({ email: "late@test.dev", expiresAt: Date.now() - 1_000 });
    const res = await post({ token, name: "Late", password: "correcthorse" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invite is invalid or expired");
  });
});
