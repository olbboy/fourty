#!/usr/bin/env node
import { migrate } from "./migrate.js";
import { TwentyGraphQLSource, FourtyRestSink } from "./clients.js";

/**
 * fourty-twenty-migrate — CLI entry (Gate B6). Reads connection details from flags
 * or env, then runs the migration. Use --dry-run to transform + count without
 * writing anything to Fourty.
 *
 *   fourty-twenty-migrate \
 *     --twenty-url https://twenty.example.com --twenty-token $TWENTY_TOKEN \
 *     --fourty-url http://localhost:3000 --fourty-key $FOURTY_API_KEY [--dry-run]
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const twentyUrl = arg("twenty-url") ?? process.env.TWENTY_URL;
  const twentyToken = arg("twenty-token") ?? process.env.TWENTY_TOKEN;
  const fourtyUrl = arg("fourty-url") ?? process.env.FOURTY_URL ?? "http://localhost:3000";
  const fourtyKey = arg("fourty-key") ?? process.env.FOURTY_API_KEY;
  const dryRun = flag("dry-run");

  if (!twentyUrl || !twentyToken) {
    console.error("Missing --twenty-url / --twenty-token (or TWENTY_URL / TWENTY_TOKEN).");
    process.exit(1);
  }
  if (!dryRun && !fourtyKey) {
    console.error("Missing --fourty-key (or FOURTY_API_KEY). Use --dry-run to skip writes.");
    process.exit(1);
  }

  const source = new TwentyGraphQLSource(twentyUrl, twentyToken);
  const sink = new FourtyRestSink(fourtyUrl, fourtyKey ?? "");

  console.error(`Migrating Twenty (${twentyUrl}) → Fourty (${fourtyUrl})${dryRun ? " [dry-run]" : ""}…`);
  const report = await migrate(source, sink, { dryRun, onProgress: (m) => console.error(`  ${m}`) });

  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length) {
    console.error(`\nCompleted with ${report.errors.length} error(s).`);
    process.exit(report.companies + report.contacts + report.deals === 0 ? 1 : 0);
  }
  console.error("Done.");
}

main().catch((e) => {
  console.error("Migration failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
