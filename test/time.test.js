'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { reportingWindow, formatTime, localMidnight } = require('../netlify/functions/lib/time');

test('reporting window uses local calendar days (EDT)', () => {
  const w = reportingWindow(new Date('2026-09-15T11:00:00Z'), 'America/New_York');
  assert.equal(w.yesterday.start.toISOString(), '2026-09-14T04:00:00.000Z');
  assert.equal(w.yesterday.end.toISOString(), '2026-09-15T04:00:00.000Z');
  assert.equal(w.today.end.toISOString(), '2026-09-16T04:00:00.000Z');
  assert.equal(w.baseline.start.toISOString(), '2026-09-07T04:00:00.000Z');
  assert.equal(w.baseline.days, 7);
});

test('reporting window in winter (EST) and across a DST change', () => {
  const w = reportingWindow(new Date('2026-12-02T12:00:00Z'), 'America/New_York');
  assert.equal(w.yesterday.start.toISOString(), '2026-12-01T05:00:00.000Z');
  // US DST ends 2026-11-01. The day before is still EDT, the day after EST.
  assert.equal(localMidnight({ year: 2026, month: 10, day: 31 }, 'America/New_York').toISOString(), '2026-10-31T04:00:00.000Z');
  assert.equal(localMidnight({ year: 2026, month: 11, day: 2 }, 'America/New_York').toISOString(), '2026-11-02T05:00:00.000Z');
});

test('other zones and time formatting', () => {
  const w = reportingWindow(new Date('2026-09-15T13:00:00Z'), 'America/Los_Angeles');
  assert.equal(w.today.start.toISOString(), '2026-09-15T07:00:00.000Z');
  assert.equal(formatTime(new Date('2026-09-15T12:00:00Z'), 'America/New_York'), '8:00a');
  assert.equal(formatTime(new Date('2026-09-15T19:30:00Z'), 'America/New_York'), '3:30p');
});
