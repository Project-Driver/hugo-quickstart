'use strict';

/**
 * A careful HTTP fetcher for scanning other people's websites.
 * Time-boxed, size-capped, follows redirects manually so we can report them,
 * and refuses private/internal addresses so the scanner cannot be pointed
 * at our own infrastructure.
 */

const dns = require('node:dns').promises;
const net = require('node:net');

const UA = 'Mozilla/5.0 (compatible; ProjectDriverTeardown/1.0; +https://project-driver.com/teardown)';
// Many small-business sites sit behind a WAF that blocks unknown bots. When the
// honest UA is refused we retry once looking like Chrome, then report both.
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const WAF_STATUSES = new Set([401, 403, 405, 406, 409, 429, 503]);
const MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT = 12000;

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127);
  }
  const v6 = ip.toLowerCase();
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80') || v6.startsWith('::ffff:');
}

/** Normalize what a person typed into a URL we can scan. Throws on junk. */
function normalizeUrl(input) {
  let s = String(input || '').trim();
  if (!s) throw new Error('Enter your website address.');
  const scheme = s.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  if (scheme && !/^https?$/i.test(scheme[1])) throw new Error('Only http and https sites can be scanned.');
  if (!scheme) s = `https://${s}`;
  let u;
  try { u = new URL(s); } catch { throw new Error('That does not look like a website address.'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http and https sites can be scanned.');
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.')) {
    throw new Error('That address cannot be scanned.');
  }
  if (net.isIP(host) && isPrivateIp(host)) throw new Error('That address cannot be scanned.');
  u.hash = '';
  return u.toString();
}

async function assertPublicHost(hostname, lookup = dns.lookup, allowPrivate = false) {
  if (allowPrivate) return;
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('Refusing to scan a private address.');
    return;
  }
  const addrs = await lookup(hostname, { all: true });
  if (!addrs.length) throw new Error('That domain does not resolve.');
  for (const a of addrs) if (isPrivateIp(a.address)) throw new Error('Refusing to scan a private address.');
}

/**
 * Fetch a URL and return {url, finalUrl, status, headers, body, bytes, ttfbMs, totalMs, redirects, error}.
 * Redirects are followed manually (max 5) and recorded.
 */
async function fetchPage(url, { timeout = DEFAULT_TIMEOUT, fetchImpl = globalThis.fetch, lookup, maxRedirects = 5, method = 'GET', allowPrivate = false, userAgent = UA, browserUaRetry = true } = {}) {
  const redirects = [];
  let current = url;
  const started = Date.now();
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const u = new URL(current);
    await assertPublicHost(u.hostname, lookup, allowPrivate);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let res;
    const t0 = Date.now();
    try {
      res = await fetchImpl(current, {
        method,
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9', 'Accept-Encoding': 'gzip, br' },
      });
    } catch (e) {
      clearTimeout(timer);
      return { url, finalUrl: current, status: 0, headers: {}, body: '', bytes: 0, ttfbMs: Date.now() - t0, totalMs: Date.now() - started, redirects, error: e.name === 'AbortError' ? `Timed out after ${timeout / 1000}s` : (e.message || 'fetch failed') };
    }
    const ttfbMs = Date.now() - t0;
    const headers = {};
    res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    if ([301, 302, 303, 307, 308].includes(res.status) && headers.location) {
      clearTimeout(timer);
      const next = new URL(headers.location, current).toString();
      redirects.push({ from: current, to: next, status: res.status });
      current = next;
      continue;
    }
    // Refused by a firewall? Try once as a browser before calling the site broken.
    if (browserUaRetry && userAgent === UA && WAF_STATUSES.has(res.status)) {
      clearTimeout(timer);
      const retry = await fetchPage(current, { timeout, fetchImpl, lookup, maxRedirects, method, allowPrivate, userAgent: BROWSER_UA, browserUaRetry: false });
      retry.url = url;
      retry.redirects = redirects.concat(retry.redirects);
      retry.uaRetried = true;
      retry.blockedOurUa = true;
      retry.firstStatus = res.status;
      return retry;
    }

    let body = '';
    let bytes = 0;
    let truncated = false;
    if (method === 'GET') {
      try {
        const reader = res.body && res.body.getReader ? res.body.getReader() : null;
        if (reader) {
          const chunks = [];
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.length;
            chunks.push(value);
            if (bytes >= MAX_BYTES) { truncated = true; try { await reader.cancel(); } catch { /* ignore */ } break; }
          }
          body = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
        } else {
          body = await res.text();
          bytes = Buffer.byteLength(body);
        }
      } catch (e) {
        clearTimeout(timer);
        return { url, finalUrl: current, status: res.status, headers, body: '', bytes, ttfbMs, totalMs: Date.now() - started, redirects, error: e.name === 'AbortError' ? 'Timed out while downloading' : e.message };
      }
    }
    clearTimeout(timer);
    return { url, finalUrl: current, status: res.status, headers, body, bytes, truncated, ttfbMs, totalMs: Date.now() - started, redirects, error: null };
  }
  return { url, finalUrl: current, status: 0, headers: {}, body: '', bytes: 0, ttfbMs: 0, totalMs: Date.now() - started, redirects, error: 'Too many redirects' };
}

module.exports = { fetchPage, normalizeUrl, isPrivateIp, assertPublicHost, UA, BROWSER_UA, WAF_STATUSES, MAX_BYTES };
