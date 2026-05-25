---
description: Ask about the current Answer Tree node
---

请调用 `answer_tree_prompt_current` 工具，基于当前节点生成追问上下文。

参数格式：

```text
$ARGUMENTS
```

参数约定：

- 如果第一个参数形如 `segment=数字`，把它作为 `segmentIndex`。
- 剩余内容是问题正文。

调用工具后，只返回生成的问题 ID 和核心上下文，不要改写用户问题。
