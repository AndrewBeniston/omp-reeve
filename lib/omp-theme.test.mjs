import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { getAvailableWebThemes, getWebThemeConfig, getWebThemePalette } = await jiti.import("./omp-theme.ts");
const { WEB_THEME_VARIABLE_NAMES } = await jiti.import("./theme-contract.ts");

function luminance(value) {
  const channels = typeof value === "string"
    ? (() => {
        assert.match(value, /^#[0-9a-f]{6}$/i);
        return [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
      })()
    : value;
  const [red, green, blue] = channels.map((channel) => (
    channel / 255 <= 0.04045
      ? channel / 255 / 12.92
      : ((channel / 255 + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function mixRgb(from, to, amount) {
  const channels = (value) => typeof value === "string"
    ? [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16))
    : value;
  const fromChannels = channels(from);
  const toChannels = channels(to);
  return fromChannels.map((fromChannel, index) => {
    const toChannel = toChannels[index];
    return fromChannel + (toChannel - fromChannel) * amount;
  });
}

const supportedPaletteEntries = (async () => {
  const selectableThemes = await getAvailableWebThemes();
  const entries = [];
  for (const { name } of selectableThemes) {
    entries.push([name, await getWebThemePalette(name)]);
  }
  assert.ok(entries.length >= 98, "The test must cover every selectable OMP palette.");
  return entries;
})();

test("every selectable OMP palette emits exactly the twenty-six Tier 1 adapter variables", async () => {
  for (const [theme, palette] of await supportedPaletteEntries) {
    assert.deepEqual(Object.keys(palette.variables), WEB_THEME_VARIABLE_NAMES);
    assert.equal(Object.keys(palette.variables).length, 26, theme);
  }
});

test("OMP palettes preserve muted and dim contrast across primary surfaces", async () => {
  for (const theme of ["titanium", "light"]) {
    const { variables } = await getWebThemePalette(theme);
    for (const background of [variables["--bg"], variables["--bg-panel"]]) {
      assert.ok(contrast(variables["--text-muted"], background) >= 5.99);
      assert.ok(contrast(variables["--text-dim"], background) >= 4.99);
    }
  }
});

test("unsupported configured themes fall back to complete default palettes", async () => {
  const configured = {
    get(path) {
      if (path === "theme.dark") return "onyx";
      if (path === "theme.light") return "light-prism";
      return undefined;
    },
  };

  const config = await getWebThemeConfig(configured);

  assert.deepEqual(config.names, { dark: "titanium", light: "light" });
  assert.equal(config.palettes.dark.name, "titanium");
  assert.equal(config.palettes.light.name, "light");
  assert.deepEqual(Object.keys(config.palettes.dark.variables), WEB_THEME_VARIABLE_NAMES);
  assert.deepEqual(Object.keys(config.palettes.light.variables), WEB_THEME_VARIABLE_NAMES);
});

test("syntax-text tokens meet WCAG AA across every supported palette and code surface", async () => {
  const syntaxTokens = [
    "--syntax-text",
    "--syntax-text-muted",
    "--syntax-accent",
    "--syntax-success",
    "--syntax-danger",
    "--syntax-warning",
  ];

  for (const [theme, { colorScheme, variables }] of await supportedPaletteEntries) {
    const sidebarTextAmount = colorScheme === "light" ? 0.025 : 0.08;
    const sidebar = mixRgb(variables["--assistant-bg"], variables["--text"], sidebarTextAmount);
    const surfaces = {
      "FileViewer source": variables["--bg"],
      "TerminalOutput command": mixRgb(variables["--tool-bg"], sidebar, 0.2),
      "TerminalOutput output": variables["--tool-bg"],
    };
    for (const token of syntaxTokens) {
      for (const [surface, background] of Object.entries(surfaces)) {
        const ratio = contrast(variables[token], background);
        assert.ok(ratio >= 4.5, `${theme} ${token} has ${ratio.toFixed(3)}:1 on ${surface}`);
      }
    }
  }
});
