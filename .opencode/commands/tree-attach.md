---
description: Attach an answer to an Answer Tree question
---

请调用 `answer_tree_attach` 工具，把回答挂接到指定问题下面。

参数格式：

```text
$ARGUMENTS
```

参数约定：

- 第一个参数是 `questionId`。
- 如果后面出现 `title=...`，把它作为标题。
- 剩余内容是回答正文。

调用工具后，返回新节点 ID、标题和片段数。
