// Every test run gets its own agent directory, so no test can write
// sessions, credentials or settings into the real one of the person
// running the suite. A test that needs a specific directory still sets
// PI_CODING_AGENT_DIR itself.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const agentDir = mkdtempSync(join(tmpdir(), "reeve-test-agent-"));
process.env.PI_CODING_AGENT_DIR = agentDir;
process.on("exit", () => {
  rmSync(agentDir, { recursive: true, force: true });
});
