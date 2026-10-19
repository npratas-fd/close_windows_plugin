// Settings live in chrome.storage.sync as { urls: string[], seconds: number }.

export const DEFAULT_SECONDS = 10;

export function loadSettings(storageArea) {
  return storageArea.get({ urls: [], seconds: DEFAULT_SECONDS });
}

export function parseSettingsForm(urlsText, secondsText) {
  const urls = urlsText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

  const trimmedSeconds = secondsText.trim();
  const seconds = Number(trimmedSeconds);
  if (trimmedSeconds === '' || !Number.isInteger(seconds) || seconds < 1) {
    return { ok: false, error: 'Enter a whole number of seconds (1 or more).' };
  }
  return { ok: true, settings: { urls, seconds } };
}

// Appends an entry unless it is blank or already listed (ignoring the scheme
// and letter case).
export function addEntry(urls, entry) {
  const comparable = (text) => text.trim().replace(/^https?:\/\//i, '').toLowerCase();
  const candidate = entry.trim();
  if (candidate === '' || urls.some((url) => comparable(url) === comparable(candidate))) {
    return { added: false, urls };
  }
  return { added: true, urls: [...urls, candidate] };
}
