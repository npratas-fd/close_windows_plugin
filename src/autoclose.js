import { clearHistory, recordClosedTab } from './history.js';
import { findMatchingEntry, urlMatches } from './matcher.js';
import { loadSettings } from './settings.js';

// A tab that reaches a listed URL gets a deadline, kept in session storage so it
// survives the service worker being shut down. A timer closes the tab on time
// while the worker is alive; an alarm with the same name wakes a stopped worker
// to finish the job. Before closing, the tab's current URL is checked against
// the current list once more. While a tab is closing, the toolbar badge shows
// the time left. The popup can ask to keep a tab open; it then stays open until
// it leaves the listed pages. Every tab closed here is added to the history;
// a page reopened from it starts out kept open.

const PENDING_PREFIX = 'close-tab-';
const KEPT_PREFIX = 'keep-tab-';
const BADGE_COLOR = '#2563eb';

export function registerAutoClose(chrome) {
  // Run one task at a time so events for the same tab never interleave.
  let queue = Promise.resolve();
  const enqueue = (task) => {
    const result = queue.then(task);
    queue = result.catch((error) => console.error('Auto Close Tabs:', error));
    return result;
  };

  const pendingKey = (tabId) => `${PENDING_PREFIX}${tabId}`;
  const keptKey = (tabId) => `${KEPT_PREFIX}${tabId}`;

  const scheduleCheck = (tabId, delay) => {
    setTimeout(() => enqueue(() => closeIfDue(tabId)), delay);
  };

  async function onUrlChanged(tabId, url) {
    const { urls, seconds } = await loadSettings(chrome.storage.sync);
    if (!urlMatches(url, urls)) {
      await forgetTab(tabId);
      return;
    }

    const flags = await chrome.storage.session.get([pendingKey(tabId), keptKey(tabId)]);
    if (Object.keys(flags).length > 0) return;

    const delay = seconds * 1000;
    const deadline = Date.now() + delay;
    await chrome.storage.session.set({ [pendingKey(tabId)]: deadline });
    await chrome.alarms.create(pendingKey(tabId), { when: deadline });
    scheduleCheck(tabId, delay);
    await setBadge(tabId, formatBadge(delay));
    startBadgeTicks();
  }

  async function closeIfDue(tabId) {
    const key = pendingKey(tabId);
    const { [key]: deadline } = await chrome.storage.session.get(key);
    if (deadline === undefined) return;

    const remaining = deadline - Date.now();
    if (remaining > 0) {
      scheduleCheck(tabId, remaining);
      return;
    }

    await cancelClose(tabId);
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return;
    const { urls } = await loadSettings(chrome.storage.sync);
    const entry = findMatchingEntry(tab.url, urls);
    if (entry === null) return;
    await chrome.tabs.remove(tabId);
    await recordClosedTab(chrome.storage.local, {
      url: tab.url,
      title: tab.title ?? '',
      entry,
      closedAt: Date.now(),
    });
  }

  async function reopen(url) {
    // Runs inside the queue, so the new tab's URL event is handled only after
    // it has been marked as kept.
    const tab = await chrome.tabs.create({ url });
    await chrome.storage.session.set({ [keptKey(tab.id)]: true });
    return { tabId: tab.id };
  }

  async function keepOpen(tabId) {
    await cancelClose(tabId);
    await chrome.storage.session.set({ [keptKey(tabId)]: true });
    return { state: 'kept' };
  }

  async function tabStatus(tabId) {
    const flags = await chrome.storage.session.get([pendingKey(tabId), keptKey(tabId)]);
    if (pendingKey(tabId) in flags) return { state: 'closing', closesAt: flags[pendingKey(tabId)] };
    if (keptKey(tabId) in flags) return { state: 'kept' };
    return { state: 'idle' };
  }

  async function cancelClose(tabId) {
    const key = pendingKey(tabId);
    await chrome.storage.session.remove(key);
    await chrome.alarms.clear(key);
    await setBadge(tabId, '');
  }

  async function forgetTab(tabId) {
    await cancelClose(tabId);
    await chrome.storage.session.remove(keptKey(tabId));
  }

  async function pendingDeadlines() {
    const items = await chrome.storage.session.get(null);
    return Object.entries(items)
      .filter(([key]) => key.startsWith(PENDING_PREFIX))
      .map(([key, deadline]) => [Number(key.slice(PENDING_PREFIX.length)), deadline]);
  }

  // The tab may already be gone; a badge is never worth failing a task for.
  function setBadge(tabId, text) {
    return chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  }

  // One loop refreshes every closing tab's badge each second while any exist.
  let ticking = false;
  function startBadgeTicks() {
    if (ticking) return;
    ticking = true;
    setTimeout(() => enqueue(refreshBadges), 1000);
  }

  async function refreshBadges() {
    let anyPending = false;
    try {
      const pending = await pendingDeadlines();
      anyPending = pending.length > 0;
      for (const [tabId, deadline] of pending) {
        await setBadge(tabId, formatBadge(deadline - Date.now()));
      }
    } finally {
      if (anyPending) setTimeout(() => enqueue(refreshBadges), 1000);
      else ticking = false;
    }
  }

  // A restarted worker picks up the countdowns its predecessor left behind.
  async function resume() {
    const pending = await pendingDeadlines();
    for (const [tabId, deadline] of pending) {
      scheduleCheck(tabId, Math.max(0, deadline - Date.now()));
    }
    if (pending.length > 0) startBadgeTicks();
  }

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) enqueue(() => onUrlChanged(tabId, changeInfo.url));
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    enqueue(() => forgetTab(tabId));
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name.startsWith(PENDING_PREFIX)) {
      enqueue(() => closeIfDue(Number(alarm.name.slice(PENDING_PREFIX.length))));
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handlers = {
      'keep-tab-open': () => keepOpen(message.tabId),
      'get-tab-status': () => tabStatus(message.tabId),
      'reopen-tab': () => reopen(message.url),
      'clear-history': () => clearHistory(chrome.storage.local).then(() => ({})),
    };
    const handler = handlers[message?.type];
    if (!handler) return false;
    enqueue(handler).then(sendResponse, () => sendResponse(null));
    return true;
  });

  enqueue(() => chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR }));
  enqueue(() => chrome.action.setBadgeTextColor({ color: '#ffffff' }));
  enqueue(resume);
}

// Seconds left, rounded up; whole minutes once it no longer fits in 2 digits.
function formatBadge(ms) {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  return seconds <= 99 ? String(seconds) : `${Math.ceil(seconds / 60)}m`;
}
