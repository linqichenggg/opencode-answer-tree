# OpenCode Slash Commands

本项目提供项目级 OpenCode commands，放在：

```text
.opencode/commands/
```

在 OpenCode TUI 中输入 `/` 后可以使用：

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

这些命令本质上是 prompt 模板，会要求模型调用对应的 Answer Tree tool。它们使用的是 OpenCode 官方 custom commands 机制。

## 当前限制

OpenCode command 不能像传统 CLI 一样直接解析参数并执行本地函数，它会把命令内容作为 prompt 发给模型。因此：

- `/tree-list`、`/tree-current`、`/tree-export` 很稳定。
- `/tree-show` 需要你传入准确 node ID。
- `/tree-use` 可以减少后续复制 node ID。
- `/tree-use-match` 可以按标题或来源问题模糊切换节点，例如 `self attention`、`multi head`。
- `/tree-show-full` 用于查看完整节点内容。
- `/tree-rename` 用于修正节点标题。
- `/tree-delete` 默认拒绝删除有子节点的节点；需要删除子树时要明确说明。
- `/tree-ask-current` 和 `/tree-attach-last` 是推荐的连续追问入口。
- `/tree-ask`、`/tree-attach` 的参数解析由模型根据模板完成，复杂参数建议保持简单。

当前 1.0 版已经把右侧 sidebar 集成进内置 OpenCode host。Slash command 仍然保留为手动入口，日常使用主要依赖 `answer-tree-auto` skill、Answer Tree tools 和右侧 sidebar。

## 自动 skill

项目级 skill：

```text
.opencode/skills/answer-tree-auto/SKILL.md
```

作用：

- 识别用户是否在追问当前 Answer Tree 节点。
- 自动决定是否调用 `answer_tree_prompt_auto` 或 `answer_tree_prompt_current`。
- 对值得继续追问的回答，自动调用 `answer_tree_attach_last` 保存为子节点。
- 对新的 standalone 长回答，自动调用 `answer_tree_create` 保存为根节点。

这减少了用户手动输入 `/tree-ask-current` 和 `/tree-attach-last` 的频率。需要注意：skill 属于模型层规则，真正的保存仍由 plugin tools 和 `message.updated` 事件完成。
