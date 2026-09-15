'use strict';

/**
 * Pure board composition. No network. Takes the raw records for one account
 * and one reporting window and returns the Pit Board object that every
 * renderer (SMS, email, web) draws from.
 */

const { formatDay, formatShortDay, formatTime } = require('./time');

const MISSED_STATUSES = new Set(['no-answer', 'busy', 'failed', 'canceled', 'cancelled', 'voicemail']);
const RECOVERY_WINDOW_MS = 10 * 60 * 1000;      // text-back within 10 minutes counts as recovered
const QUIET_LEAD_MIN_AGE_MS = 2 * 60 * 60 * 1000; // customer waited at least 2 hours
const QUIET_LEAD_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const STALE_ESTIMATE_DAYS = 3;
const MAX_TABLE_ITEMS = 6;

function within(ts, start, end) {
  const t = new Date(ts).getTime();
  return t >= start.getTime() && t < end.getTime();
}

function isMissed(call) {
  const status = (call.meta && call.meta.call && call.meta.call.status) || call.status;
  return call.direction === 'inbound' && MISSED_STATUSES.has(String(status || '').toLowerCase());
}

function contactLink(account, contactId) {
  const base = (account.appBaseUrl || 'https://app.gohighlevel.com').replace(/\/$/, '');
  return `${base}/v2/location/${account.locationId}/contacts/detail/${contactId}`;
}

function conversationLink(account, conversationId) {
  const base = (account.appBaseUrl || 'https://app.gohighlevel.com').replace(/\/$/, '');
  return `${base}/v2/location/${account.locationId}/conversations/conversations/${conversationId}`;
}

function displayName(rec) {
  return rec.contactName || rec.fullName || rec.name
    || [rec.firstName, rec.lastName].filter(Boolean).join(' ')
    || rec.phone || rec.email || 'Unknown caller';
}

function relativeAge(ms) {
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60000))}m`;
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function bucketSource(contact) {
  const raw = String(contact.source || (contact.attributions && contact.attributions[0] && contact.attributions[0].utmSessionSource) || '').toLowerCase();
  if (!raw) return 'Other';
  if (/google|gbp|maps|organic/.test(raw)) return 'Google';
  if (/facebook|instagram|meta|fb|ig/.test(raw)) return 'Social';
  if (/call|phone|voice|maya|receptionist/.test(raw)) return 'Phone';
  if (/site|web|form|chat|landing/.test(raw)) return 'Website';
  if (/refer/.test(raw)) return 'Referral';
  if (/direct/.test(raw)) return 'Direct';
  return 'Other';
}

/**
 * @param {object} input
 * @param {object} input.account   {name, locationId, timeZone, appBaseUrl}
 * @param {object} input.window    from time.reportingWindow()
 * @param {Date}   input.now
 * @param {Array}  input.calls      call records covering baseline+yesterday
 * @param {Array}  input.sms        SMS records covering baseline+yesterday
 * @param {Array}  input.newContacts contacts added yesterday
 * @param {Array}  input.appointments events covering yesterday..today
 * @param {Array}  input.waiting    conversations whose last message is inbound
 * @param {Array}  input.opportunities open opportunities
 * @param {Array}  input.pipelines  pipelines with stages
 * @param {Array}  input.invoices   unpaid invoices
 */
function composeBoard(input) {
  const { account, window: win, now = new Date() } = input;
  const tz = win.timeZone;
  const calls = input.calls || [];
  const sms = input.sms || [];
  const newContacts = input.newContacts || [];
  const appointments = input.appointments || [];
  const waiting = input.waiting || [];
  const opportunities = input.opportunities || [];
  const pipelines = input.pipelines || [];
  const invoices = input.invoices || [];

  // ---- Yesterday's lap -------------------------------------------------
  const yCalls = calls.filter((c) => within(c.dateAdded, win.yesterday.start, win.yesterday.end));
  const inboundCalls = yCalls.filter((c) => c.direction === 'inbound');
  const missedCalls = inboundCalls.filter(isMissed);
  const outboundSms = sms.filter((m) => m.direction === 'outbound');
  const inboundSms = sms.filter((m) => m.direction === 'inbound');

  const recoveredIds = new Set();
  const unrecovered = [];
  for (const call of missedCalls) {
    const t = new Date(call.dateAdded).getTime();
    const textedBack = outboundSms.some((m) => m.contactId === call.contactId
      && new Date(m.dateAdded).getTime() >= t
      && new Date(m.dateAdded).getTime() - t <= RECOVERY_WINDOW_MS);
    if (textedBack) recoveredIds.add(call.id); else unrecovered.push(call);
  }

  const yInboundSms = inboundSms.filter((m) => within(m.dateAdded, win.yesterday.start, win.yesterday.end));
  const yOutboundSms = outboundSms.filter((m) => within(m.dateAdded, win.yesterday.start, win.yesterday.end));

  // Median first-reply time: for each inbound SMS yesterday, the first outbound after it (same contact).
  const replyMinutes = [];
  for (const m of yInboundSms) {
    const t = new Date(m.dateAdded).getTime();
    const reply = outboundSms
      .filter((o) => o.contactId === m.contactId && new Date(o.dateAdded).getTime() > t)
      .map((o) => new Date(o.dateAdded).getTime())
      .sort((a, b) => a - b)[0];
    if (reply) replyMinutes.push((reply - t) / 60000);
  }
  replyMinutes.sort((a, b) => a - b);
  const medianReply = replyMinutes.length
    ? replyMinutes[Math.floor(replyMinutes.length / 2)]
    : null;

  const bookedYesterday = appointments.filter((a) => within(a.dateAdded || a.createdAt || a.startTime, win.yesterday.start, win.yesterday.end)
    && !['cancelled', 'noshow', 'invalid'].includes(String(a.appointmentStatus || '').toLowerCase()));

  const leadsBySource = {};
  for (const c of newContacts) {
    const s = bucketSource(c);
    leadsBySource[s] = (leadsBySource[s] || 0) + 1;
  }

  // ---- 7-day baseline ----------------------------------------------------
  const bCalls = calls.filter((c) => c.direction === 'inbound' && within(c.dateAdded, win.baseline.start, win.baseline.end));
  const bMissed = bCalls.filter(isMissed);
  const baseline = {
    callsPerDay: +(bCalls.length / win.baseline.days).toFixed(1),
    missedPerDay: +(bMissed.length / win.baseline.days).toFixed(1),
  };

  // ---- Last 7 days (yesterday plus the six before it) -----------------------
  const weekStart = new Date(win.yesterday.start.getTime() - 6 * 86400000);
  const wCalls = calls.filter((c) => c.direction === 'inbound' && within(c.dateAdded, weekStart, win.yesterday.end));
  const wMissed = wCalls.filter(isMissed);
  const wRecovered = wMissed.filter((call) => {
    const t = new Date(call.dateAdded).getTime();
    return outboundSms.some((m) => m.contactId === call.contactId
      && new Date(m.dateAdded).getTime() >= t && new Date(m.dateAdded).getTime() - t <= RECOVERY_WINDOW_MS);
  });
  const week = {
    callsIn: wCalls.length,
    missed: wMissed.length,
    recovered: wRecovered.length,
    textsIn: inboundSms.filter((m) => within(m.dateAdded, weekStart, win.yesterday.end)).length,
  };
  const isMonday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(win.today.start) === 'Mon';

  // ---- Today's lineup ------------------------------------------------------
  const todays = appointments
    .filter((a) => within(a.startTime, win.today.start, win.today.end)
      && !['cancelled', 'invalid'].includes(String(a.appointmentStatus || '').toLowerCase()))
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
    .map((a) => ({
      id: a.id,
      time: formatTime(new Date(a.startTime), tz),
      startTime: a.startTime,
      name: a.contactName || a.title || 'Appointment',
      title: a.title || '',
      address: a.address || '',
      link: a.contactId ? contactLink(account, a.contactId) : null,
    }));

  // ---- Money on the table ---------------------------------------------------
  const table = [];
  const nowMs = now.getTime();

  for (const call of unrecovered) {
    table.push({
      kind: 'missed-call',
      label: 'Missed call, no text back',
      name: displayName(call) === 'Unknown caller' ? (call.from || 'Unknown caller') : displayName(call),
      detail: `Called ${formatTime(new Date(call.dateAdded), tz)}`,
      ageMs: nowMs - new Date(call.dateAdded).getTime(),
      link: call.conversationId ? conversationLink(account, call.conversationId) : contactLink(account, call.contactId),
      priority: 0,
    });
  }

  for (const conv of waiting) {
    const last = new Date(conv.lastMessageDate || conv.dateUpdated || 0).getTime();
    const age = nowMs - last;
    if (!last || age < QUIET_LEAD_MIN_AGE_MS || age > QUIET_LEAD_MAX_AGE_MS) continue;
    table.push({
      kind: 'waiting',
      label: 'Waiting on a reply',
      name: displayName(conv),
      detail: (conv.lastMessageBody || '').replace(/\s+/g, ' ').slice(0, 80),
      ageMs: age,
      link: conversationLink(account, conv.id),
      priority: age > 24 * 3600000 ? 1 : 2,
    });
  }

  const stageName = new Map();
  for (const p of pipelines) for (const s of p.stages || []) stageName.set(s.id, s.name);
  for (const opp of opportunities) {
    const stage = stageName.get(opp.pipelineStageId) || '';
    if (!/estimate|quote|proposal|bid/i.test(stage)) continue;
    const since = new Date(opp.lastStageChangeAt || opp.updatedAt || opp.createdAt).getTime();
    const age = nowMs - since;
    if (age < STALE_ESTIMATE_DAYS * 86400000) continue;
    table.push({
      kind: 'estimate',
      label: 'Estimate not booked',
      name: opp.name || displayName(opp.contact || {}),
      detail: `${stage}${opp.monetaryValue ? ` · $${Math.round(opp.monetaryValue).toLocaleString('en-US')}` : ''}`,
      amount: opp.monetaryValue || 0,
      ageMs: age,
      link: opp.contactId ? contactLink(account, opp.contactId) : null,
      priority: 2,
    });
  }

  let unpaidTotal = 0;
  for (const inv of invoices) {
    const due = Number(inv.amountDue != null ? inv.amountDue : inv.total) || 0;
    if (due <= 0) continue;
    unpaidTotal += due;
    const dueDate = inv.dueDate ? new Date(inv.dueDate).getTime() : null;
    const overdue = dueDate && dueDate < nowMs;
    table.push({
      kind: 'invoice',
      label: overdue ? 'Invoice overdue' : 'Invoice unpaid',
      name: (inv.contactDetails && inv.contactDetails.name) || inv.name || 'Invoice',
      detail: `#${inv.invoiceNumber || ''} · $${Math.round(due).toLocaleString('en-US')}${overdue ? ` · due ${formatShortDay(new Date(dueDate), tz)}` : ''}`,
      amount: due,
      ageMs: dueDate ? Math.max(0, nowMs - dueDate) : 0,
      link: inv.contactDetails && inv.contactDetails.id ? contactLink(account, inv.contactDetails.id) : null,
      priority: overdue ? 2 : 3,
    });
  }

  table.sort((a, b) => a.priority - b.priority || b.ageMs - a.ageMs);
  const tableTotal = table.length;
  const moneyOnTheTable = table.slice(0, MAX_TABLE_ITEMS).map((t) => ({ ...t, age: relativeAge(t.ageMs) }));

  // ---- Response score (0-100) -----------------------------------------------
  // 60% missed-call recovery, 40% reply speed. Days with no activity score 100.
  const missedShare = missedCalls.length ? recoveredIds.size / missedCalls.length : 1;
  const replyScore = medianReply == null ? 1 : Math.max(0, 1 - Math.min(medianReply, 120) / 120);
  const score = Math.round((0.6 * missedShare + 0.4 * replyScore) * 100);

  // ---- One thing to do today ------------------------------------------------
  let doThis;
  if (unrecovered.length) {
    doThis = `Text back the ${unrecovered.length === 1 ? 'missed call' : `${unrecovered.length} missed calls`} nobody answered. Every hour lowers the odds they still need you.`;
  } else if (moneyOnTheTable.find((t) => t.kind === 'waiting')) {
    const w = table.filter((t) => t.kind === 'waiting').length;
    doThis = `${w === 1 ? 'One customer is' : `${w} customers are`} waiting on a reply. Clear them before the first job.`;
  } else if (moneyOnTheTable.find((t) => t.kind === 'estimate')) {
    doThis = 'Follow up the open estimates. A two-line text ("Still want to get this on the calendar?") books more than a call.';
  } else if (unpaidTotal > 0) {
    doThis = `Send the payment reminders. $${Math.round(unpaidTotal).toLocaleString('en-US')} is finished work you have not been paid for.`;
  } else if (todays.length === 0) {
    doThis = 'Calendar is open today. Send a review request to your last three completed jobs.';
  } else {
    doThis = 'Board is clean. Ask today\'s first customer for a review while you are still in the driveway.';
  }

  return {
    version: 1,
    generatedAt: now.toISOString(),
    account: { name: account.name, locationId: account.locationId, timeZone: tz },
    dateLabel: formatDay(win.yesterday.start, tz),
    todayLabel: formatDay(win.today.start, tz),
    lap: {
      callsIn: inboundCalls.length,
      missed: missedCalls.length,
      recovered: recoveredIds.size,
      newLeads: newContacts.length,
      leadsBySource,
      booked: bookedYesterday.length,
      textsIn: yInboundSms.length,
      textsOut: yOutboundSms.length,
      medianReplyMinutes: medianReply == null ? null : Math.round(medianReply),
    },
    baseline,
    week,
    isMonday,
    score,
    today: { count: todays.length, appointments: todays },
    moneyOnTheTable,
    moneyOnTheTableTotal: tableTotal,
    unpaidTotal: Math.round(unpaidTotal),
    doThis,
  };
}

module.exports = { composeBoard, isMissed, bucketSource, relativeAge, contactLink, conversationLink };
