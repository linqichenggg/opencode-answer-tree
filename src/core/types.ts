export type NodeRole = "root" | "assistant-answer";

export type Segment = {
  id: string;
  index: number;
  content: string;
  charStart: number;
  charEnd: number;
};

export type AnswerNode = {
  id: string;
  role: NodeRole;
  title: string;
  content: string;
  segments: Segment[];
  parentId: string | null;
  sourceSegmentId: string | null;
  parentQuestion: string | null;
  children: string[];
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
};

export type QuestionRecord = {
  id: string;
  nodeId: string;
  segmentId: string | null;
  question: string;
  answerNodeId: string | null;
  createdAt: string;
};

export type CaptureStatus = {
  status: "saved" | "skipped";
  reason: string;
  messageId?: string;
  nodeId?: string;
  mode?: "root" | "child";
  charCount: number;
  updatedAt: string;
};

export type SessionMessageSnapshot = {
  messageId?: string;
  content: string;
  createdAt: string;
};

export type AnswerTreeState = {
  version: 1;
  activeNodeId: string | null;
  lastQuestionId: string | null;
  nodes: Record<string, AnswerNode>;
  questions: Record<string, QuestionRecord>;
  questionOrder: string[];
  sessions?: Record<
    string,
    {
      activeNodeId: string | null;
      lastQuestionId: string | null;
      lastCapture?: CaptureStatus;
      lastUserMessage?: SessionMessageSnapshot;
    }
  >;
};

export type CreateNodeInput = {
  title?: string;
  content: string;
  parentId?: string | null;
  sourceSegmentId?: string | null;
  parentQuestion?: string | null;
  role?: NodeRole;
  metadata?: Record<string, unknown>;
};

export type AskInput = {
  nodeId: string;
  segmentIndex?: number;
  question: string;
  includeAncestorPath?: boolean;
  includeRootSummary?: boolean;
};

export type PromptContext = {
  prompt: string;
  questionId: string;
  node: AnswerNode;
  segment: Segment | null;
  path: AnswerNode[];
};
