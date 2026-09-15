'use strict';

/** GET /api/teardown-status?id=  -> the free summary (polled while running). */

const { getScanStore } = require('./lib/teardown/store');
const { freeSummary } = require('./lib/teardown/report');

exports.handler = async (event) => {
  const id = event.queryStringParameters && event.queryStringParameters.id;
  if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'id required' }) };
  const record = await getScanStore().get(id);
  if (!record) return { statusCode: 404, body: JSON.stringify({ error: 'unknown scan' }) };
  // Scans that never got picked up should not spin forever.
  if (record.status === 'queued' && Date.now() - new Date(record.createdAt).getTime() > 3 * 60000) {
    record.status = 'failed'; record.error = 'The scan did not start. Please try again.';
  }
  if (record.status === 'running' && Date.now() - new Date(record.startedAt || record.createdAt).getTime() > 12 * 60000) {
    record.status = 'failed'; record.error = 'The scan took too long. The site may be blocking crawlers.';
  }
  return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(freeSummary(record)) };
};
