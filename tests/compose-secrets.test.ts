import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Q115: the self-host compose file is also what production runs. A database
 * password written into it is known to anyone who can read the repository, so
 * every connection string takes its password from the environment, as
 * POSTGRES_PASSWORD and FOURTY_APP_PASSWORD already do.
 */
describe("docker-compose.yml database passwords", () => {
  const compose = readFileSync("docker-compose.yml", "utf8");
  const urls = [...compose.matchAll(/postgres(?:ql)?:\/\/([^:\s]+):([^@\s]+)@/g)].map(([, user, password]) => ({ user, password }));

  it("has connection strings to check", () => {
    expect(urls.length).toBeGreaterThan(0);
  });

  it("reads every connection string's password from the environment", () => {
    const written = urls.filter(({ password }) => !password!.startsWith("${"));
    expect(written.map(({ user }) => user)).toEqual([]);
  });

  it("uses the owner's password for the owner and the app's for the app", () => {
    for (const { user, password } of urls) {
      expect(password).toMatch(user === "fourty_app" ? /^\$\{FOURTY_APP_PASSWORD[:}]/ : /^\$\{POSTGRES_PASSWORD[:}]/);
    }
  });
});
