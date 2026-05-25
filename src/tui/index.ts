#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import blessed from "blessed";
import { loadTree, resolveNamedStorePath } from "../index.js";
import { buildTreeLines, renderNodeDetails, type TreeLine } from "./view-model.js";

type Args = {
  store?: string;
  exportPath?: string;
  ascii?: boolean;
  help?: boolean;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const storePath = resolveStore(cwd, args.store);
  let tree = await loadTree(storePath);
  let lines = buildTreeLines(tree, { ascii: args.ascii });
  let selectedIndex = selectInitialIndex(lines, tree.state.activeNodeId);

  const screen = blessed.screen({
    smartCSR: true,
    title: "Answer Tree",
  });

  const treeBox = blessed.list({
    parent: screen,
    label: ` Answer Tree (${args.store ?? "cli"}) `,
    top: 0,
    left: 0,
    width: "36%",
    height: "100%-1",
    border: "line",
    keys: true,
    mouse: true,
    vi: true,
    style: {
      selected: { bg: "blue" },
      border: { fg: "cyan" },
    },
    items: lines.map((line) => line.label),
  });

  const detailBox = blessed.box({
    parent: screen,
    label: " Node Detail ",
    top: 0,
    left: "36%",
    width: "64%",
    height: "100%-1",
    border: "line",
    keys: true,
    mouse: true,
    scrollable: true,
    alwaysScroll: true,
    tags: false,
    style: {
      border: { fg: "cyan" },
    },
  });

  const status = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    content: args.ascii
      ? "up/down select  enter view  e export  r reload  q quit"
      : "↑/↓ select  enter view  e export  r reload  q quit",
    style: { bg: "black", fg: "white" },
  });

  function render(): void {
    lines = buildTreeLines(tree, { ascii: args.ascii });
    treeBox.setItems(lines.map((line) => line.label));
    if (selectedIndex >= lines.length) selectedIndex = Math.max(0, lines.length - 1);
    treeBox.select(selectedIndex);
    const selected = lines[selectedIndex];
    const node = selected ? tree.getNode(selected.nodeId) ?? null : null;
    detailBox.setContent(renderNodeDetails(tree, node, { ascii: args.ascii }));
    screen.render();
  }

  async function reload(): Promise<void> {
    tree = await loadTree(storePath);
    render();
    status.setContent(`Reloaded ${storePath}`);
    screen.render();
  }

  async function exportMarkdown(): Promise<void> {
    const output = args.exportPath ?? resolve(cwd, "answer-tree-export.md");
    await writeFile(output, tree.exportMarkdown(), "utf8");
    status.setContent(`Exported ${output}`);
    screen.render();
  }

  treeBox.on("select", (_item, index) => {
    selectedIndex = index;
    render();
  });

  treeBox.key(["enter"], () => {
    render();
  });

  screen.key(["up", "k"], () => {
    selectedIndex = Math.max(0, selectedIndex - 1);
    render();
  });

  screen.key(["down", "j"], () => {
    selectedIndex = Math.min(Math.max(0, lines.length - 1), selectedIndex + 1);
    render();
  });

  screen.key(["e"], () => {
    exportMarkdown().catch((error) => {
      status.setContent(error instanceof Error ? error.message : String(error));
      screen.render();
    });
  });

  screen.key(["r"], () => {
    reload().catch((error) => {
      status.setContent(error instanceof Error ? error.message : String(error));
      screen.render();
    });
  });

  screen.key(["q", "C-c"], () => {
    screen.destroy();
    process.exit(0);
  });

  render();
  treeBox.focus();
}

function parseArgs(raw: string[]): Args {
  const args: Args = {};
  for (let index = 0; index < raw.length; index += 1) {
    const token = raw[index];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--store") {
      args.store = raw[index + 1];
      index += 1;
      continue;
    }
    if (token === "--out") {
      args.exportPath = raw[index + 1];
      index += 1;
      continue;
    }
    if (token === "--ascii") {
      args.ascii = true;
    }
  }
  return args;
}

function resolveStore(cwd: string, store?: string): string {
  const resolved = resolveNamedStorePath(cwd, store);
  return isAbsolute(resolved) ? resolved : resolve(cwd, resolved);
}

function selectInitialIndex(lines: TreeLine[], activeNodeId: string | null): number {
  if (!activeNodeId) return 0;
  const index = lines.findIndex((line) => line.nodeId === activeNodeId);
  return index === -1 ? 0 : index;
}

function printHelp(): void {
  console.log(`answer-tree-tui

Usage:
  node dist/src/tui/index.js [--store cli|opencode|path] [--out file.md] [--ascii]

Options:
  --ascii          Render ASCII-only text for terminals that cannot display CJK text

Keys:
  up/down or j/k   Select a node
  enter            Refresh selected node detail
  e                Export Markdown
  r                Reload state file
  q                Quit
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
