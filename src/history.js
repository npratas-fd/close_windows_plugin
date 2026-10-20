// Tabs the extension closed, newest first, in chrome.storage.local (this
// computer only). Each item: { url, title, entry, closedAt }.

const HISTORY_KEY = 'history';
const HISTORY_LIMIT = 50;

export async function loadHistory(storageArea) {
  const { [HISTORY_KEY]: history } = await storageArea.get({ [HISTORY_KEY]: [] });
  return history;
}

export async function recordClosedTab(storageArea, item) {
  const history = await loadHistory(storageArea);
  await storageArea.set({ [HISTORY_KEY]: [item, ...history].slice(0, HISTORY_LIMIT) });
}

export function clearHistory(storageArea) {
  return storageArea.remove(HISTORY_KEY);
}

// Calls `listener` with the new history whenever it changes.
export function onHistoryChanged(storage, listener) {
  storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && HISTORY_KEY in changes) listener(changes[HISTORY_KEY].newValue ?? []);
  });
}
