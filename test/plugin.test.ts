import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { AnswerTreePlugin } from "../src/plugin/opencode.js";
import { loadTree } from "../src/index.js";

type ToolMap = Record<string, { execute: (args: unknown, context?: unknown) => Promise<string> }>;

test("OpenCode plugin tools can create and list answer nodes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "opencode-answer-tree-plugin-"));

  try {
    const plugin = await AnswerTreePlugin({
      directory: dir,
      client: { app: { log: async () => undefined } },
    } as never);
    const tools = (plugin as never as { tool: ToolMap }).tool;

    const createResult = await tools.answer_tree_create.execute(
      {
        content: "A\n\nB",
        title: "root",
      },
      { sessionID: "ses_test" },
    );
    const listResult = await tools.answer_tree_list.execute({});
    const tree = await loadTree(join(dir, ".answer-tree", "opencode-state.json"));
    const node = Object.values(tree.state.nodes)[0];

    assert.match(createResult, /Saved ans_/);
    assert.match(listResult, /root \(2 segments\)/);
    assert.equal(node.metadata.opencodeSessionId, "ses_test");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("OpenCode plugin tools support current node and last question flow", async () => {
  const dir = await mkdtemp(join(tmpdir(), "opencode-answer-tree-plugin-"));

  try {
    const plugin = await AnswerTreePlugin({
      directory: dir,
      client: { app: { log: async () => undefined } },
    } as never);
    const tools = (plugin as never as { tool: ToolMap }).tool;

    await tools.answer_tree_create.execute({
      content: "第一段。\n\n第二段。",
      title: "root",
    });
    const current = await tools.answer_tree_current.execute({});
    const rootId = current.match(/Current: (ans_[a-z0-9]+)/)?.[1];
    assert.ok(rootId);

    const prompt = await tools.answer_tree_prompt_current.execute({
      question: "解释当前节点",
      segmentIndex: 1,
    });
    const questionId = prompt.match(/Question (q_[a-z0-9]+)/)?.[1];
    assert.ok(questionId);

    const attached = await tools.answer_tree_attach_last.execute({
      content: "这是子回答。",
      title: "child",
    });
    assert.match(attached, new RegExp(`Question: ${questionId}`));

    const list = await tools.answer_tree_list.execute({});
    assert.match(list, /\* ans_[a-z0-9]+ child \(1 segments\)/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("OpenCode plugin current node is scoped by session", async () => {
  const dir = await mkdtemp(join(tmpdir(), "opencode-answer-tree-plugin-"));

  try {
    const plugin = await AnswerTreePlugin({
      directory: dir,
      client: { app: { log: async () => undefined } },
    } as never);
    const tools = (plugin as never as { tool: ToolMap }).tool;

    await tools.answer_tree_create.execute(
      {
        content: "A session answer",
        title: "session A",
      },
      { sessionID: "ses_a" },
    );
    await tools.answer_tree_create.execute(
      {
        content: "B session answer",
        title: "session B",
      },
      { sessionID: "ses_b" },
    );

    const currentA = await tools.answer_tree_current.execute({}, { sessionID: "ses_a" });
    const currentB = await tools.answer_tree_current.execute({}, { sessionID: "ses_b" });

    assert.match(currentA, /session A/);
    assert.match(currentB, /session B/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("OpenCode plugin can switch current node by title match", async () => {
  const dir = await mkdtemp(join(tmpdir(), "opencode-answer-tree-plugin-"));

  try {
    const plugin = await AnswerTreePlugin({
      directory: dir,
      client: { app: { log: async () => undefined } },
    } as never);
    const tools = (plugin as never as { tool: ToolMap }).tool;

    await tools.answer_tree_create.execute(
      {
        content: "Self attention content",
        title: "Self-Attention 计算过程",
      },
      { sessionID: "ses_match" },
    );
    await tools.answer_tree_create.execute(
      {
        content: "Multi-head content",
        title: "Multi-Head Attention 详解",
      },
      { sessionID: "ses_match" },
    );

    const useMatch = await tools.answer_tree_use_match.execute({ query: "multi head" }, { sessionID: "ses_match" });
    const current = await tools.answer_tree_current.execute({}, { sessionID: "ses_match" });

    assert.match(useMatch, /Multi-Head Attention/);
    assert.match(current, /Multi-Head Attention/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("OpenCode plugin can show, rename, and delete nodes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "opencode-answer-tree-plugin-"));

  try {
    const plugin = await AnswerTreePlugin({
      directory: dir,
      client: { app: { log: async () => undefined } },
    } as never);
    const tools = (plugin as never as { tool: ToolMap }).tool;

    await tools.answer_tree_create.execute(
      {
        content: "Root content",
        title: "Original Root",
      },
      { sessionID: "ses_manage" },
    );
    const current = await tools.answer_tree_current.execute({}, { sessionID: "ses_manage" });
    const rootId = current.match(/Current: (ans_[a-z0-9]+)/)?.[1];
    assert.ok(rootId);

    const shown = await tools.answer_tree_show_full.execute({}, { sessionID: "ses_manage" });
    assert.match(shown, /Root content/);

    const renamed = await tools.answer_tree_rename.execute({ nodeId: rootId, title: "Renamed Root" });
    assert.match(renamed, /Renamed Root/);

    const deleted = await tools.answer_tree_delete.execute({ nodeId: rootId }, { sessionID: "ses_manage" });
    const afterDelete = await tools.answer_tree_current.execute({}, { sessionID: "ses_manage" });

    assert.match(deleted, /Deleted 1 node/);
    assert.equal(afterDelete, "No current answer node.");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
