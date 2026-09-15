'use strict';

/**
 * POST /api/run
 * Header: x-pitboard-key: $PITBOARD_ADMIN_KEY
 * Body (optional): { "accountId": "acme-plumbing", "dryRun": true }
 *
 * Manual trigger for the daily send. dryRun builds the boards and returns the
 * SMS text without sending anything.
 */

const { runAll } = require('./lib/runner');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'POST only' };
  const headers = event.headers || {};
  const key = headers['x-pitboard-key'] || headers['X-Pitboard-Key'];
  if (!process.env.PITBOARD_ADMIN_KEY || key !== process.env.PITBOARD_ADMIN_KEY) {
    return { statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) };
  }
  let opts = {};
  try { opts = event.body ? JSON.parse(event.body) : {}; } catch { return { statusCode: 400, body: 'Invalid JSON' }; }
  const summary = await runAll({ accountId: opts.accountId, dryRun: !!opts.dryRun });
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(summary, null, 2) };
};
