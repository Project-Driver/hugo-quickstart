'use strict';

/** POST /api/teardown-checkout {id, plan: 'report'|'call'} -> {url} to Stripe Checkout. */

const { getScanStore } = require('./lib/teardown/store');
const { createCheckoutSession } = require('./lib/teardown/stripe');

const PRICE_ENV = { report: 'STRIPE_PRICE_TEARDOWN', call: 'STRIPE_PRICE_TEARDOWN_CALL' };

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const plan = body.plan === 'call' ? 'call' : 'report';
  const record = await getScanStore().get(body.id);
  if (!record) return json(404, { error: 'unknown scan' });
  if (record.paid) return json(200, { ok: true, alreadyPaid: true, url: `/teardown/report/?id=${record.id}&k=${record.key}` });
  const priceId = process.env[PRICE_ENV[plan]];
  const base = (process.env.URL || process.env.PITBOARD_SITE_URL || '').replace(/\/$/, '');
  if (!priceId || !process.env.STRIPE_SECRET_KEY) return json(503, { error: 'Checkout is not configured yet. Call 754-315-4467 and we will run it by hand.' });
  try {
    const session = await createCheckoutSession({
      priceId, scanId: record.id, plan, email: record.biz.email,
      successUrl: `${base}/teardown/report/?id=${record.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/teardown/?id=${record.id}`,
      description: `Instant Teardown for ${record.biz.name} (${plan === 'call' ? 'report + call' : 'report'})`,
    });
    record.checkout = { sessionId: session.id, plan, createdAt: new Date().toISOString() };
    await getScanStore().set(record.id, record);
    return json(200, { ok: true, url: session.url });
  } catch (e) {
    console.error('checkout failed', e.message);
    return json(502, { error: 'Could not start checkout. Try again, or call 754-315-4467.' });
  }
};
