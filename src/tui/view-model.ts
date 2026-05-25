import type { AnswerNode, AnswerTree, QuestionRecord } from "../index.js";

export type TreeLine = {
  nodeId: string;
  depth: number;
  label: string;
};

export type ViewOptions = {
  ascii?: boolean;
};

export function buildTreeLines(tree: AnswerTree, options: ViewOptions = {}): TreeLine[] {
  const lines: TreeLine[] = [];
  for (const root of tree.listRoots()) {
    appendNode(tree, root, 0, lines, options);
  }
  return lines;
}

export function renderNodeDetails(tree: AnswerTree, node: AnswerNode | null, options: ViewOptions = {}): string {
  if (!node) return "No answer node selected.";

  const parts: string[] = [];
  parts.push(formatTitle(node, options));
  parts.push(`ID: ${node.id}`);
  parts.push(`Segments: ${node.segments.length}`);
  if (node.parentId) parts.push(`Parent: ${node.parentId}`);
  if (node.parentQuestion) parts.push(`Parent question: ${formatText(node.parentQuestion, options)}`);
  parts.push("");
  parts.push("Path:");
  for (const pathNode of tree.pathTo(node.id)) {
    parts.push(`- ${pathNode.id} ${formatTitle(pathNode, options)}`);
  }
  parts.push("");
  parts.push("Segments:");
  for (const segment of node.segments) {
    parts.push(`[${segment.index}] ${formatText(segment.content, options)}`);
    parts.push("");
  }

  const questions = questionsForNode(tree, node.id);
  if (questions.length) {
    parts.push("Questions:");
    for (const question of questions) {
      parts.push(`- ${question.id}: ${formatText(question.question, options)}`);
      if (question.answerNodeId) parts.push(`  answer: ${question.answerNodeId}`);
    }
  }

  return parts.join("\n");
}

export function questionsForNode(tree: AnswerTree, nodeId: string): QuestionRecord[] {
  return tree.state.questionOrder
    .map((id) => tree.state.questions[id])
    .filter((question): question is QuestionRecord => Boolean(question && question.nodeId === nodeId));
}

function appendNode(tree: AnswerTree, node: AnswerNode, depth: number, lines: TreeLine[], options: ViewOptions): void {
  const active = tree.state.activeNodeId === node.id ? "* " : "";
  const indent = "  ".repeat(depth);
  lines.push({
    nodeId: node.id,
    depth,
    label: `${indent}${active}${formatTitle(node, options)} (${node.id})`,
  });

  for (const childId of node.children) {
    const child = tree.getNode(childId);
    if (child) appendNode(tree, child, depth + 1, lines, options);
  }
}

function formatTitle(node: AnswerNode, options: ViewOptions): string {
  if (!options.ascii) return node.title;
  const cleaned = toAscii(node.title);
  if (cleaned) return cleaned;
  return `Node ${node.id}`;
}

function formatText(input: string, options: ViewOptions): string {
  if (!options.ascii) return input;
  const cleaned = toAscii(input);
  if (cleaned) return cleaned;
  return `[non-ASCII text hidden in TUI; press e to export original Markdown]`;
}

function toAscii(input: string): string {
  const output = input
    .normalize("NFKD")
    .replace(/[^\x20-\x7E\n\t]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
  return /[A-Za-z0-9]/.test(output) ? output : "";
}
