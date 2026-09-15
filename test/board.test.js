'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { composeBoard, isMissed, bucketSource, relativeAge } = require('../netlify/functions/lib/board');
const { reportingWindow } = require('../netlify/functions/lib/time');
const fx = require('./fixtures');

function build(overrides = {}) {
  const win = reportingWindow(fx.NOW, fx.account.timeZone);
  return composeBoard({ account: fx.account, window: win, now: fx.NOW, ...fx, ...overrides });
}

test('yesterday lap counts inbound calls, missed and recovered in the owner time zone', () => {
  const b = build();
  assert.equal(b.lap.callsIn, 5, 'five inbound calls yesterday, the 10 PM ET call included, today excluded');
  assert.equal(b.lap.missed, 2);
  assert.equal(b.lap.recovered, 1, 'only the text within 10 minutes counts');
  assert.equal(b.dateLabel, 'Monday, September 14');
  assert.equal(b.todayLabel, 'Tuesday, September 15');
});

test('texts, reply time and leads by source', () => {
  const b = build();
  assert.equal(b.lap.textsIn, 2);
  assert.equal(b.lap.textsOut, 4);
  assert.equal(b.lap.medianReplyMinutes, 30, 'median of 6 and 30 rounds to the upper middle');
  assert.equal(b.lap.newLeads, 3);
  assert.deepEqual(b.lap.leadsBySource, { Google: 2, Website: 1 });
});

test('booked yesterday counts appointments created yesterday, not held yesterday', () => {
  const b = build();
  assert.equal(b.lap.booked, 3);
});

test('7-day baseline averages inbound calls per day', () => {
  const b = build();
  assert.equal(b.baseline.callsPerDay, 1);
  assert.equal(b.baseline.missedPerDay, 0.3);
});

test('weekly recap covers yesterday plus six days and flags Mondays', () => {
  const b = build();
  assert.deepEqual(b.week, { callsIn: 12, missed: 4, recovered: 1, textsIn: 2 }, 'seven baseline calls plus five yesterday');
  assert.equal(b.isMonday, false, '2026-09-15 is a Tuesday');
  const monday = new Date('2026-09-14T11:00:00.000Z');
  const win = reportingWindow(monday, fx.account.timeZone);
  assert.equal(composeBoard({ account: fx.account, window: win, now: monday, ...fx }).isMonday, true);
});

test('today lineup is sorted, excludes cancelled, and formats local time', () => {
  const b = build();
  assert.equal(b.today.count, 2);
  assert.deepEqual(b.today.appointments.map((a) => a.time), ['9:00a', '4:00p']);
  assert.equal(b.today.appointments[0].address, '1 Main St');
  assert.match(b.today.appointments[0].link, /contacts\/detail\/c8$/);
});

test('money on the table ranks unrecovered missed calls first, then waiting replies, stale estimates and unpaid invoices', () => {
  const b = build();
  const kinds = b.moneyOnTheTable.map((t) => t.kind);
  assert.deepEqual(kinds, ['missed-call', 'waiting', 'estimate', 'invoice', 'invoice']);
  assert.equal(b.moneyOnTheTableTotal, 5);
  assert.equal(b.moneyOnTheTable[0].name, '+19545550100');
  assert.match(b.moneyOnTheTable[0].link, /conversations\/conv-c4$/);
  assert.equal(b.moneyOnTheTable[1].name, 'Waiting Wanda');
  assert.equal(b.moneyOnTheTable[2].name, 'Big Repipe');
  assert.equal(b.moneyOnTheTable[2].detail, 'Estimate Sent · $8,200');
  assert.equal(b.moneyOnTheTable[3].label, 'Invoice overdue');
  assert.equal(b.moneyOnTheTable[4].label, 'Invoice unpaid');
  assert.equal(b.unpaidTotal, 570);
});

test('score blends missed-call recovery and reply speed', () => {
  const b = build();
  // recovery 1/2 -> 0.5 * 60 = 30; reply 30 min -> (1 - 30/120) = .75 * 40 = 30 -> 60
  assert.equal(b.score, 60);
  const clean = build({ calls: [], sms: [], waiting: [], opportunities: [], invoices: [] });
  assert.equal(clean.score, 100);
});

test('do-this nudge follows priority order', () => {
  assert.match(build().doThis, /Text back the missed call/);
  assert.match(build({ calls: fx.calls.filter((c) => c.id !== 'y4') }).doThis, /waiting on a reply/);
  assert.match(build({ calls: [], waiting: [] }).doThis, /open estimates/);
  assert.match(build({ calls: [], waiting: [], opportunities: [] }).doThis, /\$570/);
  assert.match(build({ calls: [], waiting: [], opportunities: [], invoices: [], appointments: [] }).doThis, /Calendar is open/);
  assert.match(build({ calls: [], waiting: [], opportunities: [], invoices: [] }).doThis, /Board is clean/);
});

test('table is capped at six items but the total is preserved', () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ id: `conv-x${i}`, contactName: `P${i}`, lastMessageDate: '2026-09-13T08:00:00Z' }));
  const b = build({ waiting: many });
  assert.equal(b.moneyOnTheTable.length, 6);
  assert.equal(b.moneyOnTheTableTotal, 9 + 1 + 1 + 2);
});

test('helpers', () => {
  assert.equal(isMissed({ direction: 'inbound', meta: { call: { status: 'busy' } } }), true);
  assert.equal(isMissed({ direction: 'outbound', meta: { call: { status: 'no-answer' } } }), false);
  assert.equal(isMissed({ direction: 'inbound', status: 'completed' }), false);
  assert.equal(bucketSource({ source: 'Instagram DM' }), 'Social');
  assert.equal(bucketSource({ source: 'Maya AI Voice' }), 'Phone');
  assert.equal(bucketSource({}), 'Other');
  assert.equal(relativeAge(5 * 60000), '5m');
  assert.equal(relativeAge(3 * 3600000), '3h');
  assert.equal(relativeAge(50 * 3600000), '2d');
});
