# OpenCode Answer Tree

[中文](README.md) | [English](README.en.md)

Answer Tree is a long-answer follow-up workspace for OpenCode. It saves long LLM answers as tree nodes that can be segmented, questioned, nested, and revisited without scrolling through a long chat timeline.

## Current Features

- Core library: answer nodes, automatic segmentation, question records, child-answer attachment, path tracking, and Markdown export.
- CLI: verifies the full workflow without depending on OpenCode.
- OpenCode plugin: provides event hooks for automatically capturing long answers and a set of custom tools.
- OpenCode host: `opencode-host/` includes the right-side Answer Tree sidebar, active context, node details, and keyboard operations.
- Node numbering: tree views, TUI, and Markdown export show hierarchical numbers such as `1`, `1.1`, and `1.1.1`.
- Tests: cover segmentation, nested follow-up questions, and local persistence.

## Installation

```bash
npm install
npm run build
```

## CLI Quick Start

Create a root answer:

```bash
node dist/src/cli/index.js create --file examples/long-answer.md --title "Long Answer A"
```

List the answer tree:

```bash
node dist/src/cli/index.js list
```

List the answer tree saved by the OpenCode plugin:

```bash
node dist/src/cli/index.js list --store opencode
```

Show segments:

```bash
node dist/src/cli/index.js show <nodeId>
```

Generate a follow-up prompt for a segment:

```bash
node dist/src/cli/index.js ask <nodeId> "Why does this need a tree structure?" --segment 3
```

Attach a model answer as a child node:

```bash
node dist/src/cli/index.js attach <questionId> "A tree structure is needed because the answer itself can lead to more follow-up questions."
```

Continue asking questions around the current node:

```bash
node dist/src/cli/index.js current --store opencode
node dist/src/cli/index.js use <nodeId> --store opencode
node dist/src/cli/index.js ask-current "Explain this part further" --segment 1 --store opencode
node dist/src/cli/index.js attach-last "This is the answer to the previous question" --title "Child Answer" --store opencode
```

Export:

```bash
node dist/src/cli/index.js export --out answer-tree.md
```

Export data saved by the OpenCode plugin:

```bash
node dist/src/cli/index.js export --store opencode --out answer-tree.md
```

By default, CLI state is stored at `.answer-tree/state.json` in the current project. OpenCode plugin state is stored at `.answer-tree/opencode-state.json`. The CLI can read plugin data with `--store opencode`, or read any custom state file with `--store <path>`.

## OpenCode Plugin Usage

The plugin entry is:

```text
src/plugin/opencode.ts
```

This project already includes a local plugin loader:

```text
.opencode/plugins/answer-tree.js
```

Build first:

```bash
npm run build
```

Then start OpenCode in this directory. OpenCode will load this project-level plugin.

To start OpenCode with the right-side Answer Tree panel:

```bash
npm run opencode
```

By default, this uses the OpenCode host source included in this repository:

```text
opencode-host/packages/opencode
```

Normal development does not need a second local repository. For temporary debugging against another OpenCode source copy, override the host directory:

```bash
OPENCODE_FORK_DIR=/path/to/opencode-host npm run opencode
```

After building, the plugin can also be used as an npm plugin through this export path:

```text
opencode-answer-tree/plugin
```

The plugin provides these tools:

- `answer_tree_create`: save a long answer as a root node.
- `answer_tree_list`: list the answer tree.
- `answer_tree_show`: show the segments of a node.
- `answer_tree_show_full`: show the full content of a node.
- `answer_tree_current`: show the current node and latest question.
- `answer_tree_use`: switch the current node.
- `answer_tree_use_match`: fuzzy-match by title or source question and switch the current node.
- `answer_tree_rename`: rename a node.
- `answer_tree_delete`: delete a node; nodes with children are protected by default.
- `answer_tree_prompt`: record a question and generate a context-aware prompt.
- `answer_tree_prompt_current`: ask a follow-up question based on the current node.
- `answer_tree_attach`: attach an answer as a child node.
- `answer_tree_attach_last`: attach an answer to the latest question.
- `answer_tree_export`: export Markdown.

The plugin also listens to `message.updated` and automatically saves assistant messages as answer nodes when they exceed the length threshold. This event structure still needs continued verification in real OpenCode sessions.

Nodes are stored in `.answer-tree/opencode-state.json` in the project directory. Tool calls and automatic captures write `opencodeSessionId` to new nodes, and the current node and latest question are tracked separately for each OpenCode session. The right-side sidebar only shows nodes related to the current OpenCode session by default. Nodes created by older versions have no session metadata; they are treated as legacy project nodes and will not be mixed into a new session tree.

This project also provides these OpenCode slash commands:

```text
/tree-list
/tree-current
/tree-use ans_xxxxxxxx
/tree-use-match self attention
/tree-show ans_xxxxxxxx
/tree-show-full ans_xxxxxxxx
/tree-rename ans_xxxxxxxx New title
/tree-delete ans_xxxxxxxx
/tree-ask ans_xxxxxxxx segment=2 Why is it designed this way?
/tree-ask-current segment=2 Why is it designed this way?
/tree-attach q_xxxxxxxx title=New child answer This is the model answer body
/tree-attach-last title=New child answer This is the model answer body
/tree-export
```

These commands live in `.opencode/commands/`. Under the hood, they still ask the model to call the corresponding `answer_tree_*` tool.

## Answer Tree Auto Skill

The project-level skill is located at:

```text
.opencode/skills/answer-tree-auto/SKILL.md
```

It guides the model to decide when Answer Tree should be updated during normal chat:

- When the user asks a follow-up question around the current active node, prefer `answer_tree_prompt_current`.
- When the answer is long enough and may lead to future follow-up questions, call `answer_tree_attach_last` to save it as a child node.
- When the user asks for a new long-form analysis, call `answer_tree_create` after answering to save it as a root node.
- Greetings, short questions, debugging, UI operations, and similar interactions are not written to the tree.

This is model-behavior automation. It encourages the model to call existing tools. It is not a low-level event listener, so final persistence still depends on whether the model correctly triggers the skill and tools.

## TUI Viewer

View the answer tree saved by the OpenCode plugin:

```bash
npm run build
node dist/src/tui/index.js --store opencode
```

If Chinese text is displayed as question marks, use ASCII-compatible mode:

```bash
node dist/src/tui/index.js --store opencode --ascii
```

Keyboard shortcuts:

```text
Up/Down or j/k   Select node
e                Export Markdown
r                Reload state file
q                Quit
```

## Verification

```bash
npm run validate
```

This command runs the main project tests, CLI/TUI smoke test, and typecheck for the bundled OpenCode host. You can also run the checks separately:

```bash
npm test
npm run smoke
```

## Product Boundary

This version focuses on saving, locating, and reusing long answers and nested follow-up questions. The repository already includes the OpenCode host source, so the current session tree can be viewed on the right side, the active node can be switched, active context can be inspected, and switching nodes can jump to the corresponding answer in the left-side chat history. It has not yet been released as a one-command OpenCode installation for regular users.

More documentation:

- `docs/PRODUCT_PLAN.md`
- `docs/ARCHITECTURE.md`
- `docs/COMMANDS.md`
- `docs/TUI.md`
- `docs/FORK_PLAN.md`
- `docs/UPSTREAM_SPIKE.md`
- `docs/SELF_REVIEW.md`
- `docs/VALIDATION.md`
- `docs/NEXT_STEPS.md`
