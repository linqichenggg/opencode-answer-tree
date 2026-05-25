# TUI Viewer

Answer Tree TUI 是一个独立终端查看器，用来可视化检查 OpenCode 插件保存的回答树。

启动：

```bash
npm run build
node dist/src/tui/index.js --store opencode
```

也可以读取默认 CLI 状态：

```bash
node dist/src/tui/index.js
```

如果终端把中文或日文显示成问号，使用 ASCII 兼容模式：

```bash
node dist/src/tui/index.js --store opencode --ascii
```

ASCII 模式只在 TUI 中隐藏非 ASCII 原文，按 `e` 导出的 Markdown 仍保留原始内容。

## 快捷键

```text
↑/↓ 或 j/k   选择节点
Enter        刷新当前节点详情
e            导出 Markdown
r            重新读取状态文件
q            退出
```

## 当前范围

这个 TUI 第一版只负责查看和导出：

- 左侧显示回答树。
- `*` 表示当前节点。
- 右侧显示当前节点标题、ID、父问题、路径、片段和问题列表。
- 默认导出到 `answer-tree-export.md`，也可以启动时传 `--out file.md`。

它暂时不写状态文件，也不直接提问。连续追问仍然通过 OpenCode commands 或 CLI 完成。
