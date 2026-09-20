#!/usr/bin/env node
'use strict';
/** Print the scanner's rule inventory, read from the checks source itself. */
const fs = require('node:fs');
const path = require('node:path');
const SRC = path.join(__dirname, '..', 'netlify', 'functions', 'lib', 'teardown', 'checks.js');
const KEYS = ['id', 'category', 'severity', 'title', 'cost', 'fix', 'effort', 'evidence', 'pages', 'product', 'amount'];
const CATS = { speed: 'Speed & mobile', search: 'Search', local: 'Local & AI search', conversion: 'Getting the call', access: 'Accessibility' };

function stripInterpolations(s) {
  let out = '', i = 0;
  while (i < s.length) {
    if (s[i] === '$' && s[i + 1] === '{') {
      let depth = 0, j = i + 1;
      for (; j < s.length; j++) { if (s[j] === '{') depth++; else if (s[j] === '}') { depth--; if (depth === 0) break; } }
      out += '…'; i = j + 1;
    } else { out += s[i]; i++; }
  }
  return out;
}

function extract(src = fs.readFileSync(SRC, 'utf8')) {
  const rules = [];
  let idx = src.indexOf('add({');
  while (idx !== -1) {
    const start = src.indexOf('{', idx + 3);
    let depth = 0, j = start;
    for (; j < src.length; j++) { const c = src[j]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) break; } }
    const body = src.slice(start + 1, j);
    const found = {};
    for (const key of KEYS) {
      const m = body.match(new RegExp('(?:^\\s*|[,{]\\s*)' + key + ':\\s*'));
      if (!m) continue;
      const from = m.index + m[0].length;
      let end = body.length;
      for (const other of KEYS) {
        if (other === key) continue;
        const m2 = body.slice(from).match(new RegExp(',\\s*' + other + ':\\s*'));
        if (m2 && from + m2.index < end) end = from + m2.index;
      }
      found[key] = body.slice(from, end).trim().replace(/,$/, '');
    }
    const clean = (v) => {
      if (!v) return null;
      let s = stripInterpolations(v.trim());
      if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('`') && s.endsWith('`'))) s = s.slice(1, -1);
      return s.replace(/`/g, '').replace(/\\'/g, "'").replace(/…[\s…]*…/g, '…').replace(/\s+/g, ' ').trim();
    };
    if (found.id) rules.push({ id: clean(found.id), category: clean(found.category), severity: clean(found.severity), title: clean(found.title), cost: clean(found.cost), fix: clean(found.fix), effort: clean(found.effort) || 'quick', product: clean(found.product) });
    idx = src.indexOf('add({', j);
  }
  return rules;
}

if (require.main === module) {
  const rules = extract();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(rules, null, 1)); process.exit(0); }
  for (const [key, label] of Object.entries(CATS)) {
    const list = rules.filter((r) => r.category === key);
    console.log(`\n${label} (${list.length})`);
    for (const r of list) console.log(`  ${String(r.severity).replace(/\s*\?.*/, '*').padEnd(10)} ${r.id.padEnd(26)} ${r.title}`);
  }
  console.log(`\n${rules.length} checks in total. * = severity depends on how bad the finding is.\n`);
}

module.exports = { extract };
