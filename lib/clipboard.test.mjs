import assert from "node:assert/strict";
import test from "node:test";
import { copyText, copyTextOrFail } from "./clipboard.ts";

/*
 * One check, for the one thing that matters here: a refused copy must not come
 * back looking like a successful one. A control that says "Copied" when the
 * clipboard said no sends somebody off to paste something else entirely.
 */

async function withGlobals(values, run) {
  const saved = new Map();
  for (const [name, value] of Object.entries(values)) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  try {
    // Awaited, or the globals would be put back before the body that needs
    // them has run.
    return await run();
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

/** A document whose clipboard command refuses, the way a real one refuses. */
function refusingDocument() {
  const area = { value: "", style: {}, select() {} };
  return {
    createElement: () => area,
    body: { appendChild() {}, removeChild() {} },
    execCommand: () => false,
  };
}

/** A document whose clipboard command accepts, and keeps what it was given. */
function acceptingDocument(copied) {
  const area = { value: "", style: {}, select() {} };
  return {
    createElement: () => area,
    body: { appendChild() {}, removeChild() {} },
    execCommand: () => {
      copied.push(area.value);
      return true;
    },
  };
}

test("a refused clipboard API falls back to the document, and the copy happens", async () => {
  // The Electron shell denies clipboard-write to the renderer, so writeText
  // exists and rejects. Returning early on the API meant the fallback below it
  // never ran, and every Copy control in the desktop application failed.
  const copied = [];
  const denying = { clipboard: { writeText: () => Promise.reject(new Error("Denied")) } };
  await withGlobals({ navigator: denying, document: acceptingDocument(copied) }, async () => {
    await copyTextOrFail("some text");
    await copyText("more text");
  });
  assert.deepEqual(copied, ["some text", "more text"]);
});

test("a clipboard that refuses is reported as a refusal, not as a copy", async () => {
  // Both paths refused. Only then is the copy a refusal, and the reason the
  // API gave is kept as the cause.
  const denying = { clipboard: { writeText: () => Promise.reject(new Error("Denied")) } };
  await withGlobals({ navigator: denying, document: refusingDocument() }, async () => {
    await assert.rejects(() => copyTextOrFail("some text"), (error) => {
      assert.match(error.message, /refused/);
      assert.match(error.cause.message, /Denied/);
      return true;
    });
  });

  // The fallback refuses by returning false rather than by throwing, which is
  // the case that used to be read as success.
  await withGlobals({ navigator: {}, document: refusingDocument() }, async () => {
    await assert.rejects(() => copyTextOrFail("some text"), /refused/);
    // The older contract is deliberately unchanged: callers that never catch
    // it must not start seeing rejections.
    await copyText("some text");
  });
});
