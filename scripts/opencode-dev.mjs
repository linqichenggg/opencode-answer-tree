#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const forkRoot = resolve(
  process.env.OPENCODE_FORK_DIR ?? resolve(projectRoot, "..", "opencode-answer-tree-fork"),
  "packages",
  "opencode",
);

if (!existsSync(forkRoot)) {
  console.error("OpenCode fork not found.");
  console.error(`Expected: ${forkRoot}`);
  console.error("Set OPENCODE_FORK_DIR to the OpenCode fork root if it lives elsewhere.");
  process.exit(1);
}

const env = {
  ...process.env,
  PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH ?? ""}`,
};

const child = spawn(
  "bun",
  ["run", "--cwd", forkRoot, "dev", projectRoot, "--print-logs", "--log-level", "INFO"],
  {
    stdio: "inherit",
    env,
  },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
