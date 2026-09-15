#!/usr/bin/env node
'use strict';

/**
 * Local preview of the Pit Board renderers.
 *
 *   node scripts/preview.js                 # sample board as SMS + text
 *   node scripts/preview.js --html > b.html # sample board as the email
 *   PITBOARD_ACCOUNTS='[...]' node scripts/preview.js --live acme-plumbing
 */

const { toSms, toText, toHtml } = require('../netlify/functions/lib/render');

async function main() {
  const args = process.argv.slice(2);
  let board = require('../data/sample_board.json');
  const liveIdx = args.indexOf('--live');
  if (liveIdx !== -1) {
    const { loadAccounts } = require('../netlify/functions/lib/accounts');
    const { buildBoard } = require('../netlify/functions/lib/runner');
    const account = loadAccounts().find((a) => a.id === args[liveIdx + 1]);
    if (!account) throw new Error('Unknown account id');
    board = (await buildBoard(account)).board;
  }
  if (args.includes('--html')) { process.stdout.write(toHtml(board)); return; }
  if (args.includes('--json')) { process.stdout.write(JSON.stringify(board, null, 2)); return; }
  console.log('--- SMS ---\n' + toSms(board) + '\n\n--- TEXT ---\n' + toText(board));
}

main().catch((e) => { console.error(e); process.exit(1); });
