'use strict';

/**
 * Shared plumbing for crawler sources.
 *
 * Every source must return the exact shape fetchPage() returns, because
 * crawl.js -> parsePage() -> checks.js is written against it and none of that
 * is allowed to care where the HTML came from.
 */

const { fetchPage: nativeFetchPage, assertPublicHost, UA } = require('../fetcher');

// Rendering a page in a real browser is much slower than a raw GET.
const DEFAULT_TIMEOUT = 45000;

/** The result shape, with everything a failed fetch cannot know zeroed out. */
function emptyResult(url, started, error) {
  return {
    url,
    finalUrl: url,
    status: 0,
    headers: {},
    body: '',
    bytes: 0,
    ttfbMs: 0,
    totalMs: Date.now() - started,
    redirects: [],
    error,
  };
}

/**
 * POST JSON to the crawler. Network and protocol failures come back as a
 * thrown Error carrying a message worth showing an operator, because a
 * misconfigured crawler is our problem, not the scanned site's.
 */
async function postJson(endpoint, payload, { fetchImpl = globalThis.fetch, apiKey = '', timeout = DEFAULT_TIMEOUT, label = 'crawler' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let res;
  try {
    res = await fetchImpl(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error(`${label} did not answer within ${Math.round(timeout / 1000)}s`);
    throw new Error(`${label} unreachable at ${endpoint}: ${e.message}`);
  }
  let text;
  try {
    text = await res.text();
  } catch (e) {
    clearTimeout(timer);
    throw new Error(`${label} response could not be read: ${e.message}`);
  }
  clearTimeout(timer);
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* handled below */ }
  if (!res.ok) {
    const detail = (json && (json.error || json.detail || json.message)) || text.slice(0, 200) || 'no body';
    throw new Error(`${label} returned HTTP ${res.status}: ${detail}`);
  }
  if (json == null) throw new Error(`${label} returned a non-JSON body: ${text.slice(0, 200)}`);
  return json;
}

/** Normalize a crawler's header bag to the lowercased plain object we use. */
function normalizeHeaders(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw)) {
    if (v == null) continue;
    out[String(k).toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);
  }
  return out;
}

/**
 * Give a rendered page its transport facts back.
 *
 * A rendering crawler reports the DOM, not the wire: it rarely passes on
 * content-encoding, the redirect chain, or a true time to first byte. Left
 * empty those read as absent to checks.js, which would invent findings like
 * "pages are sent uncompressed" on a site that compresses perfectly well.
 * So in the default 'hybrid' transport we fetch the same URL natively at the
 * same time and keep each half of the answer from the side that actually
 * knows it: transport from the raw GET, rendered body and markdown from the
 * crawler.
 */
async function withTransport(rendered, url, opts = {}) {
  if ((opts.transport || 'hybrid') !== 'hybrid') return rendered;
  let native;
  try {
    native = await opts.nativePromise;
  } catch {
    native = null;
  }
  if (!native || native.error || !native.status) return rendered;
  return {
    ...rendered,
    status: native.status,
    headers: native.headers,
    redirects: native.redirects,
    ttfbMs: native.ttfbMs,
    // bytes stays the size of the document the host actually sent, because
    // that is what the "heavy HTML" check is about. Scoring the rendered DOM
    // there would invent a heavy-page finding against a site whose download is
    // a one-kilobyte shell. The rendered size is kept beside it.
    bytes: native.bytes,
    renderedBytes: rendered.bytes,
    ...(native.truncated ? { truncated: true } : {}),
    ...(native.uaRetried ? { uaRetried: true, blockedOurUa: native.blockedOurUa, firstStatus: native.firstStatus } : {}),
  };
}

/** Start the companion native fetch (if the transport wants one). */
function startNative(url, opts = {}) {
  if ((opts.transport || 'hybrid') !== 'hybrid') return null;
  return nativeFetchPage(url, opts).catch(() => null);
}

module.exports = { postJson, normalizeHeaders, withTransport, startNative, emptyResult, assertPublicHost, nativeFetchPage, DEFAULT_TIMEOUT, UA };
