#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
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

const targetDirectory = resolve(process.argv[2] ?? process.cwd());
const stateDirectory = resolve(targetDirectory, ".answer-tree");
const pidFile = resolve(stateDirectory, "opencode-dev.pid.json");

cleanupPreviousRun();
cleanupMatchingProcesses("SIGTERM");

const args = ["run", "--cwd", hostRoot, "dev", targetDirectory];
if (process.env.ANSWER_TREE_OPENCODE_PRINT_LOGS === "1") {
  args.push("--print-logs", "--log-level", "INFO");
}

const child = spawn(
  "bun",
  args,
  {
    detached: false,
    stdio: "inherit",
    env,
  },
);

writePidFile();

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

function processCommand(pid) {
  const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], {
    encoding: "utf8",
  });
  if (result.status !== 0) return "";
  return result.stdout.trim();
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function matchingProcessPids() {
  const result = spawnSync("ps", ["-axo", "pid=,command="], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      if (!match) return undefined;
      return { pid: Number(match[1]), command: match[2] };
    })
    .filter((item) => item && item.pid !== process.pid)
    .filter((item) => {
      const command = item.command;
      return (
        command.includes("scripts/opencode-dev.mjs") && command.includes(targetDirectory)
      ) || (
        command.includes("bun run --cwd") &&
        command.includes(hostRoot) &&
        command.includes(" dev ") &&
        command.includes(targetDirectory)
      ) || (
        command.includes("bun run --conditions=browser ./src/index.ts") &&
        command.includes(targetDirectory)
      );
    })
    .map((item) => item.pid)
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

function cleanupMatchingProcesses(signal) {
  for (const pid of matchingProcessPids()) {
    killTree(pid, signal);
  }
}

function cleanupPreviousRun() {
  if (!existsSync(pidFile)) return;
  try {
    const previous = JSON.parse(readFileSync(pidFile, "utf8"));
    for (const pid of [previous.wrapperPid, previous.childPid].filter(Number.isFinite)) {
      if (!processExists(pid)) continue;
      const command = processCommand(pid);
      if (!command.includes(projectRoot) && !command.includes(hostRoot) && !command.includes(targetDirectory)) continue;
      killTree(pid, "SIGTERM");
    }
  } catch {
    // Ignore malformed pid files; exact command matching below is the safety net.
  }
}

function writePidFile() {
  try {
    mkdirSync(stateDirectory, { recursive: true });
    writeFileSync(
      pidFile,
      JSON.stringify(
        {
          wrapperPid: process.pid,
          childPid: child.pid,
          projectRoot,
          hostRoot,
          targetDirectory,
          startedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
  } catch {
    // The launcher still works if the project directory cannot store pid metadata.
  }
}

function removePidFile() {
  try {
    const current = JSON.parse(readFileSync(pidFile, "utf8"));
    if (current.wrapperPid === process.pid) unlinkSync(pidFile);
  } catch {
    // The file may already be gone.
  }
}

function killChild(signal = "SIGTERM") {
  if (!child.pid) return;
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
  killTree(child.pid, "SIGWINCH");
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
  removePidFile();
});

child.on("exit", (code, signal) => {
  shuttingDown = true;
  cleanupMatchingProcesses("SIGTERM");
  removePidFile();
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
