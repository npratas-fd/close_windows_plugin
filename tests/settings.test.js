import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeEntries,
  addEntry,
  entryState,
  parseSeconds,
  removeEntry,
  replaceEntries,
  setEntryEnabled,
} from '../src/settings.js';

// ---- Close after ------------------------------------------------------------

test('accepts a whole number of seconds', () => {
  assert.deepEqual(parseSeconds(' 15 '), { ok: true, seconds: 15 });
});

for (const seconds of ['0', '-3', '2.5', 'abc', '', '   ']) {
  test(`rejects ${JSON.stringify(seconds)} as the number of seconds`, () => {
    const result = parseSeconds(seconds);
    assert.equal(result.ok, false);
    assert.equal(typeof result.error, 'string');
    assert.notEqual(result.error, '');
  });
}

// ---- Adding -----------------------------------------------------------------

test('adds a new entry at the end of the list, trimmed', () => {
  assert.deepEqual(addEntry(['zoom.us/j/'], '  login.example.com/done '), {
    added: true,
    urls: ['zoom.us/j/', 'login.example.com/done'],
  });
});

for (const duplicate of ['zoom.us/j/', 'ZOOM.us/J/', 'https://zoom.us/j/', '  zoom.us/j/  ']) {
  test(`does not add ${JSON.stringify(duplicate)} again`, () => {
    assert.deepEqual(addEntry(['https://Zoom.us/j/'], duplicate), { added: false, urls: ['https://Zoom.us/j/'] });
  });
}

test('does not add a blank entry', () => {
  assert.deepEqual(addEntry(['zoom.us/j/'], '   '), { added: false, urls: ['zoom.us/j/'] });
});

// ---- Turning entries off and on --------------------------------------------

const settings = { urls: ['zoom.us/j/', 'https://Login.example.com/done', 'example.org'], disabled: [] };

test('every entry is active until it is turned off', () => {
  assert.deepEqual(activeEntries(settings), settings.urls);
  assert.deepEqual(activeEntries({ urls: ['zoom.us/j/'] }), ['zoom.us/j/']);
});

test('a turned-off entry is no longer active', () => {
  const { disabled } = setEntryEnabled(settings, 'login.example.com/done', false);
  assert.deepEqual(activeEntries({ ...settings, disabled }), ['zoom.us/j/', 'example.org']);
});

test('turning an entry back on makes it active again', () => {
  const off = setEntryEnabled(settings, 'zoom.us/j/', false);
  const on = setEntryEnabled({ ...settings, ...off }, 'https://ZOOM.us/j/', true);
  assert.deepEqual(on, { disabled: [] });
});

test('turning an entry off twice records it once', () => {
  const once = setEntryEnabled(settings, 'zoom.us/j/', false);
  const twice = setEntryEnabled({ ...settings, ...once }, 'zoom.us/j/', false);
  assert.deepEqual(twice, { disabled: ['zoom.us/j/'] });
});

test('reports whether an entry is on, off or no longer listed', () => {
  const current = { ...settings, disabled: ['example.org'] };
  assert.equal(entryState(current, 'zoom.us/j/'), 'on');
  assert.equal(entryState(current, 'login.example.com/done'), 'on');
  assert.equal(entryState(current, 'EXAMPLE.org'), 'off');
  assert.equal(entryState(current, 'zoom.us'), 'removed');
});

// ---- Removing ---------------------------------------------------------------

test('removes an entry and forgets that it was turned off', () => {
  const current = { ...settings, disabled: ['example.org', 'zoom.us/j/'] };
  assert.deepEqual(removeEntry(current, 'Example.org'), {
    urls: ['zoom.us/j/', 'https://Login.example.com/done'],
    disabled: ['zoom.us/j/'],
  });
});

// ---- Editing as text --------------------------------------------------------

test('replaces the list with one entry per non-blank line, trimmed and without repeats', () => {
  const result = replaceEntries({ urls: [], disabled: [] }, 'zoom.us/j/\r\n\n   login.example.com/done  \n\tHTTPS://zoom.us/j/\n');
  assert.deepEqual(result, { urls: ['zoom.us/j/', 'login.example.com/done'], disabled: [] });
});

test('entries kept while editing as text stay off; removed ones are forgotten', () => {
  const current = { urls: ['zoom.us/j/', 'example.org'], disabled: ['zoom.us/j/', 'example.org'] };
  assert.deepEqual(replaceEntries(current, 'zoom.us/j/\nnew.example.com'), {
    urls: ['zoom.us/j/', 'new.example.com'],
    disabled: ['zoom.us/j/'],
  });
});

test('replacing with blank text empties the list', () => {
  assert.deepEqual(replaceEntries({ urls: ['zoom.us/j/'], disabled: [] }, '  \n'), { urls: [], disabled: [] });
});
