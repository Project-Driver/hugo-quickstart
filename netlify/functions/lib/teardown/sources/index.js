'use strict';

/**
 * Where the scanner gets its HTML.
 *
 * The whole scanner runs on one shape: whatever fetchPage() returns. So a
 * source is just something that produces that shape for a URL, and swapping
 * one in changes nothing downstream. 'native' is the default so the deployed
 * Netlify site keeps working with no configuration at all.
 *
 *   TEARDOWN_CRAWLER            native (default) | firecrawl | crawl4ai
 *   TEARDOWN_CRAWLER_URL        base URL of the crawler; each source has a
 *                               sensible local default
 *   TEARDOWN_CRAWLER_KEY        API key / bearer token, if yours needs one
 *                               (FIRECRAWL_API_KEY and CRAWL4AI_API_TOKEN are
 *                               read as fallbacks)
 *   TEARDOWN_CRAWLER_PATH       override the endpoint path (e.g. /v2/scrape)
 *   TEARDOWN_CRAWLER_WAIT_MS    extra settle time after load, in ms
 *   TEARDOWN_CRAWLER_TRANSPORT  hybrid (default) | crawler
 *
 * On transport: a rendering crawler reports the DOM, not the wire, so it
 * usually cannot tell us content-encoding, the redirect chain or a real TTFB.
 * 'hybrid' fetches each page natively alongside the render and takes the
 * transport facts from the raw GET, so those checks stay honest. 'crawler'
 * skips that second request and accepts thinner headers.
 */

const native = require('./native');
const firecrawl = require('./firecrawl');
const crawl4ai = require('./crawl4ai');

const BUILDERS = { firecrawl, crawl4ai };
const NAMES = ['native', ...Object.keys(BUILDERS)];

/**
 * Resolve the configured source. Throws on an unknown name rather than
 * quietly falling back, because silently not rendering is the exact failure
 * this is meant to fix.
 */
function getSource(env = process.env) {
  const name = String(env.TEARDOWN_CRAWLER || 'native').trim().toLowerCase();
  if (!name || name === 'native') return native;
  const mod = BUILDERS[name];
  if (!mod) throw new Error(`Unknown TEARDOWN_CRAWLER "${name}". Use one of: ${NAMES.join(', ')}.`);
  const waitMs = Number(env.TEARDOWN_CRAWLER_WAIT_MS || 0);
  const transport = String(env.TEARDOWN_CRAWLER_TRANSPORT || 'hybrid').trim().toLowerCase();
  if (!['hybrid', 'crawler'].includes(transport)) {
    throw new Error(`Unknown TEARDOWN_CRAWLER_TRANSPORT "${transport}". Use hybrid or crawler.`);
  }
  return mod.build({
    baseUrl: String(env.TEARDOWN_CRAWLER_URL || mod.DEFAULT_URL).trim(),
    apiKey: String(env.TEARDOWN_CRAWLER_KEY || env.FIRECRAWL_API_KEY || env.CRAWL4AI_API_TOKEN || '').trim(),
    path: String(env.TEARDOWN_CRAWLER_PATH || mod.DEFAULT_PATH).trim(),
    waitFor: Number.isFinite(waitMs) && waitMs > 0 ? waitMs : 0,
    transport,
  });
}

module.exports = { getSource, native, firecrawl, crawl4ai, NAMES };
