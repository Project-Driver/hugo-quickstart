'use strict';

/**
 * Google Maps local pack for "<trade> <city>" via SerpApi. Optional: without
 * SERPAPI_KEY the report simply omits the competitor section.
 */

const TRADE_QUERY = {
  hvac: 'ac repair', plumbing: 'plumber', roofing: 'roofing contractor', electrical: 'electrician',
  'garage-doors': 'garage door repair', pool: 'pool service', 'pest-control': 'pest control',
  landscaping: 'landscaping', cleaning: 'house cleaning', 'general-contractor': 'general contractor',
  other: 'contractor',
};

function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function domainOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }

function matchYou(results, biz) {
  const bizName = norm(biz.name);
  const bizDomain = domainOf(biz.url);
  const nameTokens = bizName.split(' ').filter((t) => t.length > 2 && !['the', 'and', 'llc', 'inc', 'co', 'company', 'services', 'service'].includes(t));
  return results.find((r) => {
    if (bizDomain && r.website && domainOf(r.website) === bizDomain) return true;
    const rn = norm(r.name);
    return nameTokens.length && nameTokens.every((t) => rn.includes(t));
  }) || null;
}

async function localPack(biz, { apiKey = process.env.SERPAPI_KEY, fetchImpl = globalThis.fetch, timeout = 20000 } = {}) {
  if (!apiKey) return { ok: false, error: 'not configured' };
  const query = `${TRADE_QUERY[biz.trade] || TRADE_QUERY.other} ${biz.city}`.trim();
  const u = new URL('https://serpapi.com/search.json');
  u.searchParams.set('engine', 'google_maps');
  u.searchParams.set('q', query);
  u.searchParams.set('type', 'search');
  u.searchParams.set('hl', 'en');
  u.searchParams.set('api_key', apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetchImpl(u, { signal: controller.signal });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json.error || `HTTP ${res.status}` };
    const results = (json.local_results || []).slice(0, 10).map((r, i) => ({
      position: r.position || i + 1, name: r.title, rating: r.rating || null, reviews: r.reviews || 0, website: r.website || '', address: r.address || '',
    }));
    const you = matchYou(results, biz);
    return { ok: true, query, top: results.slice(0, 3), you: you ? { position: you.position, rating: you.rating, reviews: you.reviews } : null, all: results };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'local lookup timed out' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { localPack, matchYou, TRADE_QUERY };
