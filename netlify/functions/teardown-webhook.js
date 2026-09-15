'use strict';

/** POST /api/teardown-webhook  (Stripe: checkout.session.completed) */

const { verifyWebhook } = require('./lib/teardown/stripe');
const { getScanStore } = require('./lib/teardown/store');
const { markPaidAndDeliver } = require('./lib/teardown/deliver');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'POST only' };
  let evt;
  try {
    const sig = event.headers && (event.headers['stripe-signature'] || event.headers['Stripe-Signature']);
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    evt = verifyWebhook(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return { statusCode: 400, body: `Webhook error: ${e.message}` };
  }
  if (evt.type !== 'checkout.session.completed') return { statusCode: 200, body: 'ignored' };
  const session = evt.data.object;
  if (session.payment_status && session.payment_status !== 'paid') return { statusCode: 200, body: 'not paid' };
  const scanId = (session.metadata && session.metadata.scanId) || session.client_reference_id;
  const store = getScanStore();
  const record = scanId && await store.get(scanId);
  if (!record) return { statusCode: 200, body: 'unknown scan' };
  const result = await markPaidAndDeliver(record, {
    plan: session.metadata && session.metadata.plan,
    sessionId: session.id,
    amount: session.amount_total,
    email: session.customer_details && session.customer_details.email,
  }, { store, log: console.log });
  return { statusCode: 200, body: JSON.stringify(result) };
};
