'use strict';

/**
 * Time-zone helpers with no dependencies. Each account has an IANA time zone;
 * "yesterday" and "today" are always the owner's local calendar days.
 */

function partsInZone(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  for (const { type, value } of fmt.formatToParts(date)) p[type] = value;
  return {
    year: +p.year, month: +p.month, day: +p.day,
    hour: +p.hour, minute: +p.minute, second: +p.second,
  };
}

/** Offset (ms) of a zone at a given instant. */
function zoneOffsetMs(date, timeZone) {
  const p = partsInZone(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Instant for local midnight of the given local calendar day. */
function localMidnight({ year, month, day }, timeZone) {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offset = zoneOffsetMs(guess, timeZone);
  const instant = new Date(guess.getTime() - offset);
  // Re-check around DST transitions.
  const offset2 = zoneOffsetMs(instant, timeZone);
  return offset2 === offset ? instant : new Date(guess.getTime() - offset2);
}

function addDays({ year, month, day }, n) {
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * Reporting window for a run at `now`: yesterday (local) and today (local).
 * Also returns a 7-day baseline window ending at yesterday's end.
 */
function reportingWindow(now, timeZone) {
  const today = partsInZone(now, timeZone);
  const todayKey = { year: today.year, month: today.month, day: today.day };
  const yesterdayKey = addDays(todayKey, -1);
  const tomorrowKey = addDays(todayKey, 1);
  const weekAgoKey = addDays(todayKey, -8);

  const todayStart = localMidnight(todayKey, timeZone);
  const yesterdayStart = localMidnight(yesterdayKey, timeZone);
  const tomorrowStart = localMidnight(tomorrowKey, timeZone);
  const baselineStart = localMidnight(weekAgoKey, timeZone);

  return {
    timeZone,
    yesterday: { start: yesterdayStart, end: todayStart, key: yesterdayKey },
    today: { start: todayStart, end: tomorrowStart, key: todayKey },
    baseline: { start: baselineStart, end: yesterdayStart, days: 7 },
  };
}

function formatDay(date, timeZone) {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric' }).format(date);
}

function formatShortDay(date, timeZone) {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

function formatTime(date, timeZone) {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(date)
    .replace(' AM', 'a').replace(' PM', 'p');
}

module.exports = { partsInZone, zoneOffsetMs, localMidnight, addDays, reportingWindow, formatDay, formatShortDay, formatTime };
