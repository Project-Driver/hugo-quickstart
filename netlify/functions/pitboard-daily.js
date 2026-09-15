'use strict';

/**
 * Scheduled function. Runs every day at 11:00 UTC (7:00 AM US Eastern in
 * summer, 6:00 AM in winter; change the cron for other markets) and sends
 * every active account its Pit Board.
 *
 * Netlify does not expose scheduled functions over HTTP. To run on demand
 * use POST /api/run (see pitboard-run.js).
 */

const { runAll } = require('./lib/runner');

exports.config = { schedule: '0 11 * * *' };

exports.handler = async () => {
  const summary = await runAll();
  return { statusCode: 200, body: JSON.stringify(summary) };
};
