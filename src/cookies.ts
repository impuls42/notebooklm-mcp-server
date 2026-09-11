import { BASE_URL } from './constants.js';

/**
 * One cookie in the jar, carrying enough scope to know where it may be sent.
 *
 * Google's login chain crosses hosts, and some of the cookies it hands out
 * belong to one host only. Folding them all into a single flat string sends
 * accounts.google.com's cookies to the service host and persists them there,
 * so scope is tracked per entry rather than assumed.
 */
export interface JarEntry {
  value: string;
  /** Host-scoped: sent only back to this exact host. */
  host?: string;
  /** Domain cookie: sent to this domain and its subdomains. */
  domain?: string;
}

export type CookieJar = Map<string, JarEntry>;

/**
 * Cookies Google issues without a Domain attribute, which therefore belong to
 * the host that set them. `__Host-` carries the same meaning by prefix, and
 * the prefix forbids a Domain attribute outright.
 */
const HOST_SCOPED_NAMES = ['OSID', '__Secure-OSID'];

function isHostScopedName(name: string): boolean {
  return name.startsWith('__Host-') || HOST_SCOPED_NAMES.includes(name);
}

export function serviceHost(): string {
  return new URL(BASE_URL).host;
}

function domainMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Whether a cookie may be sent to a host. Entries carrying no scope at all
 * come from a stored cookie string whose attributes are long gone; those are
 * Google's ordinary .google.com session cookies and travel everywhere.
 */
function sendableTo(entry: JarEntry, host: string): boolean {
  if (entry.host) return host === entry.host;
  if (entry.domain) return domainMatches(host, entry.domain);
  return true;
}

/**
 * Read a stored `name=value; ...` string into a jar. Attributes are not
 * preserved on disk, so host-scoped names are re-bound to the service host —
 * the only host whose scoped cookies are ever written out.
 */
export function parseCookieString(cookieString: string, host = serviceHost()): CookieJar {
  const jar: CookieJar = new Map();
  for (const part of cookieString.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.substring(0, eq).trim();
    const value = part.substring(eq + 1).trim();
    if (!name) continue;
    jar.set(name, isHostScopedName(name) ? { value, host } : { value });
  }
  return jar;
}

/**
 * Serialize for storage: domain cookies plus the service host's own scoped
 * cookies. Another host's scoped cookies are useless to this client and
 * would be replayed to the wrong origin, so they are dropped.
 */
export function serializeJar(jar: CookieJar): string {
  const host = serviceHost();
  return Array.from(jar.entries())
    .filter(([, entry]) => !entry.host || entry.host === host)
    .map(([name, entry]) => `${name}=${entry.value}`)
    .join('; ');
}

/**
 * Build the Cookie header a browser would send to `host`.
 */
export function cookieHeaderFor(jar: CookieJar, host: string): string {
  return Array.from(jar.entries())
    .filter(([, entry]) => sendableTo(entry, host))
    .map(([name, entry]) => `${name}=${entry.value}`)
    .join('; ');
}

/**
 * Fold a response's Set-Cookie headers into the jar, recording the scope each
 * one declares. `host` is the host that issued them.
 *
 * Deletions (an empty value) are skipped rather than applied: cookies are
 * merged on save, so a delete would be undone by the next read from disk.
 * Clearing a cookie for real takes a fresh `auth` run.
 */
export function mergeSetCookies(jar: CookieJar, headers: string[], host: string): boolean {
  let changed = false;
  for (const header of headers) {
    const segments = header.split(';');
    const pair = segments[0];
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.substring(0, eq).trim();
    const value = pair.substring(eq + 1).trim();
    if (!name || !value || value === '""') continue;

    let domain: string | undefined;
    for (const segment of segments.slice(1)) {
      const sep = segment.indexOf('=');
      if (sep <= 0) continue;
      if (segment.substring(0, sep).trim().toLowerCase() !== 'domain') continue;
      domain = segment.substring(sep + 1).trim().replace(/^\./, '').toLowerCase();
    }

    // A __Host- cookie may not carry Domain, and an absent Domain means the
    // cookie belongs to the issuing host and goes nowhere else.
    const scoped = !domain || name.startsWith('__Host-');
    jar.set(name, scoped ? { value, host } : { value, domain });
    changed = true;
  }
  return changed;
}
