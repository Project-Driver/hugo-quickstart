'use strict';

/**
 * Integration tests over real HTTP on the loopback interface. Unlike
 * teardown.test.js these use node's real fetch, so they exercise DNS, sockets,
 * redirects, gzip, streaming and timeouts rather than a mocked fetch.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const { once } = require('node:events');

const { fetchPage, normalizeUrl, UA, BROWSER_UA } = require('../netlify/functions/lib/teardown/fetcher');
const { crawlSite } = require('../netlify/functions/lib/teardown/crawl');
const { runChecks } = require('../netlify/functions/lib/teardown/checks');
const { scoreFindings } = require('../netlify/functions/lib/teardown/score');
const { createScanRecord, runScan } = require('../netlify/functions/lib/teardown/scan');
const { freeSummary } = require('../netlify/functions/lib/teardown/report');
const { useMemoryStore } = require('../netlify/functions/lib/teardown/store');

// A plausible garage-door company site: neglected, but not broken.
const page = (title, body, { desc = '', h1 = '' } = {}) => `<!doctype html><html><head><meta charset="utf-8">
<title>${title}</title>${desc ? `<meta name="description" content="${desc}">` : ''}</head>
<body><header><a href="/">Home</a> <a href="/services">Services</a> <a href="/about">About</a> <a href="/contact">Contact</a></header>
${h1 ? `<h1>${h1}</h1>` : ''}${body}</body></html>`;

const HOME = page('Home', `
  <h2>Garage Door Repair</h2>
  <p>We fix garage doors. Springs, openers, cables, tracks. Call us today for fast service.</p>
  <img src="/door1.jpg"><img src="/door2.jpg"><img src="/van.jpg" alt="Our service van">
  <form action="/contact"><input name="name"><input name="email"><input name="phone"><input name="address"><input name="city"><input name="zip"><input name="message"><button>Send</button></form>
`);
const SERVICES = page('Home', '<h1>Services</h1><h1>What we do</h1><p>Openers. Springs.</p>');
const ABOUT = page('About Us', `<h1>About</h1><p>${'We have served homeowners for many years and take pride in our work. '.repeat(20)}</p>`, { desc: 'About our company' });

function makeSite({ wafBlocksScanner = false, alwaysBlock = false } = {}) {
  const hits = [];
  const server = http.createServer((req, res) => {
    const ua = req.headers['user-agent'] || '';
    hits.push({ url: req.url, ua });
    const send = (status, body, headers = {}) => { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...headers }); res.end(body); };

    if (alwaysBlock) return send(403, 'Forbidden', { 'Content-Type': 'text/plain' });
    if (wafBlocksScanner && ua.includes('ProjectDriverTeardown')) return send(403, 'Forbidden by firewall', { 'Content-Type': 'text/plain' });

    switch (req.url) {
      case '/': {
        const gz = zlib.gzipSync(Buffer.from(HOME));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Encoding': 'gzip' });
        return res.end(gz);
      }
      case '/services': return send(301, '', { Location: '/services/' });
      case '/services/': return send(200, SERVICES);
      case '/about': return send(200, ABOUT);
      case '/contact': return send(200, page('Contact', '<h1>Contact</h1><p>Reach us.</p>'));
      case '/robots.txt': return send(200, 'User-agent: *\nAllow: /\n', { 'Content-Type': 'text/plain' });
      case '/slow': return setTimeout(() => send(200, 'late'), 3000).unref?.() || undefined;
      default: return send(404, page('Not found', '<p>404</p>'));
    }
  });
  return { server, hits };
}

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}/`;
}

/** normalizeUrl rightly refuses loopback, so build the record then retarget it. */
function localRecord(url, biz) {
  const record = createScanRecord({ url: 'https://example.com/', ...biz });
  record.biz.url = url;
  return record;
}

/** Real fetch for the test site; canned failures for the two external APIs. */
function offlineExternals() {
  return async (input, init) => {
    const u = String(input);
    if (u.includes('googleapis.com') || u.includes('serpapi.com')) {
      return { ok: false, status: 503, text: async () => '{}', json: async () => ({ error: { message: 'offline in tests' } }) };
    }
    return globalThis.fetch(input, init);
  };
}

test('crawls a real server: gzip, redirects, robots, missing sitemap, soft 404s', async (t) => {
  const { server, hits } = makeSite();
  const base = await listen(server);
  t.after(() => server.close());

  const crawl = await crawlSite(base, { allowPrivate: true });
  assert.equal(crawl.home.status, 200);
  assert.equal(crawl.unreachable, undefined);
  assert.match(crawl.home.text, /Springs, openers, cables, tracks/, 'gzip body decoded');
  assert.ok(crawl.home.ttfbMs >= 0);
  assert.equal(crawl.robots.present, true);
  assert.equal(crawl.sitemap.present, false);
  assert.equal(crawl.notFoundStatus, 404, 'real 404 is not a soft 404');

  const urls = crawl.pages.map((p) => new URL(p.finalUrl).pathname);
  assert.ok(urls.includes('/services/'), `followed the 301 to /services/; got ${urls.join(', ')}`);
  assert.ok(urls.includes('/contact') && urls.includes('/about'));
  const services = crawl.pages.find((p) => p.finalUrl.endsWith('/services/'));
  assert.equal(services.redirects.length, 1);
  assert.equal(services.redirects[0].status, 301);
  assert.ok(hits.every((h) => h.ua === UA), 'every request identified itself honestly');

  const findings = runChecks({ crawl, psi: null, local: null, biz: { name: 'Jupiter Garage Doors', city: 'Jupiter', trade: 'garage-doors' } });
  const ids = findings.map((f) => f.id);
  for (const expected of ['duplicate-titles', 'multiple-h1', 'missing-h1', 'no-phone', 'no-sitemap', 'long-form', 'images-no-alt', 'unlabeled-inputs', 'no-localbusiness-schema', 'city-not-mentioned']) {
    assert.ok(ids.includes(expected), `expected ${expected}; got ${ids.join(', ')}`);
  }
  const score = scoreFindings(findings);
  assert.ok(score.overall > 0 && score.overall < 60, `a neglected real site scores low: ${score.overall}`);
});

test('a firewall that blocks our scanner is retried as a browser, once', async (t) => {
  const { server, hits } = makeSite({ wafBlocksScanner: true });
  const base = await listen(server);
  t.after(() => server.close());

  const res = await fetchPage(base, { allowPrivate: true });
  assert.equal(res.status, 200, 'the retry got through');
  assert.equal(res.uaRetried, true);
  assert.equal(res.blockedOurUa, true);
  assert.equal(res.firstStatus, 403);
  assert.match(res.body, /Garage Door Repair/);
  assert.deepEqual(hits.map((h) => (h.ua === UA ? 'scanner' : h.ua === BROWSER_UA ? 'browser' : '?')), ['scanner', 'browser'], 'honest UA first, browser only as fallback');

  const crawl = await crawlSite(base, { allowPrivate: true });
  assert.equal(crawl.unreachable, undefined, 'the site is scannable after the retry');
  assert.equal(crawl.home.status, 200);
});

test('a site that blocks everything is marked blocked, never scored, never sellable', async (t) => {
  const { server } = makeSite({ alwaysBlock: true });
  const base = await listen(server);
  t.after(() => server.close());

  const record = localRecord(base, { business: 'Fortress Doors', city: 'Jupiter', trade: 'garage-doors', email: 'a@b.co' });
  await runScan(record, { allowPrivate: true, fetchImpl: offlineExternals(), env: {} });

  assert.equal(record.status, 'blocked');
  assert.equal(record.result, undefined, 'no result object means nothing to render or sell');
  assert.equal(record.blocked.blockedOurUa, true);
  assert.match(record.blocked.reason, /firewall that refused our scanner/);
  assert.match(record.blocked.reason, /run it by hand/);

  const free = freeSummary(record);
  assert.equal(free.sellable, false);
  assert.equal(free.score, undefined, 'a site we could not read has no score');
  assert.equal(free.grade, undefined);
  assert.match(free.error, /firewall/);

  const store = useMemoryStore();
  await store.set(record.id, record);
  const checkout = require('../netlify/functions/teardown-checkout');
  const res = await checkout.handler({ httpMethod: 'POST', body: JSON.stringify({ id: record.id, plan: 'report' }) });
  assert.equal(res.statusCode, 409, 'checkout refuses a scan we could not complete');
  assert.match(JSON.parse(res.body).error, /Nothing has been charged/);
});

test('a dead address is blocked with an explanation, not a grade', async () => {
  const record = localRecord('http://127.0.0.1:1/', { business: 'Nobody Home', city: 'Jupiter', trade: 'garage-doors', email: 'a@b.co' });
  await runScan(record, { allowPrivate: true, fetchImpl: offlineExternals(), env: {} });
  assert.equal(record.status, 'blocked');
  assert.match(record.blocked.reason, /could not reach/);
  assert.equal(freeSummary(record).sellable, false);
});

test('request timeouts are reported, not hung', async (t) => {
  const { server } = makeSite();
  const base = await listen(server);
  t.after(() => server.close());
  const res = await fetchPage(`${base}slow`, { allowPrivate: true, timeout: 400 });
  assert.equal(res.status, 0);
  assert.match(res.error, /Timed out after 0.4s/);
});

test('normalizeUrl still refuses loopback from user input', () => {
  assert.throws(() => normalizeUrl('http://127.0.0.1:8080/'), /cannot be scanned/);
  assert.throws(() => normalizeUrl('http://192.168.1.10/'), /cannot be scanned/);
});
