# 下一步实施路线

## 当前 V1 已完成

- 树状数据结构。
- 长回答切段。
- 片段追问 prompt。
- 子回答挂接。
- CLI 工作流。
- OpenCode 插件入口和 custom tools。
- 自动化测试和手工验收。
- 独立 TUI Viewer，可以查看 OpenCode 插件保存的回答树。
- 项目级 `answer-tree-auto` skill，可以指导模型在普通聊天里自动调用 Answer Tree tools。

## 下一步优先级

### 1. 真实 OpenCode 会话验证

目标：确认 `message.updated` 事件里的 message shape 是否和当前解析器完全一致。

动作：

```bash
npm run build
opencode
```

然后在 OpenCode 中产生一条长回答，检查：

```text
.answer-tree/opencode-state.json
```

如果没有捕获，需要根据真实 event payload 调整 `extractAssistantMessage()`。

### 2. 插件命令体验

目标：让用户不用记 tool 名。

已完成第一版项目级 slash commands：

```text
/tree-list
/tree-show
/tree-ask
/tree-attach
/tree-export
```

当前边界：OpenCode command 是 prompt 模板，仍然由模型调用 tool。后续如果要完全确定性执行，需要 fork OpenCode TUI 或等待插件 API 支持直接注册 command handler。

### 2.5 自动 skill 体验验证

目标：减少用户手动要求模型调用 `answer_tree_*` tool 的次数。

已新增：

```text
.opencode/skills/answer-tree-auto/SKILL.md
```

验证方式：

1. 启动 OpenCode。
2. 让模型生成一段新的长回答。
3. 对其中一部分自然语言追问，例如“针对用户体验部分继续展开”。
4. 检查模型是否自动调用 `answer_tree_prompt_current` 和 `answer_tree_attach_last`。
5. 检查 `.answer-tree/opencode-state.json` 是否新增子节点。

当前边界：skill 只能约束模型行为，不是确定性的事件处理器。若模型没有触发 tool，需要继续加强 skill 描述，或在 fork 里做事件级自动挂接。

### 3. Fork OpenCode TUI

触发条件：

- 插件已能稳定保存和生成 prompt。
- 用户确认这个工作流确实减少翻页成本。
- 独立 TUI Viewer 的信息结构已经验证清楚。

要改的产品界面：

```text
左侧：Answer Tree
中间：当前回答和编号片段
右侧：当前节点问题线程
底部：输入框
```

核心库保持不变，只新增 UI adapter。

### 4. 发布形态

先发布 npm 插件：

```text
opencode-answer-tree
```

再考虑 fork 版：

```text
opencode-answer-tree-edition
```

插件版适合验证，fork 版适合做完整体验。
