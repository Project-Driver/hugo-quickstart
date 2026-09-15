'use strict';

const { sortFindings } = require('./score');

const EFFORT_ORDER = { quick: 0, 'half-day': 1, project: 2 };

/**
 * A 30-day plan: week 1 is every quick fix, worst first; week 2 the half-day
 * items; weeks 3-4 the projects. Each step keeps its finding id so the report
 * can link back.
 */
function buildPlan(findings) {
  const sorted = sortFindings(findings);
  const weeks = [
    { week: 1, title: 'Week 1: quick fixes', intro: 'Each of these is under an hour for whoever manages the site. Do the critical ones the same day.', items: [] },
    { week: 2, title: 'Week 2: half-day jobs', intro: 'Block a morning, or hand this list to us.', items: [] },
    { week: 3, title: 'Weeks 3-4: projects', intro: 'These change what the site is, not just how it is set up. Scope them before starting.', items: [] },
  ];
  for (const f of sorted) {
    const idx = EFFORT_ORDER[f.effort] ?? 0;
    weeks[idx].items.push({ id: f.id, severity: f.severity, title: f.title, fix: f.fix, product: f.product });
  }
  return weeks.filter((w) => w.items.length);
}

module.exports = { buildPlan, EFFORT_ORDER };
