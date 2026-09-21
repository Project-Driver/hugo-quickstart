'use strict';

/**
 * crawl4ai (self-hosted Docker image) as a page source.
 *
 * crawl4ai drives a real Playwright browser and returns the rendered HTML plus
 * markdown. Its /crawl endpoint takes a list of URLs; we send one at a time on
 * purpose, because crawl.js already owns discovery, deduplication, priority
 * and the concurrency pool.
 *
 * API: POST {base}/crawl
 *   -> { success, results: [ { html, cleaned_html, markdown, status_code,
 *        response_headers, redirected_url, url, error_message } ] }
 * markdown is a string on older builds and { raw_markdown, fit_markdown } on
 * newer ones; both are accepted.
 */

const { postJson, normalizeHeaders, withTransport, startNative, emptyResult, assertPublicHost, nativeFetchPage, DEFAULT_TIMEOUT, UA } = require('./support');

const DEFAULT_URL = 'http://127.0.0.1:11235';
const DEFAULT_PATH = '/crawl';

function pickMarkdown(md) {
  if (typeof md === 'string') return md;
  if (md && typeof md === 'object') return md.raw_markdown || md.fit_markdown || md.markdown || '';
  return '';
}

function build({ baseUrl = DEFAULT_URL, apiKey = '', path = DEFAULT_PATH, waitFor = 0, transport = 'hybrid' } = {}) {
  const endpoint = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();

  async function fetchPage(url, opts = {}) {
    if ((opts.method || 'GET') !== 'GET') return nativeFetchPage(url, opts);

    const started = Date.now();
    const timeout = opts.timeout && opts.timeout > DEFAULT_TIMEOUT ? opts.timeout : DEFAULT_TIMEOUT;
    try {
      await assertPublicHost(new URL(url).hostname, opts.lookup, opts.allowPrivate);
    } catch (e) {
      return emptyResult(url, started, e.message);
    }

    const nativePromise = startNative(url, { ...opts, transport });
    let json;
    try {
      json = await postJson(endpoint, {
        urls: [url],
        browser_config: { type: 'BrowserConfig', params: { headless: true, user_agent: opts.userAgent || UA } },
        crawler_config: {
          type: 'CrawlerRunConfig',
          params: {
            cache_mode: 'BYPASS',
            page_timeout: timeout,
            ...(waitFor ? { delay_before_return_html: waitFor / 1000 } : {}),
          },
        },
      }, { fetchImpl: opts.fetchImpl, apiKey, timeout: timeout + 5000, label: 'crawl4ai' });
    } catch (e) {
      const native = await nativePromise;
      if (native && !native.error) return { ...native, source: 'native', sourceFallback: e.message };
      return emptyResult(url, started, e.message);
    }

    const first = (Array.isArray(json && json.results) ? json.results[0] : null) || (json && json.result) || null;
    if (!first || first.success === false || json.success === false) {
      const native = await nativePromise;
      const why = (first && (first.error_message || first.error)) || (json && json.detail) || 'crawl4ai could not render the page';
      if (native && !native.error) return { ...native, source: 'native', sourceFallback: why };
      return emptyResult(url, started, why);
    }

    const body = first.html || first.cleaned_html || '';
    const status = Number(first.status_code ?? (body ? 200 : 0)) || 0;
    const rendered = {
      url,
      finalUrl: first.redirected_url || first.url || url,
      status,
      headers: normalizeHeaders(first.response_headers),
      body,
      bytes: Buffer.byteLength(body),
      ttfbMs: Date.now() - started,
      totalMs: Date.now() - started,
      redirects: [],
      error: status === 0 && !body ? (first.error_message || 'crawl4ai returned no HTML') : null,
      markdown: pickMarkdown(first.markdown),
      source: 'crawl4ai',
    };
    return withTransport(rendered, url, { ...opts, transport, nativePromise });
  }

  return {
    name: 'crawl4ai',
    rendersJavaScript: true,
    returnsMarkdown: true,
    endpoint,
    describe: () => `crawl4ai at ${endpoint} (renders JavaScript, returns markdown, transport: ${transport})`,
    fetchPage,
  };
}

module.exports = { build, DEFAULT_URL, DEFAULT_PATH, pickMarkdown };
