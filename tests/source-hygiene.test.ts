import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * A source file must not contain a NUL byte.
 *
 * This is not hypothetical: `src/lib/metrics.ts` shipped with eight of them,
 * where a space inside a template literal had been mangled. Nothing failed — the
 * code ran, the tests passed — but git, ripgrep and every editor classified the
 * file as binary, so it silently dropped out of diffs and searches. A file
 * nobody can review is worse than one that does not compile.
 */
describe("source hygiene", () => {
  it("has no NUL bytes in any tracked text file", () => {
    const root = path.resolve(__dirname, "..");
    const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "buffer" })
      .toString("utf8")
      .split("\0")
      .filter(Boolean);

    const offenders: string[] = [];
    for (const rel of files) {
      const full = path.join(root, rel);
      // A tracked path can be a submodule or a deleted-but-staged entry.
      let size = 0;
      try {
        const st = statSync(full);
        if (!st.isFile()) continue;
        size = st.size;
      } catch {
        continue;
      }
      if (size > 2_000_000) continue; // real binaries are not what this checks
      if (/\.(png|jpe?g|gif|ico|webp|woff2?|ttf|pdf|zip)$/i.test(rel)) continue;
      if (readFileSync(full).includes(0)) offenders.push(rel);
    }
    expect(offenders, `files containing a NUL byte:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("does not send users to Settings or Automations for workflows", () => {
    // Workflows live at /workflows in the sidebar. A tutorial that pointed
    // at Settings for workflows sent people into a panel that does not exist.
    const root = path.resolve(__dirname, "..");
    const files = execFileSync("git", ["ls-files", "-z", "docs", "src"], {
      cwd: root,
      encoding: "buffer",
    })
      .toString("utf8")
      .split("\0")
      .filter(Boolean);

    const offenders: string[] = [];
    for (const rel of files) {
      if (!/\.(md|ts|tsx)$/.test(rel)) continue;
      const text = readFileSync(path.join(root, rel), "utf8");
      if (/Settings\s*→\s*Workflows/.test(text) || /Automations\s*→/.test(text)) {
        offenders.push(rel);
      }
    }
    expect(offenders, `wrong workflow path:\n${offenders.join("\n")}`).toEqual([]);
  });
});
