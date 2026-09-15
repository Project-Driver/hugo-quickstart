'use strict';

/**
 * The rules. Each check reads the crawl (and optional PageSpeed / local
 * search data) and emits findings:
 *
 * { id, category, severity, title, cost, fix, effort, evidence, pages, product }
 *
 * category: speed | search | local | conversion | access
 * severity: critical | high | medium | low
 * effort:   quick (under an hour) | half-day | project
 * product:  the Project Driver service that fixes it, for the report footer
 */

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const STREET_RE = /\b\d{2,6}\s+(?:[NSEW]\.?\s+)?[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,3}\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Way|Ct|Court|Hwy|Highway|Pkwy|Parkway|Pl|Place|Ter|Terrace|Cir|Circle|Trail|Trl)\b\.?/i;
const ZIP_RE = /\b(?:FL|Florida)\b[,\s]+\d{5}\b|\b\d{5}(?:-\d{4})?\b/;
const HOURS_RE = /\b(?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b[^.]{0,40}\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b(?:24\/7|24 hours|open 24)\b/i;
const EMERGENCY_RE = /\b(emergency|24\/7|24 hours|same[- ]day|after[- ]hours)\b/i;
const FINANCING_RE = /\b(financ(?:e|ing)|payment plans?|0% (?:apr|interest)|monthly payments?)\b/i;
const TRUST_RE = /\b(licensed|insured|bonded|bbb|better business bureau|since (?:19|20)\d{2}|years? (?:of|in) (?:business|experience)|family[- ]owned|veteran[- ]owned)\b/i;
const REVIEW_RE = /\b(reviews?|testimonials?|★|⭐|stars?|rated|google rating)\b/i;
const BOOK_RE = /\b(book(?: now| online)?|schedule|appointment|get (?:a )?(?:free )?(?:quote|estimate)|request (?:a )?(?:quote|estimate|service)|free estimate|contact us|call now|get started)\b/i;

const FL_LICENSE = {
  hvac: { re: /\bCAC\s?\d{6,7}\b/i, label: 'CAC (state-certified air conditioning) license number' },
  plumbing: { re: /\bCFC\s?\d{6,7}\b/i, label: 'CFC (state-certified plumbing) license number' },
  roofing: { re: /\bCCC\s?\d{6,7}\b/i, label: 'CCC (state-certified roofing) license number' },
  electrical: { re: /\bE[CR]\s?\d{7}\b/i, label: 'EC (state-certified electrical) license number' },
  'general-contractor': { re: /\bCGC\s?\d{6,7}\b/i, label: 'CGC (general contractor) license number' },
  pool: { re: /\bCPC\s?\d{6,7}\b/i, label: 'CPC (pool contractor) license number' },
};

const LOCAL_TYPES = /^(LocalBusiness|HVACBusiness|Plumber|RoofingContractor|Electrician|HomeAndConstructionBusiness|GeneralContractor|HousePainter|Locksmith|MovingCompany|ProfessionalService|Store|Organization)$/i;

function esc(s) { return String(s == null ? '' : s); }
function short(url) { try { const u = new URL(url); return (u.pathname === '/' ? u.host : u.pathname).slice(0, 60); } catch { return String(url).slice(0, 60); } }
function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }
function find(list, pred) { return list.filter(pred); }

/**
 * @param {object} input
 * @param {object} input.crawl   from crawl.crawlSite
 * @param {object} [input.psi]   from pagespeed.runPageSpeed (may be null)
 * @param {object} [input.local] from serp.localPack (may be null)
 * @param {object} input.biz     {name, city, trade, phone?}
 */
function runChecks({ crawl, psi = null, local = null, biz = {} }) {
  const F = [];
  const add = (f) => F.push({ pages: [], effort: 'quick', ...f });
  const { home, pages, robots, sitemap, httpProbe, notFoundStatus } = crawl;
  const okPages = pages.filter((p) => !p.error && p.status >= 200 && p.status < 400);
  const city = (biz.city || '').trim();
  const trade = (biz.trade || '').toLowerCase();
  const allText = okPages.map((p) => p.text).join(' ');

  // ---------------------------------------------------------------- reachability
  if (home.error || home.status >= 400) {
    add({ id: 'home-unreachable', category: 'speed', severity: 'critical', title: 'Your homepage did not load', cost: 'Every visitor from Google, your truck, and your business cards hits a dead end.', fix: `Fix the site: it returned ${home.error || `HTTP ${home.status}`} when we tried. Call your host or whoever built it today.`, effort: 'half-day', evidence: home.error || `HTTP ${home.status}`, product: 'Website Build' });
    return F;
  }

  // ---------------------------------------------------------------- security
  if (!home.finalUrl.startsWith('https://')) {
    add({ id: 'no-https', category: 'speed', severity: 'critical', title: 'Site is not on HTTPS', cost: 'Chrome labels the site "Not secure" next to your name, and Google ranks it below competitors that are secure.', fix: 'Turn on the free SSL certificate at your host and force every page to https.', effort: 'quick', evidence: home.finalUrl, product: 'Website Build' });
  } else if (httpProbe && !httpProbe.error && httpProbe.finalUrl && !httpProbe.finalUrl.startsWith('https://')) {
    add({ id: 'http-not-redirected', category: 'speed', severity: 'high', title: 'The http:// version does not redirect to https://', cost: 'Anyone who types your address, or clicks an old link, lands on the insecure copy. Google can index both as separate sites.', fix: 'Add a permanent (301) redirect from http to https at the host or in the site settings.', effort: 'quick', evidence: `http probe ended at ${httpProbe.finalUrl} (HTTP ${httpProbe.status})`, product: 'Website Build' });
  }
  if (home.mixedContent.length) {
    add({ id: 'mixed-content', category: 'speed', severity: 'high', title: 'Insecure files loaded on a secure page', cost: 'Browsers block or warn on these, so images or scripts silently fail for some visitors.', fix: 'Change the http:// file addresses below to https://.', effort: 'quick', evidence: home.mixedContent.slice(0, 3).join(', '), pages: [home.finalUrl], product: 'Website Build' });
  }
  if (home.redirects.length > 2) {
    add({ id: 'redirect-chain', category: 'speed', severity: 'low', title: `Homepage goes through ${home.redirects.length} redirects`, cost: 'Each hop adds load time on a phone, and passes less ranking value.', fix: 'Point every variant (http, www, trailing slash) straight at the final address in one hop.', effort: 'quick', evidence: home.redirects.map((r) => `${r.status} ${short(r.from)}`).join(' → '), product: 'Website Build' });
  }

  // ---------------------------------------------------------------- mobile & speed
  if (!home.viewport) {
    add({ id: 'no-viewport', category: 'speed', severity: 'critical', title: 'Site is not built for phones', cost: 'Most home-service searches happen on a phone. Without a viewport tag the page renders as a tiny desktop layout people have to pinch.', fix: 'Add a responsive viewport meta tag and check every page at phone width.', effort: 'project', evidence: 'No <meta name="viewport"> on the homepage', product: 'Website Build' });
  }
  if (home.ttfbMs > 1500) {
    add({ id: 'slow-server', category: 'speed', severity: 'high', title: `Server takes ${(home.ttfbMs / 1000).toFixed(1)}s to start responding`, cost: 'Visitors on cellular see a blank screen for seconds before anything appears. Many leave.', fix: 'Move to faster hosting or add page caching. Under 0.8s is the target.', effort: 'half-day', evidence: `Time to first byte ${home.ttfbMs} ms`, product: 'Website Build' });
  } else if (home.ttfbMs > 800) {
    add({ id: 'slowish-server', category: 'speed', severity: 'medium', title: `Server is slow to respond (${home.ttfbMs} ms)`, cost: 'Adds most of a second before the page can even start drawing.', fix: 'Turn on page caching at the host or a CDN in front of the site.', effort: 'quick', evidence: `Time to first byte ${home.ttfbMs} ms`, product: 'Self-Managed Plan' });
  }
  if (home.bytes > 1024 * 1024) {
    add({ id: 'heavy-html', category: 'speed', severity: 'medium', title: `Homepage HTML is ${(home.bytes / 1024 / 1024).toFixed(1)} MB`, cost: 'That is the text of the page alone, before any images. Slow on a phone, expensive on data.', fix: 'Usually a page builder embedding everything inline. Remove unused sections and plugins.', effort: 'half-day', evidence: `${home.bytes} bytes`, product: 'Website Build' });
  }
  if (!/gzip|br|deflate/.test(home.headers['content-encoding'] || '')) {
    add({ id: 'no-compression', category: 'speed', severity: 'low', title: 'Pages are sent uncompressed', cost: 'Every page is two to four times larger than it needs to be.', fix: 'Enable gzip or Brotli compression at the host or CDN. One setting.', effort: 'quick', evidence: `content-encoding: ${home.headers['content-encoding'] || 'none'}`, product: 'Self-Managed Plan' });
  }
  if (home.scripts.length > 25) {
    add({ id: 'many-scripts', category: 'speed', severity: 'low', title: `Homepage loads ${home.scripts.length} script files`, cost: 'Each one is a separate download that can block the page from becoming tappable.', fix: 'Remove unused plugins and widgets; combine what is left.', effort: 'half-day', evidence: `${home.scripts.length} <script src> tags`, product: 'Website Build' });
  }
  const noLazy = home.images.filter((i) => !i.loading && i.src).length;
  if (home.images.length >= 8 && noLazy / home.images.length > 0.7) {
    add({ id: 'no-lazy-images', category: 'speed', severity: 'low', title: 'Images below the fold all load at once', cost: 'Slows the first screen to load pictures nobody has scrolled to yet.', fix: 'Add loading="lazy" to images below the first screen.', effort: 'quick', evidence: `${noLazy} of ${home.images.length} images without lazy loading`, product: 'Website Build' });
  }
  if (psi && psi.ok) {
    const m = psi.metrics;
    if (psi.scores.performance != null && psi.scores.performance < 50) {
      add({ id: 'psi-perf-poor', category: 'speed', severity: 'high', title: `Google rates mobile speed ${psi.scores.performance}/100`, cost: 'This is the same score Google uses when deciding who ranks. Under 50 is "poor".', fix: psi.opportunities.length ? `Biggest wins: ${psi.opportunities.slice(0, 3).map((o) => o.title).join('; ')}.` : 'Compress images, remove unused scripts, and fix the server response time.', effort: 'project', evidence: `Lighthouse mobile performance ${psi.scores.performance}`, product: 'Website Build' });
    } else if (psi.scores.performance != null && psi.scores.performance < 80) {
      add({ id: 'psi-perf-ok', category: 'speed', severity: 'medium', title: `Google rates mobile speed ${psi.scores.performance}/100`, cost: 'Passing, but competitors above 80 load noticeably faster on a phone.', fix: psi.opportunities.length ? `Start with: ${psi.opportunities.slice(0, 2).map((o) => o.title).join('; ')}.` : 'Compress images and defer non-critical scripts.', effort: 'half-day', evidence: `Lighthouse mobile performance ${psi.scores.performance}`, product: 'Website Build' });
    }
    if (m.lcpMs != null && m.lcpMs > 4000) {
      add({ id: 'lcp-poor', category: 'speed', severity: 'high', title: `Main content takes ${(m.lcpMs / 1000).toFixed(1)}s to appear on a phone`, cost: 'Google\'s threshold is 2.5s. Past 4s counts against ranking and people give up.', fix: 'Usually one oversized hero image or video. Compress it, size it for phones, and load it first.', effort: 'half-day', evidence: `Largest Contentful Paint ${m.lcpMs} ms`, product: 'Website Build' });
    } else if (m.lcpMs != null && m.lcpMs > 2500) {
      add({ id: 'lcp-needs-work', category: 'speed', severity: 'medium', title: `Main content takes ${(m.lcpMs / 1000).toFixed(1)}s to appear on a phone`, cost: 'Over Google\'s 2.5s "good" line.', fix: 'Compress the hero image and preload it.', effort: 'quick', evidence: `Largest Contentful Paint ${m.lcpMs} ms`, product: 'Website Build' });
    }
    if (m.cls != null && m.cls > 0.25) {
      add({ id: 'cls-poor', category: 'speed', severity: 'high', title: 'Page jumps around while loading', cost: 'People tap the wrong thing, including away from your phone number.', fix: 'Give images and embeds fixed width and height, and load fonts without swapping.', effort: 'half-day', evidence: `Cumulative Layout Shift ${m.cls}`, product: 'Website Build' });
    } else if (m.cls != null && m.cls > 0.1) {
      add({ id: 'cls-needs-work', category: 'speed', severity: 'low', title: 'Some layout shift while loading', cost: 'Minor, but Google measures it.', fix: 'Set width and height on images and ad or map embeds.', effort: 'quick', evidence: `Cumulative Layout Shift ${m.cls}`, product: 'Website Build' });
    }
    if (m.tbtMs != null && m.tbtMs > 600) {
      add({ id: 'tbt-poor', category: 'speed', severity: 'medium', title: 'Page is frozen for over half a second after it appears', cost: 'Taps on the call button do nothing until scripts finish.', fix: 'Remove or defer heavy scripts: chat widgets, sliders, tracking tags you no longer use.', effort: 'half-day', evidence: `Total Blocking Time ${m.tbtMs} ms`, product: 'Website Build' });
    }
  }

  // ---------------------------------------------------------------- indexing
  if (robots && robots.disallowsAll) {
    add({ id: 'robots-blocked', category: 'search', severity: 'critical', title: 'robots.txt tells Google not to crawl the site', cost: 'The site cannot rank for anything while this is in place.', fix: 'Remove the "Disallow: /" line from robots.txt.', effort: 'quick', evidence: 'User-agent: * / Disallow: /', product: 'Local SEO, monthly' });
  }
  if (/noindex/.test(home.robotsMeta)) {
    add({ id: 'home-noindex', category: 'search', severity: 'critical', title: 'Homepage is marked "noindex"', cost: 'You have asked Google to leave your homepage out of search results.', fix: 'Remove the noindex robots meta tag. Common leftover from a site launch.', effort: 'quick', evidence: `meta robots: ${home.robotsMeta}`, pages: [home.finalUrl], product: 'Local SEO, monthly' });
  }
  if (!sitemap || !sitemap.present) {
    add({ id: 'no-sitemap', category: 'search', severity: 'medium', title: 'No sitemap.xml', cost: 'Google finds new service and city pages slower, or not at all.', fix: 'Generate a sitemap (every platform has a plugin or setting) and submit it in Google Search Console.', effort: 'quick', evidence: `${new URL(home.finalUrl).origin}/sitemap.xml returned nothing`, product: 'Local SEO, monthly' });
  }
  if (!robots || !robots.present) {
    add({ id: 'no-robots', category: 'search', severity: 'low', title: 'No robots.txt', cost: 'Harmless by itself, but it is where the sitemap gets announced.', fix: 'Add a robots.txt with a Sitemap: line.', effort: 'quick', evidence: 'robots.txt returned nothing', product: 'Local SEO, monthly' });
  }
  if (notFoundStatus === 200) {
    add({ id: 'soft-404', category: 'search', severity: 'low', title: 'Missing pages return "OK" instead of "not found"', cost: 'Google keeps indexing dead addresses and can treat real pages as duplicates.', fix: 'Make the 404 page send a real 404 status.', effort: 'quick', evidence: 'A made-up address returned HTTP 200', product: 'Website Build' });
  }
  const canon = home.canonical && new URL(home.canonical, home.finalUrl).toString().replace(/\/$/, '');
  if (canon && canon !== home.finalUrl.replace(/\/$/, '') && !canon.startsWith(new URL(home.finalUrl).origin)) {
    add({ id: 'canonical-elsewhere', category: 'search', severity: 'high', title: 'Homepage tells Google the real page is on another site', cost: 'Ranking credit is handed to that other address.', fix: 'Set the canonical tag to your own homepage address.', effort: 'quick', evidence: `canonical: ${home.canonical}`, pages: [home.finalUrl], product: 'Local SEO, monthly' });
  }

  // ---------------------------------------------------------------- titles, descriptions, headings
  const titles = new Map();
  for (const p of okPages) titles.set(p.title, (titles.get(p.title) || 0) + 1);
  const dupTitles = [...titles.entries()].filter(([t, n]) => t && n > 1);
  const noTitle = okPages.filter((p) => !p.title);
  const longTitle = okPages.filter((p) => p.title && p.title.length > 65);
  const genericHome = home.title && /^(home|homepage|welcome|untitled|new page|index)\b/i.test(home.title.trim());
  if (noTitle.length) add({ id: 'missing-title', category: 'search', severity: 'high', title: `${noTitle.length} page${noTitle.length > 1 ? 's have' : ' has'} no title`, cost: 'The title is the blue link in Google. Without one, Google invents it.', fix: 'Write a title for each: "[Service] in [City] | [Company]".', effort: 'quick', evidence: noTitle.map((p) => short(p.finalUrl)).join(', '), pages: noTitle.map((p) => p.finalUrl), product: 'Local SEO, monthly' });
  if (dupTitles.length) add({ id: 'duplicate-titles', category: 'search', severity: 'medium', title: 'Several pages share the same title', cost: 'Google cannot tell the pages apart, so it ranks neither.', fix: 'Give every page its own title naming the service and the city.', effort: 'quick', evidence: dupTitles.map(([t, n]) => `"${t}" ×${n}`).join('; '), product: 'Local SEO, monthly' });
  if (genericHome) add({ id: 'generic-title', category: 'search', severity: 'high', title: `Homepage title is "${home.title}"`, cost: 'Google shows that word instead of what you do and where. Nobody searches "Home".', fix: `Change it to something like "${biz.trade ? biz.trade.replace(/-/g, ' ') : 'Service'} in ${city || 'your city'} | ${biz.name || 'Company'}".`, effort: 'quick', evidence: home.title, pages: [home.finalUrl], product: 'Local SEO, monthly' });
  if (city && home.title && !new RegExp(city.split(/\s+/)[0], 'i').test(home.title) && !genericHome) add({ id: 'title-no-city', category: 'local', severity: 'medium', title: `Homepage title does not mention ${city}`, cost: `"${(biz.trade || 'service').replace(/-/g, ' ')} ${city}" is the search that pays. The title is the strongest signal for it.`, fix: `Add ${city} to the homepage title.`, effort: 'quick', evidence: home.title, pages: [home.finalUrl], product: 'Local SEO, monthly' });
  if (longTitle.length) add({ id: 'long-titles', category: 'search', severity: 'low', title: `${longTitle.length} title${longTitle.length > 1 ? 's get' : ' gets'} cut off in Google`, cost: 'The end, often the city or company name, disappears.', fix: 'Keep titles under about 60 characters, most important words first.', effort: 'quick', evidence: longTitle.map((p) => `${short(p.finalUrl)} (${p.title.length})`).join(', '), pages: longTitle.map((p) => p.finalUrl), product: 'Local SEO, monthly' });
  const noDesc = okPages.filter((p) => !p.metaDescription);
  if (noDesc.length) add({ id: 'missing-description', category: 'search', severity: noDesc.length === okPages.length ? 'medium' : 'low', title: `${noDesc.length} of ${okPages.length} pages have no meta description`, cost: 'That is the grey text under your link in Google. Without it, Google picks a random sentence.', fix: 'Write two sentences per page: what you do, where, and why call now.', effort: 'quick', evidence: noDesc.map((p) => short(p.finalUrl)).join(', '), pages: noDesc.map((p) => p.finalUrl), product: 'Local SEO, monthly' });
  const noH1 = okPages.filter((p) => p.h1s.length === 0);
  const multiH1 = okPages.filter((p) => p.h1s.length > 1);
  if (noH1.length) add({ id: 'missing-h1', category: 'search', severity: 'medium', title: `${noH1.length} page${noH1.length > 1 ? 's have' : ' has'} no main heading`, cost: 'Google and screen readers use the H1 to understand what the page is about.', fix: 'One H1 per page, naming the service and city.', effort: 'quick', evidence: noH1.map((p) => short(p.finalUrl)).join(', '), pages: noH1.map((p) => p.finalUrl), product: 'Local SEO, monthly' });
  if (multiH1.length) add({ id: 'multiple-h1', category: 'search', severity: 'low', title: `${multiH1.length} page${multiH1.length > 1 ? 's have' : ' has'} several main headings`, cost: 'Dilutes the one topic each page should own.', fix: 'Keep one H1; make the rest H2.', effort: 'quick', evidence: multiH1.map((p) => `${short(p.finalUrl)} (${p.h1s.length})`).join(', '), pages: multiH1.map((p) => p.finalUrl), product: 'Local SEO, monthly' });
  const thin = okPages.filter((p) => p.wordCount < 150 && !/contact|book|schedule/i.test(p.finalUrl));
  if (thin.length) add({ id: 'thin-pages', category: 'search', severity: 'medium', title: `${thin.length} page${thin.length > 1 ? 's are' : ' is'} too thin to rank`, cost: 'Under about 150 words, Google has nothing to rank the page for.', fix: 'Add what the service includes, the areas you cover, pricing ranges, and a few real reviews.', effort: 'half-day', evidence: thin.map((p) => `${short(p.finalUrl)} (${p.wordCount} words)`).join(', '), pages: thin.map((p) => p.finalUrl), product: 'Content Onboarding' });
  // A bare /services index does not count; we want a page per service.
  const servicePages = okPages.filter((p) => p !== home
    && !/^\/(our-)?services?\/?$/i.test(new URL(p.finalUrl).pathname)
    && /service|repair|install|replace|maintenance|cleaning|inspection/i.test(p.finalUrl + ' ' + p.title));
  if (!servicePages.length) add({ id: 'no-service-pages', category: 'search', severity: 'high', title: 'No individual service pages', cost: 'Google ranks pages, not businesses. Without a page for each service, "AC repair", "duct cleaning" and "new install" all compete for one homepage.', fix: 'One page per service you actually sell, each with its own title, heading, photos and reviews.', effort: 'project', evidence: `${okPages.length} pages crawled, none about a specific service`, product: 'Website Build' });
  const cityPages = okPages.filter((p) => p !== home && /area|locations?|cit(y|ies)|serving|near/i.test(p.finalUrl + ' ' + p.title));
  if (!cityPages.length && city) add({ id: 'no-city-pages', category: 'local', severity: 'medium', title: 'No service-area or city pages', cost: `You can rank in ${city}, but the next town over searches "${(biz.trade || 'service').replace(/-/g, ' ')} [their town]" and finds someone else.`, fix: 'A page per city you serve, with real detail: neighborhoods, drive times, jobs done there.', effort: 'project', evidence: 'No page about service areas found', product: 'Local SEO, monthly' });

  // ---------------------------------------------------------------- structured data
  const allLd = okPages.flatMap((p) => p.jsonLd);
  const types = new Set(allLd.map((o) => String(o['@type'])));
  const hasLocal = [...types].some((t) => LOCAL_TYPES.test(t));
  if (!hasLocal) add({ id: 'no-localbusiness-schema', category: 'local', severity: 'high', title: 'No LocalBusiness structured data', cost: 'Structured data is how Google and AI assistants confirm your name, address, phone, hours and service area. Without it they guess.', fix: 'Add LocalBusiness (or HVACBusiness / Plumber / RoofingContractor) JSON-LD with name, address, phone, hours, areaServed and sameAs links to your Google profile and socials.', effort: 'quick', evidence: types.size ? `Found: ${[...types].filter((t) => t !== '__invalid__').join(', ') || 'none'}` : 'No JSON-LD on any crawled page', product: 'Local SEO, monthly' });
  if (types.has('__invalid__')) add({ id: 'invalid-jsonld', category: 'search', severity: 'medium', title: 'Broken structured data', cost: 'A JSON error means Google ignores the whole block.', fix: 'Validate the JSON-LD with Google\'s Rich Results Test and fix the syntax.', effort: 'quick', evidence: 'At least one application/ld+json block failed to parse', product: 'Local SEO, monthly' });
  if (!types.has('FAQPage')) add({ id: 'no-faq-schema', category: 'local', severity: 'low', title: 'No FAQ structured data', cost: 'FAQ markup is one of the main ways AI answers quote a business directly.', fix: 'Add a short FAQ per service page and mark it up as FAQPage.', effort: 'quick', evidence: 'No FAQPage type found', product: 'Local SEO, monthly' });
  if (![...types].some((t) => /Service|Offer/.test(t))) add({ id: 'no-service-schema', category: 'local', severity: 'low', title: 'No Service structured data', cost: 'Google cannot list which services you offer from the code.', fix: 'Add Service schema on each service page with serviceType, provider and areaServed.', effort: 'quick', evidence: 'No Service type found', product: 'Local SEO, monthly' });
  if (!home.og.title && !home.og.image) add({ id: 'no-opengraph', category: 'search', severity: 'low', title: 'No social preview tags', cost: 'When someone texts your link, it shows up with no picture and a bare address.', fix: 'Add og:title, og:description and an og:image (1200×630) to every page.', effort: 'quick', evidence: 'No og:title / og:image on homepage', pages: [home.finalUrl], product: 'Website Build' });

  // ---------------------------------------------------------------- local presence
  const phoneOnHome = PHONE_RE.test(home.text);
  const telLinks = home.links.filter((l) => l.kind === 'tel');
  if (!phoneOnHome && !telLinks.length) add({ id: 'no-phone', category: 'local', severity: 'critical', title: 'No phone number on the homepage', cost: 'For a trade, the phone number is the product. Google also matches it against your Business Profile.', fix: 'Put the number in the header of every page, as a tap-to-call link.', effort: 'quick', evidence: 'No phone pattern found in homepage text', pages: [home.finalUrl], product: 'Get Booked Online' });
  const addressFound = STREET_RE.test(allText) && ZIP_RE.test(allText);
  if (!addressFound) add({ id: 'no-address', category: 'local', severity: 'high', title: 'No street address on the site', cost: 'Google cross-checks name, address and phone between the site and your Business Profile. A mismatch or a missing address costs map-pack rankings.', fix: 'Add the full address (or service-area statement plus city and ZIP if you work from home) in the footer of every page, exactly as it appears on Google.', effort: 'quick', evidence: 'No street + ZIP pattern found on crawled pages', product: 'Local SEO, monthly' });
  if (city && !new RegExp(city.split(/\s+/)[0], 'i').test(allText)) add({ id: 'city-not-mentioned', category: 'local', severity: 'high', title: `The site never mentions ${city}`, cost: `Google has no reason to show you for searches in ${city}.`, fix: `Name ${city} and the surrounding cities in the homepage copy, the footer, and a service-area page.`, effort: 'quick', evidence: `"${city}" not found in crawled text`, product: 'Local SEO, monthly' });
  if (!HOURS_RE.test(allText)) add({ id: 'no-hours', category: 'local', severity: 'medium', title: 'Business hours are not on the site', cost: 'People calling at 6 PM want to know if anyone answers. Google also compares hours with your profile.', fix: 'Add hours to the footer and to the LocalBusiness schema.', effort: 'quick', evidence: 'No hours pattern found', product: 'Local SEO, monthly' });
  const lic = FL_LICENSE[trade];
  if (lic && !lic.re.test(allText)) add({ id: 'no-license-number', category: 'local', severity: 'medium', title: `${lic.label} not shown`, cost: 'Florida requires the license number in advertising (F.S. 489.119). It is also the fastest trust signal for a homeowner comparing three quotes.', fix: 'Put the license number in the footer of every page and on the Google profile.', effort: 'quick', evidence: `No ${lic.label.split(' ')[0]} pattern found`, product: 'Local SEO, monthly' });
  const mapEmbed = okPages.some((p) => p.iframes.some((s) => /google\.com\/maps|maps\.google/i.test(s)));
  if (!mapEmbed) add({ id: 'no-map', category: 'local', severity: 'low', title: 'No Google Map on the site', cost: 'A map embed of your Business Profile is one more link between the site and the listing.', fix: 'Embed the map from your Google Business Profile on the contact page.', effort: 'quick', evidence: 'No Google Maps iframe found', product: 'Local SEO, monthly' });
  const hasReviews = REVIEW_RE.test(allText) || types.has('AggregateRating') || types.has('Review') || allLd.some((o) => o.aggregateRating);
  if (!hasReviews) add({ id: 'no-reviews', category: 'conversion', severity: 'medium', title: 'No reviews shown on the site', cost: 'Homeowners read reviews before they call. If they are not on the site, they leave to find them and may not come back.', fix: 'Pull your Google reviews onto the homepage and service pages, with the star rating and count.', effort: 'quick', evidence: 'No review or rating text found', product: 'Never Miss a Job' });
  if (local && local.ok) {
    if (!local.you) add({ id: 'not-in-local-pack', category: 'local', severity: 'high', title: `Not in the top ${local.top.length} on Google Maps for "${local.query}"`, cost: `${local.top.map((t) => t.name).join(', ')} get those calls.`, fix: 'Claim and complete the Google Business Profile, match the categories to the trade, add photos weekly, and get reviews steadily. The site fixes above feed into this.', effort: 'project', evidence: local.top.map((t) => `${t.name} (${t.rating}★, ${t.reviews} reviews)`).join('; '), product: 'Local SEO, monthly' });
    else {
      const best = local.top[0];
      if (best && local.you.reviews < best.reviews / 2) add({ id: 'fewer-reviews', category: 'local', severity: 'medium', title: `Position ${local.you.position} on Maps, but ${best.name} has ${best.reviews} reviews to your ${local.you.reviews}`, cost: 'Review count is the tiebreaker homeowners use between the top three.', fix: 'Ask for a review after every completed job, automatically, by text.', effort: 'quick', evidence: `You: ${local.you.rating}★ ×${local.you.reviews}; leader: ${best.rating}★ ×${best.reviews}`, product: 'Never Miss a Job' });
      if (local.you.rating && local.you.rating < 4.5) add({ id: 'low-rating', category: 'local', severity: 'medium', title: `Google rating is ${local.you.rating}★`, cost: 'Under 4.5, a measurable share of people pick the next listing.', fix: 'Reply to every review, fix the recurring complaint, and drive new reviews to dilute old ones.', effort: 'project', evidence: `${local.you.rating}★ across ${local.you.reviews} reviews`, product: 'In Your Corner' });
    }
  }
  if (!crawl.llmsTxt) add({ id: 'no-llms-txt', category: 'local', severity: 'low', title: 'Nothing written for AI assistants', cost: 'ChatGPT, Gemini and Google\'s AI answers increasingly recommend businesses. A plain-text summary (llms.txt) and FAQ markup make you quotable.', fix: 'Publish /llms.txt with what you do, where, hours, phone, and licensing, in plain sentences.', effort: 'quick', evidence: '/llms.txt not found', product: 'Local SEO, monthly' });

  // ---------------------------------------------------------------- conversion
  if (!telLinks.length) add({ id: 'no-click-to-call', category: 'conversion', severity: 'high', title: 'Phone number is not tappable', cost: 'On a phone, a number that is just text means copy, switch apps, paste. Many do not.', fix: 'Wrap every phone number in a tel: link.', effort: 'quick', evidence: 'No tel: links on homepage', pages: [home.finalUrl], product: 'Get Booked Online' });
  else if (phoneOnHome && home.text.search(PHONE_RE) > 400) add({ id: 'phone-buried', category: 'conversion', severity: 'medium', title: 'Phone number is not at the top of the page', cost: 'The first thing a homeowner with a broken AC looks for is the number.', fix: 'Put the number, tappable, in the header on every page.', effort: 'quick', evidence: `First phone number appears ${home.text.search(PHONE_RE)} characters into the page`, pages: [home.finalUrl], product: 'Get Booked Online' });
  const bookLinks = home.links.filter((l) => l.kind === 'link' && BOOK_RE.test(l.text));
  const anyForm = okPages.some((p) => p.forms.length);
  if (!bookLinks.length && !anyForm) add({ id: 'no-booking-path', category: 'conversion', severity: 'critical', title: 'No way to book or request a quote online', cost: 'Half of home-service customers would rather book than call, especially after hours. They go to whoever lets them.', fix: 'Add online booking that writes to your real calendar, or at minimum a short quote form, linked from the header.', effort: 'half-day', evidence: 'No booking/quote links and no forms on crawled pages', product: 'Get Booked Online' });
  else if (!bookLinks.length) add({ id: 'no-booking-cta', category: 'conversion', severity: 'high', title: 'No "book" or "get a quote" button in sight', cost: 'A form exists somewhere, but the homepage does not send people to it.', fix: 'One clear button in the header: "Book online" or "Get a free estimate".', effort: 'quick', evidence: 'No booking-style link text on homepage', pages: [home.finalUrl], product: 'Get Booked Online' });
  const longForms = okPages.flatMap((p) => p.forms.filter((f) => f.inputs.length > 6).map((f) => ({ page: p.finalUrl, n: f.inputs.length })));
  if (longForms.length) add({ id: 'long-form', category: 'conversion', severity: 'medium', title: `A form asks ${Math.max(...longForms.map((f) => f.n))} questions`, cost: 'Every field past name, phone and "what do you need" loses people.', fix: 'Cut the form to three fields. Ask the rest on the call.', effort: 'quick', evidence: longForms.map((f) => `${short(f.page)} (${f.n} fields)`).join(', '), pages: longForms.map((f) => f.page), product: 'Get Booked Online' });
  const smsLinks = home.links.filter((l) => l.kind === 'sms');
  if (!smsLinks.length) add({ id: 'no-text-us', category: 'conversion', severity: 'low', title: 'No "text us" option', cost: 'Younger homeowners text first. A sms: link costs nothing.', fix: 'Add a "Text us" link next to the phone number, routed to an inbox someone watches.', effort: 'quick', evidence: 'No sms: links found', product: 'Never Miss a Job' });
  if (['hvac', 'plumbing', 'electrical', 'garage-doors', 'roofing'].includes(trade) && !EMERGENCY_RE.test(allText)) add({ id: 'no-emergency', category: 'conversion', severity: 'low', title: 'No mention of emergency or same-day service', cost: 'Urgent searches ("AC not cooling", "water heater leaking") are the highest-value calls, and the page does not claim them.', fix: 'Say plainly whether you do same-day or after-hours work, and what happens when someone calls at 9 PM.', effort: 'quick', evidence: 'No emergency / same-day / 24-7 wording found', product: 'AI Front Desk' });
  if (['hvac', 'roofing', 'plumbing', 'pool', 'general-contractor'].includes(trade) && !FINANCING_RE.test(allText)) add({ id: 'no-financing', category: 'conversion', severity: 'low', title: 'Financing is not mentioned', cost: 'A replacement is a five-figure decision. "As low as $X/month" keeps people on the page.', fix: 'Add a financing line to service pages and the header if you offer it.', effort: 'quick', evidence: 'No financing wording found', product: 'Content Onboarding' });
  if (!TRUST_RE.test(allText)) add({ id: 'no-trust-signals', category: 'conversion', severity: 'low', title: 'No licensed / insured / years-in-business line', cost: 'These are the three words every homeowner checks for.', fix: 'One line under the headline: "Licensed & insured · Serving [city] since [year]".', effort: 'quick', evidence: 'No trust wording found', product: 'Content Onboarding' });
  const allScripts = okPages.flatMap((p) => p.scripts).join(' ') + okPages.map((p) => p.html.slice(0, 200000)).join(' ');
  const hasAnalytics = /gtag\(|googletagmanager|google-analytics|G-[A-Z0-9]{6,}|fbq\(|connect\.facebook\.net|clarity\.ms|hotjar/i.test(allScripts);
  if (!hasAnalytics) add({ id: 'no-tracking', category: 'conversion', severity: 'medium', title: 'No analytics or call tracking', cost: 'You cannot tell which page, ad, or search produced a call, so every marketing dollar is a guess.', fix: 'Install GA4 with click-to-call and form events, and use a tracking number for the site.', effort: 'quick', evidence: 'No GA4 / GTM / Meta pixel found', product: 'Get Booked Online' });

  // ---------------------------------------------------------------- accessibility
  const imgs = okPages.flatMap((p) => p.images.map((i) => ({ ...i, page: p.finalUrl })));
  // alt="" is the correct marker for a decorative image; only a missing attribute counts.
  const noAlt = imgs.filter((i) => i.alt == null);
  if (imgs.length && noAlt.length) {
    const share = pct(noAlt.length, imgs.length);
    add({ id: 'images-no-alt', category: 'access', severity: share > 30 ? 'high' : 'medium', title: `${noAlt.length} of ${imgs.length} images have no description (alt text)`, cost: 'The single most common item in ADA demand letters, and Google cannot "see" the photos of your work.', fix: 'Write one plain sentence per image saying what is in it. Purely decorative images get an empty alt="" so screen readers skip them.', effort: noAlt.length > 40 ? 'half-day' : 'quick', evidence: `${share}% missing`, pages: [...new Set(noAlt.map((i) => i.page))].slice(0, 6), product: 'Accessibility and Alt-Text Scan' });
  }
  const unlabeled = okPages.flatMap((p) => p.forms.flatMap((f) => f.inputs.filter((i) => !i.labelled).map((i) => ({ page: p.finalUrl, name: i.name || i.type }))));
  if (unlabeled.length) add({ id: 'unlabeled-inputs', category: 'access', severity: 'medium', title: `${unlabeled.length} form field${unlabeled.length > 1 ? 's have' : ' has'} no label`, cost: 'Screen readers announce "edit text" with no idea what goes in it. Also a demand-letter item.', fix: 'Add a <label> for every field. Placeholder text does not count.', effort: 'quick', evidence: unlabeled.slice(0, 5).map((u) => `${short(u.page)}: ${u.name}`).join(', '), pages: [...new Set(unlabeled.map((u) => u.page))], product: 'Accessibility and Alt-Text Scan' });
  const skips = okPages.filter((p) => { let last = 0; for (const h of p.headings) { if (last && h.level > last + 1) return true; last = h.level; } return false; });
  if (skips.length) add({ id: 'heading-skips', category: 'access', severity: 'low', title: 'Heading levels skip (e.g. H1 straight to H3)', cost: 'Screen-reader users navigate by headings; skips make the page outline nonsense.', fix: 'Use H2 for sections and H3 inside them.', effort: 'quick', evidence: skips.map((p) => short(p.finalUrl)).join(', '), pages: skips.map((p) => p.finalUrl), product: 'Accessibility and Alt-Text Scan' });
  const emptyLinks = okPages.flatMap((p) => p.links.filter((l) => l.kind === 'link' && !l.text).map(() => p.finalUrl));
  if (emptyLinks.length) add({ id: 'empty-links', category: 'access', severity: 'low', title: `${emptyLinks.length} links with no text`, cost: 'Usually icon or image links. Screen readers read the raw address.', fix: 'Add aria-label or visually hidden text to icon links.', effort: 'quick', evidence: `${emptyLinks.length} across ${new Set(emptyLinks).size} pages`, pages: [...new Set(emptyLinks)].slice(0, 6), product: 'Accessibility and Alt-Text Scan' });
  const generic = okPages.flatMap((p) => p.links.filter((l) => /^(click here|read more|learn more|here|more)$/i.test(l.text)).map(() => p.finalUrl));
  if (generic.length > 3) add({ id: 'generic-links', category: 'access', severity: 'low', title: `${generic.length} "click here" / "learn more" links`, cost: 'Meaningless out of context, for people and for Google.', fix: 'Say where the link goes: "See AC repair pricing".', effort: 'quick', evidence: `${generic.length} generic link texts`, product: 'Content Onboarding' });
  if (!home.lang) add({ id: 'no-lang', category: 'access', severity: 'low', title: 'Page language is not declared', cost: 'Screen readers may read English with the wrong pronunciation rules.', fix: 'Add lang="en" to the <html> tag.', effort: 'quick', evidence: 'No lang attribute on <html>', pages: [home.finalUrl], product: 'Accessibility and Alt-Text Scan' });
  if (psi && psi.ok && psi.scores.accessibility != null && psi.scores.accessibility < 80) add({ id: 'psi-a11y', category: 'access', severity: 'medium', title: `Google's accessibility audit scores ${psi.scores.accessibility}/100`, cost: 'Includes color contrast, which we cannot measure without rendering. Under 80 usually means low-contrast text.', fix: psi.a11yIssues.length ? `Top items: ${psi.a11yIssues.slice(0, 3).join('; ')}.` : 'Run the Lighthouse accessibility audit and fix contrast and labels.', effort: 'half-day', evidence: `Lighthouse accessibility ${psi.scores.accessibility}`, product: 'Accessibility and Alt-Text Scan' });

  return F;
}

module.exports = { runChecks, PHONE_RE, STREET_RE, FL_LICENSE };
