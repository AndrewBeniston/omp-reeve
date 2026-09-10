import cssModule from "./recipes.module.css";

type CssModuleClasses = Partial<Record<string, string>>;

/**
 * Read one class name from the compiled CSS module.
 *
 * A compiled CSS module lists every class it declares. A name that is absent
 * from that list is a typo or a deleted rule, so the lookup throws instead of
 * emitting an unstyled class name.
 *
 * A runtime without the CSS module pipeline, such as the test runner, imports
 * an empty object. That runtime keeps the plain name so class identity stays
 * stable. `lib/ui/recipes.test.mjs` checks every name against
 * `recipes.module.css`, so a typo still fails a test in that runtime.
 */
export function resolveRecipeClass(classes: CssModuleClasses, name: string): string {
  const compiled = classes[name];
  if (typeof compiled === "string" && compiled.length > 0) return compiled;
  if (Object.keys(classes).length > 0) {
    throw new Error(`Missing CSS module class in recipes.module.css: ${name}`);
  }
  return name;
}

const compiledClasses = cssModule as CssModuleClasses;

const styles = new Proxy({} as Record<string, string>, {
  get(_target, property: string) {
    return resolveRecipeClass(compiledClasses, property);
  },
});

export const recipes = {
  button: {
    base: styles.button,
    variants: {
      tone: {
        neutral: styles.buttonNeutral,
        primary: styles.buttonPrimary,
        danger: styles.buttonDanger,
        ghost: styles.buttonGhost,
      },
      size: { sm: styles.buttonSm, md: styles.buttonMd, lg: styles.buttonLg },
      fullWidth: { true: styles.fullWidth, false: styles.inlineWidth },
    },
  },
  iconButton: {
    base: styles.iconButton,
    variants: {
      tone: {
        neutral: styles.iconButtonNeutral,
        primary: styles.iconButtonPrimary,
        danger: styles.iconButtonDanger,
      },
      size: { sm: styles.iconButtonSm, md: styles.iconButtonMd, touch: styles.iconButtonTouch },
      pressed: { true: styles.pressed, false: styles.notPressed, mixed: styles.pressedMixed },
    },
  },
  surface: {
    base: styles.surface,
    variants: {
      tone: {
        canvas: styles.surfaceCanvas,
        main: styles.surfaceMain,
        sidebar: styles.surfaceSidebar,
        surface: styles.surfaceDefault,
        elevated: styles.surfaceElevated,
        inset: styles.surfaceInset,
      },
      border: { none: styles.borderNone, default: styles.borderDefault, strong: styles.borderStrong },
      radius: {
        none: styles.radiusNone,
        sm: styles.radiusSm,
        md: styles.radiusMd,
        lg: styles.radiusLg,
        card: styles.radiusCard,
      },
      elevation: { none: styles.elevationNone, raised: styles.elevationRaised },
      padding: { none: styles.paddingNone, sm: styles.paddingSm, md: styles.paddingMd, lg: styles.paddingLg },
    },
  },
  statusBadge: {
    base: styles.statusBadge,
    variants: {
      tone: {
        neutral: styles.statusNeutral,
        success: styles.statusSuccess,
        warning: styles.statusWarning,
        danger: styles.statusDanger,
        info: styles.statusInfo,
      },
    },
  },
  disclosure: {
    base: styles.disclosure,
    variants: { density: { compact: styles.disclosureCompact, default: styles.disclosureDefault } },
  },
  disclosureTrigger: {
    base: styles.disclosureTrigger,
    variants: { expanded: { true: styles.disclosureTriggerExpanded, false: styles.disclosureTriggerClosed } },
  },
  disclosurePanel: {
    base: styles.disclosurePanel,
    variants: { expanded: { true: styles.disclosurePanelExpanded, false: styles.disclosurePanelClosed } },
  },
  dialogBackdrop: {
    base: styles.dialogBackdrop,
    variants: {
      open: { true: styles.dialogBackdropOpen, false: styles.dialogBackdropClosed },
      presentation: {
        centered: styles.dialogBackdropCentered,
        fullWindow: styles.dialogBackdropFullWindow,
      },
    },
  },
  dialog: {
    base: styles.dialog,
    variants: {
      presentation: { centered: styles.dialogCentered, fullWindow: styles.dialogFullWindow },
      size: { sm: styles.dialogSm, md: styles.dialogMd, lg: styles.dialogLg },
    },
  },
  menu: {
    base: styles.menu,
    variants: { open: { true: styles.menuOpen, false: styles.menuClosed } },
  },
  menuSurface: { base: styles.menuSurface },
  menuItem: {
    base: styles.menuItem,
    variants: { tone: { neutral: styles.menuItemNeutral, danger: styles.menuItemDanger } },
  },
  menuItemSurface: { base: styles.menuItemSurface },
  menuItemIcon: { base: styles.menuItemIcon },
  tabs: {
    base: styles.tabs,
    variants: { orientation: { horizontal: styles.tabsHorizontal, vertical: styles.tabsVertical } },
  },
  tabList: {
    base: styles.tabList,
    variants: { orientation: { horizontal: styles.tabListHorizontal, vertical: styles.tabListVertical } },
  },
  tab: {
    base: styles.tab,
    variants: { selected: { true: styles.tabSelected, false: styles.tabUnselected } },
  },
  tabPanel: { base: styles.tabPanel },
  tooltip: { base: styles.tooltip },
  tooltipBubble: {
    base: styles.tooltipBubble,
    variants: { visible: { true: styles.tooltipVisible, false: styles.tooltipHidden } },
  },
  formField: { base: styles.formField },
  formLabel: { base: styles.formLabel },
  formDescription: { base: styles.formDescription },
  formError: { base: styles.formError },
  visuallyHidden: { base: styles.visuallyHidden },
  dynamicStyleVars: { base: styles.dynamicStyleVars },
} as const;

type VariantValue<Value> = Value extends "true"
  ? true
  : Value extends "false"
    ? false
    : Value;

type RecipeVariantOptions<Recipe> = Recipe extends {
  readonly variants: infer Variants;
}
  ? {
      [Variant in keyof Variants]: Variants[Variant] extends Readonly<Record<PropertyKey, string>>
        ? VariantValue<keyof Variants[Variant]>
        : never;
    }
  : Record<never, never>;

export type RecipeVariants = {
  [RecipeName in keyof typeof recipes]: RecipeVariantOptions<(typeof recipes)[RecipeName]>;
};
