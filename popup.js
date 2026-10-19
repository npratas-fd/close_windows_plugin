import { findMatchingEntry, suggestEntry } from './src/matcher.js';
import { addEntry, loadSettings } from './src/settings.js';

const statusCard = document.getElementById('tab-status');
const statusText = document.getElementById('tab-status-text');
const keepButton = document.getElementById('keep-open');
const addForm = document.getElementById('add-form');
const entryField = document.getElementById('entry');
const addButton = addForm.querySelector('button[type="submit"]');
const addError = document.getElementById('add-error');
const addNote = document.getElementById('add-note');

document.getElementById('open-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

// --- This tab: countdown and "keep open" ---------------------------------

let countdownTimer;

function renderStatus(status) {
  clearInterval(countdownTimer);
  statusCard.hidden = status?.state !== 'closing' && status?.state !== 'kept';

  if (status?.state === 'kept') {
    statusText.textContent = 'This tab will stay open.';
    keepButton.hidden = true;
  } else if (status?.state === 'closing') {
    const update = () => {
      const seconds = Math.ceil((status.closesAt - Date.now()) / 1000);
      if (seconds > 0) {
        statusText.replaceChildren('This tab closes in ', strong(`${seconds} s`), '.');
      } else {
        statusText.textContent = 'Closing…';
        keepButton.hidden = true;
      }
    };
    keepButton.hidden = false;
    update();
    countdownTimer = setInterval(update, 250);
  }
}

keepButton.addEventListener('click', async () => {
  keepButton.disabled = true;
  renderStatus(await chrome.runtime.sendMessage({ type: 'keep-tab-open', tabId: tab.id }));
  keepButton.disabled = false;
});

// --- Add this page ---------------------------------------------------------

function renderAdd({ urls, seconds }, addedEntry) {
  addError.hidden = true;
  const suggestion = suggestEntry(tab?.url);
  const match = suggestion === null ? null : findMatchingEntry(tab.url, urls);

  if (addedEntry) {
    showNote('added', 'Added ', code(addedEntry), `. Tabs that open it from now on close after ${seconds} s.`);
  } else if (suggestion === null) {
    showNote('muted', 'Pages like this one can’t be closed automatically.');
  } else if (match !== null) {
    showNote('muted', 'This page is in your list as ', code(match), '.');
  } else {
    addNote.hidden = true;
    addForm.hidden = false;
    entryField.value = suggestion;
    addButton.disabled = false;
  }
}

function showNote(kind, ...content) {
  addForm.hidden = true;
  addNote.hidden = false;
  addNote.className = `note ${kind}`;
  addNote.replaceChildren(...content);
}

entryField.addEventListener('input', () => {
  addButton.disabled = entryField.value.trim() === '';
  addError.hidden = true;
});

addForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const settings = await loadSettings(chrome.storage.sync);
  const result = addEntry(settings.urls, entryField.value);
  if (!result.added) {
    addError.textContent = 'That entry is already in your list.';
    addError.hidden = false;
    return;
  }
  await chrome.storage.sync.set({ urls: result.urls });
  renderAdd({ ...settings, urls: result.urls }, result.urls.at(-1));
});

// ---------------------------------------------------------------------------

function strong(text) {
  const element = document.createElement('strong');
  element.textContent = text;
  return element;
}

function code(text) {
  const element = document.createElement('code');
  element.textContent = text;
  return element;
}

renderAdd(await loadSettings(chrome.storage.sync));
if (tab) renderStatus(await chrome.runtime.sendMessage({ type: 'get-tab-status', tabId: tab.id }));
