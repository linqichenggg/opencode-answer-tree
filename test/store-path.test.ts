import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveNamedStorePath } from "../src/index.js";

test("resolveNamedStorePath maps default and opencode stores", () => {
  const cwd = "/tmp/project";

  assert.equal(resolveNamedStorePath(cwd), join(cwd, ".answer-tree", "state.json"));
  assert.equal(resolveNamedStorePath(cwd, "cli"), join(cwd, ".answer-tree", "state.json"));
  assert.equal(resolveNamedStorePath(cwd, "default"), join(cwd, ".answer-tree", "state.json"));
  assert.equal(resolveNamedStorePath(cwd, "opencode"), join(cwd, ".answer-tree", "opencode-state.json"));
});

test("resolveNamedStorePath accepts custom paths", () => {
  assert.equal(resolveNamedStorePath("/tmp/project", ".answer-tree/custom.json"), ".answer-tree/custom.json");
  assert.equal(resolveNamedStorePath("/tmp/project", "/tmp/state.json"), "/tmp/state.json");
});
