'use strict';

/**
 * Just enough Stripe: create a Checkout Session, fetch one, verify a webhook.
 * Plain REST, no SDK.
 */

const crypto = require('node:crypto');

const API = 'https://api.stripe.com/v1';

function form(obj, prefix = '') {
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => parts.push(...(typeof item === 'object' ? [form(item, `${key}[${i}]`)] : [`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(item)}`])));
    else if (typeof v === 'object') parts.push(form(v, key));
    else parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return parts.filter(Boolean).join('&');
}

async function stripeRequest(method, path, body, { secretKey = process.env.STRIPE_SECRET_KEY, fetchImpl = globalThis.fetch } = {}) {
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not set');
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body ? form(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error((json.error && json.error.message) || `Stripe ${res.status}`);
  return json;
}

async function createCheckoutSession({ priceId, scanId, plan, email, successUrl, cancelUrl, description }, opts) {
  return stripeRequest('POST', '/checkout/sessions', {
    mode: 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: email || undefined,
    client_reference_id: scanId,
    metadata: { scanId, plan },
    payment_intent_data: { description: description || `Instant Teardown (${plan})`, metadata: { scanId, plan } },
    allow_promotion_codes: true,
  }, opts);
}

async function getCheckoutSession(id, opts) {
  return stripeRequest('GET', `/checkout/sessions/${encodeURIComponent(id)}`, null, opts);
}

/** Verify Stripe-Signature; returns the parsed event or throws. */
function verifyWebhook(payload, sigHeader, secret, { toleranceSec = 300, now = Math.floor(Date.now() / 1000) } = {}) {
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  if (!sigHeader) throw new Error('Missing Stripe-Signature');
  const parts = Object.fromEntries(sigHeader.split(',').map((p) => p.split('=')).filter((p) => p.length === 2));
  const t = Number(parts.t);
  const v1 = sigHeader.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || !v1.length) throw new Error('Malformed Stripe-Signature');
  if (Math.abs(now - t) > toleranceSec) throw new Error('Webhook timestamp outside tolerance');
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${payload}`, 'utf8').digest('hex');
  const ok = v1.some((sig) => sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex')));
  if (!ok) throw new Error('Webhook signature mismatch');
  return JSON.parse(payload);
}

/** For tests: build a valid signature header. */
function signPayload(payload, secret, t = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${payload}`, 'utf8').digest('hex');
  return `t=${t},v1=${sig}`;
}

module.exports = { createCheckoutSession, getCheckoutSession, verifyWebhook, signPayload, form };
