'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAccounts, loadAccounts } = require('../netlify/functions/lib/accounts');

const one = { id: 'a', name: 'A', locationId: 'L', token: 'T', ownerContactId: 'C' };

test('parses JSON and base64 JSON, applies defaults, drops inactive', () => {
  const list = parseAccounts(JSON.stringify([one, { ...one, id: 'b', active: false, timeZone: 'America/Chicago', sendSms: false }]));
  assert.equal(list.length, 2);
  assert.equal(list[0].timeZone, 'America/New_York');
  assert.equal(list[0].sendSms, true);
  assert.equal(list[0].appBaseUrl, 'https://app.gohighlevel.com');
  assert.equal(list[1].sendSms, false);
  const b64 = Buffer.from(JSON.stringify([one])).toString('base64');
  assert.equal(parseAccounts(b64)[0].id, 'a');
  assert.equal(loadAccounts({ PITBOARD_ACCOUNTS: JSON.stringify([one, { ...one, id: 'b', active: false }]) }).length, 1);
  assert.equal(loadAccounts({}).length, 0);
});

test('rejects accounts missing required fields', () => {
  assert.throws(() => parseAccounts(JSON.stringify([{ id: 'x' }])), /missing: name, locationId, token, ownerContactId/);
  assert.throws(() => parseAccounts('{"id":"x"}'), /JSON array/);
});
