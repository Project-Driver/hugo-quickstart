'use strict';

/**
 * Firecrawl (self-hosted) as a page source.
 *
 * Firecrawl renders in a real browser and returns both the rendered HTML and
 * clean per-page markdown, which is what we want to feed an AI judgment pass.
 * We ask for the whole document (onlyMainContent: false) because the checks
 * care about the header, the footer, the nav and the forms, not just the
 * article body.
 *
 * API: POST {base}/v1/scrape
 *   -> { success, data: { rawHtml, html, markdown, metadata: { statusCode, url, sourceURL, title, error } } }
 * A self-hosted instance usually needs no key; set one if yours does.
 */

const { postJson, normalizeHeaders, withTransport, startNative, emptyResult, assertPublicHost, nativeFetchPage, DEFAULT_TIMEOUT } = require('./support');

const DEFAULT_URL = 'http://127.0.0.1:3002';
const DEFAULT_PATH = '/v1/scrape';

function build({ baseUrl = DEFAULT_URL, apiKey = '', path = DEFAULT_PATH, waitFor = 0, transport = 'hybrid' } = {}) {
  const endpoint = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();

  async function fetchPage(url, opts = {}) {
    // Anything that is not a page read stays on the native path: HEAD probes,
    // robots.txt and sitemap XML are not documents to render.
    if ((opts.method || 'GET') !== 'GET') return nativeFetchPage(url, opts);

    const started = Date.now();
    const timeout = opts.timeout && opts.timeout > DEFAULT_TIMEOUT ? opts.timeout : DEFAULT_TIMEOUT;
    // The crawler fetches on our behalf, so our own private-address guard
    // would be bypassed unless we check the target before handing it over.
    try {
      await assertPublicHost(new URL(url).hostname, opts.lookup, opts.allowPrivate);
    } catch (e) {
      return emptyResult(url, started, e.message);
    }

    const nativePromise = startNative(url, { ...opts, transport });
    let json;
    try {
      json = await postJson(endpoint, {
        url,
        formats: ['rawHtml', 'markdown'],
        onlyMainContent: false,
        timeout,
        ...(waitFor ? { waitFor } : {}),
      }, { fetchImpl: opts.fetchImpl, apiKey, timeout: timeout + 5000, label: 'Firecrawl' });
    } catch (e) {
      // A crawler outage must not take the scan down with it: fall back to the
      // raw fetch we already started, and say which one answered.
      const native = await nativePromise;
      if (native && !native.error) return { ...native, source: 'native', sourceFallback: e.message };
      return emptyResult(url, started, e.message);
    }

    const data = (json && json.data) || json || {};
    const meta = data.metadata || {};
    if (json && json.success === false) {
      const native = await nativePromise;
      const why = json.error || meta.error || 'Firecrawl could not scrape the page';
      if (native && !native.error) return { ...native, source: 'native', sourceFallback: why };
      return emptyResult(url, started, why);
    }

    const body = data.rawHtml || data.html || '';
    const status = Number(meta.statusCode ?? meta.pageStatusCode ?? (body ? 200 : 0)) || 0;
    const finalUrl = meta.url || meta.sourceURL || url;
    const rendered = {
      url,
      finalUrl,
      status,
      headers: normalizeHeaders(meta.headers || data.headers),
      body,
      bytes: Buffer.byteLength(body),
      ttfbMs: Date.now() - started,
      totalMs: Date.now() - started,
      redirects: [],
      error: status === 0 && !body ? (meta.error || 'Firecrawl returned no HTML') : null,
      markdown: typeof data.markdown === 'string' ? data.markdown : '',
      source: 'firecrawl',
    };
    return withTransport(rendered, url, { ...opts, transport, nativePromise });
  }

  return {
    name: 'firecrawl',
    rendersJavaScript: true,
    returnsMarkdown: true,
    endpoint,
    describe: () => `Firecrawl at ${endpoint} (renders JavaScript, returns markdown, transport: ${transport})`,
    fetchPage,
  };
}

module.exports = { build, DEFAULT_URL, DEFAULT_PATH };
