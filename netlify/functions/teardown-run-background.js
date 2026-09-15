'use strict';

/**
 * Netlify background function (the -background suffix gives it 15 minutes).
 * POST {id} with header x-teardown-runner. Runs the scan and stores it.
 */

const { runScan } = require('./lib/teardown/scan');
const { getScanStore } = require('./lib/teardown/store');

exports.handler = async (event) => {
  const secret = process.env.TEARDOWN_RUNNER_SECRET || '';
  const given = (event.headers && (event.headers['x-teardown-runner'] || event.headers['X-Teardown-Runner'])) || '';
  if (secret && given !== secret) return { statusCode: 401, body: 'unauthorized' };
  let id;
  try { id = JSON.parse(event.body || '{}').id; } catch { return { statusCode: 400, body: 'bad json' }; }
  const store = getScanStore();
  const record = await store.get(id);
  if (!record) return { statusCode: 404, body: 'unknown scan' };
  if (record.status === 'running' || record.status === 'done') return { statusCode: 200, body: record.status };
  record.status = 'running';
  await store.set(id, record);
  await runScan(record, { log: (m) => console.log(`[teardown ${id}] ${m}`) });
  await store.set(id, record);
  console.log(`[teardown ${id}] ${record.status} in ${record.durationMs || 0} ms, score ${record.result ? record.result.score.overall : 'n/a'}`);
  return { statusCode: 200, body: record.status };
};
