'use strict';

/**
 * POST /api/signup
 * Body: { name, business, email, phone, trade, plan, ghl, website }
 *
 * Upserts the lead into Project Driver's own GoHighLevel location with the
 * tags the "Pit Board" workflows key off, then returns where to send them.
 */

const { createClient } = require('./lib/ghl');

const PLANS = new Set(['board', 'crew', 'pro', 'agency']);
const CHECKOUT = {
  board: process.env.PITBOARD_CHECKOUT_BOARD,
  crew: process.env.PITBOARD_CHECKOUT_CREW,
  pro: process.env.PITBOARD_CHECKOUT_PRO,
  agency: process.env.PITBOARD_AGENCY_CALL_URL,
};

function clean(s, max = 200) {
  return String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  // Honeypot: real people never fill this.
  if (body.website) return json(200, { ok: true });

  const name = clean(body.name, 120);
  const business = clean(body.business, 160);
  const email = clean(body.email, 160).toLowerCase();
  const phone = clean(body.phone, 40);
  const trade = clean(body.trade, 60);
  const ghl = clean(body.ghl, 20);
  const plan = PLANS.has(body.plan) ? body.plan : 'board';

  if (!name || !business || (!email && !phone)) {
    return json(400, { error: 'Name, business, and an email or phone are required.' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'That email does not look right.' });

  const token = process.env.PD_GHL_TOKEN;
  const locationId = process.env.PD_GHL_LOCATION_ID;
  const next = CHECKOUT[plan] || process.env.PITBOARD_FALLBACK_URL || 'https://project-driver.com/book-a-call';

  if (!token || !locationId) {
    console.warn('signup received but PD_GHL_TOKEN / PD_GHL_LOCATION_ID are not set');
    return json(200, { ok: true, next, stored: false });
  }

  const [firstName, ...rest] = name.split(/\s+/);
  try {
    const ghlClient = createClient({ token, locationId });
    const r = await ghlClient.upsertContact({
      firstName,
      lastName: rest.join(' ') || undefined,
      email: email || undefined,
      phone: phone || undefined,
      companyName: business,
      source: 'Pit Board site',
      tags: ['pitboard-signup', `pitboard-plan-${plan}`, ghl === 'yes' ? 'pitboard-has-ghl' : 'pitboard-needs-ghl', trade ? `trade-${trade.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : null].filter(Boolean),
    });
    const contactId = r && r.contact && r.contact.id;
    return json(200, { ok: true, next, stored: true, contactId });
  } catch (e) {
    console.error('signup upsert failed', e.status, e.body || e.message);
    // Never lose a lead over an API hiccup: still send them onward.
    return json(200, { ok: true, next, stored: false });
  }
};
