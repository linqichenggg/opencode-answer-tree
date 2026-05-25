---
description: Attach an answer to the last Answer Tree question
---

请调用 `answer_tree_attach_last` 工具，把回答挂接到最近一次问题下面。

参数格式：

```text
$ARGUMENTS
```

参数约定：

- 如果开头出现 `title=...`，把它作为标题。
- 剩余内容是回答正文。

调用工具后，返回新节点 ID、标题、片段数和对应的问题 ID。
