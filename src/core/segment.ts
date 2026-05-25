import type { Segment } from "./types.js";
import { stableShortHash } from "./id.js";

export type SegmentOptions = {
  maxChars?: number;
};

const DEFAULT_MAX_CHARS = 1200;

export function segmentAnswer(content: string, options: SegmentOptions = {}): Segment[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;

  for (const block of blocks.length ? blocks : [normalized]) {
    if (block.length <= maxChars) {
      chunks.push(block);
      continue;
    }

    for (const sentenceChunk of splitLongBlock(block, maxChars)) {
      chunks.push(sentenceChunk);
    }
  }

  let cursor = 0;
  return chunks.map((chunk, offset) => {
    const charStart = normalized.indexOf(chunk, cursor);
    const start = charStart === -1 ? cursor : charStart;
    const end = start + chunk.length;
    cursor = end;

    return {
      id: `seg_${offset + 1}_${stableShortHash(chunk)}`,
      index: offset + 1,
      content: chunk,
      charStart: start,
      charEnd: end,
    };
  });
}

function splitLongBlock(block: string, maxChars: number): string[] {
  const sentences = block.split(/(?<=[.!?。！？])\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (!sentence) continue;
    if ((current + " " + sentence).trim().length <= maxChars) {
      current = (current + " " + sentence).trim();
      continue;
    }
    if (current) chunks.push(current);
    if (sentence.length <= maxChars) {
      current = sentence;
      continue;
    }
    chunks.push(...splitByLength(sentence, maxChars));
    current = "";
  }

  if (current) chunks.push(current);
  return chunks;
}

function splitByLength(input: string, maxChars: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < input.length; i += maxChars) {
    chunks.push(input.slice(i, i + maxChars));
  }
  return chunks;
}
