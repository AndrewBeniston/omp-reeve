import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const { messageOrigin } = await createJiti(import.meta.url).import("./message-origin.ts");

test("maps a persisted hookMessage to hook feedback", () => {
  assert.deepEqual(messageOrigin({
    role: "hookMessage",
    customType: "hook-feedback",
    content: "The hook added feedback.",
    display: true,
  }), "hook-feedback");
});

test("maps a live-delegation custom message to the live voice model", () => {
  assert.deepEqual(messageOrigin({
    role: "custom",
    customType: "live-delegation",
    content: "Handle this request.",
    display: true,
    details: { appName: "Nexus" },
  }), "live-delegation");
});

test("does not map an unknown custom message", () => {
  assert.equal(messageOrigin({
    role: "custom",
    customType: "extension_debug",
    content: "Keep this message.",
    display: true,
  }), null);
});

test("does not expose a hidden hook message", () => {
  assert.equal(messageOrigin({
    role: "hookMessage",
    customType: "hook-feedback",
    content: "Hidden hook context.",
    display: false,
  }), null);
});
