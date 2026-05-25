import { makeId } from "./id.js";
import { segmentAnswer } from "./segment.js";
import type {
  AnswerNode,
  AnswerTreeState,
  AskInput,
  CreateNodeInput,
  PromptContext,
  QuestionRecord,
  Segment,
} from "./types.js";

export function createEmptyState(): AnswerTreeState {
  return {
    version: 1,
    activeNodeId: null,
    lastQuestionId: null,
    nodes: {},
    questions: {},
    questionOrder: [],
  };
}

export function buildNodeNumberMap(state: AnswerTreeState): Map<string, string> {
  const numbers = new Map<string, string>();
  const roots = Object.values(state.nodes)
    .filter((node) => node.parentId === null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  function visit(node: AnswerNode, number: string): void {
    numbers.set(node.id, number);
    node.children.forEach((childId, index) => {
      const child = state.nodes[childId];
      if (child) visit(child, `${number}.${index + 1}`);
    });
  }

  roots.forEach((root, index) => visit(root, String(index + 1)));
  return numbers;
}

export class AnswerTree {
  constructor(public state: AnswerTreeState = createEmptyState()) {
    this.state.lastQuestionId ??= null;
  }

  createNode(input: CreateNodeInput): AnswerNode {
    const now = new Date().toISOString();
    const node: AnswerNode = {
      id: makeId("ans"),
      role: input.role ?? (input.parentId ? "assistant-answer" : "root"),
      title: input.title ?? inferTitle(input.content),
      content: input.content.trim(),
      segments: segmentAnswer(input.content),
      parentId: input.parentId ?? null,
      sourceSegmentId: input.sourceSegmentId ?? null,
      parentQuestion: input.parentQuestion ?? null,
      children: [],
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata ?? {},
    };

    this.state.nodes[node.id] = node;
    this.state.activeNodeId = node.id;

    if (node.parentId) {
      const parent = this.requireNode(node.parentId);
      parent.children.push(node.id);
      parent.updatedAt = now;
    }

    return node;
  }

  recordQuestion(input: AskInput): PromptContext {
    const node = this.requireNode(input.nodeId);
    const segment = input.segmentIndex ? getSegmentByIndex(node, input.segmentIndex) : null;
    const question: QuestionRecord = {
      id: makeId("q"),
      nodeId: node.id,
      segmentId: segment?.id ?? null,
      question: input.question.trim(),
      answerNodeId: null,
      createdAt: new Date().toISOString(),
    };

    this.state.questions[question.id] = question;
    this.state.questionOrder.push(question.id);
    this.state.activeNodeId = node.id;
    this.state.lastQuestionId = question.id;

    return {
      prompt: buildPrompt({
        node,
        segment,
        question: question.question,
        path: this.pathTo(node.id),
        nodeNumbers: buildNodeNumberMap(this.state),
        includeAncestorPath: input.includeAncestorPath ?? true,
        includeRootSummary: input.includeRootSummary ?? false,
      }),
      questionId: question.id,
      node,
      segment,
      path: this.pathTo(node.id),
    };
  }

  attachAnswer(questionId: string, content: string, title?: string): AnswerNode {
    const question = this.state.questions[questionId];
    if (!question) throw new Error(`Question not found: ${questionId}`);

    const parent = this.requireNode(question.nodeId);
    const answer = this.createNode({
      title: title ?? inferTitle(content),
      content,
      parentId: parent.id,
      sourceSegmentId: question.segmentId,
      parentQuestion: question.question,
      role: "assistant-answer",
      metadata: { questionId },
    });

    question.answerNodeId = answer.id;
    return answer;
  }

  getCurrentNode(): AnswerNode | null {
    return this.state.activeNodeId ? this.getNode(this.state.activeNodeId) ?? null : null;
  }

  requireCurrentNode(): AnswerNode {
    const current = this.getCurrentNode();
    if (!current) throw new Error("No current answer node. Use `use <nodeId>` first.");
    return current;
  }

  setCurrentNode(nodeId: string): AnswerNode {
    const node = this.requireNode(nodeId);
    this.state.activeNodeId = node.id;
    return node;
  }

  getLastQuestion(): QuestionRecord | null {
    if (this.state.lastQuestionId) {
      const question = this.state.questions[this.state.lastQuestionId];
      if (question) return question;
    }

    for (let index = this.state.questionOrder.length - 1; index >= 0; index -= 1) {
      const question = this.state.questions[this.state.questionOrder[index]];
      if (question) return question;
    }
    return null;
  }

  requireLastQuestion(): QuestionRecord {
    const question = this.getLastQuestion();
    if (!question) throw new Error("No last question. Ask a question first.");
    this.state.lastQuestionId = question.id;
    return question;
  }

  getNode(id: string): AnswerNode | undefined {
    return this.state.nodes[id];
  }

  requireNode(id: string): AnswerNode {
    const node = this.state.nodes[id];
    if (!node) throw new Error(`Answer node not found: ${id}`);
    return node;
  }

  listRoots(): AnswerNode[] {
    return Object.values(this.state.nodes)
      .filter((node) => node.parentId === null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  pathTo(nodeId: string): AnswerNode[] {
    const path: AnswerNode[] = [];
    let current: AnswerNode | undefined = this.requireNode(nodeId);
    while (current) {
      path.unshift(current);
      current = current.parentId ? this.getNode(current.parentId) : undefined;
    }
    return path;
  }

  renderTree(): string {
    const lines: string[] = [];
    const nodeNumbers = buildNodeNumberMap(this.state);
    for (const root of this.listRoots()) {
      renderNode(this.state, root, lines, "", nodeNumbers);
    }
    return lines.join("\n");
  }

  exportMarkdown(): string {
    const sections: string[] = ["# Answer Tree Export"];
    const nodeNumbers = buildNodeNumberMap(this.state);
    for (const root of this.listRoots()) {
      sections.push(renderMarkdownNode(this.state, root, 2, nodeNumbers));
    }
    return sections.join("\n\n");
  }
}

function getSegmentByIndex(node: AnswerNode, index: number): Segment {
  const segment = node.segments.find((item) => item.index === index);
  if (!segment) throw new Error(`Segment ${index} not found in node ${node.id}`);
  return segment;
}

function buildPrompt(input: {
  node: AnswerNode;
  segment: Segment | null;
  question: string;
  path: AnswerNode[];
  nodeNumbers: Map<string, string>;
  includeAncestorPath: boolean;
  includeRootSummary: boolean;
}): string {
  const lines: string[] = [];
  lines.push("请基于下面的回答树上下文回答我的问题。");
  lines.push("");

  if (input.includeAncestorPath && input.path.length > 1) {
    lines.push("## 当前路径");
    for (const node of input.path) {
      const number = input.nodeNumbers.get(node.id);
      lines.push(`- ${number ? `${number} ` : ""}${node.id}: ${node.title}`);
      if (node.parentQuestion) lines.push(`  - 来源问题: ${node.parentQuestion}`);
    }
    lines.push("");
  }

  if (input.includeRootSummary && input.path[0]) {
    lines.push("## 根回答摘要");
    lines.push(summarizeLocally(input.path[0].content));
    lines.push("");
  }

  lines.push("## 当前回答");
  lines.push(`标题: ${input.node.title}`);
  lines.push("");
  if (input.segment) {
    lines.push(`### 引用片段 ${input.segment.index}`);
    lines.push(input.segment.content);
  } else {
    lines.push(input.node.content);
  }
  lines.push("");
  lines.push("## 我的问题");
  lines.push(input.question);
  return lines.join("\n");
}

function renderNode(
  state: AnswerTreeState,
  node: AnswerNode,
  lines: string[],
  prefix: string,
  nodeNumbers: Map<string, string>,
): void {
  const currentMarker = state.activeNodeId === node.id ? "* " : "";
  const number = nodeNumbers.get(node.id);
  const numberPrefix = number ? `${number} ` : "";
  lines.push(`${prefix}${currentMarker}${numberPrefix}${node.id} ${node.title} (${node.segments.length} segments)`);
  const childPrefix = `${prefix}  `;
  for (const childId of node.children) {
    const child = state.nodes[childId];
    if (child) renderNode(state, child, lines, childPrefix, nodeNumbers);
  }
}

function renderMarkdownNode(
  state: AnswerTreeState,
  node: AnswerNode,
  level: number,
  nodeNumbers: Map<string, string>,
): string {
  const heading = "#".repeat(level);
  const number = nodeNumbers.get(node.id);
  const parts: string[] = [`${heading} ${number ? `${number}. ` : ""}${node.title}`, `Node: \`${node.id}\``];
  if (number) parts.push(`Number: \`${number}\``);
  if (node.parentQuestion) parts.push(`Parent question: ${node.parentQuestion}`);
  parts.push("");
  parts.push(node.content);

  const questions = Object.values(state.questions).filter((q) => q.nodeId === node.id);
  if (questions.length) {
    parts.push("");
    parts.push(`${heading}# Questions`);
    for (const question of questions) {
      parts.push(`- ${question.segmentId ?? "whole"}: ${question.question}`);
    }
  }

  for (const childId of node.children) {
    const child = state.nodes[childId];
    if (child) parts.push(renderMarkdownNode(state, child, level + 1, nodeNumbers));
  }
  return parts.join("\n");
}

function inferTitle(content: string): string {
  const firstLine = content.trim().split("\n").find(Boolean) ?? "Untitled answer";
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
}

function summarizeLocally(content: string): string {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length > 500 ? `${compact.slice(0, 500)}...` : compact;
}
