'use strict';

/**
 * GET /api/board                      -> the sample board (HTML)
 * GET /api/board?format=sms|text|json -> other renderings of the sample
 * GET /api/board?a=<accountId>&k=<account viewKey>        -> that owner's live board
 * GET /api/board?a=<accountId>&key=<PITBOARD_PREVIEW_KEY> -> any live board (admin)
 */

const { loadAccounts } = require('./lib/accounts');
const { buildBoard } = require('./lib/runner');
const { toSms, toText, toHtml } = require('./lib/render');
const sample = require('../../data/sample_board.json');

function respond(board, format) {
  if (format === 'json') return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(board, null, 2) };
  if (format === 'sms') return { statusCode: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: toSms(board) };
  if (format === 'text') return { statusCode: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: toText(board) };
  return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, body: toHtml(board) };
}

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const format = (q.format || 'html').toLowerCase();

  if (!q.a) return respond(sample, format);

  const account = loadAccounts().find((a) => a.id === q.a);
  const adminKey = q.key || (event.headers && event.headers['x-pitboard-key']);
  const isAdmin = !!process.env.PITBOARD_PREVIEW_KEY && adminKey === process.env.PITBOARD_PREVIEW_KEY;
  const isOwner = !!account && !!account.viewKey && q.k === account.viewKey;
  if (!isAdmin && !isOwner) return { statusCode: 401, body: 'This board is private.' };
  if (!account) return { statusCode: 404, body: 'Unknown account.' };
  try {
    const { board } = await buildBoard(account);
    return respond(board, format);
  } catch (e) {
    console.error('board preview failed', e);
    return { statusCode: 502, body: `Could not build the board: ${e.message}` };
  }
};
