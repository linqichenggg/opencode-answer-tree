<!--
Qiita title:
OpenCodeにAnswer Treeを追加して、LLMの長い回答と追問をツリーで管理できるようにした

Tags:
OpenCode, AIエージェント, LLM, TypeScript, 個人開発
-->

## はじめに

LLM を使って調べ物や実装相談をしていると、1つの回答が長くなることがあります。

長い回答そのものは便利ですが、その後に深掘りしていくと、次のような問題が起きます。

- どの回答に対する質問だったのか分からなくなる
- 前の説明を探すために何度もスクロールする必要がある
- 複数の話題が1つのチャット履歴に混ざってしまう
- あとから見返したときに、議論の構造が読み取りにくい

特に、技術調査やコード設計の相談では「この説明の2番目だけをもう少し詳しく」「さっきの CNN の話に戻って」など、回答の一部を起点にして会話を続けたい場面がよくあります。

そこで、OpenCode に右側の Answer Tree sidebar を追加し、LLM の長い回答と深掘り質問をツリー構造で管理できるようにしました。

リポジトリはこちらです。

https://github.com/linqichenggg/opencode-answer-tree

## 作ったもの

OpenCode Answer Tree は、OpenCode に「回答ツリー」を追加するプロジェクトです。

LLM の長い回答をノードとして保存し、その回答に対する追問を子ノードとして整理します。

例えば、通常のチャットでは次のように時系列で流れていく会話を、

```text
Transformer について教えて
Self-Attention を詳しく教えて
Multi-Head Attention はなぜ必要？
次に CNN について教えて
畳み込みカーネルとは？
```

Answer Tree では次のような構造として扱います。

```text
1 Transformer architecture
  1.1 Self-Attention QKV
  1.2 Multi-head attention
    1.2.1 How each attention head is formed

2 CNN architecture
  2.1 What a convolution kernel is
```

実際の sidebar はこのようになります。

![OpenCode Answer Tree sidebar showing multiple topics and nested follow-up nodes](https://raw.githubusercontent.com/linqichenggg/opencode-answer-tree/main/docs/assets/answer-tree-sidebar.png)

右側にツリーが表示され、左側には通常の OpenCode チャットが表示されます。

選択したノードを active context にすると、その後の「この部分を続けて説明して」のような追問が、現在選択している回答を前提に処理されます。

## 何ができるか

現在の Version 1.0 では、主に次の機能を実装しています。

- 長い回答や構造化された回答を root node として自動保存
- 追問に対する回答を child node として自動保存
- 1つの OpenCode session 内で複数の root topic を管理
- `1`, `1.1`, `1.1.1` のような番号付きツリー表示
- 右側 sidebar で selected node と active context を表示
- sidebar のノードをマウスクリックして、左側チャットの対応する回答へ移動
- `j/k` でノード移動
- `enter` で active context を切り替え
- `space` でノードを展開・折りたたみ
- CLI と standalone TUI viewer
- Markdown export
- `npm run validate` による一括検証

単にログを保存するだけではなく、「次の質問がどの回答にぶら下がるのか」を扱えるようにした点がポイントです。

短い回答や細かすぎる質問は保存せず、あとから見返す価値がある長めの回答だけをツリーに入れるようにしています。

## 使い方

必要なものは次の通りです。

```text
Node.js >= 20
npm
Bun
```

リポジトリを clone します。

```bash
git clone https://github.com/linqichenggg/opencode-answer-tree.git
cd opencode-answer-tree
```

初回セットアップを実行します。

```bash
npm run setup
```

このコマンドでは、Answer Tree 側の依存関係、内蔵している OpenCode host 側の依存関係、TypeScript build をまとめて実行します。

起動は次のコマンドです。

```bash
npm run opencode
```

注意点として、グローバルに入っている `opencode` コマンドを直接実行すると、通常の OpenCode が起動します。Answer Tree sidebar を使う場合は、このリポジトリ内で `npm run opencode` を実行します。

## 試す流れ

起動後、まず長めの回答が返ってくる質問をします。

```text
Please explain Transformer architecture in detail
```

回答が終わると、右側に root node が作成されます。

```text
1 Transformer architecture
```

次に、現在の回答に対して追問します。

```text
Continue explaining the self-attention part
```

追問への回答が十分に長い場合、子ノードとして保存されます。

```text
1 Transformer architecture
  1.1 Self-Attention explanation
```

別の話題に移ると、新しい root node が作成されます。

```text
what is CNN
```

```text
1 Transformer architecture
2 CNN explanation
```

このように、1つのチャット session の中で複数の話題を混ぜずに扱えます。

## Sidebar の操作

Answer Tree mode には次のキーで入ります。

```text
ctrl+x z
```

主な操作は次の通りです。

```text
j/k       Select previous / next node
click     Select node and scroll chat to the matching answer
space     Expand / collapse selected node
enter     Set selected node as active context
a         Expand all nodes
z         Collapse all nodes
r         Refresh
esc/q     Return to chat
```

sidebar のノードはマウスクリックにも対応しています。ノードをクリックすると selected node が切り替わり、左側のチャット履歴が対応する回答へ移動します。

ここで重要なのは、selected node と active context を分けていることです。

selected node は、sidebar 上でカーソルが当たっているノードです。

active context は、次の追問で実際に文脈として使われるノードです。

例えば、Transformer の話をしていたあとに CNN のノードを active context に切り替えれば、その後の「もう少し詳しく」は CNN 側の文脈として扱われます。

## OpenCode とのつなぎ込み

OpenCode 側では plugin と project-level skill を使っています。

大まかな流れは次の通りです。

```text
ユーザーが質問
  ↓
answer-tree-auto skill が Answer Tree を使うべきか判断
  ↓
answer_tree_prompt_auto / answer_tree_prompt_current が文脈つき prompt を生成
  ↓
LLM が回答
  ↓
message.updated event または answer_tree_attach_last で回答を捕捉
  ↓
src/core が root node または child node を作成
  ↓
.answer-tree/opencode-state.json に保存
  ↓
右側 sidebar が現在 session の tree を表示
```

保存先はプロジェクト内のローカルファイルです。

```text
.answer-tree/opencode-state.json
```

CLI 用の状態ファイルは分けています。

```text
.answer-tree/state.json
```

OpenCode plugin の実データと CLI demo のデータが混ざらないようにするためです。

## 現在の制限

Version 1.0 は、研究室内の demo や個人開発の検証に使える段階です。

一方で、一般ユーザー向けに配布するには、まだ次のような改善余地があります。

- npm package として簡単に入れられる形にする
- 既存の OpenCode により自然に組み込めるようにする
- 親ノード推定をさらに賢くする
- ツリー編集 UI を強化する
- 長期利用時の session 管理を改善する

現時点では、リポジトリを clone して `npm run opencode` で起動する single-repository version です。

## 検証

動作確認は次のコマンドで行いました。

```bash
npm run validate
```

このコマンドでは、main project tests、CLI / TUI smoke test、OpenCode host typecheck をまとめて実行します。

現在の Version 1.0 では、26 件のテストが通り、OpenCode host の typecheck も通っています。

## まとめ

OpenCode に Answer Tree sidebar を追加し、LLM の長い回答と深掘り質問をツリーとして整理できるようにしました。

LLM との会話は、単なる時系列ログとして見るよりも、「どの回答から、どの質問が生まれたのか」を見える形にした方が扱いやすくなります。

特に、技術調査、設計相談、論文読み、コードレビューのように、1つの回答から何度も深掘りする作業では、ツリー構造がかなり有効だと感じました。

Version 1.0 では、OpenCode plugin、右側 sidebar、CLI、TUI、Markdown export、検証コマンドまでを1つのリポジトリにまとめました。

改善案や修正案があれば、GitHub で fork して Pull Request を送っていただけると嬉しいです。内容を確認したうえで、取り込めるものは merge していきたいと思います。

## 参考リンク

- GitHub repository: https://github.com/linqichenggg/opencode-answer-tree
- OpenCode: https://opencode.ai/
- Qiita Markdown: https://help.qiita.com/ja/articles/qiita-markdown
