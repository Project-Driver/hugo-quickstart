'use strict';

/**
 * Crawl a small business website: homepage, robots.txt, sitemap, and up to
 * MAX_PAGES internal pages chosen to cover services, about, contact, and
 * booking paths. Returns parsed page objects ready for the checks.
 */

const cheerio = require('cheerio');
const { fetchPage } = require('./fetcher');
const { getSource } = require('./sources');

const MAX_PAGES = 25;
const CONCURRENCY = 5;
const MAX_SITEMAPS = 5;
const PRIORITY = [/service/i, /contact/i, /about/i, /book|schedule|appointment|quote|estimate/i, /review|testimonial/i, /area|location|city/i, /pricing|financ/i, /blog|faq/i];
const TRACKING_PARAMS = /^(utm_|fbclid|gclid|msclkid|mc_cid|mc_eid|ref|replytocom|_ga)/i;

/**
 * One key per real page. Folds www, http/https, trailing slashes, index files,
 * case and tracking parameters together so the same page is never crawled twice.
 */
function canonicalKey(u) {
  try {
    const x = new URL(u);
    x.hash = '';
    x.protocol = 'https:';
    x.hostname = x.hostname.toLowerCase().replace(/^www\./, '');
    for (const k of [...x.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) x.searchParams.delete(k);
    x.pathname = x.pathname.replace(/\/index\.(html?|php|aspx?)$/i, '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
    return x.toString();
  } catch { return String(u); }
}

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
  // A link's accessible name is what a screen reader announces: its text, or
  // failing that an aria-label, the alt text of an image inside it, an SVG
  // title, or a title attribute. Only a link with none of those is unusable.
  const accessibleName = (el) => {
    const $a = $(el);
    const alts = $a.find('img[alt]').map((_, i) => cleanText($(i).attr('alt'))).get().filter(Boolean);
    return cleanText($a.text())
      || cleanText($a.attr('aria-label'))
      || alts.join(' ')
      || cleanText($a.find('svg title, svg desc').text())
      || ($a.attr('aria-labelledby') ? 'referenced' : '')
      || cleanText($a.attr('title'));
  };
  const links = [];
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href');
    const text = cleanText($(a).text());
    const name = accessibleName(a);
    if (!href || /^(mailto:|tel:|javascript:|#|sms:)/i.test(href)) {
      if (href && /^tel:/i.test(href)) links.push({ href, text, name, kind: 'tel', at: $(a).index() });
      if (href && /^sms:/i.test(href)) links.push({ href, text, name, kind: 'sms' });
      return;
    }
    try {
      const abs = new URL(href, base).toString().split('#')[0];
      links.push({ href: abs, text, name, internal: sameSite(abs, base), kind: 'link' });
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
  const telMatch = (res.body || '').search(/href=["']tel:/i);
  return {
    url: res.url,
    finalUrl: base,
    telAtFraction: telMatch === -1 ? null : telMatch / Math.max(1, (res.body || '').length),
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
    // Present only when the page came from a crawler that renders to markdown.
    // Nothing downstream reads it yet; it is the input for the AI judgment pass.
    markdown: res.markdown || '',
    source: res.source || 'native',
  };
}

async function fetchText(url, opts) {
  const r = await fetchPage(url, { ...opts, timeout: 8000 });
  return r.status >= 200 && r.status < 300 ? r.body : '';
}

/**
 * Everything worth crawling: the sitemap first (it lists pages nothing links
 * to), then the homepage's own links. Deduped by canonical key and ranked so
 * the pages that decide whether someone calls come before the blog archive.
 */
function pickInternalPages(home, limit, sitemapUrls = []) {
  const seen = new Set([canonicalKey(home.finalUrl)]);
  const candidates = [];
  const consider = (href, label, fromSitemap) => {
    if (!href) return;
    let key;
    try { key = canonicalKey(new URL(href, home.finalUrl).toString()); } catch { return; }
    if (seen.has(key)) return;
    if (!sameSite(key, home.finalUrl)) return;
    if (/\.(pdf|jpe?g|png|gif|svg|webp|avif|mp4|mov|zip|docx?|xlsx?|css|js|xml|txt)$/i.test(key)) return;
    if (/\/(wp-admin|wp-login|wp-json|cart|checkout|my-account|feed)\b/i.test(key)) return;
    seen.add(key);
    const hay = `${key} ${label || ''}`;
    const score = PRIORITY.reduce((acc, re, i) => (re.test(hay) ? acc + (PRIORITY.length - i) : acc), 0)
      + (fromSitemap ? 1 : 0)
      - Math.max(0, (key.split('/').length - 4)); // prefer shallower pages
    candidates.push({ href, score });
  };
  for (const u of sitemapUrls) consider(u, '', true);
  for (const l of home.links) if (l.internal) consider(l.href, l.text, false);
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit).map((c) => c.href);
}

/** Run jobs with a small pool so we never hammer a small business host. */
async function pool(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  }));
  return out;
}

/**
 * @returns {{home, pages, robots, sitemap, errors}}
 */
async function crawlSite(startUrl, { fetchImpl, lookup, maxPages = MAX_PAGES, log = () => {}, allowPrivate = false, env = process.env, source } = {}) {
  const opts = { fetchImpl, lookup, allowPrivate };
  // Pages are read through the configured source, which may render JavaScript.
  // robots.txt, sitemap XML and the HEAD/404 probes stay on the raw fetcher:
  // they are not documents to render, and a renderer would only mangle them.
  const pageSource = source || getSource(env);
  const readPage = (u, o) => pageSource.fetchPage(u, o || opts);
  if (pageSource.name !== 'native') log(`reading pages with ${pageSource.describe()}`);
  const errors = [];
  const homeRes = await readPage(startUrl);
  const home = parsePage(homeRes);
  if (homeRes.error || homeRes.status >= 400) {
    return {
      home,
      pages: [home],
      robots: null,
      sitemap: null,
      errors: [homeRes.error || `Homepage returned HTTP ${homeRes.status}`],
      httpProbe: null,
      unreachable: { status: homeRes.status, error: homeRes.error, blockedOurUa: !!homeRes.blockedOurUa, firstStatus: homeRes.firstStatus || null },
    };
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

  const [robotsTxt, rootSitemapXml, notFound] = await Promise.all([
    fetchText(`${origin}/robots.txt`, opts),
    fetchText(`${origin}/sitemap.xml`, opts),
    fetchPage(`${origin}/this-page-should-not-exist-${Date.now()}`, { ...opts, timeout: 6000 }).catch((e) => ({ status: 0, error: e.message })),
  ]);
  const robots = robotsTxt ? {
    present: true,
    disallowsAll: /^\s*User-agent:\s*\*\s*[\r\n]+\s*Disallow:\s*\/\s*$/im.test(robotsTxt),
    sitemapLines: (robotsTxt.match(/^sitemap:\s*(\S+)/gim) || []).map((l) => l.split(/:\s*/).slice(1).join(':').trim()),
  } : { present: false, disallowsAll: false, sitemapLines: [] };

  // Gather page addresses from every sitemap we can find: /sitemap.xml, any
  // sitemap named in robots.txt, and the children of a sitemap index. A soft-404
  // site answers /sitemap.xml with HTML, so only real XML counts.
  const locsOf = (xml) => (xml.match(/<loc>\s*([^<\s]+)\s*<\/loc>/gi) || []).map((m) => m.replace(/<\/?loc>/gi, '').trim());
  const isXml = (xml) => /<(urlset|sitemapindex)\b/i.test(xml || '');
  const seenSitemaps = new Set();
  const sitemapDocs = [];
  const queue = [`${origin}/sitemap.xml`, ...robots.sitemapLines];
  let rootPresent = isXml(rootSitemapXml);
  if (rootPresent) { seenSitemaps.add(`${origin}/sitemap.xml`); sitemapDocs.push({ url: `${origin}/sitemap.xml`, xml: rootSitemapXml }); }
  for (const u of queue) {
    if (sitemapDocs.length >= MAX_SITEMAPS) break;
    if (seenSitemaps.has(u)) continue;
    seenSitemaps.add(u);
    const xml = await fetchText(u, opts);
    if (isXml(xml)) sitemapDocs.push({ url: u, xml });
  }
  // Follow a sitemap index one level down.
  for (const doc of [...sitemapDocs]) {
    if (!/<sitemapindex/i.test(doc.xml)) continue;
    for (const child of locsOf(doc.xml)) {
      if (sitemapDocs.length >= MAX_SITEMAPS) break;
      if (seenSitemaps.has(child)) continue;
      seenSitemaps.add(child);
      const xml = await fetchText(child, opts);
      if (isXml(xml) && /<urlset/i.test(xml)) sitemapDocs.push({ url: child, xml });
    }
  }
  const sitemapUrls = [...new Set(sitemapDocs.filter((d) => /<urlset/i.test(d.xml)).flatMap((d) => locsOf(d.xml)))];
  const sitemap = {
    present: rootPresent || sitemapDocs.length > 0,
    isIndex: sitemapDocs.some((d) => /<sitemapindex/i.test(d.xml)),
    sources: sitemapDocs.map((d) => d.url),
    urls: sitemapUrls,
  };
  if (sitemapUrls.length) log(`sitemap lists ${sitemapUrls.length} pages`);

  const targets = pickInternalPages(home, maxPages - 1, sitemapUrls);
  log(`crawling ${targets.length} of ${Math.max(targets.length, sitemapUrls.length)} known pages`);
  const fetched = await pool(targets, CONCURRENCY, (u) => readPage(u).then(parsePage).catch((e) => ({
    url: u, finalUrl: u, status: 0, error: e.message,
    links: [], images: [], headings: [], h1s: [], jsonLd: [], forms: [], scripts: [], iframes: [], mixedContent: [], text: '', wordCount: 0,
  })));

  // Two addresses can redirect to the same page; keep the first of each.
  const byKey = new Set([canonicalKey(home.finalUrl)]);
  const results = [];
  let duplicates = 0;
  for (const p of fetched) {
    if (p.error) { errors.push(`${p.url}: ${p.error}`); results.push(p); continue; }
    if (p.status >= 400) { errors.push(`${p.url}: HTTP ${p.status}`); results.push(p); continue; }
    const key = canonicalKey(p.finalUrl);
    if (byKey.has(key)) { duplicates++; continue; }
    byKey.add(key);
    results.push(p);
  }
  if (duplicates) log(`skipped ${duplicates} duplicate page${duplicates === 1 ? '' : 's'}`);

  const pages = [home, ...results];
  return {
    home,
    pages,
    robots,
    sitemap,
    errors,
    httpProbe,
    notFoundStatus: notFound.status,
    knownPageCount: Math.max(sitemapUrls.length, pages.length),
    crawlLimited: sitemapUrls.length > pages.length,
  };
}

module.exports = { crawlSite, parsePage, pickInternalPages, sameSite, cleanText, canonicalKey, pool, MAX_PAGES };
