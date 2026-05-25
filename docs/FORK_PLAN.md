# OpenCode Fork Integration Plan

## 目标

把当前 Answer Tree 能力从“独立插件 + CLI + TUI Viewer”推进到 OpenCode 内部体验：

```text
OpenCode TUI
  右侧/辅助面板：Answer Tree
  主对话区：保留原有 OpenCode conversation
  操作入口：围绕当前 answer node 追问、挂接回答、导出
```

当前上游仓库：`anomalyco/opencode`，GitHub 实际入口也可能显示为 `sst/opencode`。Fork 前要以 GitHub 页面当前重定向为准。

## 现有项目中可复用的部分

可以直接复用：

- `src/core/*`
  - 树结构
  - 分段
  - prompt 生成
  - 状态读写
- `src/tui/view-model.ts`
  - 把 AnswerTree 转成可展示的树行
  - 节点详情渲染思路
- `src/plugin/opencode.ts`
  - tool 行为定义
  - OpenCode 插件状态文件约定

不建议直接复用：

- `src/tui/index.ts`
  - 它使用 `blessed` 独立渲染。
  - OpenCode 自身 TUI 可能基于 OpenTUI/Solid，应按上游 UI 架构接入。

## Fork 后第一轮只做什么

第一轮先做旁路面板，避免一开始改动过大：

1. 在 OpenCode TUI 中增加 Answer Tree panel。
2. 读取当前项目 `.answer-tree/opencode-state.json`。
3. 显示回答树。
4. 支持选中节点、刷新、把选中节点设为 active node。
5. 显示 node id、segment 数量和来源问题。

暂时不做：

- 在面板里直接发起 LLM 请求。
- 修改 OpenCode 原会话结构。
- 替换 OpenCode 原本消息渲染。

## Fork 后要找的入口

进入上游仓库后，优先搜索：

```bash
rg "opentui|solid|tui|message.updated|command|plugin" packages src
rg "Plugin" packages src
rg "session" packages src
rg "message" packages src
```

重点确认：

- TUI 组件目录。
- 插件加载和事件派发位置。
- 当前 session/message store。
- keybinding / command palette 入口。
- 项目根目录解析逻辑。

## 推荐目录策略

在 fork 内尽量保持 Answer Tree 为独立 adapter：

```text
packages/opencode
  src/answer-tree/
    core-adapter.ts      调用本项目 core 或复制稳定 core
    state.ts             读写 .answer-tree/opencode-state.json
    view-model.ts        生成 UI 可渲染数据
    panel.tsx            OpenCode UI panel
```

如果上游是 monorepo，具体路径以真实目录为准。

## 风险

- OpenCode TUI 架构可能变化快，fork 维护成本高。
- 插件 API 已能完成大量逻辑，fork 只应该用于 UI 体验。
- 如果直接改 message store，会和上游升级冲突。优先做旁路面板读取 `.answer-tree` 状态。

## 验收标准

Fork 第一版成功标准：

```text
1. OpenCode 正常启动。
2. 原有聊天功能不受影响。
3. Answer Tree panel 能显示 opencode-state.json。
4. 切换节点时选中标记正确更新。
5. 不需要复制 nodeId 就能看到当前节点上下文。
6. npm/bun 测试或至少 typecheck 通过。
```

## 当前下一步

1. 已克隆上游 OpenCode 到 `/Users/lqcmacmini/code/opencode-upstream`。
2. 已创建本地 fork 工作副本 `/Users/lqcmacmini/code/opencode-answer-tree-fork`。
3. 已创建分支 `answer-tree-panel`。
4. 已确认 TUI 技术栈是 `@opentui/solid`。
5. 已发现 `sidebar_content` 插槽，可以先做 sidebar 插件，降低 fork 风险。

下一步：

1. 已安装 Bun 并完成 fork 依赖安装。
2. 已在 `/Users/lqcmacmini/code/opencode-answer-tree-fork/packages/opencode` 跑通上游 typecheck。
3. 已修正 fork spike 中的类型问题。
4. fork 版 OpenCode 能启动，并确认 `internal:sidebar-answer-tree` 被加载。

后续重点：

1. 在真实 session 中人工确认 `ctrl+x z` 进入 Answer Tree 模式，以及 `j/k/enter/r/esc` 的单键交互。
2. 给 fork sidebar panel 增加 ASCII fallback，避免 CJK 终端渲染问题。
3. 接入“从选中节点生成追问 prompt”和“把新回答挂到选中节点”。
4. 判断是否把 sidebar panel 从内部插件改造成外部 TUI plugin。
