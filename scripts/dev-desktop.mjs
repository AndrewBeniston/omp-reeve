#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const devUrl = "http://127.0.0.1:30141";
let stopped = false;

function terminate(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(devUrl, { redirect: "manual" });
      if (response.status > 0) return;
    } catch {}
    await Bun.sleep(250);
  }
  throw new Error("development server did not answer within 60 seconds");
}

const server = spawn("bun", ["run", "dev"], {
  cwd: root,
  detached: process.platform !== "win32",
  stdio: "inherit",
});

function stop(exitCode = 0) {
  if (stopped) return;
  stopped = true;
  terminate(server);
  process.exit(exitCode);
}

process.on("SIGINT", () => stop(130));
process.on("SIGTERM", () => stop(143));

try {
  await waitForServer();
} catch (error) {
  console.error(`[desktop-dev] ${error.message}`);
  stop(1);
}

const electron = spawn(join(root, "node_modules", ".bin", "electron"), ["desktop"], {
  cwd: root,
  env: { ...process.env, OMP_WEB_DESKTOP_DEV_URL: devUrl },
  stdio: "inherit",
});

electron.on("exit", (code) => stop(code ?? 0));
electron.on("error", (error) => {
  console.error(`[desktop-dev] ${error.message}`);
  stop(1);
});
