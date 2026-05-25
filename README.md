# OpenCode Answer Tree

Answer Tree 是一个面向 OpenCode 的长回答追问工作区。它把 LLM 的长回答保存成可分段、可追问、可继续嵌套的树状结构，避免在聊天时间线里反复往上翻。

## 当前完成内容

- 核心库：回答节点、自动分段、问题记录、子回答挂接、路径追踪、Markdown 导出。
- CLI：可以不依赖 OpenCode 独立验证完整流程。
- OpenCode 插件：提供自动捕获长回答的事件 hook 和一组 custom tools。
- OpenCode fork sidebar：在右侧显示当前会话的 Answer Tree、active context、节点详情和快捷键操作。
- 测试：覆盖切段、嵌套追问和本地持久化。

## 安装

```bash
npm install
npm run build
```

## CLI 快速试用

创建根回答：

```bash
node dist/src/cli/index.js create --file examples/long-answer.md --title "长回答 A"
```

查看回答树：

```bash
node dist/src/cli/index.js list
```

查看 OpenCode 插件保存的回答树：

```bash
node dist/src/cli/index.js list --store opencode
```

查看分段：

```bash
node dist/src/cli/index.js show <nodeId>
```

针对某个片段生成追问 prompt：

```bash
node dist/src/cli/index.js ask <nodeId> "为什么这里需要树结构？" --segment 3
```

把模型回答挂成子节点：

```bash
node dist/src/cli/index.js attach <questionId> "这里需要树结构，因为回答本身还会继续产生新的追问。"
```

围绕当前节点连续追问：

```bash
node dist/src/cli/index.js current --store opencode
node dist/src/cli/index.js use <nodeId> --store opencode
node dist/src/cli/index.js ask-current "继续解释这一段" --segment 1 --store opencode
node dist/src/cli/index.js attach-last "这是上一问的回答" --title "子回答" --store opencode
```

导出：

```bash
node dist/src/cli/index.js export --out answer-tree.md
```

导出 OpenCode 插件保存的数据：

```bash
node dist/src/cli/index.js export --store opencode --out answer-tree.md
```

CLI 默认状态保存在当前项目的 `.answer-tree/state.json`。OpenCode 插件状态保存在 `.answer-tree/opencode-state.json`。CLI 可以用 `--store opencode` 读取插件数据，也可以用 `--store <path>` 指定任意状态文件。

## OpenCode 插件用法

当前插件入口在：

```text
src/plugin/opencode.ts
```

当前项目已经放了一个本地插件加载文件：

```text
.opencode/plugins/answer-tree.js
```

先构建：

```bash
npm run build
```

然后在当前目录启动 OpenCode 时，OpenCode 会加载这个项目级插件。

如果要启动带右侧 Answer Tree 面板的本地 OpenCode fork：

```bash
npm run opencode
```

默认会寻找相邻目录：

```text
../opencode-answer-tree-fork
```

如果 fork 放在别处：

```bash
OPENCODE_FORK_DIR=/path/to/opencode-answer-tree-fork npm run opencode
```

构建后也可以通过 npm 插件方式接入 OpenCode，导出路径是：

```text
opencode-answer-tree/plugin
```

插件提供这些 tools：

- `answer_tree_create`：保存一段长回答为根节点。
- `answer_tree_list`：列出回答树。
- `answer_tree_show`：显示某个节点的分段。
- `answer_tree_show_full`：显示某个节点的完整内容。
- `answer_tree_current`：显示当前节点和最近问题。
- `answer_tree_use`：切换当前节点。
- `answer_tree_use_match`：按标题或来源问题模糊匹配并切换当前节点。
- `answer_tree_rename`：重命名节点。
- `answer_tree_delete`：删除节点，默认保护有子节点的节点。
- `answer_tree_prompt`：记录问题并生成带上下文的 prompt。
- `answer_tree_prompt_current`：基于当前节点追问。
- `answer_tree_attach`：把回答挂接成子节点。
- `answer_tree_attach_last`：把回答挂到最近问题下面。
- `answer_tree_export`：导出 Markdown。

插件也会监听 `message.updated`，当 assistant 消息长度超过阈值时自动保存为回答节点。这个事件结构需要在真实 OpenCode 会话中继续核验。

节点会继续保存在项目目录的 `.answer-tree/opencode-state.json`。OpenCode 工具调用和自动捕获会给新节点写入 `opencodeSessionId`，并为每个 OpenCode 会话单独记录当前节点和最近问题。fork 版右侧 sidebar 默认只显示当前 OpenCode 会话相关的节点。旧版本生成的节点没有 session metadata，会被视为 legacy project nodes，不会在新会话里混进当前树。

项目还提供这些 OpenCode slash commands：

```text
/tree-list
/tree-current
/tree-use ans_xxxxxxxx
/tree-use-match self attention
/tree-show ans_xxxxxxxx
/tree-show-full ans_xxxxxxxx
/tree-rename ans_xxxxxxxx 新标题
/tree-delete ans_xxxxxxxx
/tree-ask ans_xxxxxxxx segment=2 这里为什么要这样设计？
/tree-ask-current segment=2 这里为什么要这样设计？
/tree-attach q_xxxxxxxx title=新的子回答 这里是模型回答正文
/tree-attach-last title=新的子回答 这里是模型回答正文
/tree-export
```

这些命令位于 `.opencode/commands/`，底层仍然会要求模型调用对应的 `answer_tree_*` tool。

## Answer Tree 自动 skill

项目级 skill 位于：

```text
.opencode/skills/answer-tree-auto/SKILL.md
```

它会指导模型在普通聊天时自动判断是否需要更新 Answer Tree：

- 用户围绕当前 active node 追问时，优先调用 `answer_tree_prompt_current`。
- 回答足够长、后续可能继续追问时，调用 `answer_tree_attach_last` 保存为子节点。
- 用户要求新的长内容分析时，回答后调用 `answer_tree_create` 保存为根节点。
- 问候、短问题、运行调试、UI 操作等不会写入树。

这是模型行为层自动化：它让模型主动调用已有 tools。它还不是底层事件监听，所以最终是否保存仍取决于模型是否正确触发 skill 和 tools。

## TUI Viewer

查看 OpenCode 插件保存的回答树：

```bash
npm run build
node dist/src/tui/index.js --store opencode
```

如果中文显示成问号，使用 ASCII 兼容模式：

```bash
node dist/src/tui/index.js --store opencode --ascii
```

快捷键：

```text
↑/↓ 或 j/k   选择节点
e            导出 Markdown
r            重新读取状态文件
q            退出
```

## 验证

```bash
npm test
npm run smoke
```

## 产品边界

这个版本先解决“长回答和套娃追问如何被保存、定位和复用”。当前已经有本地 fork 版 OpenCode sidebar，可以在右侧查看当前会话树、切换 active node、查看 active context。它仍然是本地 fork 集成，还没有发布成普通用户一键安装的 OpenCode 版本。

更多说明见：

- `docs/PRODUCT_PLAN.md`
- `docs/ARCHITECTURE.md`
- `docs/COMMANDS.md`
- `docs/TUI.md`
- `docs/FORK_PLAN.md`
- `docs/UPSTREAM_SPIKE.md`
- `docs/SELF_REVIEW.md`
- `docs/VALIDATION.md`
- `docs/NEXT_STEPS.md`
