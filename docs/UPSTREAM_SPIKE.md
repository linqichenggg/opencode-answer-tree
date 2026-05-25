# Upstream OpenCode Spike

时间：2026-05-23

## 本地目录

```text
上游只读镜像：/Users/lqcmacmini/code/opencode-upstream
本地 fork 工作副本：/Users/lqcmacmini/code/opencode-answer-tree-fork
分支：answer-tree-panel
上游 remote：https://github.com/sst/opencode.git
当前上游提交：2c4ad9f
```

## 关键发现

OpenCode TUI 位置：

```text
packages/opencode/src/cli/cmd/tui/
```

TUI 技术栈：

```text
@opentui/solid
solid-js
@opentui/core
```

Session 侧栏已经有插件插槽：

```text
packages/opencode/src/cli/cmd/tui/routes/session/sidebar.tsx
```

其中：

```tsx
<TuiPluginRuntime.Slot name="sidebar_content" session_id={props.sessionID} />
```

这说明 Answer Tree 可以先作为 sidebar 插件接入，不需要大改 Session 主布局。

## Fork Spike 已做

在本地 fork 分支 `answer-tree-panel` 中新增：

```text
packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/answer-tree.tsx
```

并修改：

```text
packages/opencode/src/cli/cmd/tui/plugin/internal.ts
```

效果目标：

- 读取当前项目 `.answer-tree/opencode-state.json`。
- 在 OpenCode sidebar 中显示 Answer Tree。
- 用 `*` 标记 active node。
- 显示 node id、segment 数量和 parent question。
- 点击 `refresh` 可重新读取状态。
- 用 `>` 标记当前在 sidebar 中选中的节点。
- 支持 Answer Tree 模式：先进入模式，再用单键选择节点、刷新、把选中节点设为 active。

## 验证结果

已安装 Bun：

```text
Bun 1.3.14
```

fork 依赖安装成功：

```bash
PATH="$HOME/.bun/bin:$PATH" bun install
```

fork typecheck 通过：

```bash
cd /Users/lqcmacmini/code/opencode-answer-tree-fork/packages/opencode
PATH="$HOME/.bun/bin:$PATH" bun run typecheck
```

fork 版 OpenCode 可以启动，且日志确认加载了内部 Answer Tree sidebar 插件：

```text
service=tui.plugin id=internal:sidebar-answer-tree loading internal tui plugin
```

已在真实 OpenCode session sidebar 中人工确认 Answer Tree 区块可见：

- 右侧 sidebar 显示 `Answer Tree` 标题。
- 能读取 `/Users/lqcmacmini/code/opencode-answer-tree/.answer-tree/opencode-state.json`。
- 能显示根节点 `ans_7b1a812b` 和子节点 `ans_f4e2b013`。
- active node 使用 `*` 标记。
- 子节点显示来源问题 `from: ...`。

当前交互入口：

```text
ctrl+x z   进入 Answer Tree 模式
j / k      选择下一个 / 上一个节点
enter      把选中节点设为 active node
r          刷新 Answer Tree 状态
esc / q    回到聊天输入
```

命令面板中也注册了：

```text
Answer Tree: Focus panel
Answer Tree: Select previous node
Answer Tree: Select next node
Answer Tree: Use selected node
Answer Tree: Refresh
```

启动命令：

```bash
cd /Users/lqcmacmini/code/opencode-answer-tree
PATH="$HOME/.bun/bin:$PATH" \
  bun run --cwd /Users/lqcmacmini/code/opencode-answer-tree-fork/packages/opencode \
  dev /Users/lqcmacmini/code/opencode-answer-tree --print-logs --log-level INFO
```

未完全验证：

- 当前 spike 是 fork 内部插件，尚未转换成外部分发的 TUI plugin。
- sidebar 当前可选择节点并切换 active node，尚未支持在面板内创建问题或把当前回答直接挂到节点。

当前 Answer Tree 主项目验证：

- `npm run typecheck` 通过。
- `npm run smoke` 通过。
- `npm test` 通过，13 pass / 0 fail。
- 上游目录结构已确认。
- fork 改动范围保持在 sidebar 内部插件和 internal plugin registry。

## 重要结论

不需要一开始 fork 大改 OpenCode 会话界面。上游已经有 sidebar 插槽，最佳下一步是把 Answer Tree 做成 TUI sidebar 插件或内部 sidebar 插件。

如果能把外部 TUI plugin 跑通，维护成本会比长期 fork 更低。Fork 版适合验证 UI 想法，正式分发仍建议优先走插件。
