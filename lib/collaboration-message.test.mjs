import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { applyCollaborationSnapshot } = await jiti.import("./collaboration-message.ts");

const active = {
  active: true,
  mode: "write",
  browserUrl: "https://my.omp.sh/#write",
  viewBrowserUrl: "https://my.omp.sh/#view",
  participants: [{ name: "andrew", role: "host" }],
};

test("appends one collaboration card and updates it in place", () => {
  const original = [{ role: "user", content: "hello", timestamp: 1 }];
  const appended = applyCollaborationSnapshot(original, active, {
    appendIfMissing: true,
    message: "Collaboration session started",
  });
  assert.equal(appended.length, 2);
  assert.equal(appended[1].customType, "collaboration");

  const updated = applyCollaborationSnapshot(appended, {
    ...active,
    participants: [...active.participants, { name: "guest", role: "guest" }],
  });
  assert.equal(updated.length, 2);
  assert.equal(updated[1].details.participants.length, 2);
});

test("does not create a stopped card when no card exists", () => {
  const messages = [{ role: "user", content: "hello", timestamp: 1 }];
  const result = applyCollaborationSnapshot(messages, {
    active: false,
    mode: "write",
    participants: [],
  });
  assert.equal(result, messages);
});
