'use strict';

/**
 * GET /api/teardown-report?id=&k=<key>            -> full report (paid)
 * GET /api/teardown-report?id=&session_id=<cs_..> -> verifies the Stripe session, marks paid if needed, serves the report
 * GET /api/teardown-report?id=&key=<PITBOARD_PREVIEW_KEY> -> admin
 */

const { getScanStore } = require('./lib/teardown/store');
const { fullReportHtml } = require('./lib/teardown/report');
const { getCheckoutSession } = require('./lib/teardown/stripe');
const { markPaidAndDeliver } = require('./lib/teardown/deliver');

const html = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }, body });

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  if (!q.id) return html(400, 'Missing report id.');
  const store = getScanStore();
  const record = await store.get(q.id);
  if (!record) return html(404, 'Unknown report.');

  const admin = !!process.env.PITBOARD_PREVIEW_KEY && q.key === process.env.PITBOARD_PREVIEW_KEY;
  let authorized = admin || (!!q.k && q.k === record.key && record.paid);

  if (!authorized && q.session_id && process.env.STRIPE_SECRET_KEY) {
    try {
      const s = await getCheckoutSession(q.session_id);
      const matches = s && (s.metadata && s.metadata.scanId === record.id || s.client_reference_id === record.id);
      if (matches && s.payment_status === 'paid') {
        if (!record.paid) await markPaidAndDeliver(record, { plan: s.metadata && s.metadata.plan, sessionId: s.id, amount: s.amount_total, email: s.customer_details && s.customer_details.email }, { store, log: console.log });
        authorized = true;
      }
    } catch (e) { console.error('session check failed', e.message); }
  }
  if (!authorized) return html(402, 'This report has not been unlocked. Go back to the scan page to unlock it.');

  if (record.status !== 'done') {
    return html(200, `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="4"><title>Building your report</title><body style="background:#0b0c0e;color:#f4f5f7;font-family:sans-serif;padding:40px;text-align:center"><h1>Building your report…</h1><p>${record.status === 'failed' ? `The scan failed: ${record.error}. Reply to your receipt and we will run it by hand and refund if it cannot be done.` : 'The scan is still running. This page refreshes itself.'}</p></body>`);
  }
  const siteUrl = process.env.URL || process.env.PITBOARD_SITE_URL || '';
  return html(200, fullReportHtml(record, { siteUrl, bookUrl: process.env.TEARDOWN_CALL_URL || 'https://project-driver.com/book-a-call' }));
};
