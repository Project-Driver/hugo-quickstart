'use strict';

const SEVERITY_WEIGHT = { critical: 30, high: 16, medium: 8, low: 3 };
const CATEGORY_WEIGHT = { speed: 0.25, search: 0.25, local: 0.2, conversion: 0.2, access: 0.1 };
const CATEGORY_LABEL = { speed: 'Speed & mobile', search: 'Search', local: 'Local & AI search', conversion: 'Getting the call', access: 'Accessibility' };
const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function grade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 65) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

/** Category scores 0-100 and a weighted overall. PageSpeed blends into "speed" when present. */
function scoreFindings(findings, psi = null) {
  const cats = {};
  for (const c of Object.keys(CATEGORY_WEIGHT)) cats[c] = { score: 100, findings: 0, label: CATEGORY_LABEL[c] };
  for (const f of findings) {
    const c = cats[f.category];
    if (!c) continue;
    c.score = Math.max(0, c.score - (SEVERITY_WEIGHT[f.severity] || 0));
    c.findings += 1;
  }
  if (psi && psi.ok && psi.scores.performance != null) {
    cats.speed.score = Math.round(0.5 * cats.speed.score + 0.5 * psi.scores.performance);
  }
  let overall = 0;
  for (const [c, w] of Object.entries(CATEGORY_WEIGHT)) overall += cats[c].score * w;
  overall = Math.round(overall);
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
  return { overall, grade: grade(overall), categories: cats, bySeverity, total: findings.length };
}

function sortFindings(findings) {
  return [...findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    || (CATEGORY_WEIGHT[b.category] || 0) - (CATEGORY_WEIGHT[a.category] || 0));
}

module.exports = { scoreFindings, sortFindings, grade, SEVERITY_WEIGHT, CATEGORY_WEIGHT, CATEGORY_LABEL, SEVERITY_ORDER };
