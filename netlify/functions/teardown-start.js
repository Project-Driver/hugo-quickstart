'use strict';

/**
 * POST /api/teardown-start  {url, business, city, trade, email, phone}
 * Creates the scan, kicks off the background runner, returns {id}.
 */

const { createScanRecord } = require('./lib/teardown/scan');
const { getScanStore } = require('./lib/teardown/store');

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  if (body.website) return json(200, { ok: true, id: 'bot' }); // honeypot

  let record;
  try { record = createScanRecord(body); } catch (e) { return json(400, { error: e.message }); }
  const store = getScanStore();
  await store.set(record.id, record);

  // Fire the background function. It returns 202 immediately and runs for up to 15 minutes.
  const base = process.env.URL || process.env.PITBOARD_SITE_URL;
  const runnerSecret = process.env.TEARDOWN_RUNNER_SECRET || '';
  if (base) {
    try {
      await fetch(`${base.replace(/\/$/, '')}/.netlify/functions/teardown-run-background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-teardown-runner': runnerSecret },
        body: JSON.stringify({ id: record.id }),
      });
    } catch (e) {
      console.error('could not start background scan', e.message);
      record.status = 'failed';
      record.error = 'Could not start the scan. Try again in a minute.';
      await store.set(record.id, record);
      return json(502, { error: record.error });
    }
  } else {
    // Local dev without a site URL: run inline (slow, but works).
    const { runScan } = require('./lib/teardown/scan');
    runScan(record).then(() => store.set(record.id, record)).catch(() => {});
  }
  return json(200, { ok: true, id: record.id });
};
