import { test } from "node:test";
import assert from "node:assert/strict";
import { AnswerTree } from "../src/index.js";
import { buildTreeLines, renderNodeDetails } from "../src/tui/view-model.js";

test("TUI view model renders nested tree lines with active marker", () => {
  const tree = new AnswerTree();
  const root = tree.createNode({ title: "Root", content: "root content" });
  const question = tree.recordQuestion({ nodeId: root.id, question: "why?" });
  const child = tree.attachAnswer(question.questionId, "child content", "Child");

  const lines = buildTreeLines(tree);

  assert.equal(lines.length, 2);
  assert.equal(lines[0].nodeId, root.id);
  assert.equal(lines[1].nodeId, child.id);
  assert.equal(lines[0].number, "1");
  assert.equal(lines[1].number, "1.1");
  assert.match(lines[1].label, /\* 1\.1 Child/);
});

test("TUI view model renders node details with path, segments, and questions", () => {
  const tree = new AnswerTree();
  const root = tree.createNode({ title: "Root", content: "segment one\n\nsegment two" });
  tree.recordQuestion({ nodeId: root.id, segmentIndex: 1, question: "Explain segment one" });

  const details = renderNodeDetails(tree, root);

  assert.match(details, /ID: ans_/);
  assert.match(details, /Number: 1/);
  assert.match(details, /Path:/);
  assert.match(details, /\[1\] segment one/);
  assert.match(details, /Explain segment one/);
});

test("TUI view model ascii mode hides non-ASCII text", () => {
  const tree = new AnswerTree();
  const root = tree.createNode({ title: "测试长回答 A", content: "这是中文内容。" });
  tree.recordQuestion({ nodeId: root.id, question: "为什么？" });

  const lines = buildTreeLines(tree, { ascii: true });
  const details = renderNodeDetails(tree, root, { ascii: true });

  assert.match(lines[0].label, new RegExp(`\\* 1 A \\(${root.id}\\)`));
  assert.doesNotMatch(lines[0].label, /[^\x00-\x7F]/);
  assert.match(details, /non-ASCII text hidden/);
  assert.doesNotMatch(details, /[^\x00-\x7F]/);
});
