#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { AnswerTree, loadTree, resolveNamedStorePath, saveTree } from "../index.js";

type ParsedArgs = {
  command: string;
  values: string[];
  flags: Record<string, string | boolean>;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command || args.command === "--help" || args.command === "-h" || args.flags.help || args.flags.h) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const storePath = resolveCliStorePath(cwd, args);
  const tree = await loadTree(storePath);

  switch (args.command) {
    case "create":
      await create(tree, args, storePath);
      break;
    case "list":
      console.log(tree.renderTree() || "No answer nodes yet.");
      break;
    case "show":
      await show(tree, args, storePath);
      break;
    case "ask":
      await ask(tree, args, storePath);
      break;
    case "ask-current":
      await askCurrent(tree, args, storePath);
      break;
    case "attach":
      await attach(tree, args, storePath);
      break;
    case "attach-last":
      await attachLast(tree, args, storePath);
      break;
    case "current":
      current(tree);
      break;
    case "use":
      await useNode(tree, args, storePath);
      break;
    case "path":
      path(tree, args);
      break;
    case "export":
      await exportMarkdown(tree, args);
      break;
    default:
      throw new Error(`Unknown command: ${args.command}`);
  }
}

async function create(tree: AnswerTree, args: ParsedArgs, storePath: string): Promise<void> {
  const content = await readContent(args);
  const node = tree.createNode({
    title: getStringFlag(args, "title"),
    content,
    role: "root",
  });
  await saveTree(storePath, tree);
  console.log(`Created ${node.id}: ${node.title}`);
  console.log(`Segments: ${node.segments.length}`);
}

async function show(tree: AnswerTree, args: ParsedArgs, storePath: string): Promise<void> {
  const nodeId = requireValue(args, 0, "node id");
  const node = tree.setCurrentNode(nodeId);
  await saveTree(storePath, tree);
  console.log(`${node.id} ${node.title}`);
  console.log("");
  for (const segment of node.segments) {
    console.log(`[${segment.index}] ${segment.content}`);
    console.log("");
  }
}

async function ask(tree: AnswerTree, args: ParsedArgs, storePath: string): Promise<void> {
  const nodeId = requireValue(args, 0, "node id");
  const question = requireValue(args, 1, "question");
  await askNode(tree, args, storePath, nodeId, question);
}

async function askCurrent(tree: AnswerTree, args: ParsedArgs, storePath: string): Promise<void> {
  const node = tree.requireCurrentNode();
  const question = requireValue(args, 0, "question");
  await askNode(tree, args, storePath, node.id, question);
}

async function askNode(
  tree: AnswerTree,
  args: ParsedArgs,
  storePath: string,
  nodeId: string,
  question: string,
): Promise<void> {
  const segmentIndex = args.flags.segment ? Number(args.flags.segment) : undefined;
  const context = tree.recordQuestion({
    nodeId,
    question,
    segmentIndex,
    includeAncestorPath: args.flags.path !== false,
    includeRootSummary: Boolean(args.flags["root-summary"]),
  });
  await saveTree(storePath, tree);

  console.log(`Question: ${context.questionId}`);
  console.log("");
  console.log(context.prompt);
}

async function attach(tree: AnswerTree, args: ParsedArgs, storePath: string): Promise<void> {
  const questionId = requireValue(args, 0, "question id");
  const content = await readContent(args, 1);
  const node = tree.attachAnswer(questionId, content, getStringFlag(args, "title"));
  await saveTree(storePath, tree);
  console.log(`Attached ${node.id}: ${node.title}`);
  console.log(`Segments: ${node.segments.length}`);
}

async function attachLast(tree: AnswerTree, args: ParsedArgs, storePath: string): Promise<void> {
  const question = tree.requireLastQuestion();
  const content = await readContent(args);
  const node = tree.attachAnswer(question.id, content, getStringFlag(args, "title"));
  await saveTree(storePath, tree);
  console.log(`Attached ${node.id}: ${node.title}`);
  console.log(`Question: ${question.id}`);
  console.log(`Segments: ${node.segments.length}`);
}

function current(tree: AnswerTree): void {
  const node = tree.getCurrentNode();
  const question = tree.getLastQuestion();
  if (!node) {
    console.log("No current answer node.");
    return;
  }
  console.log(`Current: ${node.id} ${node.title} (${node.segments.length} segments)`);
  if (question) console.log(`Last question: ${question.id} ${question.question}`);
}

async function useNode(tree: AnswerTree, args: ParsedArgs, storePath: string): Promise<void> {
  const nodeId = requireValue(args, 0, "node id");
  const node = tree.setCurrentNode(nodeId);
  await saveTree(storePath, tree);
  console.log(`Current: ${node.id} ${node.title} (${node.segments.length} segments)`);
}

function path(tree: AnswerTree, args: ParsedArgs): void {
  const nodeId = args.values[0] ?? tree.requireCurrentNode().id;
  const nodes = tree.pathTo(nodeId);
  for (const node of nodes) {
    console.log(`${node.id} ${node.title}`);
    if (node.parentQuestion) console.log(`  from question: ${node.parentQuestion}`);
  }
}

async function exportMarkdown(tree: AnswerTree, args: ParsedArgs): Promise<void> {
  const output = getStringFlag(args, "out");
  const markdown = tree.exportMarkdown();
  if (output) {
    await writeFile(resolve(output), markdown, "utf8");
    console.log(`Exported ${output}`);
    return;
  }
  console.log(markdown);
}

async function readContent(args: ParsedArgs, valueOffset = 0): Promise<string> {
  const file = getStringFlag(args, "file");
  if (file) return readFile(resolve(file), "utf8");

  const inline = args.values.slice(valueOffset).join(" ").trim();
  if (inline) return inline;

  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    const content = Buffer.concat(chunks).toString("utf8").trim();
    if (content) return content;
  }

  throw new Error("Missing content. Pass text, --file <path>, or pipe stdin.");
}

function parseArgs(raw: string[]): ParsedArgs {
  const [command = "", ...rest] = raw;
  const values: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith("--")) {
      values.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = rest[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i += 1;
    }
  }
  return { command, values, flags };
}

function requireValue(args: ParsedArgs, index: number, label: string): string {
  const value = args.values[index];
  if (!value) throw new Error(`Missing ${label}`);
  return value;
}

function getStringFlag(args: ParsedArgs, key: string): string | undefined {
  const value = args.flags[key];
  return typeof value === "string" ? value : undefined;
}

function resolveCliStorePath(cwd: string, args: ParsedArgs): string {
  const store = getStringFlag(args, "store");
  const resolved = resolveNamedStorePath(cwd, store);
  return isAbsolute(resolved) ? resolved : resolve(cwd, resolved);
}

function printHelp(): void {
  console.log(`answer-tree

Commands:
  create [text] [--file path] [--title title]      Create a root answer node
  list                                             Render the answer tree
  show <nodeId>                                    Show node segments
  ask <nodeId> <question> [--segment n]            Record a question and print a prompt
  ask-current <question> [--segment n]             Ask about the current answer node
  attach <questionId> [text] [--file path]         Attach an answer as a child node
  attach-last [text] [--file path] [--title title] Attach an answer to the last question
  current                                          Show the current node and last question
  use <nodeId>                                     Set the current answer node
  path <nodeId>                                    Show ancestry path
  export [--out file.md]                           Export tree as Markdown

Global options:
  --store cli|default                              Use .answer-tree/state.json
  --store opencode                                 Use .answer-tree/opencode-state.json
  --store <path>                                   Use a custom state file path
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
