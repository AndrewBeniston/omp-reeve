/**
 * Putting text on the clipboard.
 *
 * Two entry points on purpose. `copyTextOrFail` reports what actually
 * happened, which is what a control that says "Copied" needs. `copyText` keeps
 * the older, quieter contract because three of its callers never catch it, and
 * making it reject more often would turn a refused copy into an unhandled
 * rejection somewhere else in the application.
 */

/** The one message a refused copy reports, and the one `copyText` keeps quiet. */
const REFUSED = "The clipboard refused this copy.";

/**
 * The fallback for a browser that will not hand over the clipboard API, or a
 * page that is not allowed to use it. Returns whether the copy was accepted:
 * `execCommand` reports a refusal by returning false rather than by throwing.
 */
function copyThroughDocument(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(area);
  }
}

/** Copy, and reject if the clipboard refused it. */
export async function copyTextOrFail(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      // A present API is not a permitted one: the desktop shell can refuse
      // clipboard-write to the renderer. The document command is still
      // allowed there, so a rejection means try the fallback, not give up.
      if (copyThroughDocument(text)) return;
      throw new Error(REFUSED, { cause: error });
    }
  }
  if (!copyThroughDocument(text)) throw new Error(REFUSED);
}

/**
 * Copy, reporting only the failures the older callers already handle.
 *
 * A refusal the fallback reports by returning false resolves here, exactly as
 * it always has. Prefer `copyTextOrFail` in new code, and in any control whose
 * label claims the copy succeeded.
 */
export function copyText(text: string): Promise<void> {
  return copyTextOrFail(text).catch((error: unknown) => {
    if (error instanceof Error && error.message === REFUSED) return;
    return Promise.reject(error);
  });
}
