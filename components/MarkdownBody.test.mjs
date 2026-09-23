import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import { click, DomEvent, domDocument, domWindow, focused, mount, press, typeInto } from "../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { MarkdownBody } = await jiti.import("./MarkdownBody.tsx");
const { default: ReactMarkdown } = await jiti.import("react-markdown");
const { markdownPreviewRehypePlugins, markdownRemarkPlugins, normalizeDisplayMath } = await jiti.import("../lib/markdown.ts");
const { I18nProvider } = await jiti.import("../hooks/useI18n.tsx");
const globalCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function renderMarkdown(markdown, props = {}) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(MarkdownBody, {
        cwd: "/home/me/project",
        onOpenFile() {},
        ...props,
      }, markdown),
    ),
  );
}

test("fades streamed prose in stable word segments", () => {
  const html = renderMarkdown("Hello, smooth world!", { isStreaming: true });

  assert.match(html, /data-markdown-animated="true"/);
  assert.match(html, /data-stream-fade-key="stream-segment-0"[^>]*>Hello, /);
  assert.match(html, /data-stream-fade-key="stream-segment-1"[^>]*>smooth /);
  assert.match(html, /data-stream-fade-key="stream-segment-2"[^>]*>world!/);
});

test("the streamed word delays can override the base animation shorthand", () => {
  for (const delay of [16, 32, 48, 64, 80, 96]) {
    assert.match(
      globalCss,
      new RegExp(`\\.markdown-body\\[data-markdown-animated="true"\\] \\.markdown-stream-fade\\[data-stream-fade-delay="${delay}"\\] \\{ animation-delay: ${delay}ms; \\}`),
    );
  }
});

test("does not add reveal wrappers to completed prose", () => {
  const html = renderMarkdown("Hello, settled world!", { isStreaming: false });

  assert.doesNotMatch(html, /data-markdown-animated|data-stream-fade-key|markdown-stream-fade/);
});

test("fades inline code as one unit without splitting fenced code", () => {
  const html = renderMarkdown("Use `bun test`.\n\n```ts\nconst ok = true;\n```", { isStreaming: true });

  assert.match(html, /data-stream-fade-key="stream-segment-1"[^>]*><code class="markdown-inline-code">bun test<\/code>/);
  assert.match(html, /<div class="markdown-code-block">[\s\S]*const ok = true;/);
  assert.doesNotMatch(html, /const <\/span>/);
});

test("opens non-file markdown links in a safe new tab", () => {
  const html = renderMarkdown("[docs](https://example.com/docs)");

  assert.match(
    html,
    /<a (?=[^>]*href="https:\/\/example\.com\/docs")(?=[^>]*target="_blank")(?=[^>]*rel="noopener noreferrer")[^>]*>docs<\/a>/,
  );
  assert.doesNotMatch(html, /\snode=/);
});

test("keeps local file markdown links in the app", () => {
  const html = renderMarkdown("[file](components/MarkdownBody.tsx)");

  assert.match(html, /<a href="components\/MarkdownBody\.tsx">file<\/a>/);
  assert.doesNotMatch(html, /target=|rel=|\snode=/);
});

test("renders a code citation with a line and no private path in the markup", () => {
  const html = renderMarkdown("[source](/home/me/project/src/main.ts#L12)");

  assert.match(html, /<button[^>]*aria-label="main\.ts line 12"[^>]*>/);
  assert.match(html, /main\.ts/);
  assert.match(html, /Code/);
  assert.match(html, /\(line 12\)/);
  assert.doesNotMatch(html, /\/home\/me\/project|href=|title="\/home/);
});

test("renders citation types and locations from local links", () => {
  const examples = [
    ["[source](./src/main.ts#L12-L18)", "main.ts lines 12-18", "Code", "(lines 12-18)"],
    ["[report](./report.pdf#page=7)", "report.pdf page 7", "Document", "(page 7)"],
    ["[diagram](./diagram.png \"citation\")", "diagram.png", "Image", ""],
    ["[deck](./deck.pptx#slide=4)", "deck.pptx slide 4", "Presentation", "(slide 4)"],
    ["[chart](./deck.pptx#slide=4&object=Growth%20chart)", "deck.pptx slide 4, Growth chart", "Presentation", "(slide 4, Growth chart)"],
    ["[cell](./data.xlsx#sheet=Summary&object=Revenue)", "data.xlsx Summary, Revenue", "Spreadsheet", "(Summary, Revenue)"],
    ["[archive](./archive.zip \"citation\")", "archive.zip", "File", ""],
  ];

  for (const [markdown, ariaLabel, typeLabel, locationLabel] of examples) {
    const html = renderMarkdown(markdown);
    assert.match(html, /<button/);
    assert.ok(html.includes(`aria-label="${ariaLabel}"`), html);
    assert.ok(html.includes(`>${typeLabel}</span>`), html);
    if (locationLabel) assert.ok(html.includes(`>${locationLabel}</span>`), html);
  }
});

test("uses an explicit type for an extensionless citation", () => {
  const html = renderMarkdown("[file](./Dockerfile#L3 \"citation:code\")");

  assert.match(html, /aria-label="Dockerfile, Code line 3"/);
  assert.match(html, />Code<\/span>/);
  assert.match(renderMarkdown("[file](./LICENSE \"citation:document\")"), /aria-label="LICENSE, Document"/);
});

test("opens a citation in the existing file surface", async () => {
  const paths = [];
  const view = await mount(React.createElement(I18nProvider, null,
    React.createElement(MarkdownBody, { cwd: "/home/me/project", onOpenFile: (path) => paths.push(path) },
      "[source](./src/main.ts#L12)")));
  try {
    const citation = view.container.querySelector("button[aria-label='main.ts line 12']");
    assert.ok(citation);
    await click(citation);
    assert.deepEqual(paths, ["/home/me/project/src/main.ts"]);
  } finally {
    await view.unmount();
  }
});

test("names an unavailable citation without rendering its private path", () => {
  const html = renderMarkdown("[missing](/home/me/project/missing.pdf \"citation\")", { onOpenFile: undefined });

  assert.match(html, /role="note"/);
  assert.match(html, /missing\.pdf/);
  assert.match(html, /Unavailable/);
  assert.doesNotMatch(html, /<button|\/home\/me\/project|href=/);

  const outside = renderMarkdown("[outside](../../private/secret.ts \"citation\")");
  assert.match(outside, /role="note"/);
  assert.doesNotMatch(outside, /<button|\.\.\/\.\.\/private/);
});

test("keeps single-tilde CJK numeric ranges literal instead of striking them", () => {
  const html = renderMarkdown("5~7U 保证金 × 100~200倍杠杆");

  assert.doesNotMatch(html, /<del>/);
  assert.match(html, /5~7U/);
  assert.match(html, /100~200倍/);
});

test("still renders double-tilde strikethrough", () => {
  const html = renderMarkdown("~~gone~~");

  assert.match(html, /<del>gone<\/del>/);
});

test("renders LaTeX parenthesis delimiters as inline math", () => {
  const html = renderMarkdown(String.raw`射线为 \(r_c = K^{-1}p\)。`);

  assert.match(html, /class="katex"/);
  assert.match(html, /r_c/);
});

test("renders paired LaTeX bracket delimiters as display math", () => {
  const html = renderMarkdown(String.raw`\[
P(\lambda)=o_b+\lambda r_b
\]`);
  const oneLineHtml = renderMarkdown(String.raw`\[P(\lambda)=o_b+\lambda r_b\]`);

  assert.match(html, /class="katex-display"/);
  assert.match(html, /lambda/);
  assert.match(oneLineHtml, /class="katex-display"/);
});

test("leaves an unmatched LaTeX bracket delimiter unchanged", () => {
  const markdown = String.raw`before
\[
x + y
after`;

  assert.equal(normalizeDisplayMath(markdown), markdown);
});

test("copies only the selected rendered table as tab-separated rows", async () => {
  const copied = [];
  const previousClipboard = navigator.clipboard;
  navigator.clipboard = { writeText: async (text) => { copied.push(text); } };
  const view = await mount(React.createElement(I18nProvider, null,
    React.createElement(MarkdownBody, null,
      "| Name | Value |\n| --- | --- |\n| Alpha | **2** |\n\n| Other | Count |\n| --- | --- |\n| Beta | 3 |")));
  try {
    const buttons = view.container.querySelectorAll("[aria-label='Copy table']");
    assert.equal(buttons.length, 2);
    await click(buttons[0]);
    assert.deepEqual(copied, ["Name\tValue\nAlpha\t2"]);
  } finally {
    await view.unmount();
    navigator.clipboard = previousClipboard;
  }
});

test("expands one Markdown table into a labelled dialog that closes by button and Escape", async () => {
  const view = await mount(React.createElement(I18nProvider, null,
    React.createElement(MarkdownBody, null,
      "| Name | Value |\n| --- | --- |\n| Alpha | 2 |")));
  try {
    const expand = view.container.querySelector("[aria-label='Expand table']");
    assert.ok(expand);
    expand.focus();
    await click(expand);

    let dialog = domDocument.body.querySelector("[role='dialog']");
    assert.ok(dialog);
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    assert.equal(dialog.getAttribute("aria-label"), "Table preview");
    assert.match(dialog.textContent, /NameValueAlpha2/);
    assert.equal(dialog.querySelectorAll("table").length, 1);
    const close = dialog.querySelector("[aria-label='Close table preview']");
    assert.ok(close);
    assert.equal(focused(), close);
    await click(close);
    assert.equal(domDocument.body.querySelector("[role='dialog']"), null);
    assert.equal(focused(), expand);

    await click(expand);
    dialog = domDocument.body.querySelector("[role='dialog']");
    assert.ok(dialog);
    await press(dialog, "Escape");
    assert.equal(domDocument.body.querySelector("[role='dialog']"), null);
    assert.equal(focused(), expand);
  } finally {
    await view.unmount();
  }
});

test("does not normalize LaTeX delimiters inside Markdown code", () => {
  const markdown = "    \\(indented\\)\n\n`code\n\\(inline\\)`\n\n```text\n\\[\nfenced\n\\]\n```";

  assert.equal(normalizeDisplayMath(markdown), markdown);
});

test("does not normalize LaTeX delimiters inside raw HTML code", () => {
  const markdown = "<code>\\(inline\\)</code>\n\n<pre>\n\\(block\\)\n</pre>";

  assert.equal(normalizeDisplayMath(markdown), markdown);
});

test("does not normalize escaped delimiters or link destinations", () => {
  const escaped = String.raw`Literal: \\(x+y\\).`;
  const link = String.raw`[docs](https://example.com/\(manual\))`;

  assert.equal(normalizeDisplayMath(escaped), escaped);
  assert.equal(normalizeDisplayMath(link), link);
});

test("labels inline assistant images while loading and after load", async () => {
  const view = await mount(React.createElement(I18nProvider, null,
    React.createElement(MarkdownBody, { enableMedia: true }, "![](https://example.com/diagram.png)")));
  try {
    const image = view.container.querySelector("img");
    const button = view.container.querySelector("button");

    assert.ok(image);
    assert.ok(button);
    assert.equal(button.getAttribute("aria-label"), "Image loading");
    assert.equal(button.getAttribute("aria-busy"), "true");

    await React.act(async () => { image.dispatchEvent(new DomEvent("load")); });

    const loadedButton = view.container.querySelector("button");
    assert.equal(loadedButton.getAttribute("aria-label"), "Open image preview");
    assert.equal(loadedButton.getAttribute("aria-busy"), null);

    const opened = [];
    const previousOpen = domWindow.open;
    domWindow.open = (...args) => {
      opened.push(args);
      return null;
    };
    try {
      await click(loadedButton);
      assert.deepEqual(opened, [["https://example.com/diagram.png", "_blank", "noopener,noreferrer"]]);
    } finally {
      if (previousOpen) domWindow.open = previousOpen;
      else delete domWindow.open;
    }
  } finally {
    await view.unmount();
  }
});

test("uses supplied image alt text for loading and unavailable states", async () => {
  const view = await mount(React.createElement(I18nProvider, null,
    React.createElement(MarkdownBody, { enableMedia: true }, "![Release diagram](https://example.com/diagram.png)")));
  try {
    const image = view.container.querySelector("img");
    assert.equal(view.container.querySelector("button").getAttribute("aria-label"), "Release diagram");

    await React.act(async () => { image.dispatchEvent(new DomEvent("load")); });

    assert.equal(view.container.querySelector("button").getAttribute("aria-label"), "Release diagram");
  } finally {
    await view.unmount();
  }

  const failedView = await mount(React.createElement(I18nProvider, null,
    React.createElement(MarkdownBody, { enableMedia: true }, "![Release diagram](https://example.com/diagram.png)")));
  try {
    const image = failedView.container.querySelector("img");
    await React.act(async () => { image.dispatchEvent(new DomEvent("error")); });

    const fallback = failedView.container.querySelector("[role='img']");
    assert.ok(fallback);
    assert.equal(fallback.getAttribute("aria-label"), "Release diagram");
    assert.equal(failedView.container.querySelector("img"), null);
  } finally {
    await failedView.unmount();
  }
});

test("shows the unavailable label when an image has no alt text", async () => {
  const view = await mount(React.createElement(I18nProvider, null,
    React.createElement(MarkdownBody, { enableMedia: true }, "![](https://example.com/missing.png)")));
  try {
    const image = view.container.querySelector("img");
    await React.act(async () => { image.dispatchEvent(new DomEvent("error")); });

    const fallback = view.container.querySelector("[role='img']");
    assert.ok(fallback);
    assert.equal(fallback.getAttribute("aria-label"), "Image unavailable");
  } finally {
    await view.unmount();
  }
});

test("keeps regular Markdown images outside assistant media controls", () => {
  const html = renderMarkdown("![Chart](https://example.com/chart.png)");

  assert.match(html, /<img[^>]*alt="Chart"/);
  assert.doesNotMatch(html, /<button|Image loading|Open image preview/);
});

test("plays inline assistant Markdown video and labels its unavailable state", async () => {
  const view = await mount(React.createElement(I18nProvider, null,
    React.createElement(MarkdownBody, { enableMedia: true }, "<video src=\"https://example.com/clip.mp4\"></video>")));
  try {
    const video = view.container.querySelector("video");
    assert.ok(video);
    assert.equal(video.getAttribute("aria-label"), "Video");
    assert.ok(video.hasAttribute("controls"));

    await React.act(async () => { video.dispatchEvent(new DomEvent("error")); });

    const fallback = view.container.querySelector("[role='img']");
    assert.ok(fallback);
    assert.equal(fallback.getAttribute("aria-label"), "Video unavailable");
    assert.equal(view.container.querySelector("video"), null);
  } finally {
    await view.unmount();
  }
});

test("uses supplied video alt text and leaves non-assistant videos disabled", async () => {
  const markdown = "<video alt=\"Release clip\"><source src=\"https://example.com/clip.mp4\" type=\"video/mp4\"></video>";
  const assistant = renderMarkdown(markdown, { enableMedia: true });
  const nonAssistant = renderMarkdown(markdown);

  assert.match(assistant, /<video[^>]*aria-label="Release clip"/);
  assert.match(assistant, /<source src="https:\/\/example\.com\/clip\.mp4" type="video\/mp4"/);
  assert.doesNotMatch(nonAssistant, /<video|Video unavailable/);

  const view = await mount(React.createElement(I18nProvider, null,
    React.createElement(MarkdownBody, { enableMedia: true }, markdown)));
  try {
    const video = view.container.querySelector("video");
    assert.ok(video);
    assert.equal(video.getAttribute("aria-label"), "Release clip");
    await React.act(async () => { video.dispatchEvent(new DomEvent("error")); });

    const fallback = view.container.querySelector("[role='img']");
    assert.ok(fallback);
    assert.equal(fallback.getAttribute("aria-label"), "Release clip");
  } finally {
    await view.unmount();
  }
});

test("renders an accessible inline audio player with keyboard controls", async () => {
  const view = await mount(React.createElement(I18nProvider, null,
    React.createElement(MarkdownBody, { enableMedia: true }, "<audio src=\"https://example.com/field-recording.mp3\"></audio>")));
  try {
    const player = view.container.querySelector("[role='group']");
    const audio = view.container.querySelector("audio");
    const play = view.container.querySelector("button");
    const timeline = view.container.querySelector("input");
    assert.ok(player);
    assert.ok(audio);
    assert.ok(play);
    assert.ok(timeline);
    assert.equal(player.getAttribute("aria-label"), "Audio");
    assert.equal(play.getAttribute("aria-label"), "Play field-recording.mp3");
    assert.equal(timeline.getAttribute("aria-label"), "Seek in field-recording.mp3");
    assert.equal(view.container.textContent.includes("MP3 audio"), true);
    assert.equal(view.container.textContent.includes("Loading audio…"), true);

    let paused = false;
    audio.play = async () => { paused = false; };
    audio.pause = () => { paused = true; };
    Object.defineProperty(audio, "duration", { configurable: true, value: 125 });
    await React.act(async () => { audio.dispatchEvent(new DomEvent("loadedmetadata")); });
    assert.equal(view.container.textContent.includes("0:00 / 2:05"), true);

    await click(play);
    assert.equal(paused, false);
    await React.act(async () => { audio.dispatchEvent(new DomEvent("play")); });
    assert.equal(play.getAttribute("aria-label"), "Pause field-recording.mp3");

    await typeInto(timeline, "30");
    assert.equal(audio.currentTime, 30);
  } finally {
    await view.unmount();
  }
});

test("labels inline audio failure and keeps raw audio out of file previews", async () => {
  const view = await mount(React.createElement(I18nProvider, null,
    React.createElement(MarkdownBody, { enableMedia: true }, "<audio src=\"https://example.com/missing.mp3\"></audio>")));
  try {
    const audio = view.container.querySelector("audio");
    await React.act(async () => { audio.dispatchEvent(new DomEvent("error")); });
    const fallback = view.container.querySelector("[role='img']");
    assert.ok(fallback);
    assert.equal(fallback.getAttribute("aria-label"), "Audio unavailable");
    assert.equal(view.container.textContent.includes("Audio unavailable"), true);
  } finally {
    await view.unmount();
  }

  const preview = renderToStaticMarkup(React.createElement(ReactMarkdown, {
    remarkPlugins: markdownRemarkPlugins,
    rehypePlugins: markdownPreviewRehypePlugins,
  }, "<audio src=\"https://example.com/clip.mp3\"></audio>"));
  assert.doesNotMatch(preview, /<audio|<source/);
});

test("keeps raw videos out of file previews", () => {
  const preview = renderToStaticMarkup(React.createElement(ReactMarkdown, {
    remarkPlugins: markdownRemarkPlugins,
    rehypePlugins: markdownPreviewRehypePlugins,
  }, "<video src=\"https://example.com/clip.mp4\"></video>"));

  assert.doesNotMatch(preview, /<video|<source/);
});
