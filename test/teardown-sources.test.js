'use strict';

/**
 * The crawler-source adapters, over real HTTP on the loopback interface.
 *
 * Two servers stand in for the real world: one is the site being scanned, one
 * is the Docker crawler. Nothing here needs Docker running, so CI keeps
 * working, but the adapters are still exercised through a real socket, a real
 * JSON body and real gzip rather than a stubbed fetch.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const { once } = require('node:events');

const { getSource, NAMES } = require('../netlify/functions/lib/teardown/sources');
const firecrawl = require('../netlify/functions/lib/teardown/sources/firecrawl');
const crawl4ai = require('../netlify/functions/lib/teardown/sources/crawl4ai');
const { crawlSite } = require('../netlify/functions/lib/teardown/crawl');

// What a JavaScript site serves to a plain GET: an empty shell.
const SHELL = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Bottima</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;

// What the same URL looks like once a browser has run that script.
const RENDERED = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Barbershop in Fort Lauderdale | Bottima</title>
<meta name="description" content="Walk-in barbershop in Fort Lauderdale."></head><body><div id="root">
<h1>Barbershop in Fort Lauderdale</h1>
<a href="tel:+19545550100">(954) 555-0100</a> <a href="/services">Services</a> <a href="/contact">Contact</a>
<p>${'Fades, beard trims and hot towel shaves, seven days a week. '.repeat(20)}</p>
<img src="/chair.jpg" alt="Our barber chairs"></div></body></html>`;

const MARKDOWN = '# Barbershop in Fort Lauderdale\n\nFades, beard trims and hot towel shaves.';

async function listen(handler) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base, close: () => new Promise((r) => server.close(r)) };
}

/** The scanned site: serves the un-rendered shell, gzipped, like a real host. */
async function siteServer(body = SHELL) {
  const hits = [];
  const s = await listen((req, res) => {
    hits.push(req.url);
    if (req.method === 'HEAD') { res.writeHead(200); return res.end(); }
    const gz = zlib.gzipSync(Buffer.from(body));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Encoding': 'gzip', 'Cache-Control': 'max-age=600' });
    res.end(gz);
  });
  return { ...s, hits };
}

/** A stand-in crawler. `reply` decides the status and JSON for each call. */
async function crawlerServer(reply) {
  const calls = [];
  const s = await listen(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body = null;
    try { body = JSON.parse(raw); } catch { /* recorded as null */ }
    calls.push({ path: req.url, method: req.method, headers: req.headers, body });
    const out = reply(body, calls.length);
    res.writeHead(out.status || 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out.json));
  });
  return { ...s, calls };
}

const firecrawlOk = (target) => ({
  json: {
    success: true,
    data: {
      rawHtml: RENDERED,
      html: RENDERED,
      markdown: MARKDOWN,
      metadata: { title: 'Bottima', statusCode: 200, sourceURL: target, url: target },
    },
  },
});

const crawl4aiOk = (target, markdown = { raw_markdown: MARKDOWN }) => ({
  json: {
    success: true,
    results: [{
      success: true,
      url: target,
      html: RENDERED,
      markdown,
      status_code: 200,
      response_headers: { 'Content-Type': 'text/html', 'X-Powered-By': 'crawl4ai' },
    }],
  },
});

test('the registry defaults to native and refuses anything it does not know', () => {
  assert.equal(getSource({}).name, 'native');
  assert.equal(getSource({ TEARDOWN_CRAWLER: '' }).name, 'native');
  assert.equal(getSource({ TEARDOWN_CRAWLER: 'NATIVE' }).name, 'native');
  assert.equal(getSource({}).rendersJavaScript, false);

  // Silently falling back to native would be the worst outcome: the operator
  // would believe they were rendering when they were not.
  assert.throws(() => getSource({ TEARDOWN_CRAWLER: 'playwright' }), /Unknown TEARDOWN_CRAWLER/);
  assert.throws(() => getSource({ TEARDOWN_CRAWLER: 'firecrawl', TEARDOWN_CRAWLER_TRANSPORT: 'magic' }), /Unknown TEARDOWN_CRAWLER_TRANSPORT/);
  assert.deepEqual(NAMES, ['native', 'firecrawl', 'crawl4ai']);
});

test('the registry reads the URL, key and path from the environment', () => {
  const s = getSource({ TEARDOWN_CRAWLER: 'firecrawl', TEARDOWN_CRAWLER_URL: 'http://crawler.internal:3002', TEARDOWN_CRAWLER_PATH: '/v2/scrape' });
  assert.equal(s.name, 'firecrawl');
  assert.equal(s.endpoint, 'http://crawler.internal:3002/v2/scrape');
  assert.equal(s.rendersJavaScript, true);
  assert.equal(s.returnsMarkdown, true);

  // Each source keeps its own conventional local port.
  assert.match(getSource({ TEARDOWN_CRAWLER: 'firecrawl' }).endpoint, /:3002\/v1\/scrape$/);
  assert.match(getSource({ TEARDOWN_CRAWLER: 'crawl4ai' }).endpoint, /:11235\/crawl$/);
});

test('firecrawl: rendered HTML, markdown, status and final URL come back in the fetchPage shape', async () => {
  const site = await siteServer();
  const crawler = await crawlerServer((body) => firecrawlOk(body.url));
  try {
    const src = firecrawl.build({ baseUrl: crawler.base, apiKey: 'secret-token' });
    const res = await src.fetchPage(`${site.base}/`, { allowPrivate: true });

    assert.equal(res.status, 200);
    assert.equal(res.error, null);
    assert.equal(res.finalUrl, `${site.base}/`);
    assert.match(res.body, /Barbershop in Fort Lauderdale/);
    assert.equal(res.markdown, MARKDOWN);
    assert.equal(res.source, 'firecrawl');
    // bytes is what the host sent; renderedBytes is what the browser built.
    assert.equal(res.renderedBytes, Buffer.byteLength(RENDERED));
    assert.equal(res.bytes, Buffer.byteLength(SHELL));
    assert.ok(Array.isArray(res.redirects));
    assert.equal(typeof res.totalMs, 'number');

    // It asked for the whole document, not just the article body, because the
    // checks care about the nav, the footer and the forms.
    const sent = crawler.calls[0];
    assert.equal(sent.path, '/v1/scrape');
    assert.equal(sent.body.url, `${site.base}/`);
    assert.equal(sent.body.onlyMainContent, false);
    assert.deepEqual(sent.body.formats, ['rawHtml', 'markdown']);
    assert.equal(sent.headers.authorization, 'Bearer secret-token');
  } finally {
    await crawler.close();
    await site.close();
  }
});

test('crawl4ai: one URL per call, markdown as an object or a plain string', async () => {
  const site = await siteServer();
  const crawler = await crawlerServer((body) => crawl4aiOk(body.urls[0]));
  try {
    const src = crawl4ai.build({ baseUrl: crawler.base });
    const res = await src.fetchPage(`${site.base}/`, { allowPrivate: true });

    assert.equal(res.status, 200);
    assert.match(res.body, /hot towel shaves/);
    assert.equal(res.markdown, MARKDOWN);
    assert.equal(res.source, 'crawl4ai');

    // crawl.js already owns discovery and the pool, so we scrape one at a time.
    assert.deepEqual(crawler.calls[0].body.urls, [`${site.base}/`]);
    assert.equal(crawler.calls[0].body.crawler_config.params.cache_mode, 'BYPASS');
    assert.equal(crawler.calls[0].headers.authorization, undefined);
  } finally {
    await crawler.close();
    await site.close();
  }

  // Older builds return markdown as a bare string.
  const site2 = await siteServer();
  const crawler2 = await crawlerServer((body) => crawl4aiOk(body.urls[0], MARKDOWN));
  try {
    const res = await crawl4ai.build({ baseUrl: crawler2.base }).fetchPage(`${site2.base}/`, { allowPrivate: true });
    assert.equal(res.markdown, MARKDOWN);
  } finally {
    await crawler2.close();
    await site2.close();
  }
});

test('hybrid transport keeps the transport facts honest while using the rendered body', async () => {
  const site = await siteServer();
  const crawler = await crawlerServer((body) => firecrawlOk(body.url));
  try {
    const src = firecrawl.build({ baseUrl: crawler.base, transport: 'hybrid' });
    const res = await src.fetchPage(`${site.base}/`, { allowPrivate: true });

    // A renderer reports the DOM, not the wire. Without the companion fetch
    // content-encoding would look absent and the scanner would invent a
    // "pages are sent uncompressed" finding on a host that gzips fine.
    assert.equal(res.headers['content-encoding'], 'gzip');
    assert.equal(res.headers['cache-control'], 'max-age=600');
    // ...and the body is still the rendered one.
    assert.match(res.body, /hot towel shaves/);
    assert.equal(res.markdown, MARKDOWN);
    assert.equal(res.source, 'firecrawl');
    assert.ok(site.hits.length >= 1, 'hybrid fetches the page natively too');
  } finally {
    await crawler.close();
    await site.close();
  }
});

test('transport=crawler spends one request per page and accepts thinner headers', async () => {
  const site = await siteServer();
  const crawler = await crawlerServer((body) => firecrawlOk(body.url));
  try {
    const src = firecrawl.build({ baseUrl: crawler.base, transport: 'crawler' });
    const res = await src.fetchPage(`${site.base}/`, { allowPrivate: true });

    assert.match(res.body, /hot towel shaves/);
    assert.equal(site.hits.length, 0, 'the site itself is never touched directly');
    assert.equal(res.headers['content-encoding'], undefined);
  } finally {
    await crawler.close();
    await site.close();
  }
});

test('a crawler that is down or unhappy degrades to the raw fetch instead of failing the scan', async () => {
  // Crawler returns HTTP 500.
  const site = await siteServer();
  const crawler = await crawlerServer(() => ({ status: 500, json: { error: 'browser pool exhausted' } }));
  try {
    const res = await firecrawl.build({ baseUrl: crawler.base }).fetchPage(`${site.base}/`, { allowPrivate: true });
    assert.equal(res.status, 200);
    assert.equal(res.source, 'native');
    assert.match(res.sourceFallback, /browser pool exhausted/);
    assert.match(res.body, /id="root"/); // the un-rendered shell, honestly labelled
  } finally {
    await crawler.close();
    await site.close();
  }

  // Crawler answers, but says it could not scrape.
  const site2 = await siteServer();
  const crawler2 = await crawlerServer(() => ({ json: { success: false, error: 'navigation timed out' } }));
  try {
    const res = await firecrawl.build({ baseUrl: crawler2.base }).fetchPage(`${site2.base}/`, { allowPrivate: true });
    assert.equal(res.source, 'native');
    assert.match(res.sourceFallback, /navigation timed out/);
  } finally {
    await crawler2.close();
    await site2.close();
  }

  // crawl4ai reports a per-result failure.
  const site3 = await siteServer();
  const crawler3 = await crawlerServer(() => ({ json: { success: true, results: [{ success: false, error_message: 'page crashed' }] } }));
  try {
    const res = await crawl4ai.build({ baseUrl: crawler3.base }).fetchPage(`${site3.base}/`, { allowPrivate: true });
    assert.equal(res.source, 'native');
    assert.match(res.sourceFallback, /page crashed/);
  } finally {
    await crawler3.close();
    await site3.close();
  }
});

test('a crawler nobody is running reports itself, and does not look like a broken site', async () => {
  // Nothing listening on the crawler port and the site is unreachable too.
  const src = firecrawl.build({ baseUrl: 'http://127.0.0.1:1', transport: 'crawler' });
  const res = await src.fetchPage('https://example.com/', { allowPrivate: true });
  assert.equal(res.status, 0);
  assert.match(res.error, /Firecrawl unreachable at http:\/\/127\.0\.0\.1:1\/v1\/scrape/);
});

test('handing the target to a crawler does not get round the private-address guard', async () => {
  const crawler = await crawlerServer((body) => firecrawlOk(body.url));
  try {
    for (const src of [firecrawl.build({ baseUrl: crawler.base }), crawl4ai.build({ baseUrl: crawler.base })]) {
      const res = await src.fetchPage('http://127.0.0.1:8080/admin', {});
      assert.equal(res.status, 0);
      assert.match(res.error, /private address/i);
    }
    assert.equal(crawler.calls.length, 0, 'the crawler is never asked to fetch it');
  } finally {
    await crawler.close();
  }
});

test('probes and non-GET requests stay on the raw fetcher', async () => {
  const site = await siteServer();
  const crawler = await crawlerServer((body) => firecrawlOk(body && body.url));
  try {
    const src = firecrawl.build({ baseUrl: crawler.base });
    const res = await src.fetchPage(`${site.base}/`, { allowPrivate: true, method: 'HEAD' });
    assert.equal(res.status, 200);
    assert.equal(crawler.calls.length, 0, 'a HEAD probe is not a document to render');
  } finally {
    await crawler.close();
    await site.close();
  }
});

test('end to end: the same site scores differently once the source renders it', async () => {
  // The site serves an empty shell to a plain GET, and links nothing.
  const site = await siteServer();
  const crawler = await crawlerServer((body) => firecrawlOk(body.url));
  try {
    const raw = await crawlSite(`${site.base}/`, { allowPrivate: true, maxPages: 3, env: {} });
    assert.equal(raw.home.source, 'native');
    assert.equal(raw.home.markdown, '');
    assert.ok(raw.home.wordCount < 5, `empty shell should be nearly wordless, got ${raw.home.wordCount}`);
    assert.equal(raw.home.h1s.length, 0);

    const rendered = await crawlSite(`${site.base}/`, {
      allowPrivate: true,
      maxPages: 3,
      env: { TEARDOWN_CRAWLER: 'firecrawl', TEARDOWN_CRAWLER_URL: crawler.base },
    });
    assert.equal(rendered.home.source, 'firecrawl');
    assert.ok(rendered.home.wordCount > 100, `rendered page should have real copy, got ${rendered.home.wordCount}`);
    assert.deepEqual(rendered.home.h1s, ['Barbershop in Fort Lauderdale']);
    assert.equal(rendered.home.metaDescription, 'Walk-in barbershop in Fort Lauderdale.');
    // markdown is threaded through parsePage, additively.
    assert.equal(rendered.home.markdown, MARKDOWN);
    // ...and the transport facts survived the swap.
    assert.equal(rendered.home.headers['content-encoding'], 'gzip');

    // robots.txt and the sitemap were never sent to the renderer.
    for (const c of crawler.calls) assert.doesNotMatch(String(c.body.url), /robots\.txt|sitemap/);
  } finally {
    await crawler.close();
    await site.close();
  }
});
