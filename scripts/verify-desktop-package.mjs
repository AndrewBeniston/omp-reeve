#!/usr/bin/env bun

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";

import { readDesktopTargetArgs, resolvePackagedApplication } from "./desktop-targets.mjs";

const require = createRequire(import.meta.url);
const { DESKTOP_PORT } = require("../desktop/desktop-runtime.cjs");
const root = join(import.meta.dir, "..");
const desktopLog = join(tmpdir(), "omp-desktop.log");
const desktopOrigin = `http://127.0.0.1:${DESKTOP_PORT}`;
const fixtureSessionId = "00000000-0000-4000-8000-000000000001";
const timeoutMs = 90_000;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function executablePath(application) {
  if (process.platform === "darwin") return join(application, "Contents", "MacOS", "Reeve");
  return application;
}

function resourcesPath(application) {
  if (process.platform === "darwin") return join(application, "Contents", "Resources");
  return join(application, "..", "resources");
}

function snapshotTree(directory) {
  const snapshot = [];
  const visit = (path) => {
    const stats = lstatSync(path);
    const item = {
      path: relative(directory, path),
      mode: stats.mode,
      modified: stats.mtimeMs,
      size: stats.size,
      type: stats.isDirectory() ? "directory" : stats.isSymbolicLink() ? "link" : "file",
    };
    if (stats.isSymbolicLink()) item.target = readlinkSync(path);
    snapshot.push(item);
    if (!stats.isDirectory()) return;
    for (const entry of readdirSync(path).sort()) visit(join(path, entry));
  };
  visit(directory);
  return snapshot;
}

// Next writes the build directory into the server bundle. A package built from
// a home directory therefore carries the name of the person who built it, and
// this repository is public. The release build runs from a neutral path, and
// this check is what proves it, on every build rather than from memory.
const PERSONAL_PATH_PATTERNS = [
  // The leading separator or drive letter is required. Reeve serves a route at
  // /api/home, and the bundle names it, so a bare "/home/" matches the product
  // and not a person.
  { name: "a macOS home directory", pattern: /(?:^|[^A-Za-z0-9])\/Users\/[A-Za-z0-9._-]+/ },
  { name: "a Linux home directory", pattern: /(?:^|[^A-Za-z0-9])\/home\/[A-Za-z0-9._-]+\// },
  // One backslash or two. A JavaScript string escapes it, a manifest may not.
  { name: "a Windows home directory", pattern: /[A-Za-z]:\\{1,2}Users\\{1,2}[A-Za-z0-9._-]+/ },
];

function findPersonalPaths(directory) {
  const findings = [];
  const visit = (path) => {
    const stats = lstatSync(path);
    if (stats.isDirectory()) {
      for (const entry of readdirSync(path).sort()) visit(join(path, entry));
      return;
    }
    if (stats.isSymbolicLink() || stats.size > 8_000_000) return;
    let contents;
    try {
      contents = readFileSync(path, "utf8");
    } catch {
      return;
    }
    for (const { name, pattern } of PERSONAL_PATH_PATTERNS) {
      const match = pattern.exec(contents);
      if (match) findings.push(`${relative(directory, path)} carries ${name}`);
    }
  };
  visit(directory);
  return findings;
}

function writeFixture(agentDirectory, fixtureDirectory) {
  const sessionDirectory = join(agentDirectory, "sessions", "-desktop-package-fixture");
  mkdirSync(sessionDirectory, { recursive: true });
  mkdirSync(fixtureDirectory, { recursive: true });
  const timestamp = "2026-01-01T00:00:00.000Z";
  const session = [
    {
      type: "session",
      version: 3,
      id: fixtureSessionId,
      timestamp,
      cwd: fixtureDirectory,
    },
    {
      type: "message",
      id: "fixture1",
      parentId: null,
      timestamp,
      message: { role: "user", content: "Desktop package verification fixture" },
    },
  ];
  const file = join(sessionDirectory, `${timestamp.replaceAll(":", "-")}_${fixtureSessionId}.jsonl`);
  writeFileSync(file, `${session.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
}

function appendedLog(start) {
  if (!existsSync(desktopLog)) return "";
  const content = readFileSync(desktopLog);
  return content.subarray(Math.min(start, content.length)).toString("utf8");
}

async function waitForOrigin(logStart, applicationProcess) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = appendedLog(logStart).match(
      /bundled server ready on (http:\/\/127\.0\.0\.1:\d+)/,
    );
    if (match && match[1] !== desktopOrigin) {
      throw new Error(`The packaged application used unstable origin ${match[1]}.`);
    }
    if (match) return desktopOrigin;
    if (applicationProcess.launchError) throw applicationProcess.launchError;
    if (applicationProcess.exitCode !== null || applicationProcess.signalCode !== null) {
      throw new Error(
        `The packaged application exited with code ${applicationProcess.exitCode} and signal ${applicationProcess.signalCode}.`,
      );
    }
    await wait(250);
  }
  throw new Error("The packaged application did not report a stable desktop HTTP origin.");
}

async function verifySessions(origin) {
  const response = await fetch(`${origin}/api/sessions`);
  if (!response.ok) throw new Error(`The fixture Sessions API returned HTTP ${response.status}.`);
  const payload = await response.json();
  if (!Array.isArray(payload.sessions)) throw new Error("The fixture Sessions API returned no Session list.");
  const fixture = payload.sessions.find((session) => session.id === fixtureSessionId);
  if (!fixture) throw new Error("The fixture Sessions API did not return the fixture Session.");
}

async function waitForWindow(logStart, origin, applicationProcess) {
  const deadline = Date.now() + timeoutMs;
  const marker = `[omp-desktop] window loaded ${origin}`;
  while (Date.now() < deadline) {
    if (appendedLog(logStart).includes(marker)) return;
    if (applicationProcess.launchError) throw applicationProcess.launchError;
    if (applicationProcess.exitCode !== null || applicationProcess.signalCode !== null) {
      throw new Error("The packaged application exited before its window loaded.");
    }
    await wait(250);
  }
  throw new Error("The packaged application window did not finish loading.");
}

function portIsOpen(origin) {
  const { hostname, port } = new URL(origin);
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: hostname, port: Number(port) });
    socket.setTimeout(1_000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    const closed = () => {
      socket.destroy();
      resolve(false);
    };
    socket.once("error", closed);
    socket.once("timeout", closed);
  });
}

async function waitForClosedPort(origin) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (!(await portIsOpen(origin))) return;
    await wait(250);
  }
  throw new Error(`The packaged Bun server still uses ${origin}.`);
}

function applicationTreeIsRunning(applicationProcess) {
  if (!applicationProcess.pid) return false;
  if (process.platform === "win32") {
    return applicationProcess.exitCode === null && applicationProcess.signalCode === null;
  }
  try {
    process.kill(-applicationProcess.pid, 0);
    return true;
  } catch (error) {
    // ESRCH: the group is gone. EPERM: a leftover helper in the group belongs
    // to another user (seen on the macOS x64 runner after a notarized launch);
    // nothing in it is ours to wait for.
    if (error.code === "ESRCH" || error.code === "EPERM") return false;
    throw error;
  }
}

function signalApplicationTree(applicationProcess, signal) {
  if (!applicationProcess.pid) return;
  if (process.platform === "win32") {
    applicationProcess.kill(signal);
    return;
  }
  try {
    process.kill(-applicationProcess.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH" && error.code !== "EPERM") throw error;
  }
}

async function waitForApplicationTreeExit(applicationProcess, milliseconds) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (!applicationTreeIsRunning(applicationProcess)) return true;
    await wait(100);
  }
  return !applicationTreeIsRunning(applicationProcess);
}

async function terminateApplication(applicationProcess) {
  signalApplicationTree(applicationProcess, "SIGTERM");
  if (await waitForApplicationTreeExit(applicationProcess, 15_000)) return;
  signalApplicationTree(applicationProcess, "SIGKILL");
  if (!(await waitForApplicationTreeExit(applicationProcess, 5_000))) {
    throw new Error("The packaged application process tree did not terminate.");
  }
}

async function verifyPackage() {
  if (await portIsOpen(desktopOrigin)) {
    throw new Error(`Another process already uses ${desktopOrigin}.`);
  }
  const { plan } = readDesktopTargetArgs(process.argv.slice(2));
  const application = resolvePackagedApplication(plan, { root });
  const resources = resourcesPath(application);
  const beforeResources = snapshotTree(resources);

  const personalPaths = findPersonalPaths(join(resources, "server", ".next"));
  if (personalPaths.length > 0) {
    throw new Error(
      `The package carries a personal build path. Build from a neutral directory.\n${personalPaths.slice(0, 10).join("\n")}`,
    );
  }
  const temporaryRoot = mkdtempSync(join(tmpdir(), "omp-desktop-package-"));
  const agentDirectory = join(temporaryRoot, "agent");
  const fixtureDirectory = join(temporaryRoot, "fixture-project");
  const authPath = join(temporaryRoot, "web-auth.json");
  const userData = join(temporaryRoot, "electron-user-data");
  writeFixture(agentDirectory, fixtureDirectory);
  mkdirSync(userData, { recursive: true });

  const logStart = existsSync(desktopLog) ? statSync(desktopLog).size : 0;
  const environment = {
    ...process.env,
    PI_CODING_AGENT_DIR: agentDirectory,
    OMP_WEB_AUTH_FILE: authPath,
    OMP_WEB_DISABLE_SELF_UPDATE: "1",
  };
  delete environment.OMP_WEB_PASSWORD;
  delete environment.OMP_PROFILE;
  delete environment.PI_PROFILE;

  const applicationProcess = spawn(
    executablePath(application),
    [`--user-data-dir=${userData}`],
    {
      detached: process.platform !== "win32",
      env: environment,
      stdio: "ignore",
    },
  );
  applicationProcess.launchError = undefined;
  applicationProcess.once("error", (error) => {
    applicationProcess.launchError = error;
  });
  let origin;
  let verificationError;
  try {
    origin = await waitForOrigin(logStart, applicationProcess);
    await verifySessions(origin);
    await waitForWindow(logStart, origin, applicationProcess);
  } catch (error) {
    verificationError = error;
  }

  try {
    await terminateApplication(applicationProcess);
    if (origin) await waitForClosedPort(origin);
    assert.deepEqual(snapshotTree(resources), beforeResources, "Application resources changed during verification.");
  } catch (error) {
    verificationError ??= error;
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }

  if (verificationError) {
    const log = appendedLog(logStart).trim();
    throw new Error(`${verificationError.message}${log ? `\n${log}` : ""}`);
  }
  console.log(
    `[verify-desktop-package] ${basename(application)} returned the fixture Session and closed ${origin}`,
  );
}

try {
  await verifyPackage();
} catch (error) {
  console.error(`[verify-desktop-package] ${error.message}`);
  process.exit(1);
}
