// Decides whether a tab URL matches one of the entries in the settings list.
//
// An entry such as "zoom.us/j/" matches every http(s) page on that host or its
// subdomains whose path starts with "/j/". The scheme, a leading "www." and
// letter case are ignored. A port in the entry must match; no port means any.

const DEFAULT_PORTS = { 'http:': '80', 'https:': '443' };

export function urlMatches(url, entries) {
  return findMatchingEntry(url, entries) !== null;
}

// Returns the first entry (trimmed) that matches the URL, or null.
export function findMatchingEntry(url, entries) {
  const page = parsePage(url);
  if (!page) return null;
  const match = entries.find((entry) => {
    const rule = parseEntry(entry);
    return rule !== null && ruleMatches(rule, page);
  });
  return match === undefined ? null : match.trim();
}

// The entry to propose for a page: host, port if not the default, and path,
// without the query or fragment. Null for pages that can't be matched.
export function suggestEntry(url) {
  const parsed = parseHttpUrl(url);
  if (!parsed) return null;
  const path = parsed.pathname === '/' ? '' : parsed.pathname;
  return `${parsed.host}${path}`;
}

function parseHttpUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  return parsed.protocol in DEFAULT_PORTS ? parsed : null;
}

function parsePage(url) {
  const parsed = parseHttpUrl(url);
  if (!parsed) return null;
  return {
    host: parsed.hostname,
    port: parsed.port || DEFAULT_PORTS[parsed.protocol],
    path: (parsed.pathname + parsed.search + parsed.hash).toLowerCase(),
  };
}

function parseEntry(entry) {
  const text = entry.trim().replace(/^https?:\/\//i, '');
  const pathStart = text.search(/[/?#]/);
  const hostAndPort = pathStart === -1 ? text : text.slice(0, pathStart);
  const path = pathStart === -1 ? '' : text.slice(pathStart);

  const portMatch = hostAndPort.match(/:(\d+)$/);
  const host = portMatch ? hostAndPort.slice(0, portMatch.index) : hostAndPort;
  if (stripWww(host) === '') return null;

  // Let URL normalise the host (case, punycode) and the path (escaping).
  let parsed;
  try {
    parsed = new URL(`http://${host}${path}`);
  } catch {
    return null;
  }
  return {
    host: parsed.hostname,
    port: portMatch ? String(Number(portMatch[1])) : '',
    path: (parsed.pathname + parsed.search + parsed.hash).toLowerCase(),
  };
}

function ruleMatches(rule, page) {
  return (
    hostMatches(rule.host, page.host) &&
    (rule.port === '' || rule.port === page.port) &&
    page.path.startsWith(rule.path)
  );
}

function hostMatches(ruleHost, pageHost) {
  return (
    pageHost === ruleHost ||
    pageHost.endsWith(`.${ruleHost}`) ||
    stripWww(pageHost) === stripWww(ruleHost)
  );
}

function stripWww(host) {
  return host.replace(/^www\./, '');
}
