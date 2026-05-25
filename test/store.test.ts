import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { AnswerTree, loadTree, saveTree } from "../src/index.js";

test("store persists and reloads tree state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "answer-tree-"));
  const storePath = join(dir, "state.json");

  try {
    const tree = new AnswerTree();
    const node = tree.createNode({ content: "hello\n\nworld" });
    await saveTree(storePath, tree);

    const loaded = await loadTree(storePath);
    assert.equal(loaded.requireNode(node.id).segments.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
