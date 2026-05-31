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
const MIN_ROOT_CAPTURE_CHARS = 600;
const MIN_CHILD_CAPTURE_CHARS = 300;
const MIN_ROOT_CAPTURE_BULLETS = 3;
const MIN_CHILD_CAPTURE_BULLETS = 2;
const MIN_ROOT_CAPTURE_PARAGRAPHS = 3;
const MIN_CHILD_CAPTURE_PARAGRAPHS = 2;
const MAX_NODE_DEPTH = 3;

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
      const userMessage = extractUserMessage(event);
      if (userMessage) {
        await mkdir(join(pluginCtx.directory, STORE_DIR), { recursive: true });
        await withTree((tree) => {
          recordSessionUserMessage(tree, userMessage.sessionID, userMessage);
        });
        return;
      }

      const message = extractAssistantMessage(event);
      if (!message) return;

      await mkdir(join(pluginCtx.directory, STORE_DIR), { recursive: true });
      const result = await withTree((tree) => {
        const alreadyCaptured = Object.values(tree.state.nodes).some(
          (node) => node.metadata.opencodeMessageId === message.messageId,
        );
        if (alreadyCaptured) {
          setCaptureStatus(tree, message.sessionID, {
            status: "skipped",
            reason: "already captured",
            messageId: message.messageId,
            charCount: message.content.length,
          });
          return "skipped duplicate";
        }

        const question = getSessionLastQuestion(tree, message.sessionID);
        const latestUserText = getSessionLatestUserText(tree, message.sessionID) ?? question?.question ?? "";
        const shouldAttachToQuestion = Boolean(
          question && !question.answerNodeId && isFollowUpQuestion(latestUserText),
        );
        const attachment = question && shouldAttachToQuestion
          ? childAttachmentDecision(tree, question.nodeId, question.question)
          : { attach: false as const, reason: "not a pending child answer", message: "" };
        const captureMode = shouldAttachToQuestion && attachment.attach ? "child" : "root";
        const decision = shouldAutoCapture(message.content, captureMode);

        if (!decision.capture) {
          setCaptureStatus(tree, message.sessionID, {
            status: "skipped",
            reason: decision.reason,
            messageId: message.messageId,
            charCount: message.content.length,
          });
          return `skipped ${decision.reason}`;
        }

        if (shouldAttachToQuestion && question && !attachment.attach) {
          setCaptureStatus(tree, message.sessionID, {
            status: "skipped",
            reason: attachment.reason,
            messageId: message.messageId,
            charCount: message.content.length,
          });
          return `skipped ${attachment.reason}`;
        }

        if (shouldAttachToQuestion && question && attachment.attach) {
          const node = tree.attachAnswer(question.id, message.content, message.title);
          node.metadata = {
            ...node.metadata,
            opencodeMessageId: message.messageId,
            ...sessionMetadata(message.sessionID),
            capturedBy: "message.updated",
          };
          setSessionActive(tree, message.sessionID, node.id, question.id);
          setCaptureStatus(tree, message.sessionID, {
            status: "saved",
            reason: decision.reason,
            messageId: message.messageId,
            nodeId: node.id,
            mode: "child",
            charCount: message.content.length,
          });
          return `saved child ${node.id}`;
        }

        const node = tree.createNode({
          title: message.title,
          content: message.content,
          metadata: {
            opencodeMessageId: message.messageId,
            ...sessionMetadata(message.sessionID),
            capturedBy: "message.updated",
          },
        });
        setSessionActive(tree, message.sessionID, node.id, null);
        setCaptureStatus(tree, message.sessionID, {
          status: "saved",
          reason: decision.reason,
          messageId: message.messageId,
          nodeId: node.id,
          mode: "root",
          charCount: message.content.length,
        });
        return `saved root ${node.id}`;
      });
      await log(pluginCtx, "info", `Auto capture ${result}: ${message.messageId}`);
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
            setSessionActive(tree, toolCtx?.sessionID, node.id, null);
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
            setSessionActive(tree, toolCtx?.sessionID, node.id, null);
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
            setSessionActive(tree, toolCtx?.sessionID, node.id, null);
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
            return formatPromptResponse(tree, context.questionId, context.prompt, context.node.id, args.question);
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
            return formatPromptResponse(tree, context.questionId, context.prompt, context.node.id, args.question);
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
            const question = tree.state.questions[args.questionId];
            if (!question) throw new Error(`Question not found: ${args.questionId}`);
            const attachment = childAttachmentDecision(tree, question.nodeId, question.question);
            if (!attachment.attach) return attachment.message;
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
        description:
          "Attach the assistant's answer to the last recorded Answer Tree question. Use only after answer_tree_prompt_current or answer_tree_prompt has recorded the user's question; do not use this to save the user's question itself.",
        args: {
          content: tool.schema.string(),
          title: tool.schema.string().optional(),
        },
        async execute(args, toolCtx?: ToolContext) {
          return withTree((tree) => {
            const question = requireSessionLastQuestion(tree, toolCtx?.sessionID);
            const attachment = childAttachmentDecision(tree, question.nodeId, question.question);
            if (!attachment.attach) {
              setSessionActive(tree, toolCtx?.sessionID, question.nodeId, question.id);
              return attachment.message;
            }
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

function extractUserMessage(
  event: unknown,
): { messageId: string; content: string; sessionID?: string } | null {
  const message = extractMessageByRole(event, "user");
  if (!message) return null;
  return {
    messageId: message.messageId,
    content: message.content,
    sessionID: message.sessionID,
  };
}

function extractMessageByRole(
  event: unknown,
  expectedRole: "assistant" | "user",
): { messageId: string; content: string; title: string; sessionID?: string } | null {
  const record = event as Record<string, unknown>;
  if (record?.type !== "message.updated") return null;

  const payload = (record.properties ?? record) as Record<string, unknown>;
  const message = (payload.message ?? payload) as Record<string, unknown>;
  const role = String(message.role ?? message.author ?? "");
  if (role !== expectedRole) return null;

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
  questionId?: string | null,
): void {
  const session = getSession(tree, sessionID);
  if (!session) return;
  session.activeNodeId = nodeId;
  if (questionId !== undefined) session.lastQuestionId = questionId;
}

function recordSessionUserMessage(
  tree: AnswerTree,
  sessionID: string | undefined,
  input: { messageId?: string; content: string },
): void {
  const session = getSession(tree, sessionID);
  if (!session) return;
  session.lastUserMessage = {
    messageId: input.messageId,
    content: input.content.trim(),
    createdAt: new Date().toISOString(),
  };
}

function getSessionLatestUserText(tree: AnswerTree, sessionID: string | undefined): string | undefined {
  const session = getSession(tree, sessionID);
  return session?.lastUserMessage?.content;
}

function setCaptureStatus(
  tree: AnswerTree,
  sessionID: string | undefined,
  input: {
    status: "saved" | "skipped";
    reason: string;
    messageId?: string;
    nodeId?: string;
    mode?: "root" | "child";
    charCount: number;
  },
): void {
  const session = getSession(tree, sessionID);
  if (!session) return;
  session.lastCapture = {
    ...input,
    updatedAt: new Date().toISOString(),
  };
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
  if (!question) {
    throw new Error(
      "No last question for this OpenCode session. Call answer_tree_prompt_current or answer_tree_prompt with the user's question before answer_tree_attach_last.",
    );
  }
  tree.state.lastQuestionId = question.id;
  return question;
}

function formatPromptResponse(
  tree: AnswerTree,
  questionId: string,
  prompt: string,
  nodeId: string,
  question: string,
): string {
  const attachment = childAttachmentDecision(tree, nodeId, question);
  if (attachment.attach) return `Question ${questionId}\n\n${prompt}`;

  return [
    `Question ${questionId}`,
    "",
    "Answer Tree note:",
    attachment.message,
    "",
    prompt,
  ].join("\n");
}

function childAttachmentDecision(
  tree: AnswerTree,
  parentNodeId: string,
  question: string,
): { attach: true; reason: string; message: string } | { attach: false; reason: string; message: string } {
  const parent = tree.requireNode(parentNodeId);
  const parentDepth = tree.pathTo(parent.id).length;
  if (parentDepth >= MAX_NODE_DEPTH) {
    return {
      attach: false,
      reason: `max depth reached (${parentDepth}/${MAX_NODE_DEPTH})`,
      message: `Skipped Answer Tree child node: max depth is ${MAX_NODE_DEPTH} levels. Answer this as detail inside the current node context instead.`,
    };
  }

  if (isDetailQuestion(question)) {
    return {
      attach: false,
      reason: "question is too specific for a reusable child node",
      message: "Skipped Answer Tree child node: this is a narrow detail question. Answer it normally without creating another tree level.",
    };
  }

  return {
    attach: true,
    reason: "eligible child node",
    message: "Eligible Answer Tree child node.",
  };
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

function shouldAutoCapture(
  content: string,
  mode: "root" | "child",
): { capture: true; reason: string } | { capture: false; reason: string } {
  const stats = contentStats(content);
  const minChars = mode === "child" ? MIN_CHILD_CAPTURE_CHARS : MIN_ROOT_CAPTURE_CHARS;
  const minBullets = mode === "child" ? MIN_CHILD_CAPTURE_BULLETS : MIN_ROOT_CAPTURE_BULLETS;
  const minParagraphs = mode === "child" ? MIN_CHILD_CAPTURE_PARAGRAPHS : MIN_ROOT_CAPTURE_PARAGRAPHS;

  if (stats.charCount >= minChars) return { capture: true, reason: `content has ${stats.charCount} chars` };
  if (stats.bulletCount >= minBullets) return { capture: true, reason: `content has ${stats.bulletCount} bullets` };
  if (stats.paragraphCount >= minParagraphs) return { capture: true, reason: `content has ${stats.paragraphCount} paragraphs` };

  return {
    capture: false,
    reason: `too short: ${stats.charCount} chars, ${stats.paragraphCount} paragraphs, ${stats.bulletCount} bullets`,
  };
}

function isFollowUpQuestion(input: string): boolean {
  const normalized = normalizeForMatch(input);
  if (!normalized) return false;

  const explicitNewTopicPatterns = [
    /\bnew topic\b/u,
    /新话题/u,
    /换个话题/u,
    /另一个话题/u,
    /另外/u,
  ];
  if (explicitNewTopicPatterns.some((pattern) => pattern.test(normalized))) return false;

  const followUpPatterns = [
    /继续/u,
    /展开/u,
    /详细说/u,
    /进一步/u,
    /这个/u,
    /这里/u,
    /这部分/u,
    /这一/u,
    /上面/u,
    /刚才/u,
    /当前/u,
    /节点/u,
    /第\s*\d+/u,
    /\bcontinue\b/u,
    /\bfollow up\b/u,
    /\bthis\b/u,
    /\bthat\b/u,
    /\babove\b/u,
    /\bprevious\b/u,
    /\bcurrent\b/u,
    /\bsection\b/u,
    /\bpoint\b/u,
    /\bnode\b/u,
  ];
  if (followUpPatterns.some((pattern) => pattern.test(normalized))) return true;

  const generalNewTopicPatterns = [
    /\bwhat is\b/u,
    /\bexplain\b/u,
    /\bintroduce\b/u,
    /\bcompare\b/u,
    /解释.*是什么/u,
    /介绍/u,
    /对比/u,
  ];
  if (generalNewTopicPatterns.some((pattern) => pattern.test(normalized))) return false;

  return false;
}

function isDetailQuestion(input: string): boolean {
  const normalized = normalizeForMatch(input);
  if (!normalized) return false;

  const chars = Array.from(normalized).length;
  const hasLocalReference = [
    /这个/u,
    /这里/u,
    /其中/u,
    /这一步/u,
    /第\s*\d+/u,
    /\bthis\b/u,
    /\bthat\b/u,
    /\bline\b/u,
    /\bstep\s*\d+\b/u,
  ].some((pattern) => pattern.test(normalized));
  const hasDetailIntent = [
    /具体/u,
    /细节/u,
    /例子/u,
    /举例/u,
    /数据/u,
    /数值/u,
    /公式/u,
    /定义/u,
    /是什么意思/u,
    /什么意思/u,
    /为什么/u,
    /为何/u,
    /怎么算/u,
    /怎么得到/u,
    /输出/u,
    /结果/u,
    /\bdefinition\b/u,
    /\bexample\b/u,
    /\bwhy\b/u,
    /\bhow exactly\b/u,
  ].some((pattern) => pattern.test(normalized));
  const hasConcreteToken = /\d+(?:\.\d+)?|[a-z]{1,4}\s*[=/→\-]|qkv|q\/k|q-k|loss|损失|预测|输出/u.test(normalized);

  if (hasDetailIntent && hasConcreteToken) return true;
  if (hasLocalReference && hasDetailIntent && chars <= 120) return true;
  if (hasConcreteToken && chars <= 80) return true;

  return false;
}

function contentStats(content: string): { charCount: number; paragraphCount: number; bulletCount: number } {
  const trimmed = content.trim();
  const paragraphs = trimmed.split(/\n\s*\n/g).map((part) => part.trim()).filter(Boolean);
  const bulletCount = trimmed
    .split("\n")
    .filter((line) => /^\s*(?:[-*+]|\d+[.)])\s+\S/.test(line))
    .length;

  return {
    charCount: Array.from(trimmed).length,
    paragraphCount: paragraphs.length,
    bulletCount,
  };
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
