import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { InternalTuiPlugin } from "../../plugin/internal"
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import path from "path"
import { readFileSync, writeFileSync } from "fs"

const id = "internal:sidebar-answer-tree"
const answerTreeMode = "answer-tree"

type AnswerNode = {
  id: string
  title: string
  content?: string
  segments?: unknown[]
  parentQuestion?: string | null
  parentId?: string | null
  children?: string[]
  metadata?: Record<string, unknown>
}

type AnswerTreeState = {
  activeNodeId?: string | null
  nodes?: Record<string, AnswerNode>
  sessions?: Record<string, { activeNodeId?: string | null; lastQuestionId?: string | null }>
}

type LoadedState = {
  state: AnswerTreeState
  file: string
}

type TreeLine = {
  id: string
  depth: number
  number: string
  prefix: string
  title: string
  path: string[]
  segmentCount: number
  active: boolean
  parentQuestion?: string | null
  opencodeMessageId?: string
  contentPreview?: string
}

function truncate(value: string, max: number): string {
  const chars = Array.from(value)
  if (chars.length <= max) return value
  return chars.slice(0, Math.max(0, max - 1)).join("") + "…"
}

function candidateDirectories(directory: string | undefined): string[] {
  return Array.from(
    new Set(
      [directory, process.env.PWD, process.env.INIT_CWD, process.cwd()].filter((value): value is string =>
        Boolean(value),
      ),
    ),
  )
}

function loadState(directory: string | undefined): LoadedState | undefined {
  for (const candidate of candidateDirectories(directory)) {
    const file = path.join(candidate, ".answer-tree", "opencode-state.json")
    try {
      return {
        state: JSON.parse(readFileSync(file, "utf8")) as AnswerTreeState,
        file,
      }
    } catch {
      continue
    }
  }
  return
}

function saveActiveNode(directory: string | undefined, nodeID: string, sessionID: string | undefined): boolean {
  const loaded = loadState(directory)
  if (!loaded) return false
  if (!loaded.state.nodes?.[nodeID]) return false
  loaded.state.activeNodeId = nodeID
  if (sessionID) {
    loaded.state.sessions ??= {}
    loaded.state.sessions[sessionID] ??= { activeNodeId: null, lastQuestionId: null }
    loaded.state.sessions[sessionID].activeNodeId = nodeID
  }
  writeFileSync(loaded.file, JSON.stringify(loaded.state, null, 2) + "\n")
  return true
}

function nodeSessionID(node: AnswerNode): string | undefined {
  const value = node.metadata?.opencodeSessionId
  return typeof value === "string" ? value : undefined
}

function nodeMessageID(node: AnswerNode): string | undefined {
  const value = node.metadata?.opencodeMessageId
  return typeof value === "string" ? value : undefined
}

function contentPreview(node: AnswerNode): string | undefined {
  const value = node.content?.trim()
  if (!value) return
  return value.slice(0, 240)
}

function requestSessionScroll(line: TreeLine | undefined, sessionID: string | undefined) {
  if (!line || !sessionID) return
  const target = (globalThis as unknown as {
    __answerTreeScrollToMessage?: (input: {
      sessionID: string
      nodeID: string
      messageID?: string
      title: string
      contentPreview?: string
    }) => void
  }).__answerTreeScrollToMessage
  target?.({
    sessionID,
    nodeID: line.id,
    messageID: line.opencodeMessageId,
    title: line.title,
    contentPreview: line.contentPreview,
  })
}

function treeLines(state: AnswerTreeState | undefined, sessionID: string | undefined): TreeLine[] {
  if (!state?.nodes) return []
  const nodes = state.nodes
  const activeNodeId = sessionID ? state.sessions?.[sessionID]?.activeNodeId : state.activeNodeId
  const parentByChild = new Map<string, string>()
  for (const node of Object.values(nodes)) {
    for (const childID of node.children ?? []) parentByChild.set(childID, node.id)
  }
  const included = new Set<string>()

  if (sessionID) {
    for (const node of Object.values(nodes)) {
      if (nodeSessionID(node) !== sessionID) continue

      let current: AnswerNode | undefined = node
      while (current && !included.has(current.id)) {
        included.add(current.id)
        const parentID: string | undefined = current.parentId ?? parentByChild.get(current.id)
        current = parentID ? nodes[parentID] : undefined
      }
    }
  } else {
    for (const node of Object.values(nodes)) included.add(node.id)
  }

  const roots = Object.values(nodes).filter((node) => {
    if (!included.has(node.id)) return false
    const parentID: string | undefined = node.parentId ?? parentByChild.get(node.id)
    return !parentID || !included.has(parentID)
  })
  const lines: TreeLine[] = []

  function visit(
    node: AnswerNode,
    depth: number,
    branchParts: boolean[],
    isLast: boolean,
    pathTitles: string[],
    number: string,
  ) {
    const prefix =
      depth === 0
        ? ""
        : branchParts.map((partIsLast) => (partIsLast ? "   " : "│  ")).join("") + (isLast ? "└─ " : "├─ ")
    const numberedTitle = `${number} ${node.title}`
    const path = [...pathTitles, numberedTitle]
    lines.push({
      id: node.id,
      depth,
      number,
      prefix,
      title: node.title,
      path,
      segmentCount: node.segments?.length ?? 0,
      active: activeNodeId === node.id,
      parentQuestion: node.parentQuestion,
      opencodeMessageId: nodeMessageID(node),
      contentPreview: contentPreview(node),
    })
    const childIDs = (node.children ?? []).filter((childID) => included.has(childID))
    childIDs.forEach((childID, index) => {
      const child = nodes[childID]
      if (child) {
        visit(child, depth + 1, [...branchParts, isLast], index === childIDs.length - 1, path, `${number}.${index + 1}`)
      }
    })
  }

  roots.forEach((root, index) => visit(root, 0, [], index === roots.length - 1, [], String(index + 1)))
  return lines
}

function legacyNodeCount(state: AnswerTreeState | undefined): number {
  if (!state?.nodes) return 0
  return Object.values(state.nodes).filter((node) => !nodeSessionID(node)).length
}

function clampIndex(value: number, length: number): number {
  if (length <= 0) return 0
  return (value + length) % length
}

function selectedIndex(lines: TreeLine[], selectedNodeId: string | undefined): number {
  if (!lines.length) return -1
  const index = selectedNodeId ? lines.findIndex((line) => line.id === selectedNodeId) : -1
  if (index >= 0) return index
  const activeIndex = lines.findIndex((line) => line.active)
  return activeIndex >= 0 ? activeIndex : 0
}

function View(props: {
  api: TuiPluginApi
  session_id: string
  selectedNodeId: () => string | undefined
  setSelectedNodeId: (value: string | undefined) => void
  refresh: () => number
  bumpRefresh: () => void
  modeActive: () => boolean
}) {
  const [open, setOpen] = createSignal(true)
  const theme = () => props.api.theme.current
  const directory = createMemo(() => props.api.state.path.directory || process.cwd())
  const loaded = createMemo(() => {
    props.refresh()
    return loadState(directory())
  })
  const state = createMemo(() => loaded()?.state)
  const lines = createMemo(() => treeLines(state(), props.session_id))
  const nodeCount = createMemo(() => lines().length)
  const currentSelectedIndex = createMemo(() => selectedIndex(lines(), props.selectedNodeId()))
  const currentSelectedNodeId = createMemo(() => lines()[currentSelectedIndex()]?.id)
  const currentSelectedLine = createMemo(() => lines()[currentSelectedIndex()])
  const activeLine = createMemo(() => lines().find((line) => line.active))
  const titleMax = (line: TreeLine) => Math.max(10, 31 - Array.from(`${line.prefix}${line.number} `).length)
  let lastSyncedActiveNodeId: string | undefined

  createEffect(() => {
    const timer = setInterval(props.bumpRefresh, 1000)
    onCleanup(() => clearInterval(timer))
  })

  createEffect(() => {
    const activeNodeId = activeLine()?.id
    if (!activeNodeId || activeNodeId === lastSyncedActiveNodeId) return
    lastSyncedActiveNodeId = activeNodeId
    props.setSelectedNodeId(activeNodeId)
    requestSessionScroll(activeLine(), props.session_id)
  })

  return (
    <box>
      <box flexDirection="row" gap={1} onMouseDown={() => setOpen((value) => !value)}>
        <text fg={theme().text}>{open() ? "▼" : "▶"}</text>
        <text fg={props.modeActive() ? theme().primary : theme().text}>
          <b>Answer Tree</b>
        </text>
        <Show when={nodeCount() > 0}>
          <text fg={theme().textMuted}>{nodeCount()}</text>
        </Show>
        <text fg={theme().textMuted} onMouseDown={props.bumpRefresh}>
          refresh
        </text>
      </box>
      <Show when={open()}>
        <Show
          when={lines().length > 0}
          fallback={
            <box>
              <text fg={theme().textMuted} wrapMode="none">
                No session tree yet
              </text>
              <Show when={legacyNodeCount(state()) > 0}>
                <text fg={theme().textMuted} wrapMode="none">
                  Legacy project nodes: {legacyNodeCount(state())}
                </text>
              </Show>
            </box>
          }
        >
          <Show
            when={props.modeActive()}
            fallback={
              <text fg={theme().textMuted} wrapMode="none">
                ^xz focus
              </text>
            }
          >
            <text fg={theme().textMuted} wrapMode="none">
              j/k move enter use r refresh esc back
            </text>
          </Show>
          <For each={lines()}>
            {(line) => (
              <text
                fg={
                  currentSelectedNodeId() === line.id
                    ? theme().text
                    : line.active
                      ? theme().primary
                      : theme().textMuted
                }
                wrapMode="none"
                onMouseDown={() => {
                  props.setSelectedNodeId(line.id)
                  requestSessionScroll(line, props.session_id)
                }}
              >
                {currentSelectedNodeId() === line.id ? "> " : line.active ? "* " : "  "}
                {line.prefix}
                {line.number}{" "}
                {truncate(line.title, titleMax(line))}
              </text>
            )}
          </For>
          <Show when={activeLine()}>
            {(line) => (
              <box marginTop={1}>
                <text fg={theme().textMuted} wrapMode="none">
                  Active context
                </text>
                <text fg={theme().primary}>
                  {line().path.join(" > ")}
                </text>
              </box>
            )}
          </Show>
          <Show when={currentSelectedLine()}>
            {(line) => (
              <box marginTop={1}>
                <text fg={theme().textMuted} wrapMode="none">
                  Selected
                </text>
                <text fg={theme().text} wrapMode="none">
                  {line().number} {truncate(line().title, 34)}
                </text>
                <text fg={theme().textMuted} wrapMode="none">
                  id: {line().id}
                </text>
                <text fg={theme().textMuted} wrapMode="none">
                  segments: {line().segmentCount}
                </text>
                <Show when={line().parentQuestion}>
                  <text fg={theme().textMuted}>question: {line().parentQuestion}</text>
                </Show>
              </box>
            )}
          </Show>
        </Show>
      </Show>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  const [selectedNodeId, setSelectedNodeId] = createSignal<string | undefined>()
  const [refresh, setRefresh] = createSignal(0)
  const [modeActive, setModeActive] = createSignal(false)
  let leaveMode: (() => void) | undefined
  const directory = () => api.state.path.directory || process.cwd()
  let currentSessionID: string | undefined
  const bumpRefresh = () => setRefresh((value) => value + 1)
  const currentLines = () => treeLines(loadState(directory())?.state, currentSessionID)
  const selectRelative = (delta: number) => {
    const lines = currentLines()
    if (!lines.length) return
    const next = lines[clampIndex(selectedIndex(lines, selectedNodeId()) + delta, lines.length)]
    setSelectedNodeId(next?.id)
    requestSessionScroll(next, currentSessionID)
    bumpRefresh()
  }
  const useSelected = () => {
    const lines = currentLines()
    const nodeID = selectedNodeId() ?? lines[selectedIndex(lines, selectedNodeId())]?.id
    if (!nodeID) return
    const line = lines.find((item) => item.id === nodeID)
    const ok = saveActiveNode(directory(), nodeID, currentSessionID)
    if (ok) {
      requestSessionScroll(line, currentSessionID)
      api.ui.toast({
        title: "Answer Tree",
        message: `Active node: ${line?.number ? `${line.number} ` : ""}${nodeID}`,
      })
      bumpRefresh()
    } else {
      api.ui.toast({
        title: "Answer Tree",
        message: "Could not update active node",
        variant: "error",
      })
    }
  }
  const enterMode = () => {
    if (modeActive()) return
    const lines = currentLines()
    if (lines.length > 0 && !selectedNodeId()) {
      const line = lines[selectedIndex(lines, selectedNodeId())]
      setSelectedNodeId(line?.id)
      requestSessionScroll(line, currentSessionID)
    }
    leaveMode = api.mode.push(answerTreeMode)
    setModeActive(true)
    bumpRefresh()
  }
  const exitMode = () => {
    leaveMode?.()
    leaveMode = undefined
    setModeActive(false)
    bumpRefresh()
  }

  api.keymap.registerLayer({
    commands: [
      {
        name: "answer-tree.focus",
        title: "Answer Tree: Focus panel",
        category: "Answer Tree",
        namespace: "palette",
        enabled: () => api.route.current.name === "session",
        run() {
          enterMode()
          api.ui.dialog.clear()
        },
      },
      {
        name: "answer-tree.blur",
        title: "Answer Tree: Return to chat",
        category: "Answer Tree",
        hidden: true,
        run() {
          exitMode()
        },
      },
      {
        name: "answer-tree.select.previous",
        title: "Answer Tree: Select previous node",
        category: "Answer Tree",
        namespace: "palette",
        enabled: () => api.route.current.name === "session" && currentLines().length > 0,
        run() {
          selectRelative(-1)
          api.ui.dialog.clear()
        },
      },
      {
        name: "answer-tree.select.next",
        title: "Answer Tree: Select next node",
        category: "Answer Tree",
        namespace: "palette",
        enabled: () => api.route.current.name === "session" && currentLines().length > 0,
        run() {
          selectRelative(1)
          api.ui.dialog.clear()
        },
      },
      {
        name: "answer-tree.use.selected",
        title: "Answer Tree: Use selected node",
        category: "Answer Tree",
        namespace: "palette",
        enabled: () => api.route.current.name === "session" && currentLines().length > 0,
        run() {
          useSelected()
          api.ui.dialog.clear()
        },
      },
      {
        name: "answer-tree.refresh",
        title: "Answer Tree: Refresh",
        category: "Answer Tree",
        namespace: "palette",
        enabled: () => api.route.current.name === "session",
        run() {
          bumpRefresh()
          api.ui.dialog.clear()
        },
      },
    ],
    bindings: [{ key: "<leader>z", cmd: "answer-tree.focus", desc: "Focus Answer Tree" }],
  })

  api.keymap.registerLayer({
    mode: answerTreeMode,
    bindings: [
      { key: "k,up", cmd: "answer-tree.select.previous", desc: "Select previous Answer Tree node" },
      { key: "j,down", cmd: "answer-tree.select.next", desc: "Select next Answer Tree node" },
      { key: "enter", cmd: "answer-tree.use.selected", desc: "Use selected Answer Tree node" },
      { key: "r", cmd: "answer-tree.refresh", desc: "Refresh Answer Tree" },
      { key: "escape,q", cmd: "answer-tree.blur", desc: "Return to chat" },
    ],
  })

  api.slots.register({
    order: 450,
    slots: {
      sidebar_content(_ctx, props) {
        currentSessionID = props.session_id
        return (
          <View
            api={api}
            session_id={props.session_id}
            selectedNodeId={selectedNodeId}
            setSelectedNodeId={setSelectedNodeId}
            refresh={refresh}
            bumpRefresh={bumpRefresh}
            modeActive={modeActive}
          />
        )
      },
    },
  })
}

const plugin: InternalTuiPlugin = {
  id,
  tui,
}

export default plugin
