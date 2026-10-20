// Settings live in chrome.storage.sync as
// { urls: string[], seconds: number, disabled: string[] }.
// `disabled` lists the entries that are turned off; they stay in `urls` but
// close nothing. Entries are compared ignoring the scheme and letter case.

export const DEFAULT_SECONDS = 10;

export function loadSettings(storageArea) {
  return storageArea.get({ urls: [], seconds: DEFAULT_SECONDS, disabled: [] });
}

export function parseSeconds(text) {
  const trimmed = text.trim();
  const seconds = Number(trimmed);
  if (trimmed === '' || !Number.isInteger(seconds) || seconds < 1) {
    return { ok: false, error: 'Enter a whole number of seconds (1 or more).' };
  }
  return { ok: true, seconds };
}

const comparable = (text) => text.trim().replace(/^https?:\/\//i, '').toLowerCase();
const sameEntry = (a, b) => comparable(a) === comparable(b);
const includesEntry = (list, entry) => list.some((item) => sameEntry(item, entry));

// Appends an entry unless it is blank or already listed.
export function addEntry(urls, entry) {
  const candidate = entry.trim();
  if (candidate === '' || includesEntry(urls, candidate)) return { added: false, urls };
  return { added: true, urls: [...urls, candidate] };
}

// The entries that close tabs: every listed entry that is not turned off.
export function activeEntries({ urls, disabled = [] }) {
  return urls.filter((url) => !includesEntry(disabled, url));
}

// 'on', 'off', or 'removed' when the entry is no longer listed.
export function entryState({ urls, disabled = [] }, entry) {
  if (!includesEntry(urls, entry)) return 'removed';
  return includesEntry(disabled, entry) ? 'off' : 'on';
}

export function setEntryEnabled({ disabled = [] }, entry, enabled) {
  const others = disabled.filter((item) => !sameEntry(item, entry));
  return { disabled: enabled ? others : [...others, entry.trim()] };
}

export function removeEntry({ urls, disabled = [] }, entry) {
  return {
    urls: urls.filter((url) => !sameEntry(url, entry)),
    disabled: disabled.filter((item) => !sameEntry(item, entry)),
  };
}

// Replaces the list with the lines of `text`. Entries that are kept stay
// turned off if they were.
export function replaceEntries({ disabled = [] }, text) {
  const urls = text.split('\n').reduce((list, line) => addEntry(list, line).urls, []);
  return { urls, disabled: disabled.filter((item) => includesEntry(urls, item)) };
}
