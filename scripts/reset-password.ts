/**
 * reset-password — set a user's password from the server.
 *
 * The way back in when an admin password is lost. Fourty has no forgot-password
 * flow: on a fresh self-hosted install there is nowhere to send a reset link,
 * and the first account exists before any mail is configured. Whoever can reach
 * the database can reset a password, which is the same trust boundary as the
 * server itself.
 *
 *   npm run reset-password -- admin@example.com
 *
 * The password is typed at the prompt and never echoed, so it stays out of the
 * shell history and the process list. For automation, pipe it instead — the
 * confirmation prompt is skipped when stdin is not a terminal:
 *
 *   printf '%s' "$NEW_PASSWORD" | npm run reset-password -- admin@example.com
 *
 * Signs out every existing session for that user.
 */
import { createInterface } from "node:readline";
import { PASSWORD_MAX, PASSWORD_MIN, resetPassword } from "../src/lib/auth";

/** Read one line from the terminal with echo suppressed. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // `terminal: true` makes readline echo; muting the output stream while the
    // question is outstanding is what keeps the password off the screen.
    let muted = false;
    const output = rl as unknown as { output: NodeJS.WriteStream; _writeToOutput(s: string): void };
    output._writeToOutput = (s: string) => {
      if (!muted) output.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

/** Read the whole of stdin — the non-interactive path. */
function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk)).on("end", () => resolve(data));
  });
}

async function collectPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    // Piped in: no way to ask for confirmation, and a trailing newline from
    // `echo` is a typo the user cannot see, so strip it.
    return (await readStdin()).replace(/\r?\n$/, "");
  }
  const first = await promptHidden(`New password (${PASSWORD_MIN}-${PASSWORD_MAX} characters): `);
  const second = await promptHidden("Repeat: ");
  if (first !== second) throw new Error("passwords do not match");
  return first;
}

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email || email.startsWith("-")) {
    console.error("usage: npm run reset-password -- <email>");
    process.exit(2);
  }

  const password = await collectPassword();
  const ok = await resetPassword(email, password);
  if (!ok) {
    console.error(`reset-password: no user with the address ${email}`);
    process.exit(1);
  }
  console.log(`Password reset for ${email}. All existing sessions were signed out.`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(`reset-password: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
