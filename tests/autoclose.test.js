import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeBrowser } from './fake-browser.js';
import { registerAutoClose } from '../src/autoclose.js';

// Lets every pending promise chain in the extension run to completion.
const settle = () => new Promise((resolve) => setImmediate(resolve));

function start(t, sync) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const browser = createFakeBrowser({ sync, boot: registerAutoClose });
  const chrome = browser.startWorker();
  return { browser, chrome };
}

async function advance(t, ms) {
  t.mock.timers.tick(ms);
  await settle();
}

// Moves the clock one second at a time, like real time passing.
async function advanceSeconds(t, seconds) {
  for (let i = 0; i < seconds; i++) await advance(t, 1000);
}

const keepOpen = (browser, tabId) => browser.sendMessage({ type: 'keep-tab-open', tabId });
const tabStatus = (browser, tabId) => browser.sendMessage({ type: 'get-tab-status', tabId });

test('closes a tab that opens a listed URL once the delay has passed', async (t) => {
  const { browser } = start(t, { urls: ['zoom.us/j/'], seconds: 5 });

  const tab = browser.openTab('https://us02web.zoom.us/j/123?pwd=abc');
  await settle();

  await advance(t, 4999);
  assert.equal(browser.hasTab(tab), true, 'closed too early');
  await advance(t, 1);
  assert.equal(browser.hasTab(tab), false, 'not closed after the delay');
});

test('leaves tabs with unlisted URLs open', async (t) => {
  const { browser } = start(t, { urls: ['zoom.us/j/'], seconds: 5 });

  const tab = browser.openTab('https://zoom.us/profile');
  await settle();
  await advance(t, 60_000);

  assert.equal(browser.hasTab(tab), true);
  assert.equal(browser.badgeText(tab), '');
});

test('closes a tab that navigates to a listed URL, counting from the navigation', async (t) => {
  const { browser } = start(t, { urls: ['login.example.com/success'], seconds: 5 });

  const tab = browser.openTab('https://login.example.com/password');
  await settle();
  await advance(t, 30_000);
  browser.navigate(tab, 'https://login.example.com/success?state=1');
  await settle();

  await advance(t, 4999);
  assert.equal(browser.hasTab(tab), true, 'closed too early');
  await advance(t, 1);
  assert.equal(browser.hasTab(tab), false, 'not closed after the delay');
});

test('does not close a tab that navigated away before the delay passed', async (t) => {
  const { browser } = start(t, { urls: ['zoom.us/j/'], seconds: 5 });

  const tab = browser.openTab('https://zoom.us/j/1');
  await settle();
  await advance(t, 2000);
  browser.navigate(tab, 'https://zoom.us/profile');
  await settle();
  await advance(t, 60_000);

  assert.equal(browser.hasTab(tab), true);
});

test('keeps the original deadline when a tab moves between listed URLs', async (t) => {
  const { browser } = start(t, { urls: ['zoom.us/j/'], seconds: 5 });

  const tab = browser.openTab('https://zoom.us/j/1');
  await settle();
  await advance(t, 3000);
  browser.navigate(tab, 'https://zoom.us/j/1#success');
  await settle();

  await advance(t, 2000);
  assert.equal(browser.hasTab(tab), false);
});

test('waits 10 seconds when no delay has been saved', async (t) => {
  const { browser } = start(t, { urls: ['zoom.us/j/'] });

  const tab = browser.openTab('https://zoom.us/j/1');
  await settle();

  await advance(t, 9999);
  assert.equal(browser.hasTab(tab), true, 'closed too early');
  await advance(t, 1);
  assert.equal(browser.hasTab(tab), false, 'not closed after 10 seconds');
});

test('does not close a tab whose entry was removed from the list before the deadline', async (t) => {
  const { browser } = start(t, { urls: ['zoom.us/j/'], seconds: 5 });

  const tab = browser.openTab('https://zoom.us/j/1');
  await settle();
  browser.setSyncStorage({ urls: [] });
  await advance(t, 5000);

  assert.equal(browser.hasTab(tab), true);
});

test('clears wake-up alarms as soon as their tab is gone', async (t) => {
  const { browser } = start(t, { urls: ['zoom.us/j/'], seconds: 5 });

  const closedByUser = browser.openTab('https://zoom.us/j/1');
  const closedByExtension = browser.openTab('https://zoom.us/j/2');
  await settle();
  browser.closeTab(closedByUser);
  await settle();
  assert.equal(browser.alarmNames.length, 1, 'alarm kept for the tab the user closed');

  await advance(t, 5000);
  assert.equal(browser.hasTab(closedByExtension), false);
  assert.deepEqual(browser.alarmNames, []);
});

test('closes the tab when its alarm wakes a stopped service worker', async (t) => {
  t.mock.method(console, 'error', () => {}); // the dead worker's timers fail noisily
  const { browser, chrome } = start(t, { urls: ['zoom.us/j/'], seconds: 60 });

  const tab = browser.openTab('https://zoom.us/j/1');
  await settle();
  await advance(t, 30_000);
  browser.terminateWorker(chrome);

  await advance(t, 30_000);
  assert.equal(browser.hasTab(tab), true, 'closed without a running worker');
  browser.fireDueAlarms();
  await settle();

  assert.equal(browser.hasTab(tab), false);
});

test('a restarted service worker closes the tab on time and keeps the badge counting', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { browser, chrome } = start(t, { urls: ['zoom.us/j/'], seconds: 60 });

  const tab = browser.openTab('https://zoom.us/j/1');
  await settle();
  await advance(t, 30_000);
  browser.terminateWorker(chrome);
  browser.startWorker(); // woken by some other event, e.g. another tab loading
  await settle();

  await advance(t, 1000);
  assert.equal(browser.badgeText(tab), '29');
  await advance(t, 28_999);
  assert.equal(browser.hasTab(tab), true, 'closed too early');
  await advance(t, 1);
  assert.equal(browser.hasTab(tab), false, 'not closed on time');
});

test('shows the seconds left on the badge of a closing tab', async (t) => {
  const { browser } = start(t, { urls: ['zoom.us/j/'], seconds: 5 });

  const tab = browser.openTab('https://zoom.us/j/1');
  await settle();
  assert.equal(browser.badgeText(tab), '5');

  await advanceSeconds(t, 1);
  assert.equal(browser.badgeText(tab), '4');
  await advanceSeconds(t, 3);
  assert.equal(browser.badgeText(tab), '1');
});

test('shows minutes on the badge when more than 99 seconds are left', async (t) => {
  const { browser } = start(t, { urls: ['zoom.us/j/'], seconds: 300 });

  const tab = browser.openTab('https://zoom.us/j/1');
  await settle();
  assert.equal(browser.badgeText(tab), '5m');

  await advanceSeconds(t, 201);
  assert.equal(browser.badgeText(tab), '99');
});

test('clears the badge when the tab leaves the listed pages', async (t) => {
  const { browser } = start(t, { urls: ['zoom.us/j/'], seconds: 5 });

  const tab = browser.openTab('https://zoom.us/j/1');
  await settle();
  browser.navigate(tab, 'https://zoom.us/profile');
  await settle();
  await advanceSeconds(t, 2);

  assert.equal(browser.badgeText(tab), '');
});

test('keeps a tab open when asked and clears its badge', async (t) => {
  const { browser } = start(t, { urls: ['zoom.us/j/'], seconds: 5 });

  const tab = browser.openTab('https://zoom.us/j/1');
  await settle();
  await advanceSeconds(t, 2);
  assert.deepEqual(await keepOpen(browser, tab), { state: 'kept' });
  await advanceSeconds(t, 2);

  assert.equal(browser.badgeText(tab), '');
  await advance(t, 60_000);
  assert.equal(browser.hasTab(tab), true);
});

test('a kept tab stays open while it moves between listed pages', async (t) => {
  const { browser } = start(t, { urls: ['zoom.us/j/'], seconds: 5 });

  const tab = browser.openTab('https://zoom.us/j/1');
  await settle();
  await keepOpen(browser, tab);
  browser.navigate(tab, 'https://zoom.us/j/1#success');
  await settle();
  await advance(t, 60_000);

  assert.equal(browser.hasTab(tab), true);
});

test('a kept tab is closed again after leaving the listed pages and coming back', async (t) => {
  const { browser } = start(t, { urls: ['login.example.com/success'], seconds: 5 });

  const tab = browser.openTab('https://login.example.com/success');
  await settle();
  await keepOpen(browser, tab);
  browser.navigate(tab, 'https://login.example.com/password');
  await settle();
  browser.navigate(tab, 'https://login.example.com/success?retry=1');
  await settle();

  await advance(t, 5000);
  assert.equal(browser.hasTab(tab), false);
});

test('reports when a tab will close, whether it is kept, or neither', async (t) => {
  const { browser } = start(t, { urls: ['zoom.us/j/'], seconds: 5 });

  const closing = browser.openTab('https://zoom.us/j/1');
  const unlisted = browser.openTab('https://zoom.us/profile');
  await settle();

  assert.deepEqual(await tabStatus(browser, closing), { state: 'closing', closesAt: 5000 });
  assert.deepEqual(await tabStatus(browser, unlisted), { state: 'idle' });
  await keepOpen(browser, closing);
  assert.deepEqual(await tabStatus(browser, closing), { state: 'kept' });
});
