import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { AnswerTreePlugin } from "../src/plugin/opencode.js";
import { loadTree } from "../src/index.js";

type ToolMap = Record<string, { execute: (args: unknown, context?: unknown) => Promise<string> }>;
type EventPlugin = { event: (input: { event: unknown }) => Promise<void> };

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
    assert.match(list, /\* 1\.1 ans_[a-z0-9]+ child \(1 segments\)/);
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

test("OpenCode plugin auto-captures structured concise assistant answers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "opencode-answer-tree-plugin-"));

  try {
    const plugin = await AnswerTreePlugin({
      directory: dir,
      client: { app: { log: async () => undefined } },
    } as never);

    await (plugin as never as EventPlugin).event({
      event: {
        type: "message.updated",
        properties: {
          message: {
            id: "msg_structured",
            role: "assistant",
            sessionID: "ses_auto",
            content: [
              "Transformer is a neural network architecture.",
              "",
              "Core components:",
              "- Self-attention compares tokens.",
              "- Multi-head attention runs several heads.",
              "- Positional encoding preserves order.",
              "- Feed-forward layers transform representations.",
            ].join("\n"),
          },
        },
      },
    });

    const tree = await loadTree(join(dir, ".answer-tree", "opencode-state.json"));
    const nodes = Object.values(tree.state.nodes);

    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].metadata.opencodeSessionId, "ses_auto");
    assert.equal(nodes[0].metadata.opencodeMessageId, "msg_structured");
    assert.equal(tree.state.sessions?.ses_auto?.lastCapture?.status, "saved");
    assert.equal(tree.state.sessions?.ses_auto?.lastCapture?.mode, "root");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("OpenCode plugin records skipped status for short assistant answers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "opencode-answer-tree-plugin-"));

  try {
    const plugin = await AnswerTreePlugin({
      directory: dir,
      client: { app: { log: async () => undefined } },
    } as never);

    await (plugin as never as EventPlugin).event({
      event: {
        type: "message.updated",
        properties: {
          message: {
            id: "msg_short",
            role: "assistant",
            sessionID: "ses_skip",
            content: "A transformer is a neural network architecture.",
          },
        },
      },
    });

    const tree = await loadTree(join(dir, ".answer-tree", "opencode-state.json"));

    assert.equal(Object.values(tree.state.nodes).length, 0);
    assert.equal(tree.state.sessions?.ses_skip?.lastCapture?.status, "skipped");
    assert.match(tree.state.sessions?.ses_skip?.lastCapture?.reason ?? "", /too short/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("OpenCode plugin auto-captures pending follow-up answers as child nodes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "opencode-answer-tree-plugin-"));

  try {
    const plugin = await AnswerTreePlugin({
      directory: dir,
      client: { app: { log: async () => undefined } },
    } as never);
    const tools = (plugin as never as { tool: ToolMap }).tool;

    await tools.answer_tree_create.execute(
      {
        content: "Root answer content",
        title: "Root",
      },
      { sessionID: "ses_child" },
    );
    await tools.answer_tree_prompt_current.execute(
      {
        question: "continue explain this part",
      },
      { sessionID: "ses_child" },
    );

    await (plugin as never as EventPlugin).event({
      event: {
        type: "message.updated",
        properties: {
          message: {
            id: "msg_child",
            role: "assistant",
            sessionID: "ses_child",
            content: "First paragraph explains the point.\n\nSecond paragraph adds enough detail for reuse.",
          },
        },
      },
    });

    const tree = await loadTree(join(dir, ".answer-tree", "opencode-state.json"));
    const nodes = Object.values(tree.state.nodes);
    const child = nodes.find((node) => node.parentId);

    assert.equal(nodes.length, 2);
    assert.ok(child);
    assert.equal(child.metadata.opencodeMessageId, "msg_child");
    assert.equal(tree.state.sessions?.ses_child?.lastCapture?.status, "saved");
    assert.equal(tree.state.sessions?.ses_child?.lastCapture?.mode, "child");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("OpenCode plugin skips child nodes for narrow detail questions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "opencode-answer-tree-plugin-"));

  try {
    const plugin = await AnswerTreePlugin({
      directory: dir,
      client: { app: { log: async () => undefined } },
    } as never);
    const tools = (plugin as never as { tool: ToolMap }).tool;

    await tools.answer_tree_create.execute(
      {
        content: "Root answer content",
        title: "Root",
      },
      { sessionID: "ses_detail" },
    );
    await tools.answer_tree_prompt_current.execute(
      {
        question: "为什么无偏提取器不会输出 0.2 0.2？",
      },
      { sessionID: "ses_detail" },
    );

    const attached = await tools.answer_tree_attach_last.execute(
      {
        content: "因为这里讨论的是一个非常具体的数值例子，直接解释即可。\n\n不需要再生成一个可复用节点。",
        title: "Detail answer",
      },
      { sessionID: "ses_detail" },
    );
    const tree = await loadTree(join(dir, ".answer-tree", "opencode-state.json"));

    assert.match(attached, /Skipped Answer Tree child node/);
    assert.equal(Object.values(tree.state.nodes).length, 1);
    assert.equal(tree.state.sessions?.ses_detail?.activeNodeId, Object.values(tree.state.nodes)[0].id);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("OpenCode plugin limits child node depth to three levels", async () => {
  const dir = await mkdtemp(join(tmpdir(), "opencode-answer-tree-plugin-"));

  try {
    const plugin = await AnswerTreePlugin({
      directory: dir,
      client: { app: { log: async () => undefined } },
    } as never);
    const tools = (plugin as never as { tool: ToolMap }).tool;

    await tools.answer_tree_create.execute(
      {
        content: "Root answer content",
        title: "Root",
      },
      { sessionID: "ses_depth" },
    );
    await tools.answer_tree_prompt_current.execute(
      {
        question: "继续展开这个主题",
      },
      { sessionID: "ses_depth" },
    );
    await tools.answer_tree_attach_last.execute(
      {
        content: "Level two answer with enough reusable detail.\n\nIt can still have one more child.",
        title: "Level two",
      },
      { sessionID: "ses_depth" },
    );
    await tools.answer_tree_prompt_current.execute(
      {
        question: "继续展开这一层的核心方法",
      },
      { sessionID: "ses_depth" },
    );
    await tools.answer_tree_attach_last.execute(
      {
        content: "Level three answer with enough reusable detail.\n\nThis is the deepest reusable level.",
        title: "Level three",
      },
      { sessionID: "ses_depth" },
    );
    await tools.answer_tree_prompt_current.execute(
      {
        question: "继续展开这一层的实现细节",
      },
      { sessionID: "ses_depth" },
    );
    const skipped = await tools.answer_tree_attach_last.execute(
      {
        content: "This would be level four.\n\nIt should remain normal chat detail.",
        title: "Level four",
      },
      { sessionID: "ses_depth" },
    );

    const tree = await loadTree(join(dir, ".answer-tree", "opencode-state.json"));

    assert.match(skipped, /max depth is 3 levels/);
    assert.equal(Object.values(tree.state.nodes).length, 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("OpenCode plugin treats clear new topics as new root nodes inside one session", async () => {
  const dir = await mkdtemp(join(tmpdir(), "opencode-answer-tree-plugin-"));

  try {
    const plugin = await AnswerTreePlugin({
      directory: dir,
      client: { app: { log: async () => undefined } },
    } as never);
    const tools = (plugin as never as { tool: ToolMap }).tool;

    await tools.answer_tree_create.execute(
      {
        content: "Transformer root",
        title: "Transformer",
      },
      { sessionID: "ses_multi_topic" },
    );
    await tools.answer_tree_prompt_current.execute(
      {
        question: "what is CNN",
      },
      { sessionID: "ses_multi_topic" },
    );
    await (plugin as never as EventPlugin).event({
      event: {
        type: "message.updated",
        properties: {
          message: {
            id: "msg_cnn",
            role: "assistant",
            sessionID: "ses_multi_topic",
            content: [
              "CNN is a convolutional neural network.",
              "",
              "- Convolution filters scan local regions.",
              "- Pooling reduces spatial size.",
              "- Stacked layers learn higher-level features.",
            ].join("\n"),
          },
        },
      },
    });

    const tree = await loadTree(join(dir, ".answer-tree", "opencode-state.json"));
    const roots = Object.values(tree.state.nodes).filter((node) => !node.parentId);

    assert.equal(roots.length, 2);
    assert.equal(tree.state.sessions?.ses_multi_topic?.lastCapture?.mode, "root");
    assert.equal(tree.state.sessions?.ses_multi_topic?.lastQuestionId, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("OpenCode plugin records latest user message and uses it for follow-up routing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "opencode-answer-tree-plugin-"));

  try {
    const plugin = await AnswerTreePlugin({
      directory: dir,
      client: { app: { log: async () => undefined } },
    } as never);
    const tools = (plugin as never as { tool: ToolMap }).tool;

    await tools.answer_tree_create.execute(
      {
        content: "Root answer content",
        title: "Root",
      },
      { sessionID: "ses_user_route" },
    );
    await tools.answer_tree_prompt_current.execute(
      {
        question: "what is CNN",
      },
      { sessionID: "ses_user_route" },
    );
    await (plugin as never as EventPlugin).event({
      event: {
        type: "message.updated",
        properties: {
          message: {
            id: "msg_user_follow",
            role: "user",
            sessionID: "ses_user_route",
            content: "继续解释这个节点",
          },
        },
      },
    });
    await (plugin as never as EventPlugin).event({
      event: {
        type: "message.updated",
        properties: {
          message: {
            id: "msg_user_routed_child",
            role: "assistant",
            sessionID: "ses_user_route",
            content: "First paragraph explains the current node.\n\nSecond paragraph keeps enough detail.",
          },
        },
      },
    });

    const tree = await loadTree(join(dir, ".answer-tree", "opencode-state.json"));
    const nodes = Object.values(tree.state.nodes);

    assert.equal(nodes.filter((node) => node.parentId).length, 1);
    assert.equal(tree.state.sessions?.ses_user_route?.lastUserMessage?.content, "继续解释这个节点");
    assert.equal(tree.state.sessions?.ses_user_route?.lastCapture?.mode, "child");
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
