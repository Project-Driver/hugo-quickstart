'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./fixtures');

function mockFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ method: init.method || 'GET', path: u.pathname, query: Object.fromEntries(u.searchParams), body: init.body ? JSON.parse(init.body) : null, headers: init.headers });
    const handler = routes.find((r) => r.path === u.pathname && (!r.method || r.method === (init.method || 'GET')));
    if (!handler) return { ok: false, status: 404, text: async () => JSON.stringify({ error: `no route ${u.pathname}` }) };
    const body = typeof handler.body === 'function' ? handler.body(u, init) : handler.body;
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  return { fetchImpl, calls };
}

const ghlRoutes = [
  { path: '/conversations/messages/export', body: (u) => ({ messages: u.searchParams.get('channel') === 'Call' ? fx.calls : fx.sms, nextCursor: null }) },
  { path: '/contacts/search', method: 'POST', body: { contacts: fx.newContacts } },
  { path: '/calendars/', body: { calendars: [{ id: 'cal1', isActive: true }, { id: 'cal2', isActive: false }] } },
  { path: '/calendars/events', body: { events: fx.appointments } },
  { path: '/conversations/search', body: { conversations: fx.waiting } },
  { path: '/opportunities/search', body: { opportunities: fx.opportunities } },
  { path: '/opportunities/pipelines', body: { pipelines: fx.pipelines } },
  { path: '/invoices/', body: { invoices: fx.invoices } },
  { path: '/conversations/messages', method: 'POST', body: { messageId: 'sms-1', emailMessageId: 'em-1' } },
];

const account = { ...fx.account, token: 'tok', ownerContactId: 'owner1', sendSms: true, sendEmail: true, calendarIds: [], plan: 'board', active: true, viewKey: 'vk1', recipientContactIds: ['owner1', 'mgr1'] };

test('runner fetches every source with the right window and delivers SMS + email', async () => {
  const { deliverBoard } = require('../netlify/functions/lib/runner');
  const { fetchImpl, calls } = mockFetch(ghlRoutes);
  const { board, result } = await deliverBoard(account, { now: fx.NOW, fetchImpl, siteUrl: 'https://pitboard.test/' });

  assert.equal(board.lap.callsIn, 5);
  assert.deepEqual(board.warnings, []);
  assert.deepEqual(result.sms, ['sms-1', 'sms-1']);
  assert.deepEqual(result.email, ['em-1', 'em-1']);

  const exportCall = calls.find((c) => c.path === '/conversations/messages/export' && c.query.channel === 'Call');
  assert.equal(exportCall.query.startDate, '2026-09-07T04:00:00.000Z');
  assert.equal(exportCall.query.endDate, '2026-09-15T04:00:00.000Z');
  assert.equal(exportCall.headers.Authorization, 'Bearer tok');

  const search = calls.find((c) => c.path === '/contacts/search');
  assert.deepEqual(search.body.filters[0], { field: 'dateAdded', operator: 'range', value: { gte: '2026-09-14T04:00:00.000Z', lt: '2026-09-15T04:00:00.000Z' } });

  const events = calls.filter((c) => c.path === '/calendars/events');
  assert.equal(events.length, 1, 'only active calendars are queried');
  assert.equal(events[0].query.calendarId, 'cal1');

  const sends = calls.filter((c) => c.path === '/conversations/messages');
  assert.equal(sends.length, 4, 'SMS + email to the owner and to the office manager');
  assert.equal(sends[0].body.type, 'SMS');
  assert.equal(sends[0].body.contactId, 'owner1');
  assert.equal(sends[2].body.contactId, 'mgr1');
  assert.match(sends[0].body.message, /https:\/\/pitboard\.test\/api\/board\?a=demo-plumbing&k=vk1/);
  assert.equal(sends[1].body.type, 'Email');
  assert.match(sends[1].body.subject, /Pit Board · Monday: 5 calls, 2 missed, 2 today/);
});

test('runner degrades gracefully when one source fails, and dry runs send nothing', async () => {
  const { deliverBoard } = require('../netlify/functions/lib/runner');
  const { fetchImpl, calls } = mockFetch(ghlRoutes.filter((r) => r.path !== '/invoices/'));
  const { board, result } = await deliverBoard(account, { now: fx.NOW, fetchImpl, dryRun: true });
  assert.equal(board.warnings.length, 1);
  assert.match(board.warnings[0], /^invoices: /);
  assert.equal(board.unpaidTotal, 0);
  assert.equal(calls.filter((c) => c.path === '/conversations/messages').length, 0);
  assert.match(result.smsPreview, /^PIT BOARD/);
});

test('runAll isolates failures per account', async () => {
  const { runAll } = require('../netlify/functions/lib/runner');
  const { fetchImpl } = mockFetch(ghlRoutes);
  const env = { PITBOARD_ACCOUNTS: JSON.stringify([account, { ...account, id: 'broken', token: '' }]) };
  await assert.rejects(() => runAll({ env, fetchImpl, now: fx.NOW, dryRun: true }), /missing: token/);
  const env2 = { PITBOARD_ACCOUNTS: JSON.stringify([account, { ...account, id: 'two' }]) };
  const summary = await runAll({ env: env2, fetchImpl, now: fx.NOW, dryRun: true, accountId: 'two' });
  assert.equal(summary.ran, 1);
  assert.equal(summary.results[0].account, 'two');
});

test('signup function validates, honeypots, upserts with tags, and always returns a next step', async () => {
  process.env.PD_GHL_TOKEN = 'pd-token';
  process.env.PD_GHL_LOCATION_ID = 'PDLOC';
  process.env.PITBOARD_CHECKOUT_CREW = 'https://pay.test/crew';
  const { fetchImpl, calls } = mockFetch([{ path: '/contacts/upsert', method: 'POST', body: { contact: { id: 'new-1' } } }]);
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    const { handler } = require('../netlify/functions/pitboard-signup');
    const post = (body) => handler({ httpMethod: 'POST', body: JSON.stringify(body) });

    assert.equal((await handler({ httpMethod: 'GET' })).statusCode, 405);
    assert.equal((await post({ name: 'X' })).statusCode, 400);
    assert.equal((await post({ name: 'X', business: 'Y', email: 'nope' })).statusCode, 400);
    assert.equal(JSON.parse((await post({ name: 'Bot', business: 'B', email: 'b@b.co', website: 'spam' })).body).ok, true);
    assert.equal(calls.length, 0, 'honeypot never hits the API');

    const res = await post({ name: 'Omar Ramos', business: 'Coastal Air', email: 'O@Example.com', phone: '754-555-0100', trade: 'HVAC', plan: 'crew', ghl: 'yes' });
    const out = JSON.parse(res.body);
    assert.deepEqual(out, { ok: true, next: 'https://pay.test/crew', stored: true, contactId: 'new-1' });
    const up = calls.find((c) => c.path === '/contacts/upsert');
    assert.equal(up.body.locationId, 'PDLOC');
    assert.equal(up.body.email, 'o@example.com');
    assert.deepEqual(up.body.tags, ['pitboard-signup', 'pitboard-plan-crew', 'pitboard-has-ghl', 'trade-hvac']);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('board function serves the sample in every format and guards live boards', async () => {
  const { handler } = require('../netlify/functions/pitboard-board');
  const html = await handler({ queryStringParameters: {} });
  assert.equal(html.statusCode, 200);
  assert.match(html.headers['Content-Type'], /text\/html/);
  assert.match(html.body, /Coastal Air &amp; Heat/);
  const sms = await handler({ queryStringParameters: { format: 'sms' } });
  assert.match(sms.body, /^PIT BOARD/);
  const json = await handler({ queryStringParameters: { format: 'json' } });
  assert.equal(JSON.parse(json.body).score, 84);
  delete process.env.PITBOARD_PREVIEW_KEY;
  process.env.PITBOARD_ACCOUNTS = JSON.stringify([account]);
  assert.equal((await handler({ queryStringParameters: { a: 'x' } })).statusCode, 401);
  assert.equal((await handler({ queryStringParameters: { a: 'demo-plumbing', k: 'wrong' } })).statusCode, 401);
  const realFetch = globalThis.fetch;
  globalThis.fetch = mockFetch(ghlRoutes).fetchImpl;
  try {
    const live = await handler({ queryStringParameters: { a: 'demo-plumbing', k: 'vk1', format: 'json' } });
    assert.equal(live.statusCode, 200);
    assert.equal(JSON.parse(live.body).account.name, 'Demo Plumbing');
  } finally { globalThis.fetch = realFetch; }
});

test('run function requires the admin key', async () => {
  process.env.PITBOARD_ADMIN_KEY = 'secret';
  const { handler } = require('../netlify/functions/pitboard-run');
  assert.equal((await handler({ httpMethod: 'GET' })).statusCode, 405);
  assert.equal((await handler({ httpMethod: 'POST', headers: {} })).statusCode, 401);
  process.env.PITBOARD_ACCOUNTS = '[]';
  const ok = await handler({ httpMethod: 'POST', headers: { 'x-pitboard-key': 'secret' }, body: '{"dryRun":true}' });
  assert.equal(ok.statusCode, 200);
  assert.equal(JSON.parse(ok.body).ran, 0);
});
