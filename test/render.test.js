'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toSms, toText, toHtml } = require('../netlify/functions/lib/render');
const sample = require('../data/sample_board.json');

test('SMS fits in three segments and carries the essentials', () => {
  const s = toSms(sample, { boardUrl: 'https://pitboard.project-driver.com/board/?a=demo' });
  assert.ok(s.length <= 459, `SMS is ${s.length} chars`);
  assert.match(s, /^PIT BOARD · Coastal Air & Heat · Monday/);
  assert.match(s, /Calls 14 \(\+3 vs avg\)/);
  assert.match(s, /Missed 4 \(3 texted back\)/);
  assert.match(s, /Today: 4 jobs, first at 8:00a/);
  assert.match(s, /On the table: 5/);
  assert.match(s, /Do this: Text back/);
  assert.match(s, /https:\/\/pitboard/);
});

test('Monday SMS and email carry the weekly recap', () => {
  const mon = { ...sample, isMonday: true };
  assert.match(toSms(mon), /Last 7 days: 79 calls, 22 missed, 18 texted back/);
  assert.match(toHtml(mon), /Monday recap · last 7 days/);
  assert.doesNotMatch(toHtml(sample), /Monday recap/);
});

test('SMS handles a quiet day without a reply time', () => {
  const quiet = { ...sample, lap: { ...sample.lap, medianReplyMinutes: null }, moneyOnTheTableTotal: 0, moneyOnTheTable: [], today: { count: 1, appointments: [] } };
  const s = toSms(quiet);
  assert.match(s, /Score 84\/100/);
  assert.doesNotMatch(s, /On the table/);
  assert.match(s, /Today: 1 job$/m);
});

test('plain text lists every table item with its link', () => {
  const t = toText(sample);
  assert.match(t, /Calls in:\s+14 \(\+3 vs avg\)/);
  assert.match(t, /\[Invoice overdue\] Sunrise Property Group/);
  assert.match(t, /8:00a  Dana Whitfield - AC not cooling - 1420 NE 26th St/);
});

test('HTML email escapes content and includes the sections', () => {
  const hostile = { ...sample, account: { ...sample.account, name: '<script>alert(1)</script>' } };
  const h = toHtml(hostile, { boardUrl: 'https://x.test/b', brand: 'Project Driver' });
  assert.doesNotMatch(h, /<script>alert/);
  assert.match(h, /&lt;script&gt;/);
  assert.match(h, /Money on the table · 5 · \$2,340 unpaid/);
  assert.match(h, /Do this today/);
  assert.match(h, /Response score/);
  assert.match(h, /Today · Tuesday, September 15 · 4 on the calendar/);
  assert.match(h, /href="https:\/\/x.test\/b"/);
  assert.equal((h.match(/>Open<\/a>/g) || []).length, 5);
});
