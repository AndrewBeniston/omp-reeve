import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import { Window } from "happy-dom";

const browser = new Window({ url: "http://localhost" });
globalThis.window = browser;
globalThis.document = browser.document;
globalThis.HTMLElement = browser.HTMLElement;
globalThis.Node = browser.Node;
globalThis.DOMException = browser.DOMException;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createRoot } = await import("react-dom/client");

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});

const { ForkDialog } = await jiti.import("./ForkDialog.tsx");
const { MessageView } = await jiti.import("../MessageView.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

function renderDialogMarkup(props) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(ForkDialog, {
        open: true,
        onClose() {},
        onForkLocal: async () => {},
        onForkWorktree: async () => {},
        ...props,
      })
    )
  );
}

test("renders the destination dialog titled 'Fork chat from here' outside a worktree", () => {
  const html = renderDialogMarkup({ isWorktree: false, isGit: true });

  assert.match(html, /Fork chat from here/);
  assert.match(html, /Fork in this workspace/);
  assert.match(html, /Fork from this message in the current workspace/);
  assert.match(html, /Fork in a new worktree/);
  assert.match(html, /Fork from this message in a new worktree/);

  // Row 1 precedes Row 2
  const idxWorkspace = html.indexOf("Fork in this workspace");
  const idxWorktree = html.indexOf("Fork in a new worktree");
  assert.ok(idxWorkspace !== -1 && idxWorktree !== -1 && idxWorkspace < idxWorktree);
});

test("renders the destination dialog inside a worktree with same-worktree labels", () => {
  const html = renderDialogMarkup({ isWorktree: true, isGit: true });

  assert.match(html, /Fork chat from here/);
  assert.match(html, /Fork in this worktree/);
  assert.match(html, /Fork from this message in the same worktree/);
  assert.match(html, /Fork in a new worktree/);
  assert.match(html, /Fork from this message in a new worktree/);
});

test("disables the new-worktree option when not in a Git repository and shows the reason", () => {
  const html = renderDialogMarkup({ isWorktree: false, isGit: false });

  assert.match(html, /Fork in a new worktree/);
  assert.match(html, /A Git repository is required to fork in a new worktree/);
  assert.match(html, /disabled/);
});

test("provides Cancel button and follows design constraints", async () => {
  const html = renderDialogMarkup({ isWorktree: false, isGit: true });
  assert.match(html, /Cancel/);

  const source = await readFile(new URL("./ForkDialog.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("./fork-dialog.module.css", import.meta.url), "utf8");

  assert.match(source, /from "\.\.\/ui\/Dialog"/);
  assert.match(source, /initialFocus/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/i);
  assert.doesNotMatch(css, /Inter/i);
});

test("clicking local destination row invokes onForkLocal", async () => {
  let localForkCalled = false;
  let closed = false;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(
        I18nProvider,
        null,
        React.createElement(ForkDialog, {
          open: true,
          isWorktree: false,
          isGit: true,
          onClose: () => { closed = true; },
          onForkLocal: async () => {
            localForkCalled = true;
            return { forked: true };
          },
          onForkWorktree: async () => ({ forked: true }),
        })
      )
    );
  });

  const buttons = Array.from(document.querySelectorAll("button"));
  const workspaceButton = buttons.find((b) => b.textContent?.includes("Fork in this workspace"));
  assert.ok(workspaceButton, "Workspace button should exist");

  await act(async () => {
    workspaceButton.click();
  });

  assert.equal(localForkCalled, true, "onForkLocal should be called");
  assert.equal(closed, true, "Dialog should close after successful fork");
  root.unmount();
  container.remove();
});

test("clicking new-worktree destination row creates worktree and then forks in it", async () => {
  let createdBranch = "";
  let forkedPath = "";
  let closed = false;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(
        I18nProvider,
        null,
        React.createElement(ForkDialog, {
          open: true,
          cwd: "/test/repo",
          isWorktree: false,
          isGit: true,
          onClose: () => { closed = true; },
          onCreateWorktree: async (cwd, branch) => {
            createdBranch = branch;
            return { path: "/test/repo-worktrees/new-branch", branch };
          },
          onForkLocal: async () => ({ forked: true }),
          onForkWorktree: async (path) => {
            forkedPath = path;
            return { forked: true };
          },
        })
      )
    );
  });

  const buttons = Array.from(document.querySelectorAll("button"));
  const worktreeButton = buttons.find((b) => b.textContent?.includes("Fork in a new worktree"));
  assert.ok(worktreeButton, "New worktree button should exist");

  await act(async () => {
    worktreeButton.click();
  });

  assert.ok(createdBranch.startsWith("codex/fork"), "Branch should be created with codex/fork prefix");
  assert.equal(forkedPath, "/test/repo-worktrees/new-branch", "Fork should be initiated with new worktree path");
  assert.equal(closed, true, "Dialog should close after successful worktree fork");
  root.unmount();
  container.remove();
});

test("reports worktree creation failure without starting fork", async () => {
  let forkCalled = false;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(
        I18nProvider,
        null,
        React.createElement(ForkDialog, {
          open: true,
          cwd: "/test/repo",
          isWorktree: false,
          isGit: true,
          onClose: () => {},
          onCreateWorktree: async () => {
            throw new Error("Git worktree lock exists");
          },
          onForkLocal: async () => ({ forked: true }),
          onForkWorktree: async () => {
            forkCalled = true;
            return { forked: true };
          },
        })
      )
    );
  });

  const buttons = Array.from(document.querySelectorAll("button"));
  const worktreeButton = buttons.find((b) => b.textContent?.includes("Fork in a new worktree"));
  assert.ok(worktreeButton);

  await act(async () => {
    worktreeButton.click();
  });

  assert.equal(forkCalled, false, "Fork must not be called when worktree creation fails");
  const alert = document.querySelector('[role="alert"]');
  assert.ok(alert, "Error alert should be rendered");
  assert.match(alert.textContent ?? "", /Git worktree lock exists/);

  root.unmount();
  container.remove();
});

test("removes newly created worktree and reports fork failure when fork fails", async () => {
  let removedPath = "";
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(
        I18nProvider,
        null,
        React.createElement(ForkDialog, {
          open: true,
          cwd: "/test/repo",
          isWorktree: false,
          isGit: true,
          onClose: () => {},
          onCreateWorktree: async (cwd, branch) => ({
            path: "/test/repo-worktrees/temp-wt",
            branch,
          }),
          onRemoveWorktree: async (cwd, path) => {
            removedPath = path;
          },
          onForkLocal: async () => ({ forked: true }),
          onForkWorktree: async () => {
            return { forked: false, error: "Internal agent timeout" };
          },
        })
      )
    );
  });

  const buttons = Array.from(document.querySelectorAll("button"));
  const worktreeButton = buttons.find((b) => b.textContent?.includes("Fork in a new worktree"));
  assert.ok(worktreeButton);

  await act(async () => {
    worktreeButton.click();
  });

  assert.equal(removedPath, "/test/repo-worktrees/temp-wt", "Worktree should be removed when fork fails");
  const alert = document.querySelector('[role="alert"]');
  assert.ok(alert, "Error alert should be rendered");
  assert.match(alert.textContent ?? "", /Internal agent timeout/);

  root.unmount();
  container.remove();
});

test("MessageView fork action opens ForkDialog instead of forking immediately", async () => {
  let forkCalled = false;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(
        I18nProvider,
        null,
        React.createElement(MessageView, {
          message: { role: "user", content: "Test user message" },
          entryId: "user-entry-1",
          cwd: "/test/repo",
          onFork: async () => {
            forkCalled = true;
            return { forked: true };
          },
        })
      )
    );
  });

  const forkButton = document.querySelector('button[data-message-action="fork"]');
  assert.ok(forkButton, "Fork button on message should exist");

  // Clicking fork button should open the dialog, not call onFork immediately
  await act(async () => {
    forkButton.click();
  });

  assert.equal(forkCalled, false, "onFork must not be called immediately upon clicking fork button");

  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(dialog, "Fork dialog should be open");
  assert.match(dialog.textContent ?? "", /Fork chat from here/);

  root.unmount();
  container.remove();
});
