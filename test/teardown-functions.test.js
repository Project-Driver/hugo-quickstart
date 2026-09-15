'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./teardown-fixtures');
const { useMemoryStore } = require('../netlify/functions/lib/teardown/store');
const { createScanRecord, runScan } = require('../netlify/functions/lib/teardown/scan');
const { signPayload } = require('../netlify/functions/lib/teardown/stripe');
const { markPaidAndDeliver } = require('../netlify/functions/lib/teardown/deliver');

const store = useMemoryStore();
const start = require('../netlify/functions/teardown-start');
const status = require('../netlify/functions/teardown-status');
const checkout = require('../netlify/functions/teardown-checkout');
const webhook = require('../netlify/functions/teardown-webhook');
const report = require('../netlify/functions/teardown-report');

async function doneRecord() {
  const record = createScanRecord({ url: 'bad.example.com', business: 'Bad Air Co', city: 'Pompano Beach', trade: 'hvac', email: 'owner@example.com' });
  const { fetchImpl, lookup } = fx.makeFetch();
  await runScan(record, { fetchImpl, lookup, env: {} });
  await store.set(record.id, record);
  return record;
}

test('start validates, honeypots, and stores a queued scan (inline runner when no site URL)', async () => {
  delete process.env.URL; delete process.env.PITBOARD_SITE_URL;
  assert.equal((await start.handler({ httpMethod: 'GET' })).statusCode, 405);
  assert.equal((await start.handler({ httpMethod: 'POST', body: '{"url":"x.com","business":"X","city":"Y","email":"bad"}' })).statusCode, 400);
  const bot = await start.handler({ httpMethod: 'POST', body: '{"url":"x.com","website":"spam"}' });
  assert.equal(JSON.parse(bot.body).id, 'bot');
  const res = await start.handler({ httpMethod: 'POST', body: JSON.stringify({ url: 'nonexistent-host-for-tests.invalid', business: 'X', city: 'Y', trade: 'hvac', email: 'a@b.co' }) });
  assert.equal(res.statusCode, 200);
  const { id } = JSON.parse(res.body);
  const rec = await store.get(id);
  assert.ok(rec);
  assert.equal(rec.biz.url, 'https://nonexistent-host-for-tests.invalid/');
});

test('status returns the free summary and never the fixes', async () => {
  const record = await doneRecord();
  assert.equal((await status.handler({ queryStringParameters: {} })).statusCode, 400);
  assert.equal((await status.handler({ queryStringParameters: { id: 'nope' } })).statusCode, 404);
  const res = await status.handler({ queryStringParameters: { id: record.id } });
  const body = JSON.parse(res.body);
  assert.equal(body.status, 'done');
  assert.equal(body.grade, 'F');
  assert.ok(body.findingTitles.length);
  assert.ok(!res.body.includes('"fix"'));
});

test('checkout refuses when Stripe is not configured, and short-circuits when already paid', async () => {
  const record = await doneRecord();
  delete process.env.STRIPE_SECRET_KEY;
  const res = await checkout.handler({ httpMethod: 'POST', body: JSON.stringify({ id: record.id, plan: 'report' }) });
  assert.equal(res.statusCode, 503);
  record.paid = true; await store.set(record.id, record);
  const paid = await checkout.handler({ httpMethod: 'POST', body: JSON.stringify({ id: record.id }) });
  assert.equal(JSON.parse(paid.body).alreadyPaid, true);
  assert.equal((await checkout.handler({ httpMethod: 'POST', body: JSON.stringify({ id: 'nope' }) })).statusCode, 404);
});

test('checkout creates a Stripe session with the scan in metadata', async () => {
  const record = await doneRecord();
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_PRICE_TEARDOWN = 'price_report';
  process.env.URL = 'https://pitboard.test';
  const realFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, init) => { captured = { url: String(url), body: init.body }; return { ok: true, status: 200, json: async () => ({ id: 'cs_123', url: 'https://checkout.stripe.com/c/cs_123' }) }; };
  try {
    const res = await checkout.handler({ httpMethod: 'POST', body: JSON.stringify({ id: record.id, plan: 'report' }) });
    assert.equal(JSON.parse(res.body).url, 'https://checkout.stripe.com/c/cs_123');
    assert.match(captured.url, /\/v1\/checkout\/sessions$/);
    assert.match(captured.body, new RegExp(`metadata%5BscanId%5D=${record.id}`));
    assert.match(captured.body, /line_items%5B0%5D%5Bprice%5D=price_report/);
    assert.match(captured.body, /success_url=https%3A%2F%2Fpitboard.test%2Fteardown%2Freport%2F%3Fid%3D/);
    assert.equal((await store.get(record.id)).checkout.sessionId, 'cs_123');
  } finally { globalThis.fetch = realFetch; delete process.env.URL; }
});

test('webhook verifies the signature, marks paid, and is idempotent', async () => {
  const record = await doneRecord();
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_t';
  delete process.env.PD_GHL_TOKEN;
  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_9', payment_status: 'paid', amount_total: 7900, metadata: { scanId: record.id, plan: 'report' }, customer_details: { email: 'owner@example.com' } } } });
  assert.equal((await webhook.handler({ httpMethod: 'POST', headers: { 'stripe-signature': 't=1,v1=bad' }, body: payload })).statusCode, 400);
  const ok = await webhook.handler({ httpMethod: 'POST', headers: { 'stripe-signature': signPayload(payload, 'whsec_t') }, body: payload });
  assert.equal(ok.statusCode, 200);
  const rec = await store.get(record.id);
  assert.equal(rec.paid, true);
  assert.equal(rec.plan, 'report');
  assert.equal(rec.payment.amount, 7900);
  assert.match(rec.deliveryNote, /GHL not configured/);
  const again = await markPaidAndDeliver(rec, { plan: 'report', sessionId: 'cs_9' }, { store, env: {} });
  assert.equal(again.reason, 'already delivered');
  const other = JSON.stringify({ type: 'payment_intent.created', data: { object: {} } });
  assert.equal((await webhook.handler({ httpMethod: 'POST', headers: { 'stripe-signature': signPayload(other, 'whsec_t') }, body: other })).body, 'ignored');
});

test('delivery files the buyer in GHL and emails the link', async () => {
  const record = await doneRecord();
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url: String(url), body: JSON.parse(init.body) }); return { ok: true, status: 200, text: async () => JSON.stringify(String(url).includes('upsert') ? { contact: { id: 'c1' } } : { emailMessageId: 'e1' }) }; };
  const out = await markPaidAndDeliver(record, { plan: 'call', sessionId: 'cs_1', amount: 24900 }, { store, fetchImpl, env: { PD_GHL_TOKEN: 't', PD_GHL_LOCATION_ID: 'L', URL: 'https://pitboard.test' } });
  assert.equal(out.delivered, true);
  assert.match(out.url, new RegExp(`/api/teardown-report\\?id=${record.id}&k=${record.key}`));
  assert.deepEqual(calls[0].body.tags, ['teardown-paid', 'teardown-plan-call', 'trade-hvac', 'teardown-grade-f']);
  assert.equal(calls[1].body.type, 'Email');
  assert.match(calls[1].body.html, /Pick a time here/);
});

test('report is gated by the key or a verified Stripe session', async () => {
  const record = await doneRecord();
  delete process.env.STRIPE_SECRET_KEY; delete process.env.PITBOARD_PREVIEW_KEY;
  assert.equal((await report.handler({ queryStringParameters: { id: record.id, k: record.key } })).statusCode, 402, 'unpaid');
  record.paid = true; await store.set(record.id, record);
  assert.equal((await report.handler({ queryStringParameters: { id: record.id, k: 'wrong' } })).statusCode, 402);
  const ok = await report.handler({ queryStringParameters: { id: record.id, k: record.key } });
  assert.equal(ok.statusCode, 200);
  assert.match(ok.body, /Bad Air Co/);
  assert.equal(ok.headers['X-Robots-Tag'], 'noindex');

  const r2 = await doneRecord();
  process.env.STRIPE_SECRET_KEY = 'sk_test';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ id: 'cs_ok', payment_status: 'paid', metadata: { scanId: r2.id, plan: 'report' }, amount_total: 7900, customer_details: { email: 'x@y.z' } }) });
  try {
    const viaSession = await report.handler({ queryStringParameters: { id: r2.id, session_id: 'cs_ok' } });
    assert.equal(viaSession.statusCode, 200);
    assert.equal((await store.get(r2.id)).paid, true, 'session verification marks paid before the webhook arrives');
  } finally { globalThis.fetch = realFetch; delete process.env.STRIPE_SECRET_KEY; }
});
