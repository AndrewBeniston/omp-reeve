import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});

const source = await readFile(new URL("./ShellLayout.tsx", import.meta.url), "utf8");
const shellCss = await readFile(new URL("./shell.module.css", import.meta.url), "utf8");

const separatorProps = {
  "aria-label": "Resize panel",
  "aria-orientation": "vertical",
  "aria-valuenow": 340,
  role: "separator",
  tabIndex: 0,
};

test("ShellLayout exposes one structured API without a children escape hatch", () => {
  assert.match(source, /interface ShellLayoutProps \{/);
  assert.match(source, /header: ReactNode/);
  assert.match(source, /main: ReactNode/);
  assert.match(source, /sidebar: ShellLayoutSidebar/);
  assert.match(source, /rightPanel: ShellLayoutRightPanel/);
  assert.doesNotMatch(source, /children[?:]: ReactNode/);
});

test("ShellLayout owns the shell landmarks, panel states, widths, and separators", async () => {
  const { ShellLayout } = await jiti.import("./ShellLayout.tsx");
  const markup = renderToStaticMarkup(
    React.createElement(ShellLayout, {
      header: React.createElement("div", { "data-slot": "header" }, "Header"),
      isMobile: false,
      main: React.createElement("div", { "data-slot": "main" }, "Workspace"),
      secondaryPanel: React.createElement("div", { "data-slot": "subagents" }, "Subagents"),
      sidebar: {
        content: React.createElement("div", { "data-slot": "sidebar" }, "Sessions"),
        label: "Projects",
        mobileReady: true,
        onBackdropClick() {},
        open: true,
        resize: {
          isResizing: false,
          separatorProps,
          title: "Resize projects",
          width: 340,
        },
      },
      rightPanel: {
        content: React.createElement("div", { "data-slot": "file" }, "File"),
        header: React.createElement("div", { "data-slot": "tabs" }, "Tabs"),
        label: "Files",
        onBackdropClick() {},
        open: true,
        resize: {
          isResizing: true,
          separatorProps: { ...separatorProps, "aria-valuenow": 620 },
          title: "Resize files",
          width: 620,
        },
      },
    }),
  );

  assert.match(markup, /data-testid="sidebar-backdrop"/);
  assert.match(markup, /id="session-sidebar"[^>]*style="--ui-panel-width:340px"/);
  assert.match(markup, /<nav aria-label="Projects"/);
  assert.match(markup, /aria-valuenow="340"[^>]*role="separator"[^>]*aria-controls="session-sidebar"/);
  assert.match(markup, /<section[^>]*><div data-slot="header">Header<\/div><div[^>]*><main[^>]*>/);
  assert.match(markup, /<aside[^>]*><div data-slot="subagents">Subagents<\/div><\/aside>/);
  assert.match(markup, /data-testid="right-panel-backdrop"/);
  assert.match(markup, /aria-valuenow="620"[^>]*role="separator"[^>]*aria-controls="file-panel"/);
  assert.match(markup, /id="file-panel"[^>]*style="--ui-panel-width:620px"/);
  assert.match(markup, /<aside aria-label="Files"/);
  assert.match(markup, /data-slot="tabs"/);
  assert.match(markup, /data-slot="file"/);
});

test("mobile shell header controls preserve touch targets", () => {
  assert.match(
    shellCss,
    /@media \(max-width: 640px\) and \(pointer: coarse\) \{[\s\S]*?\.headerLeading > button,[\s\S]*?\.headerFileAction > button\s*\{[^}]*min-width:\s*var\(--ui-control-touch\);[^}]*min-height:\s*var\(--ui-control-touch\);/,
  );
});

test("desktop shell icon controls use the measured size", () => {
  assert.match(
    shellCss,
    /\.headerControl\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;/,
  );
  assert.match(
    shellCss,
    /\.filePanelToggle\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;/,
  );
  assert.match(shellCss, /\.headerBar\s*\{[^}]*align-items:\s*center;[^}]*height:\s*calc\(46px/);
});
