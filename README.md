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

While a tab is counting down, the icon shows a badge with the time left
(seconds, or minutes above 99 s).

## Configure

**Settings** in the menu (or **Details → Extension options**) opens the settings page:

- **Pages to close** – one entry per line.
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

Tip: if Chrome asks "Open zoom.us?" and you haven't ticked "Always allow", make
sure the delay leaves you time to click **Open**.

## Development

No dependencies or build step. Tests use Node's built-in test runner (Node 22+):

```bash
npm test
```

- `src/matcher.js` – decides whether a URL matches an entry, and suggests an
  entry for a page.
- `src/autoclose.js` – schedules and cancels closes (timer while the service
  worker is alive, plus an alarm so a stopped worker still closes the tab),
  updates the badge, and answers the popup's `get-tab-status` / `keep-tab-open`
  messages.
- `src/settings.js` – settings defaults, form validation and adding entries.
- `popup.*` – the toolbar menu; `options.*` – the settings page; `theme.css` –
  shared colours and base styles.
- `tests/fake-browser.js` – in-memory stand-in for the Chrome APIs used in tests.
