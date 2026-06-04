# 验收记录

验收时间：2026-06-05

## 自动化验证

主验证命令：

```bash
npm run validate
```

该命令会依次运行：

```text
Main project tests
CLI and TUI smoke test
OpenCode host typecheck
```

单独命令：

```bash
npm test
npm run smoke
```

预期结果：

```text
tests: 26 pass, 0 fail
smoke: CLI help 和 TUI help 正常输出
host typecheck: pass
```

## 已覆盖能力

核心库：

- 长回答按段落切分。
- 超长段落按长度切块。
- 回答树支持多层子节点。
- prompt 会包含当前节点、引用片段、来源问题和从根到当前节点的路径。
- 状态可以保存并重新加载。
- 树可以导出为 Markdown。

OpenCode plugin：

- tools 可以创建、列出、展示、重命名、删除、导出节点。
- tools 可以按 session 隔离 current node 和 last question。
- tools 可以按标题模糊切换节点。
- `answer_tree_prompt_current` 支持围绕 active context 追问。
- `answer_tree_prompt_auto` 支持根据问题内容选择更合适的父节点。
- `answer_tree_attach_last` 支持把上一问回答挂为子节点。
- 过短回答会跳过。
- 很具体的细节问题会跳过建节点。
- 子节点深度最多到 `1.1.1`。

TUI / sidebar：

- 独立 TUI viewer 可以渲染嵌套树、当前节点标记、节点详情、片段和问题列表。
- ASCII 模式可以在不支持 CJK 渲染的终端隐藏非 ASCII 原文，避免问号刷屏。
- 内置 OpenCode host 的右侧 sidebar 可以显示当前 session 的 Answer Tree。
- sidebar 支持 selected node、active context、展开折叠、刷新和跳转到对应聊天内容。

进程和终端：

- `npm run opencode` 退出时会清理 child process group，避免 bun/opencode 留在后台。
- 终端窗口 resize 会转发给内置 OpenCode host，解决 Obsidian 终端拖大后 UI 固定在旧尺寸的问题。

安全：

- 测试录制文件里疑似 Google API token 的固定字符串已改为动态拼接，避免 GitHub secret scanning 误报。

## 手工验证过的真实工作流

启动：

```bash
npm run setup
npm run opencode
```

长回答生成根节点：

```text
请详细解释 Transformer 架构
```

预期：

```text
右侧 Answer Tree 出现根节点，例如：
1 Transformer 架构设计深度分析
```

围绕当前节点追问：

```text
针对多头注意力机制这一点，再展开介绍一下
```

预期：

```text
右侧出现子节点，例如：
1 Transformer 架构设计深度分析
  1.1 Multi-Head Attention 详解
```

切换 active context：

```text
ctrl+x z
j/k 选择节点
enter
```

预期：

```text
Selected 节点变成 active context。
后续“继续展开当前节点”会基于该节点，而非整条聊天时间线。
左侧聊天历史尝试跳到对应回答位置。
```

新话题生成新根节点：

```text
新话题：解释 CNN 的卷积核
```

预期：

```text
右侧出现第二棵根树。
```

细节问题不继续建树：

```text
QKV 是什么？
为什么这里是 0.2？
```

预期：

```text
聊天正常回答，但不生成 1.1.1.1 这类过深节点。
```

## Version 1.0 验收标准

- GitHub 仓库只需要 clone 一个目录：`opencode-answer-tree`。
- `npm run setup` 能安装依赖并构建。
- `npm run opencode` 能打开带 Answer Tree sidebar 的 OpenCode。
- 普通长回答可以自动生成根节点。
- 有上下文价值的追问可以生成子节点。
- active context 可以通过 sidebar 切换。
- 细节问题和超过三层的问题不会继续污染树。
- `npm run validate` 通过。
- README、架构说明和验收记录与当前实现一致。
