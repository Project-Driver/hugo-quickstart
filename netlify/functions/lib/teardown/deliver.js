'use strict';

/**
 * After payment: mark the scan paid, file the buyer in Project Driver's GHL,
 * and email the report link. Idempotent: calling twice sends nothing twice.
 */

const { createClient } = require('../ghl');
const { deliveryEmailHtml } = require('./report');

function reportUrl(record, siteUrl) {
  return `${(siteUrl || '').replace(/\/$/, '')}/api/teardown-report?id=${encodeURIComponent(record.id)}&k=${encodeURIComponent(record.key)}`;
}

async function markPaidAndDeliver(record, { plan, sessionId, amount, email }, { store, env = process.env, fetchImpl, log = () => {} }) {
  if (record.paid && record.deliveredAt) return { delivered: false, reason: 'already delivered' };
  record.paid = true;
  record.plan = plan || record.plan || 'report';
  record.payment = { sessionId, amount: amount || null, paidAt: new Date().toISOString() };
  if (email && !record.biz.email) record.biz.email = email;
  await store.set(record.id, record);

  const siteUrl = env.URL || env.PITBOARD_SITE_URL || '';
  const url = reportUrl(record, siteUrl);
  const bookUrl = env.TEARDOWN_CALL_URL || 'https://project-driver.com/book-a-call';
  const out = { delivered: false, url };

  const token = env.PD_GHL_TOKEN;
  const locationId = env.PD_GHL_LOCATION_ID;
  if (!token || !locationId || record.status !== 'done') {
    log(`delivery skipped: ghl ${token && locationId ? 'configured' : 'not configured'}, scan ${record.status}`);
    record.deliveredAt = record.status === 'done' ? new Date().toISOString() : null;
    record.deliveryNote = token && locationId ? 'scan not finished at payment time' : 'GHL not configured; report link only';
    await store.set(record.id, record);
    return out;
  }

  const ghl = createClient({ token, locationId, fetchImpl });
  const [firstName, ...rest] = (record.biz.name || 'Owner').split(/\s+/);
  try {
    const up = await ghl.upsertContact({
      firstName: record.biz.contactName || firstName,
      lastName: record.biz.contactName ? undefined : rest.join(' ') || undefined,
      email: record.biz.email,
      phone: record.biz.phone || undefined,
      companyName: record.biz.name,
      website: record.biz.url,
      city: record.biz.city,
      source: 'Instant Teardown',
      tags: ['teardown-paid', `teardown-plan-${record.plan}`, `trade-${record.biz.trade}`, `teardown-grade-${record.result.score.grade.toLowerCase()}`],
    });
    const contactId = up && up.contact && up.contact.id;
    record.ghlContactId = contactId || null;
    if (contactId) {
      await ghl.sendEmail({
        contactId,
        subject: `Your Teardown: ${record.biz.name} scores ${record.result.score.overall}/100`,
        html: deliveryEmailHtml(record, { reportUrl: url, bookUrl }),
        emailFrom: env.TEARDOWN_EMAIL_FROM || env.PITBOARD_EMAIL_FROM || undefined,
      });
      out.delivered = true;
    }
  } catch (e) {
    log(`delivery error: ${e.message}`);
    record.deliveryNote = `email failed: ${e.message}`;
  }
  record.deliveredAt = new Date().toISOString();
  await store.set(record.id, record);
  return out;
}

module.exports = { markPaidAndDeliver, reportUrl };
