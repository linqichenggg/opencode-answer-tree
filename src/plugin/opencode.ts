import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tool, type Plugin } from "@opencode-ai/plugin";
import { AnswerTree, createEmptyState, loadTree, saveTree } from "../index.js";
import type { AnswerTreeState } from "../index.js";

type PluginContext = {
  directory: string;
  client?: {
    app?: {
      log?: (input: unknown) => Promise<unknown>;
    };
  };
};

type ToolContext = {
  sessionID?: string;
};

const STORE_DIR = ".answer-tree";
const STORE_FILE = "opencode-state.json";
const MIN_AUTO_CAPTURE_CHARS = 1200;

export const AnswerTreePlugin: Plugin = async (ctx) => {
  const pluginCtx = ctx as PluginContext;
  const storePath = join(pluginCtx.directory, STORE_DIR, STORE_FILE);

  async function withTree<T>(fn: (tree: AnswerTree) => Promise<T> | T): Promise<T> {
    const tree = await loadTree(storePath);
    const result = await fn(tree);
    await saveTree(storePath, tree);
    return result;
  }

  return {
    event: async ({ event }: { event: unknown }) => {
      const message = extractAssistantMessage(event);
      if (!message || message.content.length < MIN_AUTO_CAPTURE_CHARS) return;

      await mkdir(join(pluginCtx.directory, STORE_DIR), { recursive: true });
      await withTree((tree) => {
        const alreadyCaptured = Object.values(tree.state.nodes).some(
          (node) => node.metadata.opencodeMessageId === message.messageId,
        );
        if (alreadyCaptured) return;

        const node = tree.createNode({
          title: message.title,
          content: message.content,
          metadata: {
            opencodeMessageId: message.messageId,
            ...sessionMetadata(message.sessionID),
            capturedBy: "message.updated",
          },
        });
        setSessionActive(tree, message.sessionID, node.id);
      });
      await log(pluginCtx, "info", `Captured assistant answer ${message.messageId}`);
    },

    tool: {
      answer_tree_create: tool({
        description: "Save a long answer as a root answer-tree node.",
        args: {
          content: tool.schema.string(),
          title: tool.schema.string().optional(),
        },
        async execute(args, toolCtx?: ToolContext) {
          return withTree((tree) => {
            const node = tree.createNode({
              content: args.content,
              title: args.title,
              metadata: {
                ...sessionMetadata(toolCtx?.sessionID),
                createdBy: "tool.answer_tree_create",
              },
            });
            setSessionActive(tree, toolCtx?.sessionID, node.id);
            return `Saved ${node.id}: ${node.title} (${node.segments.length} segments)`;
          });
        },
      }),

      answer_tree_list: tool({
        description: "List saved answer-tree nodes.",
        args: {},
        async execute() {
          const tree = await loadTree(storePath);
          return tree.renderTree() || "No answer nodes saved yet.";
        },
      }),

      answer_tree_show: tool({
        description: "Show numbered segments for a saved answer node.",
        args: {
          nodeId: tool.schema.string(),
        },
        async execute(args) {
          return withTree((tree) => {
            const node = tree.setCurrentNode(args.nodeId);
            return node.segments.map((segment) => `[${segment.index}] ${segment.content}`).join("\n\n");
          });
        },
      }),

      answer_tree_show_full: tool({
        description: "Show the full content for a saved answer node.",
        args: {
          nodeId: tool.schema.string().optional(),
        },
        async execute(args, toolCtx?: ToolContext) {
          const tree = await loadTree(storePath);
          const node = args.nodeId ? tree.requireNode(args.nodeId) : requireSessionCurrentNode(tree, toolCtx?.sessionID);
          return `# ${node.title}\n\nNode: ${node.id}\nSegments: ${node.segments.length}\n\n${node.content}`;
        },
      }),

      answer_tree_current: tool({
        description: "Show the current answer node and last recorded question.",
        args: {},
        async execute(_args, toolCtx?: ToolContext) {
          const tree = await loadTree(storePath);
          const node = getSessionCurrentNode(tree, toolCtx?.sessionID);
          const question = getSessionLastQuestion(tree, toolCtx?.sessionID);
          if (!node) return "No current answer node.";
          const lines = [`Current: ${node.id} ${node.title} (${node.segments.length} segments)`];
          if (question) lines.push(`Last question: ${question.id} ${question.question}`);
          return lines.join("\n");
        },
      }),

      answer_tree_use: tool({
        description: "Set the current answer node.",
        args: {
          nodeId: tool.schema.string(),
        },
        async execute(args, toolCtx?: ToolContext) {
          return withTree((tree) => {
            const node = tree.setCurrentNode(args.nodeId);
            setSessionActive(tree, toolCtx?.sessionID, node.id);
            return `Current: ${node.id} ${node.title} (${node.segments.length} segments)`;
          });
        },
      }),

      answer_tree_use_match: tool({
        description: "Find an answer node by title/question text and set it as the current node.",
        args: {
          query: tool.schema.string(),
        },
        async execute(args, toolCtx?: ToolContext) {
          return withTree((tree) => {
            const matches = findMatchingNodes(tree, args.query, toolCtx?.sessionID);
            if (matches.length === 0) return `No Answer Tree node matched: ${args.query}`;

            const node = tree.setCurrentNode(matches[0].id);
            setSessionActive(tree, toolCtx?.sessionID, node.id);
            const lines = [`Current: ${node.id} ${node.title} (${node.segments.length} segments)`];
            if (matches.length > 1) {
              lines.push("");
              lines.push("Other close matches:");
              for (const match of matches.slice(1, 4)) lines.push(`- ${match.id} ${match.title}`);
            }
            return lines.join("\n");
          });
        },
      }),

      answer_tree_rename: tool({
        description: "Rename an answer-tree node.",
        args: {
          nodeId: tool.schema.string(),
          title: tool.schema.string(),
        },
        async execute(args) {
          return withTree((tree) => {
            const node = tree.requireNode(args.nodeId);
            node.title = args.title.trim();
            node.updatedAt = new Date().toISOString();
            return `Renamed ${node.id}: ${node.title}`;
          });
        },
      }),

      answer_tree_delete: tool({
        description: "Delete an answer-tree node. Refuses to delete nodes with children unless deleteChildren is true.",
        args: {
          nodeId: tool.schema.string(),
          deleteChildren: tool.schema.boolean().optional(),
        },
        async execute(args, toolCtx?: ToolContext) {
          return withTree((tree) => {
            const deleted = deleteNode(tree, args.nodeId, args.deleteChildren ?? false, toolCtx?.sessionID);
            return `Deleted ${deleted.length} node${deleted.length === 1 ? "" : "s"}: ${deleted.join(", ")}`;
          });
        },
      }),

      answer_tree_prompt: tool({
        description: "Record a follow-up question and generate a prompt grounded in a node or segment.",
        args: {
          nodeId: tool.schema.string(),
          question: tool.schema.string(),
          segmentIndex: tool.schema.number().optional(),
          includeRootSummary: tool.schema.boolean().optional(),
        },
        async execute(args, toolCtx?: ToolContext) {
          return withTree((tree) => {
            const context = tree.recordQuestion({
              nodeId: args.nodeId,
              question: args.question,
              segmentIndex: args.segmentIndex,
              includeRootSummary: args.includeRootSummary ?? false,
            });
            setSessionActive(tree, toolCtx?.sessionID, context.node.id, context.questionId);
            return `Question ${context.questionId}\n\n${context.prompt}`;
          });
        },
      }),

      answer_tree_prompt_current: tool({
        description: "Record a follow-up question against the current answer node.",
        args: {
          question: tool.schema.string(),
          segmentIndex: tool.schema.number().optional(),
          includeRootSummary: tool.schema.boolean().optional(),
        },
        async execute(args, toolCtx?: ToolContext) {
          return withTree((tree) => {
            const node = requireSessionCurrentNode(tree, toolCtx?.sessionID);
            const context = tree.recordQuestion({
              nodeId: node.id,
              question: args.question,
              segmentIndex: args.segmentIndex,
              includeRootSummary: args.includeRootSummary ?? false,
            });
            setSessionActive(tree, toolCtx?.sessionID, context.node.id, context.questionId);
            return `Question ${context.questionId}\n\n${context.prompt}`;
          });
        },
      }),

      answer_tree_attach: tool({
        description: "Attach an assistant answer to a recorded question, making it a child node.",
        args: {
          questionId: tool.schema.string(),
          content: tool.schema.string(),
          title: tool.schema.string().optional(),
        },
        async execute(args, toolCtx?: ToolContext) {
          return withTree((tree) => {
            const node = tree.attachAnswer(args.questionId, args.content, args.title);
            node.metadata = {
              ...node.metadata,
              ...sessionMetadata(toolCtx?.sessionID),
              createdBy: "tool.answer_tree_attach",
            };
            setSessionActive(tree, toolCtx?.sessionID, node.id);
            return `Attached ${node.id}: ${node.title} (${node.segments.length} segments)`;
          });
        },
      }),

      answer_tree_attach_last: tool({
        description: "Attach an assistant answer to the last recorded question.",
        args: {
          content: tool.schema.string(),
          title: tool.schema.string().optional(),
        },
        async execute(args, toolCtx?: ToolContext) {
          return withTree((tree) => {
            const question = requireSessionLastQuestion(tree, toolCtx?.sessionID);
            const node = tree.attachAnswer(question.id, args.content, args.title);
            node.metadata = {
              ...node.metadata,
              ...sessionMetadata(toolCtx?.sessionID),
              createdBy: "tool.answer_tree_attach_last",
            };
            setSessionActive(tree, toolCtx?.sessionID, node.id, question.id);
            return `Attached ${node.id}: ${node.title} (${node.segments.length} segments)\nQuestion: ${question.id}`;
          });
        },
      }),

      answer_tree_export: tool({
        description: "Export the current answer tree as Markdown.",
        args: {},
        async execute() {
          const tree = await loadTree(storePath);
          return tree.exportMarkdown();
        },
      }),
    },
  };
};

export default AnswerTreePlugin;

function extractAssistantMessage(
  event: unknown,
): { messageId: string; content: string; title: string; sessionID?: string } | null {
  const record = event as Record<string, unknown>;
  if (record?.type !== "message.updated") return null;

  const payload = (record.properties ?? record) as Record<string, unknown>;
  const message = (payload.message ?? payload) as Record<string, unknown>;
  const role = String(message.role ?? message.author ?? "");
  if (role && role !== "assistant") return null;

  const content = extractText(message);
  if (!content) return null;

  return {
    messageId: String(message.id ?? message.messageId ?? `manual_${Date.now()}`),
    content,
    title: inferTitle(content),
    sessionID: firstString(
      message.sessionID,
      message.sessionId,
      payload.sessionID,
      payload.sessionId,
      record.sessionID,
      record.sessionId,
    ),
  };
}

function sessionMetadata(sessionID: string | undefined): Record<string, unknown> {
  return sessionID ? { opencodeSessionId: sessionID } : {};
}

function getSession(tree: AnswerTree, sessionID: string | undefined) {
  if (!sessionID) return undefined;
  tree.state.sessions ??= {};
  tree.state.sessions[sessionID] ??= { activeNodeId: null, lastQuestionId: null };
  return tree.state.sessions[sessionID];
}

function setSessionActive(
  tree: AnswerTree,
  sessionID: string | undefined,
  nodeId: string,
  questionId?: string,
): void {
  const session = getSession(tree, sessionID);
  if (!session) return;
  session.activeNodeId = nodeId;
  if (questionId) session.lastQuestionId = questionId;
}

function getSessionCurrentNode(tree: AnswerTree, sessionID: string | undefined) {
  const session = getSession(tree, sessionID);
  if (!session) return tree.getCurrentNode();
  return session.activeNodeId ? tree.getNode(session.activeNodeId) ?? null : null;
}

function requireSessionCurrentNode(tree: AnswerTree, sessionID: string | undefined) {
  const node = getSessionCurrentNode(tree, sessionID);
  if (!node) throw new Error("No current answer node for this OpenCode session. Save or select a node first.");
  return node;
}

function getSessionLastQuestion(tree: AnswerTree, sessionID: string | undefined) {
  const session = getSession(tree, sessionID);
  if (!session) return tree.getLastQuestion();
  if (!session.lastQuestionId) return null;
  return tree.state.questions[session.lastQuestionId] ?? null;
}

function requireSessionLastQuestion(tree: AnswerTree, sessionID: string | undefined) {
  const question = getSessionLastQuestion(tree, sessionID);
  if (!question) throw new Error("No last question for this OpenCode session. Ask a question first.");
  tree.state.lastQuestionId = question.id;
  return question;
}

function findMatchingNodes(tree: AnswerTree, query: string, sessionID: string | undefined) {
  const normalizedQuery = normalizeForMatch(query);
  if (!normalizedQuery) return [];

  const nodes = Object.values(tree.state.nodes);
  const sessionNodes = sessionID
    ? nodes.filter((node) => node.metadata.opencodeSessionId === sessionID)
    : [];
  const candidates = sessionNodes.length > 0 ? sessionNodes : nodes;

  return candidates
    .map((node) => ({ node, score: matchScore(node, normalizedQuery) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.node.updatedAt.localeCompare(a.node.updatedAt))
    .map((item) => item.node);
}

function deleteNode(tree: AnswerTree, nodeId: string, deleteChildren: boolean, sessionID: string | undefined): string[] {
  const node = tree.requireNode(nodeId);
  if (node.children.length > 0 && !deleteChildren) {
    throw new Error(`Node ${node.id} has ${node.children.length} child nodes. Retry with deleteChildren=true to delete the subtree.`);
  }

  const deleted = collectSubtreeIds(tree, node.id);
  const deletedSet = new Set(deleted);
  const parentId = node.parentId;

  if (parentId) {
    const parent = tree.getNode(parentId);
    if (parent) {
      parent.children = parent.children.filter((childId) => !deletedSet.has(childId));
      parent.updatedAt = new Date().toISOString();
    }
  }

  for (const questionId of Object.keys(tree.state.questions)) {
    const question = tree.state.questions[questionId];
    if (deletedSet.has(question.nodeId) || (question.answerNodeId && deletedSet.has(question.answerNodeId))) {
      delete tree.state.questions[questionId];
    }
  }
  tree.state.questionOrder = tree.state.questionOrder.filter((questionId) => tree.state.questions[questionId]);

  for (const id of deleted) delete tree.state.nodes[id];

  if (tree.state.activeNodeId && deletedSet.has(tree.state.activeNodeId)) tree.state.activeNodeId = parentId ?? null;
  if (tree.state.lastQuestionId && !tree.state.questions[tree.state.lastQuestionId]) tree.state.lastQuestionId = null;

  for (const session of Object.values(tree.state.sessions ?? {})) {
    if (session.activeNodeId && deletedSet.has(session.activeNodeId)) session.activeNodeId = parentId ?? null;
    if (session.lastQuestionId && !tree.state.questions[session.lastQuestionId]) session.lastQuestionId = null;
  }
  const session = getSession(tree, sessionID);
  if (session?.activeNodeId && deletedSet.has(session.activeNodeId)) session.activeNodeId = parentId ?? null;

  return deleted;
}

function collectSubtreeIds(tree: AnswerTree, nodeId: string): string[] {
  const node = tree.requireNode(nodeId);
  return [node.id, ...node.children.flatMap((childId) => collectSubtreeIds(tree, childId))];
}

function matchScore(node: { id: string; title: string; parentQuestion: string | null }, normalizedQuery: string): number {
  const title = normalizeForMatch(node.title);
  const parentQuestion = normalizeForMatch(node.parentQuestion ?? "");
  const id = normalizeForMatch(node.id);

  if (id === normalizedQuery) return 100;
  if (title === normalizedQuery) return 90;
  if (title.includes(normalizedQuery)) return 70;
  if (parentQuestion.includes(normalizedQuery)) return 45;

  const tokens = normalizedQuery.split(" ").filter((token) => token.length > 0);
  if (tokens.length === 0) return 0;

  const titleHits = tokens.filter((token) => title.includes(token)).length;
  const questionHits = tokens.filter((token) => parentQuestion.includes(token)).length;
  return titleHits * 12 + questionHits * 6;
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function extractText(message: Record<string, unknown>): string {
  if (typeof message.content === "string") return message.content.trim();
  if (Array.isArray(message.parts)) {
    return message.parts
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const value = part as Record<string, unknown>;
          return typeof value.text === "string" ? value.text : "";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

function inferTitle(content: string): string {
  const firstLine = content.trim().split("\n").find(Boolean) ?? "Untitled answer";
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
}

async function log(ctx: PluginContext, level: "info" | "warn" | "error", message: string): Promise<void> {
  await ctx.client?.app?.log?.({
    body: {
      service: "opencode-answer-tree",
      level,
      message,
    },
  });
}

export async function readStateForDebug(directory: string): Promise<AnswerTreeState> {
  const statePath = join(directory, STORE_DIR, STORE_FILE);
  try {
    return JSON.parse(await readFile(statePath, "utf8")) as AnswerTreeState;
  } catch {
    return createEmptyState();
  }
}
