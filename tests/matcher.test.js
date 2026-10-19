import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMatchingEntry, suggestEntry, urlMatches } from '../src/matcher.js';

// [description, entries in the settings list, tab URL, should match]
const cases = [
  ['bare entry matches the https page', ['www.google.com'], 'https://www.google.com/', true],
  ['bare entry matches the http page', ['www.google.com'], 'http://www.google.com/search?q=x', true],
  ['https entry matches the http page', ['https://www.google.com'], 'http://www.google.com/', true],
  ['http entry matches the https page', ['http://www.google.com'], 'https://www.google.com/', true],
  ['www entry matches the host without www', ['www.google.com'], 'https://google.com/', true],
  ['entry without www matches the www host', ['google.com'], 'https://www.google.com/', true],
  ['www entry does not match other subdomains', ['www.google.com'], 'https://mail.google.com/', false],
  ['matching ignores letter case', ['WWW.Google.COM/Search'], 'https://www.google.com/search?q=x', true],
  ['entry matches subdomains', ['zoom.us/j/'], 'https://us02web.zoom.us/j/123?pwd=abc', true],
  ['entry does not match a lookalike domain', ['google.com'], 'https://notgoogle.com/', false],
  ['entry does not match a domain that only starts with it', ['google.com'], 'https://google.com.evil.io/', false],
  ['path entry does not match other paths on the same site', ['zoom.us/j/'], 'https://zoom.us/profile', false],
  ['bare entry matches any path on the site', ['zoom.us'], 'https://zoom.us/profile/settings', true],
  ['path entry matches pages that start with it', ['login.example.com/success'], 'https://login.example.com/success?state=1', true],
  ['entry with a query matches when the query starts the same', ['example.com/cb?done=1'], 'https://example.com/cb?done=1&x=2', true],
  ['entry with a query does not match a different query', ['example.com/cb?done=1'], 'https://example.com/cb?done=0', false],
  ['entry with a port matches that port', ['localhost:8080/callback'], 'http://localhost:8080/callback?code=1', true],
  ['entry with a port does not match other ports', ['localhost:8080/callback'], 'http://localhost:3000/callback', false],
  ['entry with port 443 matches the default https port', ['example.com:443'], 'https://example.com/', true],
  ['entry without a port matches any port', ['localhost/callback'], 'http://localhost:3000/callback', true],
  ['one matching entry in the list is enough', ['example.org', 'zoom.us/j/'], 'https://zoom.us/j/1', true],
  ['entry surrounded by spaces still matches', ['  zoom.us/j/  '], 'https://zoom.us/j/1', true],
  ['browser pages never match', ['newtab'], 'chrome://newtab/', false],
  ['local files never match', ['users'], 'file:///Users/x.html', false],
  ['blank entries match nothing', ['', '   ', 'https://', 'www.'], 'https://www.google.com/', false],
  ['empty list matches nothing', [], 'https://www.google.com/', false],
  ['unparseable tab URL does not match', ['zoom.us'], 'not a url', false],
  ['missing tab URL does not match', ['zoom.us'], undefined, false],
];

for (const [description, entries, url, expected] of cases) {
  test(description, () => {
    assert.equal(urlMatches(url, entries), expected);
  });
}

test('names the first entry that matches a page', () => {
  const entries = ['example.org', '  zoom.us/j/  ', 'zoom.us'];
  assert.equal(findMatchingEntry('https://us02web.zoom.us/j/1', entries), 'zoom.us/j/');
});

test('names no entry when nothing matches', () => {
  assert.equal(findMatchingEntry('https://zoom.us/profile', ['zoom.us/j/']), null);
});

// [tab URL, suggested entry]
const suggestions = [
  ['https://us02web.zoom.us/j/123?pwd=abc#success', 'us02web.zoom.us/j/123'],
  ['https://www.google.com/', 'www.google.com'],
  ['http://localhost:8080/callback?code=1', 'localhost:8080/callback'],
  ['https://example.com:443/done', 'example.com/done'],
  ['https://Login.Example.com/Done/', 'login.example.com/Done/'],
];

for (const [url, expected] of suggestions) {
  test(`suggests ${expected} for ${url}`, () => {
    assert.equal(suggestEntry(url), expected);
  });

  test(`the suggestion for ${url} matches that page`, () => {
    assert.equal(urlMatches(url, [suggestEntry(url)]), true);
  });
}

for (const url of ['chrome://extensions/', 'file:///Users/x.html', 'not a url', undefined]) {
  test(`suggests nothing for ${url}`, () => {
    assert.equal(suggestEntry(url), null);
  });
}
