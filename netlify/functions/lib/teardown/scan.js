'use strict';

/**
 * Orchestrates one Teardown: crawl, PageSpeed, local pack, checks, score,
 * plan. Returns the full scan record; the free/paid split is a projection
 * done in report.js.
 */

const crypto = require('node:crypto');
const { crawlSite } = require('./crawl');
const { fetchPage, normalizeUrl } = require('./fetcher');
const { runPageSpeed } = require('./pagespeed');
const { localPack } = require('./serp');
const { runChecks } = require('./checks');
const { scoreFindings, sortFindings } = require('./score');
const { buildPlan } = require('./plan');

const TRADES = ['hvac', 'plumbing', 'roofing', 'electrical', 'garage-doors', 'pool', 'pest-control', 'landscaping', 'cleaning', 'general-contractor', 'other'];

function newId() { return crypto.randomBytes(9).toString('base64url'); }
function newKey() { return crypto.randomBytes(18).toString('base64url'); }

/** Validate the intake form into a scan record (status: queued). */
function createScanRecord(input) {
  const url = normalizeUrl(input.url);
  const name = String(input.business || '').trim().slice(0, 120);
  const city = String(input.city || '').trim().slice(0, 80);
  const trade = TRADES.includes(input.trade) ? input.trade : 'other';
  const email = String(input.email || '').trim().toLowerCase().slice(0, 160);
  if (!name) throw new Error('Enter the business name.');
  if (!city) throw new Error('Enter the city you serve.');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email; the report is sent there.');
  return {
    id: newId(),
    key: newKey(),
    status: 'queued',
    createdAt: new Date().toISOString(),
    biz: { url, name, city, trade, email, phone: String(input.phone || '').trim().slice(0, 40) },
    paid: false,
    plan: null,
  };
}

/** Run everything for a record. Mutates and returns it. */
async function runScan(record, { fetchImpl, lookup, log = () => {}, env = process.env } = {}) {
  const started = Date.now();
  record.status = 'running';
  record.startedAt = new Date().toISOString();
  const biz = record.biz;
  try {
    const [crawl, psi, local] = await Promise.all([
      crawlSite(biz.url, { fetchImpl, lookup, log }),
      runPageSpeed(biz.url, { fetchImpl, apiKey: env.PAGESPEED_API_KEY }).catch((e) => ({ ok: false, error: e.message })),
      localPack(biz, { fetchImpl, apiKey: env.SERPAPI_KEY }).catch((e) => ({ ok: false, error: e.message })),
    ]);
    // llms.txt is cheap and tells us if anyone thought about AI search.
    try {
      const origin = new URL(crawl.home.finalUrl || biz.url).origin;
      const r = await fetchPage(`${origin}/llms.txt`, { fetchImpl, lookup, timeout: 5000 });
      crawl.llmsTxt = r.status === 200 && /\S/.test(r.body) && !/<html/i.test(r.body);
    } catch { crawl.llmsTxt = false; }

    const findings = sortFindings(runChecks({ crawl, psi, local, biz }));
    const score = scoreFindings(findings, psi);
    const plan = buildPlan(findings);

    record.status = 'done';
    record.finishedAt = new Date().toISOString();
    record.durationMs = Date.now() - started;
    record.result = {
      finalUrl: crawl.home.finalUrl,
      pagesCrawled: crawl.pages.filter((p) => !p.error).length,
      pages: crawl.pages.map((p) => ({ url: p.finalUrl, status: p.status, title: p.title || '', h1: (p.h1s || [])[0] || '', words: p.wordCount || 0, images: (p.images || []).length, imagesNoAlt: (p.images || []).filter((i) => i.alt == null).length, description: !!p.metaDescription, error: p.error || null })),
      crawlErrors: crawl.errors,
      psi: psi && psi.ok ? psi : { ok: false, error: psi && psi.error },
      local: local && local.ok ? local : { ok: false, error: local && local.error },
      findings,
      score,
      plan,
    };
  } catch (e) {
    record.status = 'failed';
    record.error = e.message;
    record.finishedAt = new Date().toISOString();
    log(`scan failed: ${e.stack || e.message}`);
  }
  return record;
}

module.exports = { createScanRecord, runScan, TRADES, newId, newKey };
