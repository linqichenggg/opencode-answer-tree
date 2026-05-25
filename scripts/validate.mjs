#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hostPackageRoot = resolve(projectRoot, "opencode-host", "packages", "opencode");

const steps = [
  {
    name: "Main project tests",
    command: "npm",
    args: ["test"],
    cwd: projectRoot,
  },
  {
    name: "CLI and TUI smoke test",
    command: "npm",
    args: ["run", "smoke"],
    cwd: projectRoot,
  },
  {
    name: "OpenCode host typecheck",
    command: "bun",
    args: ["run", "typecheck"],
    cwd: hostPackageRoot,
    requirePath: hostPackageRoot,
  },
];

const env = {
  ...process.env,
  PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH ?? ""}`,
};

for (const step of steps) {
  if (step.requirePath && !existsSync(step.requirePath)) {
    console.error(`\n[validate] ${step.name} skipped because the required path does not exist:`);
    console.error(step.requirePath);
    process.exit(1);
  }

  console.log(`\n[validate] ${step.name}`);
  await run(step.command, step.args, step.cwd);
}

console.log("\n[validate] All checks passed.");

function run(command, args, cwd) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
    });

    child.on("error", rejectRun);
    child.on("exit", (code, signal) => {
      if (signal) {
        rejectRun(new Error(`${command} ${args.join(" ")} exited with signal ${signal}`));
        return;
      }
      if (code !== 0) {
        rejectRun(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
        return;
      }
      resolveRun();
    });
  });
}
