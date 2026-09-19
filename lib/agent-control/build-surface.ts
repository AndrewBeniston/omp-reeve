/**
 * Whether this build has the desktop control surface.
 *
 * A control acts on a window that only the desktop shell owns: a Terminal is a
 * real shell on the human's machine. The browser build has no such window, so
 * it registers no control at all. A remote tab then cannot drive a local
 * window, and the agent sees no tool it could never satisfy.
 *
 * The desktop launcher gives the server a launch token, and only the launcher
 * does. That is the same marker the desktop health route reads.
 */
export function desktopControlSurfacePresent(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return typeof env.OMP_WEB_DESKTOP_TOKEN === "string" && env.OMP_WEB_DESKTOP_TOKEN.length > 0;
}
