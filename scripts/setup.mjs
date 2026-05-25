#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hostRoot = resolve(projectRoot, "opencode-host");

const steps = [
  {
    name: "Install Answer Tree dependencies",
    command: "npm",
    args: ["install"],
    cwd: projectRoot,
  },
  {
    name: "Install bundled OpenCode host dependencies",
    command: "bun",
    args: ["install"],
    cwd: hostRoot,
    requirePath: hostRoot,
  },
  {
    name: "Build Answer Tree",
    command: "npm",
    args: ["run", "build"],
    cwd: projectRoot,
  },
];

const env = {
  ...process.env,
  PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH ?? ""}`,
};

for (const step of steps) {
  if (step.requirePath && !existsSync(step.requirePath)) {
    console.error(`\n[setup] ${step.name} failed because the required path does not exist:`);
    console.error(step.requirePath);
    process.exit(1);
  }

  console.log(`\n[setup] ${step.name}`);
  await run(step.command, step.args, step.cwd);
}

console.log("\n[setup] Ready. Start the Answer Tree OpenCode host with:");
console.log("npm run opencode");

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
