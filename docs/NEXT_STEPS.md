# 后续路线

OpenCode Answer Tree 1.0 已经完成本地可展示版本。后续工作重点从“证明这个想法能跑”转向“让更多用户更容易安装、使用和迁移”。

## 1. 发布体验

目标：降低使用门槛。

可做事项：

- 提供一条安装命令或发布 npm package。
- 增加更清楚的首次启动检查，提示 Node、npm、Bun 是否缺失。
- 把 `npm run opencode` 包装成更短的命令。
- 提供 demo 数据导入命令，方便展示树结构。

## 2. 更稳定的自动判断

目标：减少模型误建节点或漏建节点。

可做事项：

- 继续收集真实使用中的“应该建节点 / 不应该建节点”样例。
- 给 parent routing 增加更可解释的日志。
- 给 detail-question skip 增加更多中文和英文规则。
- 在 sidebar 中显示最近一次跳过原因。

## 3. Sidebar 体验

目标：让右侧树在长会话里更容易读。

可做事项：

- 节点搜索。
- 只看当前 active path。
- 节点标签或颜色。
- 更明显的 active node 标记。
- selected node 的完整内容预览。

## 4. 导出和复盘

目标：让 Answer Tree 能作为学习和研究记录。

可做事项：

- 导出当前 active path。
- 导出某个节点及其子树。
- 生成学习笔记格式。
- 生成 Obsidian 友好的 Markdown。

## 5. 迁移到其他 LLM 工具

目标：把 Answer Tree 从 OpenCode 扩展到更多聊天工具。

优先顺序：

```text
OpenCode
  ↓
Claude Code / Codex CLI 类终端工具
  ↓
ChatGPT / Claude / Gemini / DeepSeek / MiniMax 等网页或桌面工具
```

迁移时应保留核心库：

```text
src/core
```

每个平台只新增 adapter：

```text
平台消息事件 -> Answer Tree core -> 平台侧边栏或独立 viewer
```
