#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

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
    detached: true,
    stdio: "inherit",
    env,
  },
);

let shuttingDown = false;
const signalExitCodes = {
  SIGINT: 130,
  SIGTERM: 143,
  SIGHUP: 129,
};

function childPids(pid) {
  const result = spawnSync("pgrep", ["-P", String(pid)], {
    encoding: "utf8",
  });
  if (result.status !== 0) return [];
  return result.stdout
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((value) => Number(value))
    .filter(Number.isFinite);
}

function killTree(pid, signal = "SIGTERM") {
  for (const childPid of childPids(pid)) {
    killTree(childPid, signal);
  }
  try {
    process.kill(pid, signal);
  } catch {
    // The process may have exited while we were walking the tree.
  }
}

function killChild(signal = "SIGTERM") {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    // The process group may already be gone. Fall back to walking children.
  }
  killTree(child.pid, signal);
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  killChild(signal);
  setTimeout(() => killChild("SIGKILL"), 800).unref();
}

function forwardResize() {
  if (!child.pid || shuttingDown) return;
  try {
    process.kill(-child.pid, "SIGWINCH");
  } catch {
    try {
      process.kill(child.pid, "SIGWINCH");
    } catch {
      // The child process may have exited between resize events.
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => {
    shutdown(signal);
    setTimeout(() => process.exit(signalExitCodes[signal]), 1500).unref();
  });
}

process.on("SIGWINCH", forwardResize);
if (process.stdout.isTTY) process.stdout.on("resize", forwardResize);

process.once("exit", () => {
  if (!shuttingDown) killChild();
});

child.on("exit", (code, signal) => {
  shuttingDown = true;
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
