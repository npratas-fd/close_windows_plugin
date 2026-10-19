import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addEntry, parseSettingsForm } from '../src/settings.js';

test('keeps one entry per non-blank line, trimmed', () => {
  const result = parseSettingsForm('zoom.us/j/\r\n\n   login.example.com/done  \n\t\n', '15');
  assert.deepEqual(result, {
    ok: true,
    settings: { urls: ['zoom.us/j/', 'login.example.com/done'], seconds: 15 },
  });
});

test('accepts an empty list', () => {
  assert.deepEqual(parseSettingsForm('   \n', '5'), { ok: true, settings: { urls: [], seconds: 5 } });
});

for (const seconds of ['0', '-3', '2.5', 'abc', '', '   ']) {
  test(`rejects ${JSON.stringify(seconds)} as the number of seconds`, () => {
    const result = parseSettingsForm('zoom.us/j/', seconds);
    assert.equal(result.ok, false);
    assert.equal(typeof result.error, 'string');
    assert.notEqual(result.error, '');
  });
}

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
