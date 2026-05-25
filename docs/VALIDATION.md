# 验收记录

验收时间：2026-05-23

## 自动化验证

命令：

```bash
npm run smoke
npm test
```

结果：

```text
smoke: CLI help 正常输出
tests: 16 pass, 0 fail
```

覆盖范围：

- 长回答按段落切分。
- 超长段落按长度切块。
- 回答树支持 A -> a1 的嵌套节点。
- 第二层追问 prompt 会包含当前路径。
- 状态可以保存并重新加载。
- OpenCode 插件 tools 可以创建和列出节点。
- OpenCode 插件 tools 可以按 session 隔离 current node 和 last question。
- OpenCode 插件 tools 可以按标题模糊切换节点。
- OpenCode 插件 tools 可以查看完整节点、重命名节点、删除节点。
- CLI store selector 可以选择默认状态、OpenCode 状态和自定义状态文件。
- 核心库可以追踪当前节点和最近问题。
- OpenCode 插件 tools 支持 current/use/ask-current/attach-last 连续追问流程。
- TUI view model 可以渲染嵌套树、当前节点标记、节点详情、片段和问题列表。
- TUI ASCII 模式可以在不支持 CJK 渲染的终端隐藏非 ASCII 原文，避免问号刷屏。

## 手工工作流验证

创建根回答：

```bash
node dist/src/cli/index.js create --file examples/long-answer.md --title '示例长回答 A'
```

结果：

```text
Created ans_3a883ba3: 示例长回答 A
Segments: 5
```

针对根回答第 4 段提问：

```bash
node dist/src/cli/index.js ask ans_3a883ba3 '为什么这里要用树结构？' --segment 4
```

结果：生成 `q_84376a71`，prompt 中包含“引用片段 4”。

挂接回答为子节点：

```bash
node dist/src/cli/index.js attach q_84376a71 '因为每个回答都可能再次成为新的长内容。如果只做平铺评论，用户很快会分不清当前问题来自哪一段、上一层问题是什么、这条回答又生成了哪些子问题。树结构可以保存来源路径，让 A -> a1 -> x1 这种关系一直清楚。' --title '为什么需要树结构'
```

结果：

```text
Attached ans_6b8e196a: 为什么需要树结构
Segments: 1
```

对子节点继续追问：

```bash
node dist/src/cli/index.js ask ans_6b8e196a '如果继续追问 x/y/z，prompt 里怎么保留上层路径？' --segment 1
```

结果：生成 `q_8616eb83`，prompt 中包含：

```text
## 当前路径
- ans_3a883ba3: 示例长回答 A
- ans_6b8e196a: 为什么需要树结构
  - 来源问题: 为什么这里要用树结构？
```

树结构：

```text
ans_3a883ba3 示例长回答 A (5 segments)
  ans_6b8e196a 为什么需要树结构 (1 segments)
```

导出文件：

```text
docs/demo-export.md
```

## 当前限制

- OpenCode 插件事件结构已按官方文档实现，但还没有在真实 OpenCode 会话里跑端到端验证。
- fork 版 OpenCode TUI 已有右侧 Answer Tree sidebar，可显示节点、选中节点、刷新，并可把选中节点设为 active node。
- 自动捕获长回答设置了长度阈值，短回答需要手动用 tool 或 CLI 保存。

## Fork Sidebar 验证

命令：

```bash
cd /Users/lqcmacmini/code/opencode-answer-tree-fork/packages/opencode
PATH="$HOME/.bun/bin:$PATH" bun run typecheck
```

结果：

```text
typecheck: pass
```

人工已确认：

- OpenCode session 右侧 sidebar 显示 `Answer Tree`。
- 读取 `/Users/lqcmacmini/code/opencode-answer-tree/.answer-tree/opencode-state.json` 成功。
- tools 会写入 `opencodeSessionId`，并按 OpenCode `sessionID` 隔离当前节点和最近问题。
- sidebar 按当前 `session_id` 过滤节点，旧的无 session metadata 节点显示为 legacy project nodes。
- 节点标题、`id/segment` 元信息、来源问题分行显示，树形缩进使用 `├─` / `└─` 表达父子层级。
- 当前交互版本新增 `>` 选中标记和 Answer Tree 模式提示。
- 快捷键避开了 OpenCode 原生 `<leader>a`、`<leader>u`、`<leader>r`，当前使用 `ctrl+x z` 进入模式，模式内使用 `j/k/enter/r/esc`。

## 自动 Skill 验证

新增文件：

```text
.opencode/skills/answer-tree-auto/SKILL.md
```

静态检查：

```text
frontmatter: has name, has description
path: .opencode/skills/answer-tree-auto/SKILL.md
```

符合 OpenCode skill loader 约定：

```text
.opencode/skills/<name>/SKILL.md
```

待人工验证：

- 普通追问是否触发 `answer_tree_prompt_current`。
- 长回答是否触发 `answer_tree_attach_last` 或 `answer_tree_create`。
- 模型是否能稳定跳过问候、短问题、调试操作等不应入树的消息。

2026-05-25 补充：

- 真实 OpenCode fork session 中已人工确认：长回答可以生成当前会话根节点。
- 基于 Transformer 根节点的自然追问可以生成子节点。
- 后续追问可以继续挂到当前 active node。
- 右侧 sidebar 已显示当前会话树、selected node、active node 和 active context。
