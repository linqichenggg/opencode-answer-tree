#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hostRoot = resolve(
  process.env.OPENCODE_FORK_DIR ?? resolve(projectRoot, "opencode-host"),
  "packages",
  "opencode",
);

if (!existsSync(hostRoot)) {
  console.error("OpenCode host not found.");
  console.error(`Expected: ${hostRoot}`);
  console.error("Set OPENCODE_FORK_DIR to an OpenCode host root if it lives elsewhere.");
  process.exit(1);
}

const env = {
  ...process.env,
  PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH ?? ""}`,
};

const args = ["run", "--cwd", hostRoot, "dev", projectRoot];
if (process.env.ANSWER_TREE_OPENCODE_PRINT_LOGS === "1") {
  args.push("--print-logs", "--log-level", "INFO");
}

const child = spawn(
  "bun",
  args,
  {
    stdio: "inherit",
    env,
  },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
