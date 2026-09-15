'use strict';

/**
 * Google PageSpeed Insights (Lighthouse in the cloud). Free; an API key
 * raises the quota. Returns null-safe data the checks can use.
 */

const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

async function runPageSpeed(url, { apiKey = process.env.PAGESPEED_API_KEY, fetchImpl = globalThis.fetch, timeout = 60000, strategy = 'mobile' } = {}) {
  const q = new URL(ENDPOINT);
  q.searchParams.set('url', url);
  q.searchParams.set('strategy', strategy);
  for (const c of ['performance', 'accessibility', 'seo', 'best-practices']) q.searchParams.append('category', c);
  if (apiKey) q.searchParams.set('key', apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetchImpl(q, { signal: controller.signal });
    const json = await res.json();
    if (!res.ok || !json.lighthouseResult) return { ok: false, error: (json.error && json.error.message) || `HTTP ${res.status}` };
    return parseLighthouse(json.lighthouseResult, strategy);
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'PageSpeed timed out' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

function parseLighthouse(lr, strategy) {
  const cat = (k) => (lr.categories && lr.categories[k] && lr.categories[k].score != null ? Math.round(lr.categories[k].score * 100) : null);
  const audits = lr.audits || {};
  const num = (k) => (audits[k] && typeof audits[k].numericValue === 'number' ? audits[k].numericValue : null);
  const opportunities = Object.values(audits)
    .filter((a) => a.details && a.details.type === 'opportunity' && a.score != null && a.score < 0.9 && a.details.overallSavingsMs > 100)
    .sort((a, b) => b.details.overallSavingsMs - a.details.overallSavingsMs)
    .slice(0, 6)
    .map((a) => ({ id: a.id, title: a.title, savingsMs: Math.round(a.details.overallSavingsMs) }));
  const a11yIssues = Object.values(audits)
    .filter((a) => a.score === 0 && /color-contrast|image-alt|label|link-name|button-name|heading-order|html-has-lang|document-title|tap-targets/.test(a.id))
    .map((a) => a.title)
    .slice(0, 6);
  return {
    ok: true,
    strategy,
    scores: { performance: cat('performance'), accessibility: cat('accessibility'), seo: cat('seo'), bestPractices: cat('best-practices') },
    metrics: {
      lcpMs: num('largest-contentful-paint') != null ? Math.round(num('largest-contentful-paint')) : null,
      fcpMs: num('first-contentful-paint') != null ? Math.round(num('first-contentful-paint')) : null,
      cls: num('cumulative-layout-shift') != null ? +num('cumulative-layout-shift').toFixed(3) : null,
      tbtMs: num('total-blocking-time') != null ? Math.round(num('total-blocking-time')) : null,
      speedIndexMs: num('speed-index') != null ? Math.round(num('speed-index')) : null,
    },
    opportunities,
    a11yIssues,
    fetchedAt: lr.fetchTime || null,
  };
}

module.exports = { runPageSpeed, parseLighthouse };
