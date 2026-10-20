// In-memory stand-in for the parts of Chrome the extension uses.
//
// One FakeBrowser holds the browser state (tabs, storage, alarms, badges).
// Each call to startWorker() creates a fresh `chrome` object, like a new
// service worker instance, and passes it to `boot`. terminateWorker() kills an
// instance: its API calls reject and it stops receiving events, while the
// browser state survives. Like Chrome, an alarm or a message from the popup
// starts a new worker when none is running.

export function createFakeBrowser({ sync = {}, local = {}, boot = () => {} } = {}) {
  const state = {
    tabs: new Map(),
    nextTabId: 1,
    sync: structuredClone(sync),
    local: structuredClone(local),
    session: {},
    alarms: new Map(),
    badges: new Map(),
    workers: [],
  };

  const live = () => state.workers.filter((worker) => worker.alive);
  const emit = (eventName, ...args) => {
    for (const worker of live()) worker.events[eventName].dispatch(...args);
  };
  const ensureWorker = () => {
    if (live().length === 0) startWorker();
  };
  const tabSnapshot = (tab) => ({ ...tab });

  function startWorker() {
    const worker = { alive: true, events: {} };
    for (const name of ['onUpdated', 'onRemoved', 'onAlarm', 'onMessage']) {
      worker.events[name] = createEvent();
    }
    const call = (fn) => async (...args) => {
      if (!worker.alive) throw new Error('Extension context invalidated.');
      return fn(...args);
    };

    worker.chrome = {
      tabs: {
        onUpdated: worker.events.onUpdated,
        onRemoved: worker.events.onRemoved,
        get: call(async (tabId) => tabSnapshot(requireTab(tabId))),
        remove: call(async (tabId) => removeTab(tabId)),
        // Like Chrome, the new tab's onUpdated event may arrive before the
        // promise resolves.
        create: call(async ({ url }) => tabSnapshot(state.tabs.get(addTab(url, '')))),
      },
      storage: {
        sync: createStorageArea(() => state.sync, call),
        local: createStorageArea(() => state.local, call),
        session: createStorageArea(() => state.session, call),
      },
      alarms: {
        onAlarm: worker.events.onAlarm,
        create: call(async (name, { when }) => {
          state.alarms.set(name, { name, scheduledTime: when });
        }),
        clear: call(async (name) => state.alarms.delete(name)),
        getAll: call(async () => [...state.alarms.values()].map((alarm) => ({ ...alarm }))),
      },
      action: {
        setBadgeText: call(async ({ tabId, text }) => {
          requireTab(tabId);
          state.badges.set(tabId, text);
        }),
        setBadgeBackgroundColor: call(async () => {}),
        setBadgeTextColor: call(async () => {}),
      },
      runtime: { onMessage: worker.events.onMessage },
    };
    state.workers.push(worker);
    boot(worker.chrome);
    return worker.chrome;
  }

  function terminateWorker(chrome) {
    const worker = state.workers.find((candidate) => candidate.chrome === chrome);
    worker.alive = false;
  }

  function requireTab(tabId) {
    const tab = state.tabs.get(tabId);
    if (!tab) throw new Error(`No tab with id: ${tabId}.`);
    return tab;
  }

  function addTab(url, title) {
    const tab = { id: state.nextTabId++, windowId: 1, url, title, status: 'loading' };
    state.tabs.set(tab.id, tab);
    emit('onUpdated', tab.id, { status: 'loading', url }, tabSnapshot(tab));
    return tab.id;
  }

  function removeTab(tabId) {
    requireTab(tabId);
    state.tabs.delete(tabId);
    state.badges.delete(tabId);
    emit('onRemoved', tabId, { windowId: 1, isWindowClosing: false });
  }

  return {
    startWorker,
    terminateWorker,

    // A page opens in a new tab (e.g. launched by a desktop app).
    openTab(url, title = '') {
      return addTab(url, title);
    },

    // An existing tab navigates or is redirected to another URL.
    navigate(tabId, url) {
      const tab = requireTab(tabId);
      tab.url = url;
      tab.status = 'loading';
      emit('onUpdated', tabId, { status: 'loading', url }, tabSnapshot(tab));
    },

    // The user closes a tab by hand.
    closeTab(tabId) {
      removeTab(tabId);
    },

    hasTab(tabId) {
      return state.tabs.has(tabId);
    },

    tabIdsWithUrl(url) {
      return [...state.tabs.values()].filter((tab) => tab.url === url).map((tab) => tab.id);
    },

    // What the extension stored, e.g. readStorage('local', 'history').
    readStorage(area, key) {
      return structuredClone(state[area][key]);
    },

    // Text of the toolbar badge while the given tab is the active one.
    badgeText(tabId) {
      return state.badges.get(tabId) ?? '';
    },

    // Chrome wakes the extension for every alarm whose time has come.
    fireDueAlarms() {
      const due = [...state.alarms.values()].filter((alarm) => alarm.scheduledTime <= Date.now());
      if (due.length > 0) ensureWorker();
      for (const alarm of due) {
        state.alarms.delete(alarm.name);
        emit('onAlarm', { ...alarm });
      }
    },

    // chrome.runtime.sendMessage from an extension page such as the popup.
    sendMessage(message) {
      ensureWorker();
      return new Promise((resolve) => {
        const sender = { id: 'extension-id', url: 'chrome-extension://extension-id/popup.html' };
        let keepOpen = false;
        for (const worker of live()) {
          for (const result of worker.events.onMessage.dispatch(message, sender, resolve)) {
            if (result === true) keepOpen = true;
          }
        }
        if (!keepOpen) resolve(undefined);
      });
    },

    get alarmNames() {
      return [...state.alarms.keys()];
    },

    setSyncStorage(items) {
      Object.assign(state.sync, structuredClone(items));
    },
  };
}

function createEvent() {
  const listeners = [];
  return {
    addListener(listener) {
      listeners.push(listener);
    },
    dispatch(...args) {
      return listeners.map((listener) => listener(...args));
    },
  };
}

// Mirrors chrome.storage.StorageArea get/set/remove semantics.
function createStorageArea(data, call) {
  return {
    get: call(async (keys) => {
      const items = data();
      if (keys === null || keys === undefined) return structuredClone(items);
      if (typeof keys === 'string') keys = [keys];
      if (Array.isArray(keys)) {
        return Object.fromEntries(
          keys.filter((key) => key in items).map((key) => [key, structuredClone(items[key])]),
        );
      }
      return Object.fromEntries(
        Object.entries(keys).map(([key, fallback]) => [
          key,
          structuredClone(key in items ? items[key] : fallback),
        ]),
      );
    }),
    set: call(async (newItems) => {
      Object.assign(data(), structuredClone(newItems));
    }),
    remove: call(async (keys) => {
      for (const key of [keys].flat()) delete data()[key];
    }),
  };
}
