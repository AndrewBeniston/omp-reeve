import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { CollaborationCard } = await jiti.import("./CollaborationCard.tsx");
const cardCss = readFileSync(new URL("./collaboration-card.module.css", import.meta.url), "utf8");

const collaboration = {
  active: true,
  mode: "write",
  browserUrl: "https://my.omp.sh/#writable-secret",
  viewBrowserUrl: "https://my.omp.sh/#view-secret",
  terminalLink: "terminal-write",
  viewTerminalLink: "terminal-view",
  participants: [{ name: "andrew", role: "host" }],
  qr: { size: 2, rows: ["10", "01"], url: "https://my.omp.sh/#writable-secret" },
};

test("renders a scannable QR code and both collaboration permissions", () => {
  const html = renderToStaticMarkup(React.createElement(CollaborationCard, { collaboration }));

  assert.match(html, /aria-label="QR code for the writable collaboration link"/);
  assert.match(html, /Live collaboration/);
  assert.match(html, /Scan to join/);
  assert.match(html, /Writable access/);
  assert.match(html, /Can view, prompt, and interrupt/);
  assert.match(html, /View-only access/);
  assert.match(html, /Can watch this session/);
  assert.match(html, /Open collaboration/);
  assert.match(html, /Open view-only/);
  assert.match(html, /Copy link/);
  assert.match(html, /Copy view-only link/);
  assert.match(html, /Anyone with this link can steer the agent/);
  assert.match(html, /1 participant/);
  assert.match(html, /aria-label="andrew, host"/);
});

test("renders the stopped state without retaining collaboration secrets", () => {
  const html = renderToStaticMarkup(React.createElement(CollaborationCard, {
    collaboration: { active: false, mode: "write", participants: [] },
  }));

  assert.match(html, /Collaboration stopped/);
  assert.doesNotMatch(html, /writable-secret|view-secret|QR code for/);
});

test("stacks the event and permission cards at narrow widths", () => {
  const narrow = cardCss.slice(cardCss.indexOf("@media (max-width: 620px)"));
  assert.match(narrow, /\.hero\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(narrow, /\.accessGrid\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(cardCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation:\s*none/);
});
