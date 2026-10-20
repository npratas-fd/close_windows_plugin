import { loadHistory, onHistoryChanged } from './src/history.js';
import { loadSettings, parseSettingsForm } from './src/settings.js';

const form = document.getElementById('settings');
const urlsField = document.getElementById('urls');
const secondsField = document.getElementById('seconds');
const status = document.getElementById('status');
const historyList = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');
const clearButton = document.getElementById('clear-history');

let statusTimer;

function showStatus(message, isError = false) {
  clearTimeout(statusTimer);
  status.textContent = message;
  status.classList.toggle('error', isError);
  if (!isError) statusTimer = setTimeout(() => (status.textContent = ''), 2500);
}

async function init() {
  const { urls, seconds } = await loadSettings(chrome.storage.sync);
  urlsField.value = urls.join('\n');
  secondsField.value = String(seconds);
  renderHistory(await loadHistory(chrome.storage.local));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = parseSettingsForm(urlsField.value, secondsField.value);
  if (!result.ok) {
    showStatus(result.error, true);
    secondsField.focus();
    return;
  }
  await chrome.storage.sync.set(result.settings);
  urlsField.value = result.settings.urls.join('\n');
  showStatus('Saved.');
});

// --- Recently closed -------------------------------------------------------

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

function renderHistory(history) {
  historyEmpty.hidden = history.length > 0;
  clearButton.hidden = history.length === 0;
  historyList.replaceChildren(...history.map(renderItem));
}

function renderItem({ url, title, entry, closedAt }) {
  const item = element('div', 'item');
  if (title !== '' && title !== url) item.append(element('div', 'item-title', title));
  const urlLine = element('div', 'item-url', url);
  urlLine.title = url;
  item.append(urlLine);
  item.append(element('div', 'item-meta', `${formatClosedAt(closedAt)} · matched `, element('code', '', entry)));

  const reopen = element('button', 'secondary', 'Reopen');
  reopen.type = 'button';
  reopen.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'reopen-tab', url }));

  return element('li', '', item, reopen);
}

function element(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

clearButton.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'clear-history' }));
onHistoryChanged(chrome.storage, renderHistory);

init();
