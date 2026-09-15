'use strict';

/**
 * Crawl a small business website: homepage, robots.txt, sitemap, and up to
 * MAX_PAGES internal pages chosen to cover services, about, contact, and
 * booking paths. Returns parsed page objects ready for the checks.
 */

const cheerio = require('cheerio');
const { fetchPage } = require('./fetcher');

const MAX_PAGES = 10;
const PRIORITY = [/service/i, /contact/i, /about/i, /book|schedule|appointment|quote|estimate/i, /review|testimonial/i, /area|location|city/i, /pricing|financ/i, /blog|faq/i];

function sameSite(a, b) {
  const ha = new URL(a).hostname.replace(/^www\./, '');
  const hb = new URL(b).hostname.replace(/^www\./, '');
  return ha === hb;
}

function cleanText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

/** Parse one HTML document into the facts the checks need. */
function parsePage(res) {
  const $ = cheerio.load(res.body || '', { decodeEntities: true });
  const base = res.finalUrl;
  const text = cleanText($('body').text());
  const links = [];
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href');
    if (!href || /^(mailto:|tel:|javascript:|#|sms:)/i.test(href)) {
      if (href && /^tel:/i.test(href)) links.push({ href, text: cleanText($(a).text()), kind: 'tel' });
      if (href && /^sms:/i.test(href)) links.push({ href, text: cleanText($(a).text()), kind: 'sms' });
      return;
    }
    try {
      const abs = new URL(href, base).toString().split('#')[0];
      links.push({ href: abs, text: cleanText($(a).text()), internal: sameSite(abs, base), kind: 'link' });
    } catch { /* ignore bad hrefs */ }
  });
  const images = [];
  $('img').each((_, img) => {
    const alt = $(img).attr('alt');
    images.push({ src: $(img).attr('src') || $(img).attr('data-src') || '', alt: alt == null ? null : cleanText(alt), width: $(img).attr('width'), height: $(img).attr('height'), loading: $(img).attr('loading') });
  });
  const headings = [];
  $('h1,h2,h3,h4,h5,h6').each((_, h) => headings.push({ level: Number(h.tagName[1]), text: cleanText($(h).text()) }));
  const jsonLd = [];
  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      const parsed = JSON.parse($(s).html());
      const items = Array.isArray(parsed) ? parsed : (parsed['@graph'] ? parsed['@graph'] : [parsed]);
      for (const it of items) if (it && it['@type']) jsonLd.push(it);
    } catch { jsonLd.push({ '@type': '__invalid__' }); }
  });
  const forms = [];
  $('form').each((_, f) => {
    const inputs = [];
    $(f).find('input,select,textarea').each((_, i) => {
      const type = ($(i).attr('type') || i.tagName).toLowerCase();
      if (['hidden', 'submit', 'button'].includes(type)) return;
      const id = $(i).attr('id');
      const labelled = !!($(i).attr('aria-label') || $(i).attr('aria-labelledby') || (id && $(f).find(`label[for="${id}"]`).length) || $(i).closest('label').length);
      inputs.push({ type, name: $(i).attr('name') || '', labelled, placeholder: $(i).attr('placeholder') || '' });
    });
    forms.push({ action: $(f).attr('action') || '', inputs });
  });
  const scripts = [];
  $('script[src]').each((_, s) => scripts.push($(s).attr('src')));
  const iframes = [];
  $('iframe[src]').each((_, i) => iframes.push($(i).attr('src')));
  const stylesheets = $('link[rel="stylesheet"]').length;
  const inlineStyles = $('style').length;
  const mixed = [];
  if (base.startsWith('https://')) {
    $('img[src^="http://"],script[src^="http://"],link[href^="http://"],iframe[src^="http://"]').each((_, el) => mixed.push($(el).attr('src') || $(el).attr('href')));
  }
  return {
    url: res.url,
    finalUrl: base,
    status: res.status,
    headers: res.headers,
    bytes: res.bytes,
    ttfbMs: res.ttfbMs,
    totalMs: res.totalMs,
    redirects: res.redirects,
    error: res.error,
    lang: $('html').attr('lang') || '',
    title: cleanText($('title').first().text()),
    metaDescription: cleanText($('meta[name="description"]').attr('content')),
    canonical: $('link[rel="canonical"]').attr('href') || '',
    robotsMeta: ($('meta[name="robots"]').attr('content') || '').toLowerCase(),
    viewport: $('meta[name="viewport"]').attr('content') || '',
    og: { title: $('meta[property="og:title"]').attr('content') || '', image: $('meta[property="og:image"]').attr('content') || '', description: $('meta[property="og:description"]').attr('content') || '' },
    favicon: !!$('link[rel~="icon"]').length,
    headings,
    h1s: headings.filter((h) => h.level === 1).map((h) => h.text),
    links,
    images,
    jsonLd,
    forms,
    scripts,
    iframes,
    stylesheets,
    inlineStyles,
    mixedContent: mixed,
    hasSkipLink: !!$('a[href^="#"]').filter((_, a) => /skip/i.test($(a).text())).length,
    text,
    wordCount: text ? text.split(' ').length : 0,
    html: res.body || '',
  };
}

async function fetchText(url, opts) {
  const r = await fetchPage(url, { ...opts, timeout: 8000 });
  return r.status >= 200 && r.status < 300 ? r.body : '';
}

function pickInternalPages(home, limit) {
  const seen = new Set([home.finalUrl.replace(/\/$/, '')]);
  const candidates = [];
  for (const l of home.links) {
    if (!l.internal) continue;
    const key = l.href.replace(/\/$/, '');
    if (seen.has(key)) continue;
    if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|mp4|zip|docx?)$/i.test(key)) continue;
    if (/\?(.*&)?(utm_|replytocom)/i.test(key)) continue;
    seen.add(key);
    const score = PRIORITY.reduce((s, re, i) => (re.test(key) || re.test(l.text) ? s + (PRIORITY.length - i) : s), 0);
    candidates.push({ href: l.href, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit).map((c) => c.href);
}

/**
 * @returns {{home, pages, robots, sitemap, errors}}
 */
async function crawlSite(startUrl, { fetchImpl, lookup, maxPages = MAX_PAGES, log = () => {} } = {}) {
  const opts = { fetchImpl, lookup };
  const errors = [];
  const homeRes = await fetchPage(startUrl, opts);
  const home = parsePage(homeRes);
  if (homeRes.error || homeRes.status >= 400) {
    return { home, pages: [home], robots: null, sitemap: null, errors: [homeRes.error || `Homepage returned HTTP ${homeRes.status}`], httpProbe: null };
  }
  const origin = new URL(home.finalUrl).origin;

  // Does plain http redirect to https?
  let httpProbe = null;
  if (home.finalUrl.startsWith('https://')) {
    try {
      const probe = await fetchPage(`http://${new URL(home.finalUrl).host}/`, { ...opts, method: 'HEAD', timeout: 6000 });
      httpProbe = { finalUrl: probe.finalUrl, status: probe.status, redirects: probe.redirects, error: probe.error };
    } catch (e) { httpProbe = { error: e.message }; }
  }

  const [robotsTxt, sitemapXml, notFound] = await Promise.all([
    fetchText(`${origin}/robots.txt`, opts),
    fetchText(`${origin}/sitemap.xml`, opts),
    fetchPage(`${origin}/this-page-should-not-exist-${Date.now()}`, { ...opts, timeout: 6000 }).catch((e) => ({ status: 0, error: e.message })),
  ]);
  const robots = robotsTxt ? {
    present: true,
    disallowsAll: /^\s*User-agent:\s*\*\s*[\r\n]+\s*Disallow:\s*\/\s*$/im.test(robotsTxt),
    sitemapLines: (robotsTxt.match(/^sitemap:\s*(\S+)/gim) || []).map((l) => l.split(/:\s*/).slice(1).join(':')),
  } : { present: false, disallowsAll: false, sitemapLines: [] };
  // A soft-404 site returns HTML for /sitemap.xml; only count real XML sitemaps.
  const realSitemap = /<(urlset|sitemapindex)\b/i.test(sitemapXml || '');
  const sitemapUrls = realSitemap ? (sitemapXml.match(/<loc>\s*([^<\s]+)\s*<\/loc>/gi) || []).map((m) => m.replace(/<\/?loc>/gi, '').trim()) : [];
  const sitemap = { present: realSitemap, isIndex: /<sitemapindex/i.test(sitemapXml || ''), urls: sitemapUrls };

  const targets = pickInternalPages(home, maxPages - 1);
  log(`crawling ${targets.length} internal pages`);
  const results = await Promise.all(targets.map((u) => fetchPage(u, opts).then(parsePage).catch((e) => ({ url: u, finalUrl: u, status: 0, error: e.message, links: [], images: [], headings: [], h1s: [], jsonLd: [], forms: [], scripts: [], iframes: [], mixedContent: [], text: '', wordCount: 0 }))));
  for (const p of results) {
    if (p.error) errors.push(`${p.url}: ${p.error}`);
    else if (p.status >= 400) errors.push(`${p.url}: HTTP ${p.status}`);
  }
  const pages = [home, ...results];
  return { home, pages, robots, sitemap, errors, httpProbe, notFoundStatus: notFound.status };
}

module.exports = { crawlSite, parsePage, pickInternalPages, sameSite, cleanText };
