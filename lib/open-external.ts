export function openExternal(url: string): void {
  const desktop = (
    globalThis as unknown as {
      ompDesktop?: {
        openExternal: (url: string) => Promise<unknown>
      }
    }
  ).ompDesktop

  const openBrowserTab = () => {
    window.open(url, "_blank", "noopener,noreferrer")
  }

  if (desktop) {
    try {
      Promise.resolve(desktop.openExternal(url)).catch(openBrowserTab)
    } catch {
      openBrowserTab()
    }
    return
  }

  openBrowserTab()
}
