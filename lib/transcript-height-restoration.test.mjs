import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { captureHeightRestoration, resolveHeightRestoration } = await jiti.import("./transcript-height-restoration.ts");

test("an existing Turn grows without moving the reader from the transcript end", () => {
  const element = {};
  const record = captureHeightRestoration(element, 120, {
    scrollHeight: 1200,
    clientHeight: 400,
    scrollTop: 500,
  });

  assert.equal(resolveHeightRestoration(record, element, 180, {
    scrollHeight: 1260,
    clientHeight: 400,
    scrollTop: 500,
  }), 560);
});

test("a replacement Turn cannot use the previous Turn's restoration record", () => {
  const record = captureHeightRestoration({}, 120, {
    scrollHeight: 1200,
    clientHeight: 400,
    scrollTop: 500,
  });

  assert.equal(resolveHeightRestoration(record, {}, 180, {
    scrollHeight: 1260,
    clientHeight: 400,
    scrollTop: 500,
  }), null);
});

test("an unchanged Turn height discards the restoration record", () => {
  const element = {};
  const record = captureHeightRestoration(element, 120, {
    scrollHeight: 1200,
    clientHeight: 400,
    scrollTop: 500,
  });

  assert.equal(resolveHeightRestoration(record, element, 120, {
    scrollHeight: 1260,
    clientHeight: 400,
    scrollTop: 500,
  }), null);
});

test("a Turn height change cannot restore when the transcript height stays equal", () => {
  const element = {};
  const record = captureHeightRestoration(element, 120, {
    scrollHeight: 1200,
    clientHeight: 400,
    scrollTop: 500,
  });

  assert.equal(resolveHeightRestoration(record, element, 180, {
    scrollHeight: 1200,
    clientHeight: 400,
    scrollTop: 500,
  }), null);
});
