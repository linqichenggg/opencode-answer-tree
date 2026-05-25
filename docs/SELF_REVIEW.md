# Self Review

## 2026-05-23 TUI Viewer Review

已检查：

- `npm run typecheck` 通过。
- `npm run smoke` 通过。
- `npm test` 通过，12 pass / 0 fail。
- `--store opencode` 能读取真实 `.answer-tree/opencode-state.json`。
- TUI view model 能渲染真实数据中的嵌套树和当前节点详情。

发现并处理：

- 根目录出现 `.DS_Store`，已删除。
- `.opencode/node_modules` 是 OpenCode 运行插件时生成的依赖目录，已有 `.opencode/.gitignore` 忽略。

保留的边界：

- TUI Viewer 只读，不写 `.answer-tree/opencode-state.json`。
- TUI Viewer 使用 `blessed`，后续 fork OpenCode 时只复用 `view-model` 思路，不直接嵌入 `blessed` 渲染。
- OpenCode slash commands 仍然是 prompt 模板，复杂参数解析依赖模型。

下一步审查重点：

- 克隆上游 OpenCode 后确认 TUI 技术栈和组件入口。
- 判断 Answer Tree panel 是否能作为旁路面板接入，不改 OpenCode 原 message store。

## 2026-05-23 Fork Sidebar Spike Review

已检查：

- Bun 已安装到 `~/.bun/bin/bun`。
- `/Users/lqcmacmini/code/opencode-answer-tree-fork/packages/opencode` 的 `bun run typecheck` 通过。
- fork 版 OpenCode 可以用上游 `dev` 脚本启动。
- 启动日志确认 `internal:sidebar-answer-tree` 已加载。
- 真实 session sidebar 已人工看到 `Answer Tree` 区块。
- sidebar 已能显示两层节点、active 标记、node id、segment 数量和来源问题。

发现并处理：

- 直接 `bun src/index.ts` 会因为 JSX runtime 解析错误找 `react/jsx-dev-runtime`；正确方式是走上游 `dev` 脚本，它带 `--conditions=browser`。
- 第一次 `bun install` 时 install script 找不到 `bun`；已用 `PATH="$HOME/.bun/bin:$PATH"` 解决。
- `answer-tree.tsx` 有两处 `state` 可能为 undefined 的类型错误；已改为局部 `nodes` 和 `activeNodeId` 常量，typecheck 通过。
- sidebar 第一次没有显示 Answer Tree，是因为只读 `props.api.state.path.directory`，初始化时可能拿不到项目目录；已改为检查项目目录、`PWD`、`INIT_CWD` 和 `process.cwd()`。
- 为了避免 silent failure，Answer Tree 区块现在会常驻显示；没读到状态时显示 `No answer tree state found`。

保留的边界：

- sidebar panel 仍是内部插件 spike，不是可分发外部 TUI plugin。
- sidebar panel 目前只读，交互能力还在 CLI/plugin tools 侧。
