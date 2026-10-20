// Tabs the extension closed, newest first, in chrome.storage.local (this
// computer only). Each item: { url, title, entry, closedAt }. Alongside it,
// `closedCounts` keeps how many tabs each entry has closed in total; clearing
// the history leaves those counts alone.

const HISTORY_KEY = 'history';
const COUNTS_KEY = 'closedCounts';
const HISTORY_LIMIT = 50;

export async function loadHistory(storageArea) {
  const { [HISTORY_KEY]: history } = await storageArea.get({ [HISTORY_KEY]: [] });
  return history;
}

export async function loadClosedCounts(storageArea) {
  const { [COUNTS_KEY]: counts } = await storageArea.get({ [COUNTS_KEY]: {} });
  return counts;
}

export async function recordClosedTab(storageArea, item) {
  const { [HISTORY_KEY]: history, [COUNTS_KEY]: counts } = await storageArea.get({
    [HISTORY_KEY]: [],
    [COUNTS_KEY]: {},
  });
  await storageArea.set({
    [HISTORY_KEY]: [item, ...history].slice(0, HISTORY_LIMIT),
    [COUNTS_KEY]: { ...counts, [item.entry]: (counts[item.entry] ?? 0) + 1 },
  });
}

export function clearHistory(storageArea) {
  return storageArea.remove(HISTORY_KEY);
}
