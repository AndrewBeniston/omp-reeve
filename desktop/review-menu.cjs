/*
 * The applications on this machine are resolved in the server, not here, and
 * arrive with the menu request. While that request is still in flight the menu
 * carries one disabled entry saying so: a submenu that is empty because an
 * answer has not come back yet reads as "nothing is installed".
 */
function openTargetEntries({ targets, preferredTargetId, onAction }) {
  if (!Array.isArray(targets)) return { primary: null, offered: [] };
  const offered = targets
    .filter((target) => target && typeof target.id === 'string' && typeof target.label === 'string')
    .map((target) => ({
      label: target.label,
      enabled: target.available !== false,
      click: () => onAction(`open-in:${target.id}`),
      id: target.id,
    }));
  const preferred = offered.find((entry) => entry.id === preferredTargetId) ?? null;
  return {
    primary: preferred ? { label: `Open in ${preferred.label}`, click: preferred.click } : null,
    offered,
  };
}

function createReviewMenuTemplate({ hasSelection, targets, preferredTargetId, loadingTargets, onAction }) {
  const { primary, offered } = openTargetEntries({ targets, preferredTargetId, onAction });
  const openWith = [{ label: 'New tab', click: () => onAction('open-file') }];
  if (loadingTargets === true) openWith.push({ type: 'separator' }, { label: 'Looking for applications…', enabled: false });
  else if (offered.length) openWith.push({ type: 'separator' }, ...offered.map(({ id, ...entry }) => entry));
  return [
    ...(primary ? [primary] : []),
    { label: 'Open with', submenu: openWith },
    { type: 'separator' },
    { label: 'Copy selection', enabled: hasSelection === true, click: () => onAction('copy-selection') },
    { label: 'Copy path', click: () => onAction('copy-path') },
    { label: 'Copy relative path', click: () => onAction('copy-relative-path') },
    { label: 'Copy diff', click: () => onAction('copy-diff') },
    { label: 'Toggle line wrap', click: () => onAction('toggle-wrap') },
  ];
}

function registerReviewMenu({ ipcMain, BrowserWindow, Menu, isTrusted }) {
  ipcMain.handle('omp-desktop:show-review-menu', (event, state) => {
    if (!isTrusted(event)) throw new Error('Review menu request is not from the application.');
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error('Review menu request has no application window.');
    return new Promise((resolve) => {
      let action = null;
      const menu = Menu.buildFromTemplate(createReviewMenuTemplate({
        hasSelection: state?.hasSelection === true,
        targets: state?.targets,
        preferredTargetId: state?.preferredTargetId,
        loadingTargets: state?.loadingTargets === true,
        onAction: (value) => { action = value; },
      }));
      menu.popup({ window, callback: () => resolve(action) });
    });
  });
}

module.exports = { createReviewMenuTemplate, registerReviewMenu };
