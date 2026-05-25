import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AnswerTreeState } from "./types.js";
import { AnswerTree, createEmptyState } from "./tree.js";

export const DEFAULT_STORE_DIR = ".answer-tree";
export const DEFAULT_STORE_FILE = "state.json";
export const OPENCODE_STORE_FILE = "opencode-state.json";

export function resolveStorePath(cwd: string, file = DEFAULT_STORE_FILE): string {
  return join(cwd, DEFAULT_STORE_DIR, file);
}

export function resolveNamedStorePath(cwd: string, store?: string): string {
  if (!store || store === "default" || store === "cli") {
    return resolveStorePath(cwd);
  }
  if (store === "opencode") {
    return resolveStorePath(cwd, OPENCODE_STORE_FILE);
  }
  return store;
}

export async function loadTree(storePath: string): Promise<AnswerTree> {
  try {
    const raw = await readFile(storePath, "utf8");
    return new AnswerTree(JSON.parse(raw) as AnswerTreeState);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return new AnswerTree(createEmptyState());
    }
    throw error;
  }
}

export async function saveTree(storePath: string, tree: AnswerTree): Promise<void> {
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(tree.state, null, 2)}\n`, "utf8");
}
