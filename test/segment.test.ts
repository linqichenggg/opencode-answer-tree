import { test } from "node:test";
import assert from "node:assert/strict";
import { segmentAnswer } from "../src/index.js";

test("segmentAnswer splits paragraphs and preserves order", () => {
  const segments = segmentAnswer("第一段内容。\n\n第二段内容。\n\n第三段内容。");

  assert.equal(segments.length, 3);
  assert.equal(segments[0].index, 1);
  assert.equal(segments[1].content, "第二段内容。");
  assert.match(segments[2].id, /^seg_3_/);
});

test("segmentAnswer chunks long text", () => {
  const long = "a".repeat(2500);
  const segments = segmentAnswer(long, { maxChars: 1000 });

  assert.equal(segments.length, 3);
  assert.equal(segments[0].content.length, 1000);
  assert.equal(segments[2].content.length, 500);
});
