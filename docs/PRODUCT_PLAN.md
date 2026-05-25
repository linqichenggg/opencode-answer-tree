# OpenCode Answer Tree 产品落地计划

## 目标

解决 OpenCode 使用中的一个具体问题：当模型输出长回答后，用户需要围绕多个片段连续追问；追问的回答又可能变成新的长内容。现有聊天时间线会让原回答越来越难回看。

本项目的核心产品形态是回答树：

```text
长回答 A
├─ 针对 A.2 的问题 a
│  └─ 回答 a1
│     ├─ 针对 a1.1 的问题 x
│     └─ 针对 a1.2 的问题 y
└─ 针对 A.4 的问题 b
```

## 当前版本范围

当前交付的是 V1 工程基础：

- `answer-tree-core`：回答节点、分段、问题记录、回答挂接、路径、Markdown 导出。
- `answer-tree` CLI：可以在任何 LLM 工具旁边独立使用。
- OpenCode 插件入口：自动捕获长 assistant message，并提供可调用 tools。
- 测试：覆盖切段、嵌套回答树、持久化。

## 为什么先做插件和 CLI

OpenCode 官方插件机制已经支持：

- 项目级 `.opencode/plugins/`
- npm 插件
- `message.updated` 事件
- custom tools
- `tui.prompt.append` 等 TUI 事件

这些能力足够验证核心工作流。真正的三栏 TUI 需要改 OpenCode 本体，应该等数据结构和用户流程稳定之后再 fork 深改。

## 下一阶段

1. 在真实 OpenCode 会话中验证 `message.updated` 的事件结构。
2. 把插件 tool 的返回结果接成更顺滑的用户命令。
3. 评估是否 fork OpenCode TUI，加入左侧回答树和当前片段面板。
4. 如果 fork，核心库保持不变，只把 UI 作为第二层接入。
