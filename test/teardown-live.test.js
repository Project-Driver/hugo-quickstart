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
const { crawlSite, canonicalKey } = require('../netlify/functions/lib/teardown/crawl');
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

/**
 * A site shaped like the real ones that broke the crawler: pages reachable only
 * from the sitemap, several addresses for the homepage, and icon links that
 * wrap an image with alt text.
 */
const SITEMAP_ONLY = (slug) => page(`${slug} | Doors`, `<p>${'Detail about this service in Jupiter. '.repeat(25)}</p>`, { desc: `${slug} in Jupiter`, h1: slug });
const HOME_WITH_ALIASES = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Garage Door Repair in Jupiter | Doors</title><meta name="description" content="Garage door repair in Jupiter."></head><body>
<header><a href="tel:+15615550100">(561) 555-0100</a> <a href="/book">Book online</a></header>
<h1>Garage Door Repair in Jupiter</h1>
<p>Licensed and insured. Serving Jupiter since 2004. Call (561) 555-0100. Open Mon-Fri 7:00 am to 6:00 pm. 1420 Main St, Jupiter, FL 33458.</p>
<a href="/"><img src="/logo.png" alt="Doors of Jupiter home"></a>
<a href="https://www.facebook.com/x"><img src="/fb.svg" alt="Facebook"></a>
<a href="/contact/" aria-label="Contact us"><span class="icon"></span></a>
<a href="/reviews/"><svg><title>Read our reviews</title></svg></a>
<a href="/nameless"><span class="icon"></span></a>
<a href="/index.php">Home</a> <a href="/?utm_source=nav">Home again</a> <a href="/about">About</a> <a href="/about/">About us</a> <a href="/home-page">Our home page</a>
<a href="/services/">Services</a>
</body></html>`;

function makeAliasSite() {
  const hits = [];
  let inFlight = 0, peak = 0;
  const sitemapPages = ['spring-repair', 'opener-install', 'new-doors', 'commercial', 'maintenance', 'emergency-service'];
  const server = http.createServer(async (req, res) => {
    inFlight++; peak = Math.max(peak, inFlight);
    hits.push(req.url);
    const url = req.url.split('?')[0];
    const done = (status, body, headers = {}) => {
      setTimeout(() => { inFlight--; res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...headers }); res.end(body); }, 15);
    };
    if (url === '/') return done(200, HOME_WITH_ALIASES);
    if (url === '/index.php') return done(200, HOME_WITH_ALIASES);
    if (url === '/home-page') return done(301, '', { Location: '/' });
    if (url === '/about') return done(301, '', { Location: '/about/' });
    if (url === '/about/') return done(200, SITEMAP_ONLY('About'));
    if (url === '/robots.txt') return done(200, `User-agent: *\nAllow: /\nSitemap: http://127.0.0.1:${server.address().port}/sitemap_index.xml\n`, { 'Content-Type': 'text/plain' });
    if (url === '/sitemap.xml') return done(404, 'no');
    if (url === '/sitemap_index.xml') {
      const base = `http://127.0.0.1:${server.address().port}`;
      return done(200, `<?xml version="1.0"?><sitemapindex><sitemap><loc>${base}/page-sitemap.xml</loc></sitemap></sitemapindex>`, { 'Content-Type': 'application/xml' });
    }
    if (url === '/page-sitemap.xml') {
      const base = `http://127.0.0.1:${server.address().port}`;
      const locs = ['/', '/about/', '/contact/', '/reviews/', '/services/', '/book', ...sitemapPages.map((p) => `/services/${p}/`)]
        .map((u) => `<url><loc>${base}${u}</loc></url>`).join('');
      return done(200, `<?xml version="1.0"?><urlset>${locs}</urlset>`, { 'Content-Type': 'application/xml' });
    }
    const slug = url.replace(/^\/services\//, '').replace(/\/$/, '');
    if (url.startsWith('/services/') && sitemapPages.includes(slug)) return done(200, SITEMAP_ONLY(slug));
    if (['/contact/', '/reviews/', '/services/', '/book', '/nameless'].includes(url)) return done(200, SITEMAP_ONLY(url.replace(/\W/g, ' ').trim() || 'Page'));
    return done(404, page('Not found', '<p>404</p>'));
  });
  return { server, hits, peak: () => peak, sitemapPages };
}

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

test('pages listed only in the sitemap are found and crawled', async (t) => {
  const { server, hits, sitemapPages } = makeAliasSite();
  const base = await listen(server);
  t.after(() => server.close());

  const crawl = await crawlSite(base, { allowPrivate: true });
  assert.equal(crawl.sitemap.present, true, 'found the sitemap named in robots.txt');
  assert.equal(crawl.sitemap.isIndex, true, 'followed the sitemap index to its child');
  assert.equal(crawl.sitemap.urls.length, 12);

  const paths = crawl.pages.map((p) => new URL(p.finalUrl).pathname);
  for (const slug of sitemapPages) {
    assert.ok(paths.includes(`/services/${slug}/`), `crawled /services/${slug}/, which nothing on the homepage links to; got ${paths.join(', ')}`);
  }
  assert.ok(hits.includes('/page-sitemap.xml'));
});

test('one page is crawled once, however many addresses point at it', async (t) => {
  const { server } = makeAliasSite();
  const base = await listen(server);
  t.after(() => server.close());

  const crawl = await crawlSite(base, { allowPrivate: true });
  const keys = crawl.pages.filter((p) => !p.error && p.status < 400).map((p) => canonicalKey(p.finalUrl));
  assert.equal(new Set(keys).size, keys.length, `every crawled page is distinct; got ${keys.join(', ')}`);

  const home = keys.filter((k) => new URL(k).pathname === '/');
  assert.equal(home.length, 1, 'the homepage appears once despite /, /index.php, /?utm_source= and a redirect to it');
  const about = crawl.pages.filter((p) => /\/about\/?$/.test(new URL(p.finalUrl).pathname));
  assert.equal(about.length, 1, '/about and /about/ are the same page');
});

test('icon links with alt text or a label are not reported as nameless', async (t) => {
  const { server } = makeAliasSite();
  const base = await listen(server);
  t.after(() => server.close());

  const crawl = await crawlSite(base, { allowPrivate: true });
  const named = crawl.home.links.filter((l) => l.kind === 'link' && l.name && !l.text);
  assert.ok(named.length >= 3, 'links named by image alt, aria-label and svg title all count as named');

  const findings = runChecks({ crawl, psi: null, local: null, biz: { name: 'Doors', city: 'Jupiter', trade: 'garage-doors' } });
  const empty = findings.find((f) => f.id === 'empty-links');
  assert.ok(empty, 'the one genuinely nameless link is still reported');
  assert.match(empty.title, /^1 link/, `only the nameless link counts; got "${empty.title}"`);
  assert.match(empty.title, /screen reader cannot name/);
});

test('a phone number in the header is not called buried, and copy matches the trade', async (t) => {
  const { server } = makeAliasSite();
  const base = await listen(server);
  t.after(() => server.close());

  const crawl = await crawlSite(base, { allowPrivate: true });
  assert.ok(crawl.home.telAtFraction !== null && crawl.home.telAtFraction < 0.25, 'the tel: link is near the top of the source');
  const findings = runChecks({ crawl, psi: null, local: null, biz: { name: 'Doors', city: 'Jupiter', trade: 'garage-doors' } });
  assert.ok(!findings.some((f) => f.id === 'phone-buried'), 'a header phone link means the number is not buried');

  // The same page without the header link should still be flagged, in this trade's words.
  // Same page with the header link gone and the number pushed down the copy.
  const noHeader = { ...crawl, home: { ...crawl.home, telAtFraction: 0.8, text: `${'Filler copy about our company history. '.repeat(20)}${crawl.home.text}` } };
  const flagged = runChecks({ crawl: noHeader, psi: null, local: null, biz: { name: 'Doors', city: 'Jupiter', trade: 'garage-doors' } })
    .find((f) => f.id === 'phone-buried');
  assert.ok(flagged, 'still caught when the number really is buried');
  assert.match(flagged.cost, /garage door that will not open/);
  assert.doesNotMatch(flagged.cost, /\bAC\b|air conditioner/, 'no air-conditioning copy in a garage-door report');
});

test('no report mentions another trade, whatever the trade', async (t) => {
  const { server } = makeAliasSite();
  const base = await listen(server);
  t.after(() => server.close());
  const crawl = await crawlSite(base, { allowPrivate: true });
  const bare = { ...crawl, home: { ...crawl.home, telAtFraction: 0.9, text: crawl.home.text.replace(/Mon-Fri[^.]*\./, '') } };
  for (const trade of ['roofing', 'plumbing', 'pool', 'cleaning']) {
    const text = runChecks({ crawl: bare, psi: null, local: null, biz: { name: 'X', city: 'Jupiter', trade } })
      .map((f) => `${f.title} ${f.cost} ${f.fix}`).join(' ');
    assert.doesNotMatch(text, /broken AC|AC repair pricing|AC not cooling/, `${trade} report still mentions air conditioning`);
  }
});

test('the crawl is capped, says so, and never floods the host', async (t) => {
  const { server, peak } = makeAliasSite();
  const base = await listen(server);
  t.after(() => server.close());

  const crawl = await crawlSite(base, { allowPrivate: true, maxPages: 5 });
  assert.equal(crawl.pages.length, 5, 'honours the cap');
  assert.equal(crawl.crawlLimited, true);
  assert.equal(crawl.knownPageCount, 12, 'reports how many pages the site actually has');
  assert.ok(peak() <= 5, `at most five requests in flight at once; peaked at ${peak()}`);

  const priority = crawl.pages.map((p) => new URL(p.finalUrl).pathname);
  assert.ok(priority.includes('/contact/'), `contact is crawled before the long tail; got ${priority.join(', ')}`);
});
