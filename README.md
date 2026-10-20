# Auto Close Tabs

Chrome extension that closes tabs a few seconds after they open one of the pages
you list. Made for the leftover tabs that desktop apps open in the browser:
Zoom meeting launchers, sign-in "you can close this window" pages, and so on.

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Optional: pin the extension from the puzzle-piece menu so its icon is always visible.

## Use

Click the extension icon to open its menu:

- **Add this page** – adds the current page to the list. The field is pre-filled
  with the page's address (without the `?…` part); shorten it to cover more pages,
  e.g. `zoom.us/j/` instead of a full meeting link. Tabs that open it from then on
  are closed; the tab you are on is left alone.
- **This tab closes in N s / Keep this tab open** – shown while the current tab is
  counting down. The tab then stays open until it leaves the listed pages; if it
  comes back to one later, the countdown starts again.
- **Settings** – opens the settings page.
- **History** – opens the list of recently closed tabs (see below).

While a tab is counting down, the icon shows a badge with the time left
(seconds, or minutes above 99 s).

## Configure

**Settings** in the menu (or **Details → Extension options**) opens the settings page.
Every change is saved straight away; a notice at the bottom confirms it, with
**Undo** after removing an entry or turning one off.

- **Pages to close** – type an entry and press **Add**. Each entry has a switch to
  turn it off without deleting it, the number of tabs it has closed, and a ✕ to
  remove it. **Edit as text** shows the whole list one entry per line, for pasting
  or tidying several at once.
- **Close after** – seconds to wait before closing; one value for every entry (default 10).

### How entries match

| Entry | Closes | Leaves open |
| --- | --- | --- |
| `zoom.us/j/` | `https://zoom.us/j/123`, `https://us02web.zoom.us/j/123?pwd=…` | `https://zoom.us/profile` |
| `zoom.us` | anything on zoom.us or its subdomains | `https://notzoom.us/` |
| `www.google.com` | `https://www.google.com/…`, `http://google.com/…` | `https://mail.google.com/` |
| `localhost:8080/callback` | `http://localhost:8080/callback?code=…` | `http://localhost:3000/callback` |

- `http://`, `https://`, a leading `www.` and letter case are ignored.
- An entry matches every page that **starts with** it, on that host and its subdomains.
- A port in the entry must match; without one, any port matches.

### Behaviour

- The countdown starts when a tab opens a listed page **or** navigates to one
  (sign-in flows usually redirect the same tab to the final page).
- If the tab moves to an unlisted page before the time is up, it stays open.
- Moving between listed pages keeps the original deadline.
- Before closing, the tab's current address is checked against the current list,
  so removing an entry stops pending closes for it.
- If the tab being closed is the one on screen, you are taken back to the tab you
  were on before it (Chrome on its own would show the tab next to it). Tabs closed
  in the background don't change which tab you are looking at.

Tip: if Chrome asks "Open zoom.us?" and you haven't ticked "Always allow", make
sure the delay leaves you time to click **Open**.

### Recently closed

The settings page lists the last 50 tabs the extension closed, newest first:
title, full address, when it closed and which entry matched it. **Reopen**
opens the page again in a new tab that is kept open (it is not closed again
unless it leaves the listed pages and comes back). **Stop closing these** turns
off the entry that closed it, for when a tab was closed that shouldn't have
been. **Clear** empties the list (the per-entry counts stay).
The history is stored on this computer only (`chrome.storage.local`); tabs
you close yourself, or that leave the listed pages in time, are not recorded.

## Development

No dependencies or build step. Tests use Node's built-in test runner (Node 22+):

```bash
npm test
```

- `src/matcher.js` – decides whether a URL matches an entry, and suggests an
  entry for a page.
- `src/autoclose.js` – schedules and cancels closes (timer while the service
  worker is alive, plus an alarm so a stopped worker still closes the tab),
  updates the badge, records closed tabs, and answers the `get-tab-status`,
  `keep-tab-open`, `reopen-tab` and `clear-history` messages from the extension
  pages.
- `src/history.js` – the list of closed tabs and the per-entry counts in
  `chrome.storage.local`.
- `src/settings.js` – settings defaults, validation, and adding, removing,
  turning off and bulk-editing entries.
- `popup.*` – the toolbar menu; `options.*` – the settings page; `theme.css` –
  shared colours and base styles.
- `tests/fake-browser.js` – in-memory stand-in for the Chrome APIs used in tests.
