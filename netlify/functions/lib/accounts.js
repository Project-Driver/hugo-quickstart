'use strict';

/**
 * Account registry.
 *
 * Accounts live in the PITBOARD_ACCOUNTS environment variable as a JSON array
 * (or base64 of one). Each entry:
 *
 * {
 *   "id": "acme-plumbing",             // slug used in URLs and logs
 *   "name": "Acme Plumbing",           // shown on the board
 *   "locationId": "GHL location id",
 *   "token": "GHL private integration token for that location",
 *   "ownerContactId": "contact in that location who receives the board",
 *   "recipientContactIds": ["extra contact ids, e.g. the office manager"],
 *   "timeZone": "America/New_York",
 *   "sendSms": true,
 *   "sendEmail": true,
 *   "appBaseUrl": "https://app.gohighlevel.com",   // or the agency white-label domain
 *   "calendarIds": [],                 // optional: restrict to specific calendars
 *   "plan": "board" | "crew" | "pro",
 *   "viewKey": "long random string",  // optional: enables the private web link in the SMS
 *   "active": true
 * }
 */

function parseAccounts(raw) {
  if (!raw) return [];
  const text = raw.trim();
  let list;
  try {
    list = JSON.parse(text);
  } catch {
    list = JSON.parse(Buffer.from(text, 'base64').toString('utf8'));
  }
  if (!Array.isArray(list)) throw new Error('PITBOARD_ACCOUNTS must be a JSON array');
  return list.map(normalizeAccount);
}

function normalizeAccount(a) {
  const missing = ['id', 'name', 'locationId', 'token', 'ownerContactId'].filter((k) => !a[k]);
  if (missing.length) throw new Error(`Account ${a.id || '(no id)'} is missing: ${missing.join(', ')}`);
  return {
    id: a.id,
    name: a.name,
    locationId: a.locationId,
    token: a.token,
    ownerContactId: a.ownerContactId,
    recipientContactIds: Array.from(new Set([a.ownerContactId, ...(Array.isArray(a.recipientContactIds) ? a.recipientContactIds : [])])),
    timeZone: a.timeZone || 'America/New_York',
    sendSms: a.sendSms !== false,
    sendEmail: a.sendEmail !== false,
    appBaseUrl: a.appBaseUrl || 'https://app.gohighlevel.com',
    calendarIds: Array.isArray(a.calendarIds) ? a.calendarIds : [],
    plan: a.plan || 'board',
    active: a.active !== false,
    emailFrom: a.emailFrom || process.env.PITBOARD_EMAIL_FROM || undefined,
    viewKey: a.viewKey || undefined, // per-owner secret for the private web link
  };
}

function loadAccounts(env = process.env) {
  return parseAccounts(env.PITBOARD_ACCOUNTS).filter((a) => a.active);
}

module.exports = { parseAccounts, normalizeAccount, loadAccounts };
