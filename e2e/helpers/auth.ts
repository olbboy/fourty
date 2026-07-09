/**
 * Fixed admin credentials shared by the setup wizard (auth.setup.ts) and the
 * login/logout spec (auth.spec.ts). The wizard creates this account on a fresh
 * E2E database; auth.spec then signs in with the same credentials.
 */
export const ADMIN = {
  name: "E2E Admin",
  email: "e2e-admin@fourty.test",
  password: "e2e-password-123",
} as const;

/** Where the signed-in session is persisted for the `smoke` project. */
export const STORAGE_STATE = "e2e/.auth/user.json";
