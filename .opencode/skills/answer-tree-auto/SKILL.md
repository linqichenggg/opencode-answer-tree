---
name: answer-tree-auto
description: Use when the user asks follow-up questions about a previous long LLM answer, references a section/point/node in Answer Tree, or asks for a new long answer that should be saved. Automatically decide whether to call answer_tree tools to create, prompt, attach, or skip nodes.
---

# Answer Tree Auto

Use this skill to keep Answer Tree updated during normal chat. The user should be able to ask naturally; do the tool calls yourself when the message should become part of the tree.

## Goal

Maintain multiple trees inside one OpenCode session:

```text
session
  root topic A
    -> follow-up answer saved as child node
  root topic B
    -> follow-up answer saved as child node
```

There is only one active node/context at a time. The user can switch focus between topics in the sidebar; follow-up questions attach to the active node only when the user clearly refers to that context.

Prefer quiet automation. Do not ask the user to manually call `answer_tree_*` tools unless a required tool is unavailable or the target node is ambiguous.

## Decision Rules

Track the user message when at least one is true:

- The user references a previous long answer, section, bullet, paragraph, point, or node.
- The user says things like "针对这一部分", "展开这个点", "第二点", "用户体验部分", "继续追问", "上面那段", "这个回答里".
- The user asks a follow-up that is likely to produce a new reusable answer node.
- The user asks for a new standalone long answer that they may later ask multiple follow-ups about.

Do not track when:

- The message is a greeting, typo fix, UI operation, install/run/debug question, or short clarification.
- The user explicitly says not to save or not to update Answer Tree.
- The answer will be short and unlikely to become a future branch.
- You cannot infer which existing node the question belongs to and there is no active node.

New-topic rule:

- Treat a fresh topic as a new root node even when an active node exists.
- Fresh-topic examples: "what is CNN", "解释 CNN 是什么", "介绍一下 RAG", "对比 CNN 和 Transformer", "新话题".
- Only attach under the active node when the user clearly says "继续", "这个", "这里", "上面", "刚才", "第 2 点", "当前节点", "this section", "above", "previous", or names a visible node/section.

When unsure whether the user changed topic, prefer a new root node. Use the active node only when the message has a clear follow-up reference.

## Workflow A: Follow-Up On Current Active Node

Use when the user asks a clear follow-up about the currently selected/active answer.

1. Call `answer_tree_prompt_current` with the user's question.
2. Read the returned context path and use it to answer.
3. If your answer is substantial enough to be useful as a future node, call `answer_tree_attach_last` with:
   - `answer`: the same answer content you will give the user
   - `title`: a short, specific title, preferably 6-14 words
4. Final response should include the answer. Add one short sentence that it was saved to Answer Tree only when useful.

Skip step 3 when the answer is short, procedural, or not worth future follow-up.

## Workflow B: New Standalone Long Answer

Use when the user asks for a fresh long answer that is not a follow-up to an existing node.

Use this workflow even if an active node exists, as long as the user asks about a different topic.

1. Answer the user normally.
2. If the answer is long or structured enough to become a root node, call `answer_tree_create` with:
   - `content`: the answer content
   - `title`: a concise topic title
3. Final response should include the answer and a short note that it was saved as a root Answer Tree node.

Good root candidates:

- multi-section product/technical analysis
- plans, architecture, comparisons, research summaries
- long explanations with several future follow-up points

Bad root candidates:

- single command
- one-paragraph answer
- transient debugging advice
- status updates

## Workflow C: User Names A Specific Node

Use when the user mentions a node id or asks to base a question on a visible node.

1. If the node id is explicit, call `answer_tree_prompt` with that `nodeId` and the question.
2. If the user asks to switch to a node by title or topic, call `answer_tree_use_match` with that title/topic before answering.
3. If the user only describes the node title/section and there is ambiguity, call `answer_tree_use_match` first; if the result is still wrong or unclear, call `answer_tree_list` or ask one concise clarification.
4. Answer using the returned path context.
5. If substantial, call `answer_tree_attach_last` with the answer and title.

## What Counts As Substantial

Attach the assistant answer as a child node when it has one of these shapes:

- at least 2 paragraphs
- at least 3 bullets or numbered steps
- introduces a new plan, design, explanation, comparison, or decision
- likely to be asked about again

Do not attach for answers that are only "yes/no", one command, one sentence, or a small correction.

## Tool Preference

Prefer current-node tools:

```text
answer_tree_prompt_current
answer_tree_attach_last
```

Use explicit-node tools only when needed:

```text
answer_tree_prompt
answer_tree_show
answer_tree_use
answer_tree_use_match
```

Use creation/export/list tools when the user's intent matches:

```text
answer_tree_create
answer_tree_list
answer_tree_export
```

Use management tools only when the user explicitly asks:

```text
answer_tree_show_full
answer_tree_rename
answer_tree_delete
```

## User-Facing Behavior

Do not expose tool mechanics unless the user asks. Good final wording:

```text
已保存到 Answer Tree，作为当前节点的子回答。
```

Keep this note short. The main answer still matters most.

## Failure Handling

If a needed Answer Tree tool is unavailable:

- Answer normally.
- Say briefly that Answer Tree auto-save did not run because the tool is unavailable.

If the tool call fails:

- Answer normally if possible.
- Mention the failure briefly and avoid retry loops.

If the active node is wrong:

- Use the user's explicit node/section if clear.
- Otherwise ask the user to select the right Answer Tree node first.
