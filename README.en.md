# OpenCode Answer Tree

[中文](README.md) | [English](README.en.md)

OpenCode Answer Tree is an OpenCode workspace with a right-side answer tree. It turns long LLM answers into follow-up nodes, so you can switch between nested questions and multiple topics without scrolling through the chat timeline.

## What It Solves

Long LLM answers often create these problems:

- You want to ask about one section, but first you need to scroll back.
- After several follow-up questions, it becomes unclear which answer the current question depends on.
- Multiple topics in one session become mixed together.
- Chat timelines are hard to review, export, or share.

Answer Tree turns normal chat into this structure:

```text
1 Transformer architecture
  1.1 Self-Attention QKV
  1.2 Multi-head attention
    1.2.1 How each attention head is formed

2 CNN architecture
  2.1 What a convolution kernel is
```

One OpenCode session can contain multiple root trees, while only one active context is used at a time. You can switch focus in the right sidebar, and the left chat history scrolls to the matching answer.

## Current Features

- Automatically saves long or structured answers as root nodes.
- Automatically saves clear follow-up answers as child nodes.
- Supports multiple root topics in one session.
- Right-side Answer Tree sidebar with numbering, selected node, and active context.
- `j/k` node navigation scrolls the left chat history to the matching answer.
- `enter` sets the selected node as the new active context.
- Node numbers use `1`, `1.1`, and `1.1.1`.
- Rename, delete, show full node, and fuzzy node switching tools.
- CLI, standalone TUI viewer, and Markdown export.
- One validation command: `npm run validate`.

## Quick Start

Requirements:

```text
Node.js >= 20
npm
Bun
```

After cloning from GitHub:

```bash
git clone https://github.com/linqichenggg/opencode-answer-tree.git
cd opencode-answer-tree
npm run setup
npm run opencode
```

`npm run setup` does three things:

```text
Installs Answer Tree dependencies
Installs bundled OpenCode host dependencies
Builds Answer Tree
```

Start with this command:

```bash
npm run opencode
```

Running the global `opencode` command starts the original OpenCode. The Answer Tree sidebar appears only in the version launched with `npm run opencode`.

## First Trial Flow

After entering `npm run opencode`, try this:

1. Ask a question that produces a long answer:

```text
Please explain Transformer architecture in detail
```

2. After the answer finishes, the first tree should appear on the right:

```text
1 Transformer architecture
```

3. Ask a follow-up about the current answer:

```text
Continue explaining the self-attention part
```

4. If the answer is long or structured enough, a child node appears:

```text
1 Transformer architecture
  1.1 Self-Attention explanation
```

5. Switch to a new topic:

```text
what is CNN
```

6. The new topic becomes another root node:

```text
1 Transformer architecture
2 CNN explanation
```

## Sidebar Controls

```text
ctrl+x z  Enter Answer Tree mode
j/k       Select previous / next node
enter     Set selected node as active context
r         Refresh
esc/q     Return to chat
```

Sidebar states:

```text
Selected        The node currently highlighted by the cursor
Active context  The node used as context for future follow-up questions
```

When you move the selected node with `j/k`, the left chat history tries to scroll to the matching answer. Pressing `enter` makes the selected node the new active context.

## Auto-Capture Rules

New topics become root nodes, for example:

```text
what is CNN
explain what CNN is
introduce RAG
compare CNN and Transformer
new topic: explain diffusion models
```

Clear follow-ups become child nodes, for example:

```text
continue explaining this
expand point 2
why is this designed this way
what does the above paragraph mean
what is QKV in the current node
```

Current save thresholds:

```text
Root node: more than 600 characters, or 3+ bullets, or 3+ paragraphs
Child node: more than 300 characters, or 2+ bullets, or 2+ paragraphs
```

Short answers are skipped, and the sidebar shows the latest result:

```text
Last answer: saved #ans_xxxxxxxx
Last answer: skipped
```

## Data Location

OpenCode plugin data is stored in the project directory:

```text
.answer-tree/opencode-state.json
```

CLI data is stored at:

```text
.answer-tree/state.json
```

These are local state files and should not be committed to GitHub.

## CLI Usage

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

Continue asking questions around the current node:

```bash
node dist/src/cli/index.js current --store opencode
node dist/src/cli/index.js use <nodeId> --store opencode
node dist/src/cli/index.js ask-current "Explain this part further" --segment 1 --store opencode
node dist/src/cli/index.js attach-last "This is the answer to the previous question" --title "Child Answer" --store opencode
```

Export:

```bash
node dist/src/cli/index.js export --store opencode --out answer-tree.md
```

## OpenCode Slash Commands

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

These commands live in `.opencode/commands/` and call the corresponding `answer_tree_*` tools.

## TUI Viewer

View the answer tree saved by the OpenCode plugin:

```bash
npm run build
node dist/src/tui/index.js --store opencode
```

If Chinese text appears as question marks, use ASCII-compatible mode:

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

## Development Validation

```bash
npm run validate
```

This command runs:

```text
Main project tests
CLI/TUI smoke test
Bundled OpenCode host typecheck
```

You can also run checks separately:

```bash
npm test
npm run smoke
```

## Project Structure

```text
src/core        Answer Tree data model, segmentation, attachment, export
src/plugin      OpenCode tools and automatic capture logic
src/cli         Command-line tool
src/tui         Standalone TUI viewer
.opencode       OpenCode commands / skill / plugin loader
opencode-host   Bundled OpenCode host source with the right sidebar
docs            Design, validation, and next steps
```

## Current Boundaries

- This is a single-repository version with a bundled OpenCode host.
- The global `opencode` command still starts original OpenCode.
- The Answer Tree version starts with `npm run opencode`.
- A one-command installable OpenCode distribution for regular users is still future work.
- Old nodes without `opencodeMessageId` use content and time fallback matching for left-side scrolling.

More documentation:

- `docs/PRODUCT_PLAN.md`
- `docs/ARCHITECTURE.md`
- `docs/COMMANDS.md`
- `docs/TUI.md`
- `docs/SELF_REVIEW.md`
- `docs/VALIDATION.md`
- `docs/NEXT_STEPS.md`
