import { createHash, randomUUID } from "node:crypto";

export function makeId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

export function stableShortHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 10);
}
