import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./SessionSidebar.tsx", import.meta.url), "utf8");
const sessionItemSource = source.slice(source.indexOf("function SessionItem("));
const directoryPickerSource = await readFile(new URL("./DirectoryPicker.tsx", import.meta.url), "utf8");
const fileExplorerSource = await readFile(new URL("./FileExplorer.tsx", import.meta.url), "utf8");
const navigationCss = await readFile(new URL("./navigation/navigation.module.css", import.meta.url), "utf8");
const codexIconsSource = await readFile(new URL("./navigation/CodexIcons.tsx", import.meta.url), "utf8").catch(() => "");
const hoverCardsSource = await readFile(new URL("./navigation/SidebarHoverCards.tsx", import.meta.url), "utf8");
const dynamicStyleVarsSource = await readFile(new URL("./ui/DynamicStyleVars.tsx", import.meta.url), "utf8");
const tokensCss = await readFile(new URL("../app/tokens.css", import.meta.url), "utf8");
const enMessages = await readFile(new URL("../lib/i18n/messages/en.ts", import.meta.url), "utf8");
const zhMessages = await readFile(new URL("../lib/i18n/messages/zh-CN.ts", import.meta.url), "utf8");
const worktreesRouteSource = await readFile(new URL("../app/api/worktrees/route.ts", import.meta.url), "utf8");
const sortableProjectSource = await readFile(new URL("./navigation/SortableProjectList.tsx", import.meta.url), "utf8");
const sortableProjectCss = await readFile(new URL("./navigation/sortable-project-list.module.css", import.meta.url), "utf8");

const navigationSources = await Promise.all(
  [
    "SessionSidebar.tsx",
    "DirectoryPicker.tsx",
    "FileExplorer.tsx",
    "BranchNavigator.tsx",
    "TabBar.tsx",
    "FileIcons.tsx",
    "navigation/navigation.module.css",
    "navigation/SidebarHoverCards.tsx",
    "navigation/SortableProjectList.tsx",
    "navigation/sortable-project-list.module.css",
  ].map(async (file) => [file, await readFile(new URL(`./${file}`, import.meta.url), "utf8")]),
);

test("navigation colors use Tier 2 semantic tokens", () => {
  const hardcodedColor = /#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\s*\(/i;

  for (const [file, fileSource] of navigationSources) {
    assert.doesNotMatch(fileSource, hardcodedColor, `${file} contains a hardcoded color`);
  }
});

test("migrated navigation uses CSS modules without direct style props", () => {
  for (const [file, fileSource] of navigationSources) {
    if (!file.endsWith(".tsx")) continue;
    assert.doesNotMatch(fileSource, /\bstyle\s*=/, `${file} contains an inline style prop`);
    assert.doesNotMatch(fileSource, /CSSProperties/, `${file} exposes a style-object boundary`);
  }
});

test("navigation CSS consumes Tier 2 tokens only", () => {
  assert.doesNotMatch(
    navigationCss,
    /var\(--(?:bg|bg-panel|bg-hover|bg-selected|border|text|text-muted|text-dim|accent|accent-hover|success|danger|warning)\)/,
  );
});

test("desktop project and session rows use the measured navigation density", () => {
  assert.match(
    navigationCss,
    /\.projectRow\s*\{[^}]*height:\s*var\(--height-token-row\);[^}]*border-radius:\s*var\(--radius-project-row\);[^}]*padding:\s*5px var\(--padding-row-cell-x\);/,
  );
  assert.match(
    navigationCss,
    /\.sessionRow\s*\{[^}]*height:\s*var\(--height-token-row\);[^}]*padding:\s*5px var\(--padding-row-cell-x\);[^}]*border-radius:\s*var\(--radius-nav-row\);/,
  );
  assert.match(navigationCss, /\.sessionRow\[data-selected="true"\]\s*\{[^}]*background:\s*var\(--ui-row-selected\);/);
  assert.match(
    navigationCss,
    /\.projectSelectButton\s*\{[^}]*font-size:\s*var\(--text-ui\);[^}]*line-height:\s*21px;/,
  );
  assert.match(
    navigationCss,
    /\.sessionTitleContainer\s*\{[^}]*font-size:\s*var\(--text-sm\);[^}]*line-height:\s*var\(--leading-sm\);/,
  );
  assert.match(
    navigationCss,
    /\.projectsHeader\s*\{[^}]*padding:\s*0 var\(--space-2\) 0 calc\(var\(--padding-row-x\) \+ var\(--padding-row-cell-x\)\);/,
  );
});

test("the sidebar header uses the 46px header centre line", () => {
  assert.match(
    navigationCss,
    /\.sidebarHeader\s*\{[^}]*height:\s*46px;[^}]*padding:\s*0 var\(--space-2-5\);/,
  );
});

test("the desktop sidebar follows the Codex title and navigation stack", () => {
  assert.match(source, /className=\{styles\.desktopTitleBar\}/);
  assert.match(source, /className=\{styles\.desktopSidebarToggle\}/);
  assert.match(source, /onClick=\{onSidebarToggle\}/);
  assert.match(source, /window\.history\.back\(\)/);
  assert.match(source, /window\.history\.forward\(\)/);
  assert.match(source, /className=\{styles\.sidebarSearchButton\}/);
  assert.match(source, /className=\{styles\.sidebarNotificationsButton\}/);
  assert.match(source, /className=\{styles\.newSessionRow\}/);
  assert.match(source, /\{t\("sidebar\.newChat"\)\}/);
  assert.match(source, /data-open=\{projectSearchOpen\}/);
  assert.match(source, /projectSearchInputRef\.current\?\.focus\(\)/);
  assert.match(
    navigationCss,
    /\.desktopTitleBar\s*\{[^}]*display:\s*none;/,
  );
  assert.match(
    navigationCss,
    /:global\(html\[data-omp-desktop="darwin"\]\) \.desktopTitleBar\s*\{[^}]*display:\s*flex;[^}]*height:\s*46px;[^}]*padding:\s*0 8px 0 82px;[^}]*-webkit-app-region:\s*drag;/,
  );
  assert.match(
    navigationCss,
    /\.newSessionRow\s*\{[^}]*height:\s*46px;[^}]*border-bottom:\s*1px solid var\(--ui-border\);/,
  );
});

test("both project entry points use the protected native folder picker", () => {
  assert.match(source, /window\.ompDesktop\?\.selectDirectory/);
  assert.doesNotMatch(source, /window\.piDesktop/);
  assert.match(source, /if \(!selectDirectory\) \{\s*setCustomPathOpen\(true\)/);
  assert.match(source, /await commitCustomPath\(path\)/);
});

test("task rows use the current Codex text and action geometry", () => {
  assert.match(navigationCss, /\.sessionRow\s*\{[^}]*font-size:\s*var\(--text-sm\);/);
  assert.match(navigationCss, /\.sessionPinButton,[\s\S]*?\.sessionArchiveButton\s*\{[^}]*width:\s*19px;[^}]*height:\s*20px;[^}]*border-radius:\s*var\(--radius-lg\);/);
  assert.match(sessionItemSource, /className=\{styles\.sessionPinButton\}[\s\S]*?<svg width="16" height="16"/);
  assert.match(sessionItemSource, /className=\{styles\.sessionArchiveButton\}[\s\S]*?<svg width="16" height="16"/);
});

test("sidebar utility controls use the current Codex geometry", () => {
  assert.match(navigationCss, /\.desktopSidebarToggle,[\s\S]*?\.desktopHistoryButton\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;[^}]*border-radius:\s*var\(--radius-nav-row\);/);
  assert.match(navigationCss, /\.sidebarSearchButton,[\s\S]*?\.sidebarNotificationsButton\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;[^}]*border-radius:\s*var\(--radius-nav-row\);/);
  assert.match(navigationCss, /\.refreshSessionsButton\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;[^}]*border-radius:\s*var\(--radius-nav-row\);/);
  assert.match(navigationCss, /\.addProjectButton\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;[^}]*border-radius:\s*var\(--radius-nav-row\);/);
  assert.match(navigationCss, /\.projectNewSessionButton\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;[^}]*border-radius:\s*var\(--radius-nav-row\);/);
  assert.match(navigationCss, /\.projectMenuButton\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;[^}]*border-radius:\s*var\(--radius-nav-row\);/);
});

test("the sidebar New button is a ghost control", () => {
  const restRule = navigationCss.match(/\.newSessionButton\s*\{(?<declarations>[^}]*)\}/)?.groups?.declarations;
  const hoverRule = navigationCss.match(/\.newSessionButton:not\(:disabled\):hover\s*\{(?<declarations>[^}]*)\}/)?.groups?.declarations;

  assert.ok(restRule, "New button rest rule exists");
  assert.match(restRule, /background:\s*transparent;/);
  assert.match(restRule, /border:\s*(?:0|none);/);
  assert.match(restRule, /color:\s*var\(--ui-text-muted\);/);
  assert.match(restRule, /flex:\s*1;/);
  assert.match(restRule, /border-radius:\s*12px;/);
  assert.match(source, /aria-label=\{t\("quickChat.title"\)\}/);
  assert.match(restRule, /justify-content:\s*flex-start;/);
  assert.match(restRule, /font-size:\s*var\(--text-ui\);/);
  assert.ok(hoverRule, "New button hover rule exists");
  assert.match(hoverRule, /background:\s*var\(--ui-row-hover\)(?:\s*!important)?;/);
  assert.match(navigationCss, /\.newSessionButton:disabled\s*\{[^}]*color:\s*var\(--ui-text-dim\);[^}]*cursor:\s*not-allowed;/);
  assert.match(navigationCss, /\.refreshSessionsButton\s*\{[^}]*background:\s*var\(--ui-hover\);[^}]*border:\s*1px solid var\(--ui-border\);/);
  assert.match(navigationCss, /\.refreshSessionsButton:not\(\[data-complete="true"\]\):hover\s*\{[^}]*background:\s*var\(--ui-row-hover\) !important;[^}]*color:\s*var\(--ui-text\) !important;/);
});

test("the sidebar New button cascade keeps one transparent rest rule", () => {
  assert.match(source, /<button\s+className=\{styles\.newSessionButton\}/);
  const rules = [...navigationCss.matchAll(/(?<selector>[^{}]+)\{(?<declarations>[^{}]*)\}/g)]
    .map((match) => match.groups)
    .filter(Boolean)
    .flatMap(({ selector, declarations }) => selector.split(",").map((part) => ({ selector: part.trim(), declarations })));
  const restRules = rules.filter((rule) => rule.selector === ".newSessionButton");
  const backgroundRules = restRules.filter((rule) => /(?:^|;)\s*background(?:-color)?:/.test(rule.declarations));
  assert.equal(backgroundRules.length, 1, "only one rest rule sets the New button background");
  assert.match(backgroundRules[0].declarations, /appearance:\s*none;/);
  assert.match(backgroundRules[0].declarations, /background:\s*transparent;/);
  assert.match(backgroundRules[0].declarations, /border:\s*(?:0|none);/);
});

test("session archive uses the redesigned navigation contract", () => {
  assert.match(source, /body:\s*JSON\.stringify\(\{ archived: true \}\)/);
  assert.match(source, /className=\{styles\.sessionArchiveButton\}/);
  assert.match(navigationCss, /\.sessionPinButton:hover,[\s\S]*?\.sessionArchiveButton:hover\s*\{[^}]*background:\s*var\(--ui-row-hover\) !important;[^}]*color:\s*var\(--ui-text\) !important;/);
  for (const messages of [enMessages, zhMessages]) {
    assert.match(messages, /"sidebar\.archive"/);
  }
});

test("a long session title fades at the edge and scrolls to its end on hover", () => {
  // Codex desktop, app-initial CSS: text-fade-truncate clips and masks the right edge.
  assert.match(navigationCss, /\.sessionTitleText\s*\{[^}]*text-overflow:\s*clip;/);
  assert.doesNotMatch(navigationCss, /\.sessionTitleText\s*\{[^}]*text-overflow:\s*ellipsis;/);
  assert.match(navigationCss, /\.sessionTitleText\[data-overflow="true"\]\s*\{[^}]*mask-image:\s*linear-gradient\(to right, transparent, black var\(--marquee-left-fade\), black calc\(100% - var\(--marquee-right-fade\)\), transparent\);/);
  // The Codex marquee: 2em per second, 0.35s hold, cubic-bezier(0.49, 0.6, 0.7, 1), one pass, stop at the end.
  assert.match(navigationCss, /--marquee-left-fade:\s*0\.571429em;/);
  assert.match(navigationCss, /--marquee-right-fade:\s*1\.14286em;/);
  assert.match(navigationCss, /@keyframes sessionTitleScroll\s*\{\s*to\s*\{\s*transform:\s*translateX\(calc\(-1 \* var\(--ui-title-shift\)\)\);/);
  assert.match(navigationCss, /animation:\s*sessionTitleScroll calc\(var\(--ui-title-shift-em\) \* 0\.5s\)/);
  // The right fade slides off in the last quarter so the final letters read clear.
  assert.match(navigationCss, /@keyframes sessionTitleFadeRight\s*\{\s*75%\s*\{\s*mask-size:\s*100% 100%;\s*\}\s*to\s*\{\s*mask-size:\s*calc\(100% \+ var\(--marquee-right-fade\)\) 100%;/);
  // Reduced motion keeps the fade and drops the scroll.
  assert.match(navigationCss, /prefers-reduced-motion: reduce\)\s*\{[^{]*\.sessionTitleInner\s*\{[^}]*animation:\s*none;/);
  assert.match(sessionItemSource, /--ui-title-shift/);
  assert.match(sessionItemSource, /--ui-title-shift-em/);
  assert.doesNotMatch(sessionItemSource, /--ui-title-shift-duration|titleShiftDuration/);
  assert.match(dynamicStyleVarsSource, /"--ui-title-shift-em"/);
  assert.doesNotMatch(dynamicStyleVarsSource, /"--ui-title-shift-duration"/);
  assert.match(sessionItemSource, /data-overflow=\{/);
});

test("the sidebar header uses the 46px header centre line (geometry)", () => {
  assert.match(
    navigationCss,
    /\.sidebarHeader\s*\{[^}]*height:\s*46px;[^}]*padding:\s*0 var\(--space-2-5\);/,
  );
  assert.match(
    navigationCss,
    /\.sidebarHeaderRow\s*\{[^}]*height:\s*100%;[^}]*align-items:\s*center;/,
  );
  assert.match(
    navigationCss,
    /\.newSessionButton\s*\{[^}]*height:\s*36px;/,
  );
  assert.match(
    navigationCss,
    /\.refreshSessionsButton\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;/,
  );
});

test("project and session rows preserve the Codex hierarchy", () => {
  assert.doesNotMatch(source, /projectChevronIcon|<polyline points="2\.5 4 6 7\.5 9\.5 4"/);
  // Codex desktop: the project name is the collapse control. The folder icon sits inside it.
  assert.doesNotMatch(source, /className=\{styles\.projectFolderButton\}/);
  assert.match(
    source,
    /onClick=\{\(\) => handleProjectPress\(project\)\}[\s\S]*?aria-expanded=\{!isCollapsed\}[\s\S]*?className=\{styles\.projectSelectButton\}[\s\S]*?<span className=\{styles\.projectFolderIconBox\}>[\s\S]*?<ProjectFolderIcon open=\{!isCollapsed\} \/>/,
  );
  assert.match(navigationCss, /\.projectRow\s*\{[^}]*gap:\s*var\(--sidebar-item-gap\);/);
  assert.match(navigationCss, /\.projectFolderIconBox\s*\{[^}]*width:\s*var\(--sidebar-item-icon-size\);/);
  assert.match(
    navigationCss,
    /\.sessionRow\s*\{[^}]*padding-left:\s*calc\(var\(--padding-row-cell-x\) \+ var\(--sidebar-item-icon-size\) \+ var\(--sidebar-item-gap\) \+ var\(--ui-tree-depth\) \* 10px\);/,
  );
});

test("each Project disclosure labels its controlled region", () => {
  assert.match(source, /const disclosureId = `project-disclosure-\$\{encodeURIComponent\(project\)\}`/);
  assert.match(source, /id=\{`\$\{disclosureId\}-trigger`\}[\s\S]*?aria-controls=\{`\$\{disclosureId\}-region`\}/);
  assert.match(source, /id=\{`\$\{disclosureId\}-region`\}[\s\S]*?role="region"[\s\S]*?aria-labelledby=\{`\$\{disclosureId\}-trigger`\}/);
});

test("project folders use the Codex icons and animate open and closed", () => {
  // Icons read from the Codex desktop app: folder-light-16, folder-open-light-16, plus-chat-bubble-light-16.
  assert.match(codexIconsSource, /M5\.55933 2\.14136C6\.06479 2\.14136/, "closed folder path");
  assert.match(codexIconsSource, /M4\.81201 2\.14124C5\.31747 2\.14124/, "open folder path");
  assert.match(codexIconsSource, /M7\.9834 5\.3042C8\.27312 5\.30446/, "new Session icon path");
  assert.match(source, /className=\{styles\.projectNewSessionButton\}[\s\S]*?<NewSessionIcon \/>/);
  // The children animate through a grid row, 300ms on the Codex enter curve. No measured height.
  assert.match(navigationCss, /\.projectChildren\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*1fr;[^}]*transition:\s*grid-template-rows var\(--duration-collapse\) var\(--ease-enter\),\s*opacity var\(--duration-collapse\) var\(--ease-enter\);/);
  assert.match(navigationCss, /\.projectChildren\[data-collapsed="true"\]\s*\{[^}]*grid-template-rows:\s*0fr;[^}]*opacity:\s*0;/);
  assert.match(navigationCss, /\.projectChildrenInner\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/);
  assert.match(tokensCss, /--duration-collapse:\s*300ms;/);
  assert.match(tokensCss, /prefers-reduced-motion: reduce\)\s*\{[^{]*:root\s*\{[^}]*--duration-collapse:\s*0\.001ms;/);
  // Collapsed children leave the tab order and the accessibility tree.
  assert.match(source, /className=\{styles\.projectChildren\}[\s\S]*?data-collapsed=\{isCollapsed\}[\s\S]*?inert=\{isCollapsed\}/);
});

test("project actions overlay the project name width", () => {
  assert.match(navigationCss, /\.projectNewSessionButton\s*\{[^}]*position:\s*absolute;[^}]*right:\s*31px;/);
  assert.match(navigationCss, /\.projectMenuWrapper\s*\{[^}]*position:\s*absolute;[^}]*right:\s*var\(--space-2\);/);
  assert.match(navigationCss, /\.projectName\s*\{[^}]*flex:\s*1;/);
});

test("sidebar scroll areas reveal the scrollbar only on hover", () => {
  assert.match(navigationCss, /:is\(\.projectsList, \.fileExplorerContent, \.worktreeList\)\s*\{[^}]*scrollbar-color:\s*transparent transparent;/);
  assert.match(navigationCss, /:is\(\.projectsList, \.fileExplorerContent, \.worktreeList\):hover\s*\{[^}]*scrollbar-color:\s*var\(--ui-scrollbar-thumb\) transparent;/);
  assert.match(navigationCss, /:is\(\.projectsList, \.fileExplorerContent, \.worktreeList\)::-webkit-scrollbar-thumb\s*\{[^}]*background-color:\s*transparent;/);
});

test("the project sidebar excludes Archive and Explorer utility sections", () => {
  assert.doesNotMatch(source, /<ArchivedSessionsSection/);
  assert.doesNotMatch(source, /<FileExplorer/);
  assert.doesNotMatch(source, /fileExplorerSectionToggle/);
});

test("mobile project and session rows preserve touch targets", () => {
  assert.match(
    navigationCss,
    /@media \(max-width: 640px\) and \(pointer: coarse\) \{[\s\S]*?\.projectRow,\s*\.sessionRow\s*\{[^}]*height:\s*var\(--ui-control-touch\);[^}]*min-height:\s*var\(--ui-control-touch\);/,
  );
  assert.match(
    navigationCss,
    /@media \(max-width: 640px\) and \(pointer: coarse\) \{[\s\S]*?\.projectNewSessionButton,[\s\S]*?\.sessionArchiveButton\s*\{[^}]*min-width:\s*var\(--ui-control-touch\);[^}]*min-height:\s*var\(--ui-control-touch\);/,
  );
});

test("mobile navigation headers preserve touch targets", () => {
  assert.match(
    navigationCss,
    /@media \(max-width: 640px\) and \(pointer: coarse\) \{[\s\S]*?\.newSessionButton,\s*\.refreshSessionsButton,\s*\.addProjectButton\s*\{[^}]*min-width:\s*var\(--ui-control-touch\);[^}]*min-height:\s*var\(--ui-control-touch\);/,
  );
});

test("sidebar status transforms stop under reduced motion", () => {
  assert.doesNotMatch(source, /animateTransform/);
  assert.match(navigationCss, /\.runningIndicatorSvg\s*\{[^}]*animation:\s*navigationSpin/);
  assert.match(
    navigationCss,
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.runningIndicatorSvg\s*\{[^}]*animation:\s*none/,
  );
});

test("navigation inputs replace suppressed outlines with token focus rings", () => {
  const inputSelectors = [
    "directoryPickerPath",
    "projectSearchInput",
    "worktreeFilterInput",
    "worktreeNewInput",
  ];

  for (const selector of inputSelectors) {
    assert.match(
      navigationCss,
      new RegExp(`\\.${selector}\\s*\\{[^}]*(?:outline:\\s*(?:none|0);)[^}]*}`),
      `${selector} must explicitly suppress its default outline`,
    );
    assert.match(
      navigationCss,
      new RegExp(`\\.${selector}:focus-visible\\s*\\{[^}]*outline:\\s*var\\(--ui-focus-ring\\);[^}]*outline-offset:\\s*var\\(--ui-focus-offset\\);`),
      `${selector} must restore the token focus ring`,
    );
  }
});

test("reduced motion disables navigation spinners", () => {
  assert.match(
    navigationCss,
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.spin\s*\{[^}]*animation:\s*none;/,
  );
});

test("navigation hover states use CSS without direct DOM style mutations", () => {
  for (const [file, fileSource] of navigationSources) {
    assert.doesNotMatch(fileSource, /currentTarget\.style|target\.style/, `${file} mutates DOM styles`);
  }

  assert.match(source, /className=\{styles\.projectNewSessionButton\}[\s\S]*?onClick=\{\(\) => handleNewSession\(project\)\}/);
  assert.match(fileExplorerSource, /className=\{styles\.fileExplorerDismissButton\}/);
  assert.match(navigationCss, /\.fileExplorerDismissButton:hover/);
});

test("navigation exposes public state markers", () => {
  assert.match(source, /data-state="running"/);
  assert.match(source, /aria-expanded=\{!isCollapsed\}/);
  assert.match(directoryPickerSource, /disabled=\{loading \|\| !canNavigateUp\}/);
  assert.match(fileExplorerSource, /role="alert"/);
  assert.match(navigationSources.find(([file]) => file === "TabBar.tsx")[1], /data-active=\{isActive\}/);
});

test("session rows expose Pin and Archive without Delete", () => {
  assert.match(sessionItemSource, /className=\{styles\.sessionPinButton\}/);
  assert.match(sessionItemSource, /className=\{styles\.sessionArchiveButton\}/);
  assert.doesNotMatch(sessionItemSource, /sessionDeleteButton|performDelete|handleDelete/);
  assert.doesNotMatch(sessionItemSource, /method:\s*"DELETE"/);
});

test("double-click opens the rename dialog", () => {
  assert.match(sessionItemSource, /onDoubleClick=\{\(event\) => \{[\s\S]*?startRename\(\);/);
  assert.match(sessionItemSource, /<RenameDialog[\s\S]*?open=\{renaming\}[\s\S]*?onSave=\{commitRename\}/);
});

test("pinned sessions sort before recent sessions", () => {
  assert.match(source, /Number\(Boolean\(b\.session\.pinned\)\) - Number\(Boolean\(a\.session\.pinned\)\)/);
});

test("polls running sessions only while the tab is visible", () => {
  assert.doesNotMatch(source, /new EventSource\("\/api\/agent\/running\/events"\)/);
  assert.match(source, /fetch\("\/api\/agent\/running"/);
  assert.match(source, /document\.visibilityState !== "visible"/);
  assert.match(source, /document\.addEventListener\("visibilitychange", onVisibilityChange\)/);
});

test("notifies only when a background session completes", () => {
  assert.match(source, /completedInBackground = \[\.\.\.previous\]\.filter\(\(id\) => !runningSessionIds\.has\(id\) && id !== selectedSessionId\)/);
  assert.match(source, /if \(completedInBackground\.length > 0\) \{[\s\S]*?onBackgroundTaskDone\?\.\(\)/);
});

test("project rows preserve collapse and session selection callbacks", () => {
  assert.match(source, /onClick=\{\(\) => handleProjectPress\(project\)\}/);
  // Andrew's rule: a press on the project name only opens or closes the group. It never changes the Session.
  assert.match(source, /const handleProjectPress = useCallback\(\(project: string\) => \{\s*toggleProjectCollapsed\(project\);\s*\}, \[toggleProjectCollapsed\]\);/);
  assert.doesNotMatch(source, /const handleProjectPress = useCallback\(\(project: string\) => \{[^}]*setSelectedCwd/);
  assert.match(source, /aria-expanded=\{!isCollapsed\}/);
  assert.match(source, /setSelectedCwd\(project\)/);
  assert.match(source, /onClick=\{\(\) => onSelectSession\(node\.session\)\}/);
});

test("project rows use saved Codex-style drag ordering", () => {
  assert.match(source, /<SortableProjectList/);
  assert.match(source, /getId=\{\(\{ project \}\) => project\}/);
  assert.match(source, /onOrderChange=\{handleProjectOrderChange\}/);
  assert.match(source, /fetch\("\/api\/sidebar\/project-order"/);
  assert.match(source, /data-project-drag-handle="true"/);
  assert.match(sortableProjectSource, /useSortable/);
  assert.match(sortableProjectSource, /dropAnimation=\{null\}/);
  assert.match(sortableProjectCss, /\.item\[data-dragging\][\s\S]*?opacity: 0\.2/);
});

test("memoizes optimistic session composition for stable hook dependencies", () => {
  assert.match(source, /const sessionsForDisplay = useMemo\(\(\) =>/);
});

test("uses approved runtime geometry variables only", () => {
  assert.match(fileExplorerSource, /<DynamicStyleVars[\s\S]*?"--ui-tree-depth"/);
  assert.match(fileExplorerSource, /<DynamicStyleVars[\s\S]*?"--ui-progress"/);
  assert.match(navigationSources.find(([file]) => file === "BranchNavigator.tsx")[1], /<DynamicStyleVars/);
});

test("keeps subagents out of the left session sidebar", () => {
  assert.doesNotMatch(source, /SubagentRail|SubagentPanel|subagents/);
});

test("includes project activity counts in accessible labels", () => {
  assert.match(
    source,
    /aria-label=\{`\$\{t\("sidebar\.agentRunning"\)\} \(\$\{activity\.running\}\)`\}/,
  );
  assert.match(
    source,
    /aria-label=\{`\$\{t\("sidebar\.newSessionActivity"\)\} \(\$\{activity\.unread\}\)`\}/,
  );
});

test("does not persist an unchanged fallback title ending in whitespace", () => {
  assert.match(
    sessionItemSource,
    /if \(name === title \|\| name === \(session\.name \?\? ""\)\)/,
  );
});
test("offers the extension hook before the native context menu", () => {
  assert.match(sessionItemSource, /const handleContextMenu[\s\S]*?dispatchSessionRowContextMenu\(\{/);
  assert.match(sessionItemSource, /if \(!handled && !hasDesktopSessionMenu\(\)\) return;/);
  assert.match(sessionItemSource, /showDesktopSessionMenu\(\{[\s\S]*?pinned:[\s\S]*?unread:/);
  assert.match(sessionItemSource, /onContextMenu=\{renaming \? undefined : handleContextMenu\}/);
});
test("project actions use one native menu for click and right-click", () => {
  assert.match(source, /showDesktopProjectMenu\(\{/);
  assert.match(source, /if \(projectHoverOpenTimerRef\.current\) clearTimeout\(projectHoverOpenTimerRef\.current\);/);
  assert.match(source, /onContextMenu=\{\(event\) => \{\s*if \(project === PROJECTLESS_GROUP\) \{ event\.preventDefault\(\); return; \}\s*void handleProjectMenu\(event, project, sessions\);/);
  assert.match(source, /onClick=\{\(event\) => void handleProjectMenu\(event, project, sessions\)\}/);
  assert.match(source, /if \(action\.type === "archive-chats"\)/);
  assert.match(source, /body:\s*JSON\.stringify\(\{ archived: true \}\)/);
  assert.match(source, /if \(action\.type === "remove-project"\) handleRemoveProject\(project\)/);
});
test("manual and lifecycle refreshes bypass the server session-list cache", () => {
  assert.match(source, /force \? "\/api\/sessions\?force=1" : "\/api\/sessions"/);
  assert.match(source, /cache: "no-store"/);
  assert.match(source, /loadSessions\(isFirst, !isFirst\)/);
  assert.match(source, /onClick=\{\(\) => loadSessions\(false, true\)\}/);
  assert.match(source, /loadSessions\(false, true\);[\s\S]*?onBackgroundTaskDone/);
});

test("does not expose disk-backed actions for transient sessions", () => {
  assert.match(sessionItemSource, /if \(session\.transient\) return;/);
  assert.match(sessionItemSource, /\{hovered && !session\.transient && \(/);
});

test("project hover cards match the shipped Codex field order", () => {
  assert.match(source, /<ProjectHoverCard[\s\S]*?projectName=\{name\}[\s\S]*?taskCount=\{sessions\.length\}[\s\S]*?repositoryLabel=[\s\S]*?projectPath=\{displayCwd\(project, homeDir\)\}/);
  assert.match(source, /className=\{styles\.projectHoverCard\}/);
  assert.match(hoverCardsSource, /taskCount === 1 \? t\("sidebar\.oneTask"\) : t\("sidebar\.taskCount", \{ count: taskCount \}\)/);
  assert.match(hoverCardsSource, /\{t\("sidebar\.editProject"\)\}/);
  assert.match(navigationCss, /\.projectHoverCard\s*\{[^}]*width:\s*min\(336px, calc\(100vw - 16px\)\);/);
  assert.match(navigationCss, /\.richHoverCard\s*\{[^}]*border-radius:\s*15px;[^}]*corner-shape:\s*superellipse\(1\.5\);/);
  assert.match(hoverCardsSource, /const rightPosition = rect\.right \+ 2;/);
  assert.match(worktreesRouteSource, /repositoryLabel:\s*project\.repositoryLabel/);
  assert.match(source, /const projectRepositoryLabel = [\s\S]*?worktreeState\?\.projectRoot[\s\S]*?worktreeState\.repositoryLabel/);
});

test("session hover cards match the shipped Codex field order", () => {
  assert.match(sessionItemSource, /const fullTitle = session\.name \|\| displayFirstMessage \|\| session\.id\.slice\(0, 12\)/);
  assert.match(sessionItemSource, /<SessionHoverCard[\s\S]*?title=\{fullTitle\}[\s\S]*?modified=\{session\.modified\}[\s\S]*?projectName=\{projectName\}[\s\S]*?repositoryLabel=\{session\.repositoryLabel\}[\s\S]*?cwd=\{displayCwd\(session\.cwd, homeDir\)\}[\s\S]*?gitBranch=\{session\.gitBranch\}[\s\S]*?isWorktree=\{session\.isWorktree\}/);
  assert.match(sessionItemSource, /className=\{styles\.sessionHoverCard\}/);
  assert.match(navigationCss, /\.sessionHoverCard\s*\{[^}]*width:\s*min\(320px, calc\(100vw - 16px\)\);/);
  assert.match(navigationCss, /\.hoverCardUnreadDot\s*\{[^}]*width:\s*6px;[^}]*height:\s*6px;[^}]*background:\s*var\(--ui-accent\);/);
});

test("sidebar icon hover colors use the Codex foreground tint", () => {
  assert.match(tokensCss, /--ui-sidebar-icon:\s*color-mix\(in srgb, var\(--text\) 50%, transparent\);/);
  assert.match(navigationCss, /\.projectNewSessionButton\s*\{[^}]*color:\s*var\(--ui-sidebar-icon\);/);
  assert.match(navigationCss, /\.sessionPinButton,[\s\S]*?\.sessionArchiveButton\s*\{[^}]*color:\s*var\(--ui-sidebar-icon\);/);
  assert.doesNotMatch(navigationCss, /\.sessionPinButton:hover,[\s\S]*?\.sessionArchiveButton:hover\s*\{[^}]*color:\s*var\(--ui-accent\)/);
  assert.doesNotMatch(navigationCss, /\.projectNewSessionButton:hover\s*\{[^}]*color:\s*var\(--ui-accent\)/);
});

test("sidebar labels cannot become browser text selections", () => {
  assert.match(navigationCss, /\.sidebarContainer\s*\{[^}]*user-select:\s*none;/);
  assert.match(navigationCss, /\.projectsTitle\s*\{[^}]*font-size:\s*var\(--text-ui\);[^}]*line-height:\s*21px;/);
});
