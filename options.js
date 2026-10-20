import { loadClosedCounts, loadHistory } from './src/history.js';
import {
  addEntry,
  entryState,
  loadSettings,
  parseSeconds,
  removeEntry,
  replaceEntries,
  setEntryEnabled,
} from './src/settings.js';

// Every change is saved as soon as it is made; a notice at the bottom confirms
// it and offers to undo removals and entries turned off.

const $ = (id) => document.getElementById(id);
const listView = $('list-view');
const textView = $('text-view');
const editAsTextButton = $('edit-as-text');
const entriesText = $('entries-text');
const addForm = $('add-form');
const newEntry = $('new-entry');
const addError = $('add-error');
const entriesList = $('entries');
const entriesEmpty = $('entries-empty');
const secondsField = $('seconds');
const secondsError = $('seconds-error');
const historyList = $('history-list');
const historyEmpty = $('history-empty');
const clearButton = $('clear-history');

let settings = { urls: [], seconds: 10, disabled: [] };
let history = [];
let counts = {};

async function save(changes, message, undoChanges) {
  await chrome.storage.sync.set(changes);
  settings = { ...settings, ...changes };
  render();
  showToast(message, undoChanges && (() => save(undoChanges, 'Undone.')));
}

function render() {
  renderEntries();
  renderHistory();
}

// --- Pages to close ----------------------------------------------------------

function renderEntries() {
  // Redrawing replaces the controls; put keyboard focus back where it was.
  const focusKey = entriesList.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null;
  entriesEmpty.hidden = settings.urls.length > 0;
  entriesList.replaceChildren(...settings.urls.map(renderEntry));
  if (focusKey) entriesList.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus();
}

function renderEntry(entry) {
  const on = entryState(settings, entry) === 'on';

  const toggle = element('input', 'switch');
  toggle.type = 'checkbox';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-label', `Close pages matching ${entry}`);
  toggle.dataset.focusKey = `toggle ${entry}`;
  toggle.checked = on;
  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    save(
      setEntryEnabled(settings, entry, enabled),
      enabled ? `Turned on ${entry}.` : `Turned off ${entry}.`,
      enabled ? null : setEntryEnabled(settings, entry, true),
    );
  });

  const count = element('span', 'entry-count', (on ? '' : 'Off · ') + closedCountText(counts[entry] ?? 0));

  const remove = element('button', 'icon-button');
  remove.type = 'button';
  remove.title = 'Remove';
  remove.setAttribute('aria-label', `Remove ${entry}`);
  remove.dataset.focusKey = `remove ${entry}`;
  remove.innerHTML =
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  remove.addEventListener('click', () => {
    const before = { urls: settings.urls, disabled: settings.disabled };
    save(removeEntry(settings, entry), `Removed ${entry}.`, before);
  });

  return element('li', on ? 'entry' : 'entry off', toggle, element('code', 'entry-text', entry), count, remove);
}

function closedCountText(count) {
  if (count === 0) return 'No tabs closed yet';
  return count === 1 ? '1 tab closed' : `${count} tabs closed`;
}

addForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = addEntry(settings.urls, newEntry.value);
  if (!result.added) {
    const state = entryState(settings, newEntry.value);
    showAddError(
      newEntry.value.trim() === ''
        ? 'Type a page to add.'
        : state === 'off'
          ? 'That page is already in your list, turned off.'
          : 'That page is already in your list.',
    );
    return;
  }
  newEntry.value = '';
  await save({ urls: result.urls }, `Added ${result.urls.at(-1)}.`);
});

newEntry.addEventListener('input', () => (addError.hidden = true));

function showAddError(message) {
  addError.textContent = message;
  addError.hidden = false;
  newEntry.focus();
}

// --- Edit as text ------------------------------------------------------------

function showTextView(show) {
  textView.hidden = !show;
  listView.hidden = show;
  editAsTextButton.hidden = show;
  if (show) {
    entriesText.value = settings.urls.join('\n');
    entriesText.focus();
  } else {
    editAsTextButton.focus();
  }
}

editAsTextButton.addEventListener('click', () => showTextView(true));
$('text-cancel').addEventListener('click', () => showTextView(false));
$('text-save').addEventListener('click', async () => {
  await save(replaceEntries(settings, entriesText.value), 'Saved.');
  showTextView(false);
});

// --- Close after -------------------------------------------------------------

let secondsTimer;

function saveSeconds() {
  clearTimeout(secondsTimer);
  const result = parseSeconds(secondsField.value);
  secondsError.hidden = result.ok;
  if (!result.ok) {
    secondsError.textContent = result.error;
    return;
  }
  if (result.seconds !== settings.seconds) save({ seconds: result.seconds }, 'Saved.');
}

secondsField.addEventListener('input', () => {
  clearTimeout(secondsTimer);
  secondsTimer = setTimeout(saveSeconds, 600);
});
secondsField.addEventListener('change', saveSeconds);

// --- Recently closed ---------------------------------------------------------

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatClosedAt(timestamp) {
  const date = new Date(timestamp);
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday ? timeFormat.format(date) : dateTimeFormat.format(date);
}

function renderHistory() {
  historyEmpty.hidden = history.length > 0;
  clearButton.hidden = history.length === 0;
  historyList.replaceChildren(...history.map(renderHistoryItem));
}

function renderHistoryItem({ url, title, entry, closedAt }) {
  const item = element('div', 'item');
  if (title !== '' && title !== url) item.append(element('div', 'item-title', title));
  const urlLine = element('div', 'item-url', url);
  urlLine.title = url;
  item.append(urlLine);
  item.append(element('div', 'item-meta', `${formatClosedAt(closedAt)} · matched `, element('code', '', entry)));

  const actions = element('div', 'item-actions', entryAction(entry));
  const reopen = element('button', 'secondary', 'Reopen');
  reopen.type = 'button';
  reopen.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'reopen-tab', url }));
  actions.append(reopen);

  return element('li', '', item, actions);
}

// What can still be done about the entry that closed a tab.
function entryAction(entry) {
  const state = entryState(settings, entry);
  if (state === 'off') return element('span', 'item-state', 'Entry turned off');
  if (state === 'removed') return element('span', 'item-state', 'Entry removed');

  const stop = element('button', 'link', 'Stop closing these');
  stop.type = 'button';
  stop.title = `Turn off ${entry}`;
  stop.addEventListener('click', () =>
    save(setEntryEnabled(settings, entry, false), `Turned off ${entry}.`, setEntryEnabled(settings, entry, true)),
  );
  return stop;
}

clearButton.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'clear-history' }));

// --- Notice --------------------------------------------------------------------

const toast = $('toast');
const toastText = $('toast-text');
const toastUndo = $('toast-undo');
let toastTimer;

function showToast(message, undo) {
  clearTimeout(toastTimer);
  toastText.textContent = message;
  toastUndo.hidden = !undo;
  toastUndo.onclick = undo
    ? () => {
        hideToast();
        undo();
      }
    : null;
  toast.classList.add('show');
  toastTimer = setTimeout(hideToast, undo ? 6000 : 2500);
}

function hideToast() {
  toast.classList.remove('show');
}

// ---------------------------------------------------------------------------

function element(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

async function loadAll() {
  [settings, history, counts] = await Promise.all([
    loadSettings(chrome.storage.sync),
    loadHistory(chrome.storage.local),
    loadClosedCounts(chrome.storage.local),
  ]);
}

// Keeps the page current when something else changes the settings or the
// history (the toolbar menu, a tab being closed, another device).
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== 'sync' && areaName !== 'local') return;
  await loadAll();
  render();
  if (document.activeElement !== secondsField) secondsField.value = String(settings.seconds);
});

await loadAll();
secondsField.value = String(settings.seconds);
render();
