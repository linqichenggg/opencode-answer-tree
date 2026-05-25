import { test } from "node:test";
import assert from "node:assert/strict";
import { AnswerTree } from "../src/index.js";

test("AnswerTree supports nested answer nodes", () => {
  const tree = new AnswerTree();
  const root = tree.createNode({
    title: "长回答 A",
    content: "第一段。\n\n第二段，需要进一步追问。\n\n第三段。",
  });

  const promptA = tree.recordQuestion({
    nodeId: root.id,
    segmentIndex: 2,
    question: "解释第二段",
  });
  const child = tree.attachAnswer(promptA.questionId, "回答 a1 第一段。\n\n回答 a1 第二段。", "回答 a1");

  const promptX = tree.recordQuestion({
    nodeId: child.id,
    segmentIndex: 1,
    question: "继续展开第一段",
  });

  assert.equal(tree.pathTo(child.id).map((node) => node.id).join(">"), `${root.id}>${child.id}`);
  assert.match(promptA.prompt, /引用片段 2/);
  assert.match(promptX.prompt, /当前路径/);
  assert.match(tree.renderTree(), new RegExp(`${root.id}.*\\n  \\* ${child.id}`));
});

test("AnswerTree tracks current node and last question", () => {
  const tree = new AnswerTree();
  const root = tree.createNode({ title: "A", content: "第一段。\n\n第二段。" });

  assert.equal(tree.getCurrentNode()?.id, root.id);

  const question = tree.recordQuestion({
    nodeId: root.id,
    segmentIndex: 1,
    question: "解释第一段",
  });
  assert.equal(tree.getLastQuestion()?.id, question.questionId);

  const child = tree.attachAnswer(question.questionId, "子回答内容", "子回答");
  assert.equal(tree.getCurrentNode()?.id, child.id);

  tree.setCurrentNode(root.id);
  assert.equal(tree.requireCurrentNode().id, root.id);
  assert.match(tree.renderTree(), new RegExp(`\\* ${root.id}`));
});

test("AnswerTree exports markdown with questions", () => {
  const tree = new AnswerTree();
  const root = tree.createNode({ title: "A", content: "content" });
  tree.recordQuestion({ nodeId: root.id, question: "why?" });

  const markdown = tree.exportMarkdown();

  assert.match(markdown, /# Answer Tree Export/);
  assert.match(markdown, /why\?/);
});
