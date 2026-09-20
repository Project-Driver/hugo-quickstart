#!/usr/bin/env node
'use strict';

/**
 * Run a real Instant Teardown from the command line.
 *
 *   node scripts/teardown.js residentialgaragedoorservice.net \
 *     --business "Residential Garage Door Service" \
 *     --city Jupiter --trade garage-doors
 *
 * Options:
 *   --business <name>   business name            (required)
 *   --city <city>       main city served         (required)
 *   --trade <trade>     hvac | plumbing | roofing | electrical | garage-doors |
 *                       pool | pest-control | landscaping | cleaning |
 *                       general-contractor | other      (default: other)
 *   --email <email>     only used to label the run      (default: cli@local)
 *   --out <file>        where to write the HTML report  (default: teardown-<host>.html)
 *   --json <file>       also write the raw scan record
 *   --max-pages <n>     how many pages to crawl (default 25)
 *   --allow-private     permit localhost / private addresses (local testing only)
 *
 * Environment (both optional, both improve the report):
 *   PAGESPEED_API_KEY   Google PageSpeed Insights key. Without it you share
 *                       Google's anonymous quota, which is usually exhausted.
 *   SERPAPI_KEY         SerpApi key for the Google Maps competitor section.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createScanRecord, runScan, TRADES } = require('../netlify/functions/lib/teardown/scan');
const { fullReportHtml } = require('../netlify/functions/lib/teardown/report');
const { CATEGORY_LABEL } = require('../netlify/functions/lib/teardown/score');

const C = { dim: '\x1b[2m', bold: '\x1b[1m', red: '\x1b[31m', orange: '\x1b[38;5;208m', yellow: '\x1b[33m', blue: '\x1b[34m', green: '\x1b[32m', reset: '\x1b[0m' };
const SEV_COLOR = { critical: C.red, high: C.orange, medium: C.yellow, low: C.blue };
const paint = (c, s) => (process.stdout.isTTY ? c + s + C.reset : s);

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = args._[0] || args.url;
  if (!url || args.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('/**')[1].split('*/')[0].replace(/^ \* ?/gm, ''));
    process.exit(url ? 0 : 1);
  }
  const allowPrivate = !!args['allow-private'];
  let record;
  try {
    record = createScanRecord({
      url: allowPrivate ? 'https://example.com/' : url,
      business: args.business || args._[1] || '',
      city: args.city || args._[2] || '',
      trade: args.trade || 'other',
      email: args.email || 'cli@local.test',
    });
    if (allowPrivate) record.biz.url = /^https?:\/\//i.test(url) ? url : `http://${url}`;
  } catch (e) {
    console.error(paint(C.red, `\n  ${e.message}\n`));
    if (/trade/i.test(e.message)) console.error(`  Valid trades: ${TRADES.join(', ')}\n`);
    process.exit(1);
  }

  const started = Date.now();
  console.error(`\n  ${paint(C.bold, 'Instant Teardown')} ${paint(C.dim, '· Project Driver')}`);
  console.error(`  ${record.biz.name} · ${record.biz.city} · ${record.biz.trade}`);
  console.error(`  ${paint(C.dim, record.biz.url)}\n`);
  if (!process.env.PAGESPEED_API_KEY) console.error(paint(C.dim, "  No PAGESPEED_API_KEY: Google's speed audit will likely be skipped.\n"));

  const maxPages = args['max-pages'] ? Math.max(1, parseInt(args['max-pages'], 10)) : undefined;
  await runScan(record, { env: process.env, allowPrivate, maxPages, log: (m) => console.error(paint(C.dim, `  ${m}`)) });

  if (record.status === 'blocked') {
    console.error(`  ${paint(C.red, 'Blocked.')} ${record.blocked.reason}\n`);
    process.exit(2);
  }
  if (record.status !== 'done') {
    console.error(`  ${paint(C.red, 'Failed.')} ${record.error}\n`);
    process.exit(2);
  }

  const r = record.result;
  const s = r.score;
  const gradeColor = s.overall >= 80 ? C.green : s.overall >= 65 ? C.yellow : s.overall >= 50 ? C.orange : C.red;
  const pageNote = r.knownPageCount > r.pagesCrawled ? `${r.pagesCrawled} of ${r.knownPageCount} pages` : `${r.pagesCrawled} pages`;
  console.error(`  ${paint(C.bold + gradeColor, `${s.overall}/100`)}  grade ${paint(gradeColor, s.grade)}   ${paint(C.dim, `${pageNote} · ${((Date.now() - started) / 1000).toFixed(1)}s`)}`);
  if (r.knownPageCount > r.pagesCrawled) console.error(paint(C.dim, `  The sitemap lists ${r.knownPageCount} pages. Raise the cap with --max-pages ${r.knownPageCount}.`));
  console.error('  ' + Object.entries(s.categories).map(([, c]) => `${c.label} ${c.score}`).join(paint(C.dim, ' · ')));
  console.error('  ' + Object.entries(s.bySeverity).filter(([, n]) => n).map(([k, n]) => paint(SEV_COLOR[k], `${n} ${k}`)).join(paint(C.dim, ' · ')) + '\n');

  const width = process.stdout.columns || 100;
  for (const [i, f] of r.findings.entries()) {
    console.error(`  ${paint(C.dim, String(i + 1).padStart(2, '0'))} ${paint(SEV_COLOR[f.severity], f.severity.toUpperCase().padEnd(8))} ${paint(C.dim, (CATEGORY_LABEL[f.category] || f.category).padEnd(18))} ${f.title.slice(0, Math.max(30, width - 40))}`);
  }
  if (!r.psi.ok) console.error(`\n  ${paint(C.dim, `Google speed audit skipped: ${r.psi.error}`)}`);
  if (!r.local.ok) console.error(`  ${paint(C.dim, `Competitor lookup skipped: ${r.local.error}`)}`);
  if (r.crawlErrors.length) console.error(`  ${paint(C.dim, `Pages that would not load: ${r.crawlErrors.join('; ')}`)}`);

  const host = new URL(r.finalUrl).hostname.replace(/^www\./, '');
  const outFile = path.resolve(args.out === true || !args.out ? `teardown-${host}.html` : args.out);
  record.paid = true; // local run: render the full report
  fs.writeFileSync(outFile, fullReportHtml(record, { siteUrl: '' }));
  if (args.json) fs.writeFileSync(path.resolve(args.json), JSON.stringify(record, null, 2));
  console.error(`\n  ${paint(C.bold, 'Report:')} ${outFile}`);
  console.error(`  ${paint(C.dim, 'Open it in a browser; use Save as PDF to keep a copy.')}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
