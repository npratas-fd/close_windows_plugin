# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Chrome extension (Manifest V3, plain JavaScript ES modules) that closes tabs a
configurable number of seconds after they open one of the pages in a user-defined
list. It targets the leftover tabs desktop apps open in the browser (Zoom
launchers, sign-in callback pages). There are no dependencies and no build step:
the folder is loaded as-is with **Load unpacked** in `chrome://extensions`, and
after changing code you reload the extension there (↻) to see it.

User-facing text (popup, settings page, README) is written in English.

## Commands

Tests use Node's built-in test runner (Node 22+); there is no linter.

```bash
npm test                                   # all tests
node --test --disable-warning=ExperimentalWarning tests/matcher.test.js
node --test --disable-warning=ExperimentalWarning --test-name-pattern='keeps a tab open' tests/autoclose.test.js
```

The extension version lives in both `manifest.json` and `package.json`; bump them together.

## Architecture

**Entry points.** `background.js` (the service worker) only calls
`registerAutoClose(chrome)` from `src/autoclose.js`. `popup.html/js` is the
toolbar menu, `options.html/js` the settings page; both import the shared logic
from `src/` and share colours and base styles through `theme.css`. All Chrome APIs
are reached through the `chrome` object passed to `registerAutoClose`, which is
what lets the tests substitute a fake.

**Surviving service-worker shutdown.** MV3 stops the worker whenever it is idle,
so no state may live only in memory:

- Each countdown is a deadline in `chrome.storage.session` under `close-tab-<tabId>`.
  It is enforced twice: a `setTimeout` closes the tab on time while the worker is
  alive, and a `chrome.alarms` alarm with the same name wakes a stopped worker.
  On start-up `resume()` re-arms timers for deadlines left by a previous instance.
- Listeners are registered synchronously in `registerAutoClose` so Chrome can wake
  the worker for them.
- Every event and popup message runs through one promise queue (`enqueue`), so
  handlers for the same tab never interleave. New handlers must go through it too.

**Closing rules.** A tab gets a deadline when it opens or navigates to a URL that
matches an *active* entry; leaving the matching pages cancels it, and moving
between matching pages keeps the original deadline. At the deadline the tab's
current URL is checked again against the current settings, so entries removed or
turned off meanwhile stop pending closes. "Keep this tab open" (and reopening from
the history) sets `keep-tab-<tabId>` in session storage; the tab is then left alone
until it navigates to a non-matching page, which clears the flag. When the tab
being closed is the active one, the worker first activates the tab that was active
before it in the same window (recorded from `tabs.onActivated`), so Chrome doesn't
fall back to the neighbouring tab.

**Storage layout.**

| Area | Keys | Written by |
| --- | --- | --- |
| `sync` | `urls` (entries), `seconds`, `disabled` (entries turned off) | settings page, popup "Add this page" |
| `local` | `history` (last 50 closed tabs, newest first), `closedCounts` (per entry, never reset by Clear) | service worker |
| `session` | `close-tab-<id>` deadlines, `keep-tab-<id>` flags, `active-in-window-<windowId>` and `came-from-<id>` (tab switching) | service worker |

The worker reads settings from storage on every event instead of caching them, and
the settings page re-renders on `chrome.storage.onChanged`, so a change made
anywhere takes effect everywhere at once.

**Messages to the worker** (`chrome.runtime.sendMessage`): `get-tab-status`,
`keep-tab-open`, `reopen-tab`, `clear-history`. Anything that touches tabs or the
session flags goes through these; the pages write settings to `storage.sync`
directly.

**Two kinds of entry comparison.** `src/matcher.js` decides whether a *URL* matches
an entry: http(s) only; scheme, a leading `www.` and case ignored; the host or any
subdomain; a port only if the entry names one; then a prefix match on
path + query + fragment. `src/settings.js` compares *entries with each other*
(duplicates, which entries are turned off) by ignoring only the scheme and case.
Use the matching helpers there (`activeEntries`, `entryState`, …) rather than
comparing strings yourself.

## Tests

`tests/fake-browser.js` is an in-memory Chrome: one window of tabs with an active
tab (closing the active tab activates its neighbour, as Chrome does), storage
areas, alarms, badges and messages. `startWorker()` boots a new worker instance and
`terminateWorker()` kills one while the browser state survives, which is how
restart behaviour is tested; like Chrome, an alarm or a message boots a worker
when none is running. `tests/autoclose.test.js` runs on Node's mock timers: after
triggering an event, `await settle()` lets the queued work finish, and use
`advanceSeconds()` rather than one large `advance()` whenever several timers must
fire at different times, so their async work sees the right clock.

The popup and settings page have no automated tests; check them by loading the
extension in Chrome.
