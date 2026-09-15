'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./teardown-fixtures');
const { normalizeUrl, isPrivateIp } = require('../netlify/functions/lib/teardown/fetcher');
const { crawlSite, parsePage } = require('../netlify/functions/lib/teardown/crawl');
const { runChecks } = require('../netlify/functions/lib/teardown/checks');
const { scoreFindings, sortFindings } = require('../netlify/functions/lib/teardown/score');
const { buildPlan } = require('../netlify/functions/lib/teardown/plan');
const { parseLighthouse } = require('../netlify/functions/lib/teardown/pagespeed');
const { matchYou } = require('../netlify/functions/lib/teardown/serp');
const { verifyWebhook, signPayload, form } = require('../netlify/functions/lib/teardown/stripe');
const { createScanRecord, runScan } = require('../netlify/functions/lib/teardown/scan');
const { freeSummary, fullReportHtml, deliveryEmailHtml } = require('../netlify/functions/lib/teardown/report');

const ids = (findings) => findings.map((f) => f.id);

test('normalizeUrl accepts what people type and refuses private targets', () => {
  assert.equal(normalizeUrl('coastalair.com'), 'https://coastalair.com/');
  assert.equal(normalizeUrl('  http://www.Example.com/page#x '), 'http://www.example.com/page');
  assert.throws(() => normalizeUrl(''), /Enter your website/);
  assert.throws(() => normalizeUrl('localhost'), /cannot be scanned/);
  assert.throws(() => normalizeUrl('http://10.0.0.5/'), /cannot be scanned/);
  assert.throws(() => normalizeUrl('ftp://x.com'), /Only http/);
  assert.equal(isPrivateIp('192.168.1.1'), true);
  assert.equal(isPrivateIp('169.254.169.254'), true);
  assert.equal(isPrivateIp('8.8.8.8'), false);
  assert.equal(isPrivateIp('::1'), true);
});

test('parsePage extracts the facts the checks need', () => {
  const p = parsePage({ url: 'https://good.example.com/', finalUrl: 'https://good.example.com/', status: 200, headers: {}, body: fx.GOOD_HOME, bytes: 100, ttfbMs: 50, totalMs: 60, redirects: [], error: null });
  assert.equal(p.title, 'AC Repair in Fort Lauderdale | Coastal Air & Heat');
  assert.deepEqual(p.h1s, ['AC Repair in Fort Lauderdale']);
  assert.equal(p.links.filter((l) => l.kind === 'tel').length, 1);
  assert.equal(p.links.filter((l) => l.kind === 'sms').length, 1);
  assert.equal(p.jsonLd.map((o) => o['@type']).join(','), 'HVACBusiness,FAQPage,Service');
  assert.equal(p.forms[0].inputs.length, 3);
  assert.equal(p.forms[0].inputs.every((i) => i.labelled), true);
  assert.equal(p.images.length, 2);
  assert.equal(p.hasSkipLink, true);
  assert.equal(p.lang, 'en');
});

test('crawl of the bad site: findings cover security, speed, indexing, local, conversion, accessibility', async () => {
  const { fetchImpl, lookup } = fx.makeFetch();
  const crawl = await crawlSite('https://bad.example.com/', { fetchImpl, lookup });
  assert.equal(crawl.home.status, 200);
  assert.ok(crawl.pages.length >= 3);
  assert.equal(crawl.robots.disallowsAll, true);
  assert.equal(crawl.sitemap.present, false);
  assert.equal(crawl.notFoundStatus, 200, 'soft 404');
  assert.ok(crawl.errors.some((e) => /gallery/.test(e)));

  crawl.home.ttfbMs = 1900; // the mock fetch is instant; the fetcher measures this in real runs
  const F = runChecks({ crawl, psi: null, local: null, biz: { name: 'Bad Air Co', city: 'Pompano Beach', trade: 'hvac' } });
  const got = ids(F);
  for (const expected of ['http-not-redirected', 'mixed-content', 'no-viewport', 'slow-server', 'no-compression', 'robots-blocked', 'no-sitemap', 'soft-404', 'duplicate-titles', 'generic-title', 'missing-description', 'missing-h1', 'multiple-h1', 'thin-pages', 'no-service-pages', 'no-city-pages', 'no-localbusiness-schema', 'no-phone', 'no-address', 'city-not-mentioned', 'no-hours', 'no-license-number', 'no-map', 'no-reviews', 'no-click-to-call', 'no-booking-cta', 'long-form', 'no-text-us', 'no-emergency', 'no-tracking', 'images-no-alt', 'unlabeled-inputs', 'no-lang', 'no-llms-txt']) {
    assert.ok(got.includes(expected), `expected finding ${expected}; got ${got.join(', ')}`);
  }
  assert.ok(!got.includes('no-booking-path'), 'a form exists, so the path exists even if the CTA is missing');
  const alt = F.find((f) => f.id === 'images-no-alt');
  assert.match(alt.title, /^6 of 8 images/, 'alt="" is decorative, not missing');
  assert.equal(alt.severity, 'high');
  const lic = F.find((f) => f.id === 'no-license-number');
  assert.match(lic.title, /CAC/);
  assert.match(lic.cost, /489\.119/);

  const score = scoreFindings(F);
  assert.ok(score.overall < 40, `bad site should score badly, got ${score.overall}`);
  assert.equal(score.grade, 'F');
  assert.ok(score.bySeverity.critical >= 3);
});

test('crawl of the good site: few findings, high score', async () => {
  const { fetchImpl, lookup } = fx.makeFetch();
  const crawl = await crawlSite('https://good.example.com/', { fetchImpl, lookup });
  crawl.llmsTxt = true;
  assert.equal(crawl.httpProbe.finalUrl, 'https://good.example.com/');
  assert.equal(crawl.sitemap.urls.length, 2);
  const F = runChecks({ crawl, psi: null, local: null, biz: { name: 'Coastal Air & Heat', city: 'Fort Lauderdale', trade: 'hvac' } });
  const got = ids(F);
  for (const notExpected of ['no-https', 'http-not-redirected', 'no-viewport', 'robots-blocked', 'no-sitemap', 'no-phone', 'no-address', 'no-click-to-call', 'no-booking-path', 'no-booking-cta', 'no-localbusiness-schema', 'no-license-number', 'no-hours', 'no-tracking', 'images-no-alt', 'unlabeled-inputs', 'no-lang', 'no-service-pages', 'no-city-pages', 'city-not-mentioned', 'no-reviews', 'no-emergency', 'no-financing', 'no-trust-signals', 'no-map', 'no-text-us', 'no-llms-txt', 'no-faq-schema', 'no-service-schema']) {
    assert.ok(!got.includes(notExpected), `did not expect ${notExpected}; got ${got.join(', ')}`);
  }
  const score = scoreFindings(F);
  assert.ok(score.overall >= 85, `good site should score well, got ${score.overall} with ${got.join(', ')}`);
});

test('PageSpeed and local pack feed the checks and the score', async () => {
  const psi = parseLighthouse(fx.PSI_POOR.lighthouseResult, 'mobile');
  assert.equal(psi.scores.performance, 31);
  assert.equal(psi.metrics.lcpMs, 6100);
  assert.equal(psi.opportunities[0].title, 'Efficiently encode images');
  assert.equal(psi.a11yIssues.length, 1);
  const { fetchImpl, lookup } = fx.makeFetch();
  const crawl = await crawlSite('https://good.example.com/', { fetchImpl, lookup });
  crawl.llmsTxt = true;
  const biz = { name: 'Coastal Air & Heat', city: 'Fort Lauderdale', trade: 'hvac', url: 'https://good.example.com/' };
  const local = { ok: true, query: 'ac repair Fort Lauderdale', top: fx.SERP_MISSING.local_results.map((r) => ({ name: r.title, rating: r.rating, reviews: r.reviews })), you: null, all: [] };
  const F = runChecks({ crawl, psi, local, biz });
  const got = ids(F);
  for (const e of ['psi-perf-poor', 'lcp-poor', 'cls-poor', 'tbt-poor', 'psi-a11y', 'not-in-local-pack']) assert.ok(got.includes(e), `expected ${e}; got ${got.join(', ')}`);
  const score = scoreFindings(F, psi);
  assert.ok(score.categories.speed.score < 60, `speed blends Lighthouse: ${score.categories.speed.score}`);

  const you = matchYou(fx.SERP_PRESENT.local_results.map((r) => ({ name: r.title, rating: r.rating, reviews: r.reviews, website: r.website, position: r.position })), biz);
  assert.equal(you.position, 2);
  const F2 = runChecks({ crawl, psi: null, local: { ok: true, query: 'q', top: fx.SERP_PRESENT.local_results.slice(0, 3).map((r) => ({ name: r.title, rating: r.rating, reviews: r.reviews })), you: { position: 2, rating: 4.9, reviews: 212 } }, biz });
  assert.ok(ids(F2).includes('fewer-reviews'));
  assert.ok(!ids(F2).includes('not-in-local-pack'));
});

test('sorting and the 30-day plan', () => {
  const F = [
    { id: 'a', category: 'access', severity: 'low', effort: 'quick', title: 'A', fix: 'fa' },
    { id: 'b', category: 'conversion', severity: 'critical', effort: 'half-day', title: 'B', fix: 'fb' },
    { id: 'c', category: 'speed', severity: 'high', effort: 'project', title: 'C', fix: 'fc' },
    { id: 'd', category: 'search', severity: 'high', effort: 'quick', title: 'D', fix: 'fd' },
  ];
  assert.deepEqual(ids(sortFindings(F)), ['b', 'c', 'd', 'a']);
  const plan = buildPlan(F);
  assert.equal(plan.length, 3);
  assert.deepEqual(plan[0].items.map((i) => i.id), ['d', 'a']);
  assert.deepEqual(plan[1].items.map((i) => i.id), ['b']);
  assert.deepEqual(plan[2].items.map((i) => i.id), ['c']);
});

test('Stripe webhook verification and form encoding', () => {
  const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
  const secret = 'whsec_test';
  const header = signPayload(payload, secret);
  assert.equal(verifyWebhook(payload, header, secret).id, 'evt_1');
  assert.throws(() => verifyWebhook(payload + ' ', header, secret), /mismatch/);
  assert.throws(() => verifyWebhook(payload, signPayload(payload, secret, 1000), secret), /tolerance/);
  assert.throws(() => verifyWebhook(payload, null, secret), /Missing/);
  const enc = form({ mode: 'payment', line_items: [{ price: 'p_1', quantity: 1 }], metadata: { scanId: 'abc' } });
  assert.equal(enc, 'mode=payment&line_items%5B0%5D%5Bprice%5D=p_1&line_items%5B0%5D%5Bquantity%5D=1&metadata%5BscanId%5D=abc');
});

test('end to end: createScanRecord + runScan + freeSummary + report render', async () => {
  const record = createScanRecord({ url: 'bad.example.com', business: 'Bad Air Co', city: 'Pompano Beach', trade: 'hvac', email: 'Owner@Example.com', phone: '954-555-0100' });
  assert.equal(record.status, 'queued');
  assert.equal(record.biz.url, 'https://bad.example.com/');
  assert.equal(record.biz.email, 'owner@example.com');
  assert.throws(() => createScanRecord({ url: 'x.com', business: 'X', city: 'Y', email: 'nope' }), /valid email/);
  assert.throws(() => createScanRecord({ url: 'x.com', business: '', city: 'Y', email: 'a@b.co' }), /business name/);

  const { fetchImpl, lookup } = fx.makeFetch({ psi: fx.PSI_POOR, serp: fx.SERP_MISSING });
  await runScan(record, { fetchImpl, lookup, env: { PAGESPEED_API_KEY: 'k', SERPAPI_KEY: 'k' } });
  assert.equal(record.status, 'done', record.error);
  assert.equal(record.result.psi.ok, true);
  assert.equal(record.result.local.ok, true);
  assert.equal(record.result.local.you, null);
  assert.ok(record.result.findings.length > 25);
  assert.equal(record.result.findings[0].severity, 'critical');

  const free = freeSummary(record);
  assert.equal(free.grade, 'F');
  assert.equal(free.paid, false);
  assert.equal(free.teaser.severity, 'critical');
  assert.ok(!JSON.stringify(free).includes('"fix"'), 'free summary must not leak the fixes');
  assert.equal(free.localPack.inTop3, false);
  assert.equal(free.lighthouse.performance, 31);

  const html = fullReportHtml(record, { siteUrl: 'https://pitboard.test', bookUrl: 'https://book.test' });
  assert.match(html, /Grade F/);
  assert.match(html, /Findings, worst first/);
  assert.match(html, /Your 30-day plan/);
  assert.match(html, /Cool Breeze AC/);
  assert.match(html, /Efficiently encode images/);
  assert.match(html, new RegExp(`k=${record.key}`));
  assert.doesNotMatch(html, /<script>alert/);
  const email = deliveryEmailHtml(record, { reportUrl: 'https://x/report' });
  assert.match(email, /grade F/);
});

test('report escapes hostile site content', async () => {
  const record = createScanRecord({ url: 'bad.example.com', business: '<img src=x onerror=alert(1)>', city: 'X<script>', trade: 'hvac', email: 'a@b.co' });
  const { fetchImpl, lookup } = fx.makeFetch();
  await runScan(record, { fetchImpl, lookup, env: {} });
  const html = fullReportHtml(record);
  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.doesNotMatch(html, /X<script>/);
  assert.match(html, /&lt;script&gt;/);
});
