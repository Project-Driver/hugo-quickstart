'use strict';

const { CATEGORY_LABEL } = require('./score');

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const SEV_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
const SEV_COLOR = { critical: '#ff4d4f', high: '#ff8a3d', medium: '#ffb020', low: '#4da3ff' };
const TRADE_LABEL = { hvac: 'HVAC', plumbing: 'Plumbing', roofing: 'Roofing', electrical: 'Electrical', 'garage-doors': 'Garage doors', pool: 'Pool service', 'pest-control': 'Pest control', landscaping: 'Landscaping', cleaning: 'Cleaning', 'general-contractor': 'General contracting', other: 'Home services' };

/** What the visitor sees before paying. Enough to be useful, not the fixes. */
function freeSummary(record) {
  const r = record.result;
  const base = { id: record.id, status: record.status, business: record.biz.name, url: record.biz.url, city: record.biz.city, trade: record.biz.trade, paid: !!record.paid, plan: record.plan || null };
  if (record.status !== 'done' || !r) {
    return { ...base, error: record.error || (record.blocked && record.blocked.reason) || null, blocked: record.blocked || null, sellable: false };
  }
  const top = r.findings[0];
  return {
    ...base,
    sellable: true,
    finalUrl: r.finalUrl,
    pagesCrawled: r.pagesCrawled,
    score: r.score.overall,
    grade: r.score.grade,
    categories: Object.fromEntries(Object.entries(r.score.categories).map(([k, v]) => [k, { label: v.label, score: v.score, findings: v.findings }])),
    bySeverity: r.score.bySeverity,
    total: r.score.total,
    lighthouse: r.psi.ok ? r.psi.scores : null,
    localPack: r.local.ok ? { query: r.local.query, inTop3: !!r.local.you, position: r.local.you ? r.local.you.position : null, leaders: r.local.top.map((t) => t.name) } : null,
    teaser: top ? { severity: top.severity, title: top.title, cost: top.cost } : null,
    // Titles only, no fixes: enough to see what is inside.
    findingTitles: r.findings.slice(0, 8).map((f) => ({ severity: f.severity, category: f.category, title: f.title })),
  };
}

function scoreColor(s) { return s >= 80 ? '#8bd346' : s >= 65 ? '#ffb020' : s >= 50 ? '#ff8a3d' : '#ff4d4f'; }

function ring(score, size = 132) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - score / 100);
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Score ${score} out of 100">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#2a2d33" stroke-width="10"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${scoreColor(score)}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" dy="0.1em" text-anchor="middle" dominant-baseline="middle" font-family="'JetBrains Mono','SF Mono',Menlo,monospace" font-weight="800" font-size="${size * 0.3}" fill="#f4f5f7">${score}</text>
  </svg>`;
}

/** The full report page. Server-rendered, printable, dark like everything Project Driver ships. */
function fullReportHtml(record, { brand = 'Project Driver', bookUrl = 'https://project-driver.com/book-a-call', siteUrl = '' } = {}) {
  const r = record.result;
  const b = record.biz;
  const s = r.score;
  const cats = Object.entries(s.categories);
  const psi = r.psi;
  const local = r.local;
  const date = new Date(record.finishedAt || record.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const findingsHtml = r.findings.map((f, i) => `
    <article class="finding" id="f-${esc(f.id)}">
      <div class="f-head">
        <span class="sev" style="--sev:${SEV_COLOR[f.severity]}">${SEV_LABEL[f.severity]}</span>
        <span class="cat">${esc(CATEGORY_LABEL[f.category] || f.category)}</span>
        <span class="num">${String(i + 1).padStart(2, '0')}</span>
      </div>
      <h3>${esc(f.title)}</h3>
      <p class="cost"><b>What it costs you.</b> ${esc(f.cost)}</p>
      <p class="fix"><b>Fix.</b> ${esc(f.fix)}</p>
      <div class="meta">
        <span>Evidence: ${esc(f.evidence)}</span>
        ${f.pages && f.pages.length ? `<span>Pages: ${f.pages.slice(0, 4).map((p) => `<a href="${esc(p)}" target="_blank" rel="noopener">${esc(p.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48))}</a>`).join(', ')}${f.pages.length > 4 ? ` +${f.pages.length - 4}` : ''}</span>` : ''}
        <span>Effort: ${esc(f.effort === 'quick' ? 'under an hour' : f.effort === 'half-day' ? 'half a day' : 'a project')}</span>
        ${f.product ? `<span>We fix this with: ${esc(f.product)}</span>` : ''}
      </div>
    </article>`).join('');

  const planHtml = r.plan.map((w) => `
    <section class="week">
      <h3>${esc(w.title)}</h3>
      <p class="muted">${esc(w.intro)}</p>
      <ol>${w.items.map((it) => `<li><a href="#f-${esc(it.id)}"><span class="dot" style="background:${SEV_COLOR[it.severity]}"></span>${esc(it.title)}</a><span class="muted"> · ${esc(it.fix)}</span></li>`).join('')}</ol>
    </section>`).join('');

  const pagesHtml = r.pages.map((p) => `<tr><td><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 50) || '/')}</a></td><td>${p.error ? `<span class="bad">${esc(p.error)}</span>` : p.status}</td><td>${esc(p.title || '—')}</td><td>${p.h1 ? esc(p.h1) : '<span class="bad">none</span>'}</td><td class="n">${p.words}</td><td class="n">${p.imagesNoAlt ? `<span class="bad">${p.imagesNoAlt}</span>` : 0}/${p.images}</td><td>${p.description ? 'yes' : '<span class="bad">no</span>'}</td></tr>`).join('');

  const psiHtml = psi.ok ? `
    <div class="grid4">
      ${[['Performance', psi.scores.performance], ['Accessibility', psi.scores.accessibility], ['SEO', psi.scores.seo], ['Best practices', psi.scores.bestPractices]].map(([l, v]) => `<div class="tile"><b style="color:${v == null ? '#9aa0a6' : scoreColor(v)}">${v == null ? '—' : v}</b><span>${l}</span></div>`).join('')}
    </div>
    <div class="grid4">
      ${[['Largest paint', psi.metrics.lcpMs != null ? `${(psi.metrics.lcpMs / 1000).toFixed(1)}s` : '—', 'good under 2.5s'], ['First paint', psi.metrics.fcpMs != null ? `${(psi.metrics.fcpMs / 1000).toFixed(1)}s` : '—', 'good under 1.8s'], ['Layout shift', psi.metrics.cls != null ? psi.metrics.cls : '—', 'good under 0.1'], ['Blocking time', psi.metrics.tbtMs != null ? `${psi.metrics.tbtMs}ms` : '—', 'good under 200ms']].map(([l, v, h]) => `<div class="tile small"><b>${v}</b><span>${l}</span><small>${h}</small></div>`).join('')}
    </div>
    ${psi.opportunities.length ? `<p class="muted">Biggest speed wins Google measured: ${psi.opportunities.map((o) => `${esc(o.title)} (${(o.savingsMs / 1000).toFixed(1)}s)`).join('; ')}.</p>` : ''}`
    : `<p class="muted">Google's PageSpeed audit was not available for this scan (${esc(psi.error || 'unknown')}). Speed findings above come from our own crawl.</p>`;

  const localHtml = local.ok ? `
    <p>We searched Google Maps for <b>"${esc(local.query)}"</b>. ${local.you ? `You are <b>#${local.you.position}</b> with ${local.you.rating}★ across ${local.you.reviews} reviews.` : `<b>You are not in the results.</b> The businesses that get those calls:`}</p>
    <table><thead><tr><th>#</th><th>Business</th><th>Rating</th><th>Reviews</th></tr></thead><tbody>
      ${local.all.slice(0, 5).map((t) => `<tr><td>${t.position}</td><td>${esc(t.name)}</td><td>${t.rating || '—'}★</td><td class="n">${t.reviews}</td></tr>`).join('')}
    </tbody></table>`
    : `<p class="muted">Competitor lookup was not included in this scan. Ask us for the map-pack comparison on the call.</p>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Teardown · ${esc(b.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&family=JetBrains+Mono:wght@700;800&display=swap" rel="stylesheet">
<style>
  :root{--bg:#0b0c0e;--panel:#15171b;--line:#2a2d33;--text:#f4f5f7;--muted:#9aa0a6;--yellow:#ffd400;color-scheme:dark}
  *{box-sizing:border-box}html{background:var(--bg)}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 Inter,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;padding:0 16px}
  .wrap{max-width:860px;margin:0 auto;padding-block:28px}
  a{color:var(--yellow)}h1,h2,h3{line-height:1.15;letter-spacing:-.02em;margin:0 0 .4em;text-wrap:balance}h1{font-size:clamp(1.7rem,4vw,2.6rem);font-weight:800}h2{font-size:1.5rem;font-weight:800;margin-top:2.4rem}h3{font-size:1.1rem;font-weight:700}
  .muted{color:var(--muted)}.brand{font-weight:800;letter-spacing:.06em}.brand span{color:var(--yellow)}
  .top{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:24px;font-size:.9rem}
  .hero{display:grid;grid-template-columns:auto 1fr;gap:24px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:22px}
  @media(max-width:560px){.hero{grid-template-columns:1fr;justify-items:center;text-align:center}}
  .hero .grade{font:800 .9rem JetBrains Mono,monospace;color:var(--yellow);letter-spacing:.1em;text-transform:uppercase}
  .cats{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:16px}@media(max-width:700px){.cats{grid-template-columns:repeat(2,1fr)}}
  .cat-tile{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px}.cat-tile b{display:block;font:800 1.8rem/1 JetBrains Mono,monospace}.cat-tile span{display:block;color:var(--muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;margin-top:6px}.cat-tile small{color:var(--muted)}
  .sevrow{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 0;font-size:.85rem}.sevrow span{display:inline-flex;align-items:center;gap:6px}.sevrow i{width:9px;height:9px;border-radius:50%;display:inline-block}
  .finding{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin:12px 0;break-inside:avoid}
  .f-head{display:flex;gap:10px;align-items:center;font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:8px}.f-head .num{margin-left:auto;font-family:JetBrains Mono,monospace}
  .sev{color:var(--sev);font-weight:700}.sev::before{content:'';display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--sev);margin-right:6px}
  .finding p{margin:.35em 0}.finding .cost b,.finding .fix b{color:var(--yellow)}.finding .meta{display:flex;flex-wrap:wrap;gap:6px 18px;color:var(--muted);font-size:.8rem;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}
  .week{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin:12px 0}.week ol{padding-left:1.2rem;margin:.5rem 0 0}.week li{margin:.45rem 0}.week .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:8px;vertical-align:middle}.week a{color:var(--text);text-decoration:none;font-weight:600}
  table{width:100%;border-collapse:collapse;font-size:.85rem;margin:.6rem 0}th,td{text-align:left;padding:8px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600;font-size:.72rem;text-transform:uppercase;letter-spacing:.06em}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}.bad{color:#ff8a3d}
  .tablewrap{overflow-x:auto;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:6px 12px}
  .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}@media(max-width:600px){.grid4{grid-template-columns:repeat(2,1fr)}}
  .tile{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px;text-align:center}.tile b{display:block;font:800 1.7rem/1 JetBrains Mono,monospace}.tile.small b{font-size:1.2rem}.tile span{display:block;color:var(--muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;margin-top:6px}.tile small{color:var(--muted);font-size:.7rem}
  .cta{background:var(--yellow);color:#0b0c0e;border-radius:14px;padding:22px 24px;margin-top:2.5rem}.cta h2{margin-top:0;color:#0b0c0e}.cta p{margin:.3em 0}.cta a.btn{display:inline-block;background:#0b0c0e;color:#fff;font-weight:700;padding:.8rem 1.2rem;border-radius:8px;text-decoration:none;margin-top:8px}
  .foot{color:var(--muted);font-size:.8rem;margin-top:2rem;padding-top:14px;border-top:1px solid var(--line)}
  .toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 0}.toolbar a,.toolbar button{background:transparent;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:.5rem .9rem;font:600 .85rem Inter,sans-serif;cursor:pointer;text-decoration:none}
  @media print{html,body{background:#fff;color:#111}:root{--bg:#fff;--panel:#fff;--line:#ddd;--text:#111;--muted:#555}.toolbar,.cta a.btn{display:none}.finding,.week,.hero,.cat-tile,.tile,.tablewrap{border-color:#ccc}.ring text{fill:#111}a{color:#111}}
</style></head>
<body><div class="wrap">
  <div class="top"><span class="brand">TEAR<span>DOWN</span> <span class="muted" style="font-weight:500;letter-spacing:0">by ${esc(brand)}</span></span><span class="muted">${esc(date)} · ${esc(TRADE_LABEL[b.trade] || 'Home services')} · ${esc(b.city)}</span></div>

  <div class="hero">
    ${ring(s.overall)}
    <div>
      <div class="grade">Grade ${esc(s.grade)}</div>
      <h1>${esc(b.name)}</h1>
      <p class="muted"><a href="${esc(r.finalUrl)}" target="_blank" rel="noopener">${esc(r.finalUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a> · ${r.pagesCrawled} pages crawled${psi.ok ? ' · Google PageSpeed included' : ''}${local.ok ? ' · Google Maps compared' : ''}</p>
      <div class="sevrow">${Object.entries(s.bySeverity).filter(([, n]) => n).map(([k, n]) => `<span><i style="background:${SEV_COLOR[k]}"></i>${n} ${SEV_LABEL[k].toLowerCase()}</span>`).join('')}</div>
      <div class="toolbar"><button onclick="window.print()">Save as PDF</button><a href="${esc(bookUrl)}">Walk through it with us</a></div>
    </div>
  </div>
  <div class="cats">${cats.map(([k, c]) => `<div class="cat-tile"><b style="color:${scoreColor(c.score)}">${c.score}</b><span>${esc(c.label)}</span><small>${c.findings} finding${c.findings === 1 ? '' : 's'}</small></div>`).join('')}</div>

  <h2>Read this first</h2>
  <p>${esc(summaryParagraph(record))}</p>

  <h2>Findings, worst first</h2>
  <p class="muted">Every item says what it is costing you and the fix. "Evidence" is exactly what we saw, so anyone can verify it.</p>
  ${findingsHtml || '<p>No findings. That almost never happens. Nice.</p>'}

  <h2>Your 30-day plan</h2>
  ${planHtml}

  <h2>Google's speed audit (mobile)</h2>
  ${psiHtml}

  <h2>Google Maps, next to your competitors</h2>
  ${localHtml}

  <h2>Page by page</h2>
  <div class="tablewrap"><table><thead><tr><th>Page</th><th>Status</th><th>Title</th><th>Main heading</th><th class="n">Words</th><th class="n">Images w/o alt</th><th>Description</th></tr></thead><tbody>${pagesHtml}</tbody></table></div>
  ${r.crawlErrors.length ? `<p class="muted">Could not load: ${r.crawlErrors.map(esc).join('; ')}</p>` : ''}

  <div class="cta">
    <h2>Want it done instead of read?</h2>
    <p>Everything in this report is credited toward any ${esc(brand)} build within 30 days. Most of the quick fixes are one Supported-plan month. The projects are the Get Booked Online and Own Your Market builds.</p>
    <p><a class="btn" href="${esc(bookUrl)}">Book the 30-minute walkthrough</a></p>
  </div>

  <p class="foot">Prepared automatically by ${esc(brand)}'s Teardown scanner on ${esc(date)} from a crawl of ${r.pagesCrawled} public pages${psi.ok ? ', Google PageSpeed Insights' : ''}${local.ok ? ', and a Google Maps search' : ''}. Color contrast and anything requiring a logged-in view were not measured. Report ID ${esc(record.id)}.${siteUrl ? ` Keep this link: ${esc(siteUrl)}/api/teardown-report?id=${esc(record.id)}&k=${esc(record.key)}` : ''}</p>
</div></body></html>`;
}

function summaryParagraph(record) {
  const r = record.result;
  const s = r.score;
  const b = record.biz;
  const crit = r.findings.filter((f) => f.severity === 'critical');
  const high = r.findings.filter((f) => f.severity === 'high');
  const worst = Object.entries(s.categories).sort((a, b2) => a[1].score - b2[1].score)[0];
  const parts = [];
  parts.push(`${b.name} scores ${s.overall} out of 100, a ${s.grade}.`);
  if (crit.length) parts.push(`${crit.length === 1 ? 'One thing is critical' : `${crit.length} things are critical`}: ${crit.map((f) => f.title.charAt(0).toLowerCase() + f.title.slice(1)).join('; ')}. Fix ${crit.length === 1 ? 'that' : 'those'} before anything else.`);
  if (high.length) parts.push(`${high.length} high-priority item${high.length > 1 ? 's' : ''} follow${high.length > 1 ? '' : 's'}, mostly ${modeCategory(high)}.`);
  if (worst) parts.push(`The weakest area is ${worst[1].label.toLowerCase()} at ${worst[1].score}.`);
  if (r.local.ok) parts.push(r.local.you ? `On Google Maps for "${r.local.query}" you are #${r.local.you.position}.` : `On Google Maps for "${r.local.query}" you do not appear in the top results, which is where most of the calls in ${b.city} go.`);
  parts.push(`Week 1 of the plan below is all quick fixes; most owners clear it in an afternoon and move the score ${Math.min(25, 8 + crit.length * 6 + Math.round(high.length * 2))} points or more.`);
  return parts.join(' ');
}

function modeCategory(findings) {
  const counts = {};
  for (const f of findings) counts[f.category] = (counts[f.category] || 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? (CATEGORY_LABEL[top[0]] || top[0]).toLowerCase() : 'across the board';
}

/** Email that carries the paid report link. */
function deliveryEmailHtml(record, { reportUrl, brand = 'Project Driver', bookUrl = 'https://project-driver.com/book-a-call' }) {
  const r = record.result;
  const s = r.score;
  return `<!doctype html><html><body style="margin:0;background:#0b0c0e;padding:20px 12px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#f4f5f7">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%">
    <tr><td style="font:800 18px sans-serif;letter-spacing:.06em;padding-bottom:12px">TEAR<span style="color:#ffd400">DOWN</span> <span style="font:12px sans-serif;color:#9aa0a6">by ${esc(brand)}</span></td></tr>
    <tr><td style="background:#15171b;border:1px solid #2a2d33;border-radius:12px;padding:20px">
      <div style="font-size:13px;color:#9aa0a6;text-transform:uppercase;letter-spacing:.08em">Your report is ready</div>
      <div style="font:800 26px/1.2 sans-serif;margin:6px 0">${esc(record.biz.name)}: ${s.overall}/100, grade ${esc(s.grade)}</div>
      <div style="color:#9aa0a6;font-size:14px">${s.total} findings · ${s.bySeverity.critical} critical · ${s.bySeverity.high} high · ${r.pagesCrawled} pages crawled</div>
      <p style="margin:16px 0 6px"><a href="${esc(reportUrl)}" style="display:inline-block;background:#ffd400;color:#0b0c0e;font-weight:700;padding:12px 18px;border-radius:8px;text-decoration:none">Open the full report</a></p>
      <p style="color:#9aa0a6;font-size:13px;margin:8px 0 0">This link is yours; anyone with it can read the report. Use "Save as PDF" on the report to keep a copy.</p>
    </td></tr>
    <tr><td style="padding-top:16px;color:#9aa0a6;font-size:14px">${record.plan === 'call' ? `Your plan includes a 30-minute walkthrough. <a href="${esc(bookUrl)}" style="color:#ffd400">Pick a time here</a> and we will come to the call with the report open.` : `Want to walk through it with a person? <a href="${esc(bookUrl)}" style="color:#ffd400">Book 30 minutes</a>. The report price is credited toward any build within 30 days.`}</td></tr>
    <tr><td style="padding-top:20px;color:#6b7075;font-size:12px">${esc(brand)} · 101 SE 3rd Ave Ste 1500, Fort Lauderdale, FL 33301 · 754-315-4467</td></tr>
  </table></td></tr></table></body></html>`;
}

module.exports = { freeSummary, fullReportHtml, deliveryEmailHtml, summaryParagraph, esc, ring, TRADE_LABEL };
