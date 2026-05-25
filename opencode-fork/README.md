# OpenCode Fork Patch

This directory records the OpenCode fork-side UI integration used by the local prototype.

The current local fork lives next to this project:

```text
../opencode-answer-tree-fork
```

The sidebar implementation is mirrored here:

```text
opencode-fork/sidebar-answer-tree.tsx
```

In the fork, it is installed at:

```text
packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/answer-tree.tsx
```

The fork also registers the sidebar in:

```text
packages/opencode/src/cli/cmd/tui/plugin/internal.ts
```

by importing `SidebarAnswerTree` and adding it to the internal TUI plugin list.

Run the local integrated prototype from this project root:

```bash
npm run opencode
```

If the fork is not next to this repo, set:

```bash
OPENCODE_FORK_DIR=/path/to/opencode-answer-tree-fork npm run opencode
```
