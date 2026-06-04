# 架构说明

OpenCode Answer Tree 1.0 是一个单仓库产品形态：核心回答树库、OpenCode plugin、项目级 skill、CLI/TUI viewer，以及内置 OpenCode host 都放在同一个仓库里。普通用户从这个仓库启动 `npm run opencode`，就能看到带右侧 Answer Tree sidebar 的 OpenCode。

## 模块

```text
src/core
  id.ts        生成节点和问题 ID
  segment.ts   把长回答切成稳定片段
  tree.ts      回答树、问题记录、子回答挂接、prompt 生成
  store.ts     本地 JSON 持久化
  types.ts     核心数据结构

src/plugin
  opencode.ts  OpenCode plugin 入口，注册 answer_tree_* tools，并实现自动捕获判断

src/cli
  index.ts     本地 CLI，用于查看、创建、导出和调试回答树

src/tui
  index.ts      独立终端查看器
  view-model.ts TUI 展示数据转换，方便测试和复用

.opencode
  plugin.ts     把本仓库 plugin 加载进 OpenCode
  commands/     /tree-* prompt commands
  skills/       answer-tree-auto skill，指导模型自然调用工具

opencode-host
  packages/opencode  内置 OpenCode host，包含右侧 Answer Tree sidebar

scripts
  setup.mjs        安装依赖并构建
  opencode-dev.mjs 启动内置 OpenCode host，并处理退出清理和终端 resize
  validate.mjs     一次运行主项目测试、smoke、host typecheck
```

## 核心数据模型

回答是可以继续阅读、切段和追问的“文档节点”。问题是连接父节点和子节点的“边”。

```text
AnswerNode
  id
  title
  content
  segments[]
  parentId
  sourceQuestionId
  sourceSegmentId
  metadata

QuestionRecord
  id
  nodeId
  question
  segmentIndex
  createdAt
```

这样可以表达嵌套追问：

```text
1 长回答 A
  q: 为什么第 2 点这样设计？
  1.1 子回答 a1
    q: 继续展开实现边界
    1.1.1 子回答 x1
```

## OpenCode 数据流

```text
用户提问
  ↓
LLM 根据 answer-tree-auto skill 判断是否需要 Answer Tree tool
  ↓
answer_tree_prompt_auto / answer_tree_prompt_current 记录问题并生成带上下文的 prompt
  ↓
LLM 回答
  ↓
message.updated 事件或 answer_tree_attach_last 捕获长回答
  ↓
src/core 创建 root node 或 child node
  ↓
.answer-tree/opencode-state.json
  ↓
右侧 Answer Tree sidebar 读取 session tree 并显示
```

自动捕获只保存有复用价值的长回答。短回答、问候、调试类输出、非常具体的细节问答会保留在聊天时间线里，不继续进入树。

## 父节点选择

每次追问前，plugin 会先判断问题应该挂到哪个父节点。

优先级：

```text
1. 问题里明确写了 ans_xxxxxxxx，直接使用该节点
2. 问题明显命中某个节点标题、来源问题或内容摘要，使用得分最高的节点
3. 没有明显命中时，使用当前 active context
```

这让用户可以自然地说：

```text
针对 Multi-Head Attention 继续展开
回到 CNN 那个节点，解释卷积核
针对当前节点继续讲
```

## 建节点规则

根节点阈值：

```text
超过 600 字符，或 3 个以上 bullet，或 3 段以上
```

子节点阈值：

```text
超过 300 字符，或 2 个以上 bullet，或 2 段以上
```

额外限制：

```text
最大树深度：3 层，即 1 -> 1.1 -> 1.1.1
非常具体的细节问题：跳过建节点
```

## Active Context

右侧 sidebar 里有两个概念：

```text
Selected        光标当前选中的节点
Active context  后续追问默认使用的上下文节点
```

按 `enter` 会把 selected 节点设为 active context。之后用户说“继续展开当前节点”时，模型会拿这个节点的标题、内容、来源问题和路径来生成更准确的追问 prompt。

## Sidebar 集成

内置 OpenCode host 中增加了 Answer Tree sidebar。它读取当前项目的 `.answer-tree/opencode-state.json`，按当前 OpenCode session 过滤节点，并显示：

```text
- 根节点和子节点
- 三层编号
- selected 标记
- active context 路径
- 最近一次自动保存或跳过结果
```

快捷键：

```text
ctrl+x z  进入 Answer Tree 模式
j/k       选择节点
space     展开或折叠
enter     设为 active context，并让左侧聊天跳到对应回答
a         展开所有节点
z         折叠所有分支
r         刷新
esc/q     回到聊天
```

## 持久化

OpenCode plugin 写入：

```text
.answer-tree/opencode-state.json
```

CLI 默认写入：

```text
.answer-tree/state.json
```

两者分开，避免真实 OpenCode session 和 CLI demo 互相污染。CLI 可以通过 `--store opencode` 读取 OpenCode plugin 状态。

## 启动与进程管理

`npm run opencode` 调用 `scripts/opencode-dev.mjs`。这个脚本负责：

```text
1. 使用仓库内置 opencode-host 启动 OpenCode
2. 把当前项目目录作为工作目录传给 OpenCode
3. 转发终端 resize，避免 Obsidian 等终端窗口变大后 UI 不刷新
4. 退出时清理 child process group，避免 bun/opencode 留在后台
```

## 当前边界

- 1.0 版已经能作为本地展示和研究室 demo 使用。
- 启动入口是 `npm run opencode`，全局 `opencode` 仍然是用户机器上安装的原版 OpenCode。
- `answer-tree-auto` skill 会指导 LLM 调用工具，但最终调用稳定性仍受模型遵循程度影响。
- 还没有打包成普通用户双击安装或全局 npm 安装的发行版。
