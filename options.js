import { loadSettings, parseSettingsForm } from './src/settings.js';

const form = document.getElementById('settings');
const urlsField = document.getElementById('urls');
const secondsField = document.getElementById('seconds');
const status = document.getElementById('status');

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

init();
