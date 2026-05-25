# 架构说明

## 模块

```text
src/core
  id.ts        生成节点和问题 ID
  segment.ts   把长回答切成稳定片段
  tree.ts      回答树、问题记录、子回答挂接、prompt 生成
  store.ts     本地 JSON 持久化
  types.ts     核心数据结构

src/cli
  index.ts     本地 CLI，独立于 OpenCode 使用

src/plugin
  opencode.ts  OpenCode 插件入口，监听事件并注册 custom tools

src/tui
  index.ts      独立终端查看器
  view-model.ts TUI 展示数据转换，方便测试和后续复用
```

## 数据流

```text
长回答内容
  ↓
createNode()
  ↓
AnswerNode + Segment[]
  ↓
recordQuestion()
  ↓
QuestionRecord + grounded prompt
  ↓
attachAnswer()
  ↓
子 AnswerNode
```

## 为什么回答和问题分开存

回答是可以继续被阅读、切段和追问的“文档节点”。问题是连接节点和片段的“边”。这样可以表达：

```text
回答 A 的第 4 段
  ↓ 问题 a
回答 a1
  ↓ 问题 x
回答 x1
```

如果把问题直接塞进回答节点里，后面做搜索、导出、路径解释和 UI 展示都会更混乱。

## Prompt 生成原则

默认 prompt 包含：

- 当前回答标题。
- 当前引用片段，或整条回答。
- 当前问题。
- 如果当前节点有父节点，则包含从根到当前节点的路径。

默认不把整棵树全部发给模型，避免上下文无限膨胀。

## OpenCode 集成边界

当前插件做了两件事：

1. 监听 `message.updated`，自动捕获超长 assistant 回答。
2. 注册 custom tools，让 OpenCode 可以创建、列出、展示、提问、挂接、导出回答树。

当前没有改 OpenCode TUI。三栏界面需要 fork OpenCode 主仓库后接入 `AnswerTree` 核心库。

## 持久化

CLI 默认写入：

```text
.answer-tree/state.json
```

OpenCode 插件默认写入：

```text
.answer-tree/opencode-state.json
```

两者暂时分开，避免真实 OpenCode 会话和 CLI demo 互相污染。CLI 可以用 `--store opencode` 读取插件数据，也可以用 `--store <path>` 指定任意状态文件。
