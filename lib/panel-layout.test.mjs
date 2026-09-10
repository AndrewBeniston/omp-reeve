import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  clampPanelWidth,
  getBrowserTabPanelWidth,
  getDefaultRightPanelWidth,
  getPanelWidthCssValue,
  getRightPanelMaxWidth,
  getSidebarMaxWidth,
  RIGHT_PANEL_MIN_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
} = await jiti.import("./panel-layout.ts");

test("exports the shell sidebar width contract", () => {
  assert.equal(SIDEBAR_DEFAULT_WIDTH, 275);
  assert.equal(SIDEBAR_MIN_WIDTH, 220);
});

test("formats runtime panel widths as typed CSS values", () => {
  assert.equal(getPanelWidthCssValue(SIDEBAR_DEFAULT_WIDTH), "275px");
  assert.equal(getPanelWidthCssValue(560), "560px");
});

test("clamps panel widths to finite bounds", () => {
  assert.equal(clampPanelWidth(420.4, 180, 480), 420);
  assert.equal(clampPanelWidth(120, 180, 480), 180);
  assert.equal(clampPanelWidth(600, 180, 480), 480);
  assert.equal(clampPanelWidth(Number.NaN, 180, 480), 180);
  assert.equal(clampPanelWidth(200, 300, 250), 300);
});

test("keeps the responsive right panel default within useful limits", () => {
  assert.equal(getDefaultRightPanelWidth(700), 360);
  assert.equal(getDefaultRightPanelWidth(1366), 574);
  assert.equal(getDefaultRightPanelWidth(1920), 640);
});

test("reserves chat space while split panels are visible", () => {
  assert.equal(getSidebarMaxWidth({
    viewportWidth: 700,
    rightPanelOpen: true,
    rightPanelWidth: 560,
  }), 380);
  assert.equal(getSidebarMaxWidth({
    viewportWidth: 1366,
    rightPanelOpen: true,
    rightPanelWidth: 686,
  }), 260);
  assert.equal(getRightPanelMaxWidth({
    viewportWidth: 1024,
    sidebarOpen: true,
    sidebarWidth: 260,
  }), 412);
  assert.equal(getRightPanelMaxWidth({
    viewportWidth: 1366,
    sidebarOpen: true,
    sidebarWidth: 260,
  }), 754);
});

test("does not rewrite desktop widths while the file panel is in overlay mode", () => {
  assert.equal(getRightPanelMaxWidth({
    viewportWidth: 900,
    sidebarOpen: true,
    sidebarWidth: 480,
  }), 1200);
});

// The numbers below were measured from the reference application's shipped
// bundle. They are the contract this pane matches, so a change to any of them
// is a deliberate divergence rather than a tidy-up.

test("a browser tab opens at the reference application's pane width", () => {
  // An ordinary window: the aspect-driven width wins, capped so the chat keeps
  // its column. 900 * 16/10 = 1440, and 1720 - 500 = 1220, so the cap applies.
  assert.equal(
    getBrowserTabPanelWidth({ shellHeight: 900, workspaceWidth: 1720 }),
    1220,
  );
});

test("a short window falls back rather than collapsing the pane", () => {
  // 400 * 16/10 = 640 against a 1200 workspace: the aspect gives 640, and the
  // fallback branch gives min(640, 1200 - 352) = 640. Both agree here.
  assert.equal(
    getBrowserTabPanelWidth({ shellHeight: 400, workspaceWidth: 1200 }),
    640,
  );
});

test("a narrow window keeps a usable chat column", () => {
  // The aspect branch is capped hard: 1000 - 500 = 500. The fallback branch
  // gives min(640, 1000 - 352) = 640, so the fallback wins and the chat keeps
  // 360px rather than 500.
  assert.equal(
    getBrowserTabPanelWidth({ shellHeight: 900, workspaceWidth: 1000 }),
    640,
  );
});

test("the pane never goes below the floor, however cramped the window", () => {
  assert.equal(
    getBrowserTabPanelWidth({ shellHeight: 200, workspaceWidth: 400 }),
    RIGHT_PANEL_MIN_WIDTH,
  );
  assert.equal(RIGHT_PANEL_MIN_WIDTH, 320);
});
