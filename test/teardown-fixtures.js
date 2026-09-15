'use strict';

// Two fictional sites served by a fake fetch. "bad" is a typical neglected
// contractor site; "good" does most things right.

const BAD_HOME = `<html><head><title>Home</title></head><body>
<div class="nav"><a href="/about">About</a><a href="/services">Services</a><a href="/gallery">Gallery</a><a href="#">Click here</a><a href="/blog?utm_source=x">Blog</a></div>
<h3>Welcome to our site</h3>
<p>We are the best company. We are here for you. Quality work at fair prices. Give us a call.</p>
<img src="/a.jpg"><img src="/b.jpg" alt=""><img src="/c.jpg" alt="Technician fixing an AC unit"><img src="/d.jpg"><img src="/e.jpg"><img src="/f.jpg"><img src="/g.jpg"><img src="/h.jpg">
<form action="/contact"><input name="a"><input name="b"><input name="c"><input name="d"><input name="e"><input name="f"><input name="g"><button>Send</button></form>
<script src="http://cdn.example.com/x.js"></script>
</body></html>`;

const BAD_SERVICES = `<html><head><title>Home</title></head><body><h1>Services</h1><h1>More</h1><p>We do stuff.</p><a href="/">home</a></body></html>`;
const BAD_ABOUT = `<html><head><title>About Us</title><meta name="description" content="About"></head><body><h1>About</h1><p>${'word '.repeat(200)}</p></body></html>`;

const GOOD_HOME = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>AC Repair in Fort Lauderdale | Coastal Air & Heat</title>
<meta name="description" content="Same-day AC repair and installation in Fort Lauderdale and Broward County. Licensed CAC1819999. Call 754-555-0100.">
<link rel="canonical" href="https://good.example.com/"><meta property="og:title" content="Coastal Air & Heat"><meta property="og:image" content="https://good.example.com/og.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"HVACBusiness","name":"Coastal Air & Heat","telephone":"+17545550100","address":{"@type":"PostalAddress","streetAddress":"1420 NE 26th St","addressLocality":"Fort Lauderdale","addressRegion":"FL","postalCode":"33305"},"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.9","reviewCount":"212"}}</script>
<script type="application/ld+json">{"@type":"FAQPage","mainEntity":[]}</script>
<script type="application/ld+json">{"@type":"Service","serviceType":"AC repair"}</script>
<script src="https://www.googletagmanager.com/gtag/js?id=G-ABC123"></script>
</head><body><a href="#main" class="skip">Skip to content</a>
<header><a href="tel:+17545550100">754-555-0100</a> <a href="sms:+17545550100">Text us</a> <a href="/book">Book online</a></header>
<main id="main"><h1>AC Repair in Fort Lauderdale</h1><p>Licensed & insured, family-owned, serving Fort Lauderdale, Pompano Beach and Davie since 2009. Same-day service, 24/7 emergency AC repair. Financing available. Rated 4.9 stars from 212 Google reviews. License CAC1819999.</p>
<h2>Services</h2><a href="/services/ac-repair">AC repair</a> <a href="/services/ac-installation">AC installation</a> <a href="/service-areas">Service areas</a> <a href="/contact">Contact</a> <a href="/reviews">Reviews</a>
<img src="/tech.jpg" alt="Technician servicing a condenser" loading="lazy"><img src="/van.jpg" alt="Coastal Air van" loading="lazy">
<h2>Hours</h2><p>Mon-Fri 7:00 am - 7:00 pm, Sat 8:00 am - 2:00 pm.</p>
<form action="/quote"><label>Name <input name="name"></label><label>Phone <input name="phone"></label><label>What do you need? <input name="need"></label><button>Get a free estimate</button></form>
<iframe src="https://www.google.com/maps/embed?pb=xyz"></iframe>
</main><footer><p>Coastal Air & Heat, 1420 NE 26th St, Fort Lauderdale, FL 33305. CAC1819999.</p></footer></body></html>`;

const GOOD_PAGE = (title, h1) => `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>${title} | Coastal Air & Heat</title><meta name="description" content="${title} in Fort Lauderdale."></head><body><h1>${h1}</h1><h2>Details</h2><p>${'Real content about the service in Fort Lauderdale. '.repeat(30)}</p><img src="/x.jpg" alt="Job photo"></body></html>`;

function site(routes, { https = true, ttfb = 100 } = {}) {
  return { routes, https, ttfb };
}

const SITES = {
  'bad.example.com': site({
    '/': { status: 200, body: BAD_HOME, headers: { 'content-type': 'text/html' } },
    '/services': { status: 200, body: BAD_SERVICES, headers: { 'content-type': 'text/html' } },
    '/about': { status: 200, body: BAD_ABOUT, headers: { 'content-type': 'text/html' } },
    '/gallery': { status: 500, body: 'error', headers: {} },
    '/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /\n', headers: {} },
  }, { ttfb: 1900 }),
  'good.example.com': site({
    '/': { status: 200, body: GOOD_HOME, headers: { 'content-type': 'text/html', 'content-encoding': 'br' } },
    '/services/ac-repair': { status: 200, body: GOOD_PAGE('AC Repair', 'AC Repair in Fort Lauderdale'), headers: { 'content-encoding': 'br' } },
    '/services/ac-installation': { status: 200, body: GOOD_PAGE('AC Installation', 'AC Installation'), headers: { 'content-encoding': 'br' } },
    '/service-areas': { status: 200, body: GOOD_PAGE('Service Areas', 'Cities We Serve'), headers: { 'content-encoding': 'br' } },
    '/contact': { status: 200, body: GOOD_PAGE('Contact', 'Contact Us'), headers: { 'content-encoding': 'br' } },
    '/reviews': { status: 200, body: GOOD_PAGE('Reviews', 'Reviews'), headers: { 'content-encoding': 'br' } },
    '/book': { status: 200, body: GOOD_PAGE('Book', 'Book Online'), headers: { 'content-encoding': 'br' } },
    '/robots.txt': { status: 200, body: 'User-agent: *\nAllow: /\nSitemap: https://good.example.com/sitemap.xml\n', headers: {} },
    '/sitemap.xml': { status: 200, body: '<urlset><url><loc>https://good.example.com/</loc></url><url><loc>https://good.example.com/services/ac-repair</loc></url></urlset>', headers: {} },
    '/llms.txt': { status: 200, body: '# Coastal Air & Heat\nAC repair in Fort Lauderdale.', headers: {} },
  }),
};

/** A fetch that serves the fixture sites, redirects http->https for good, and 404s the rest. */
function makeFetch({ psi = null, serp = null } = {}) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (input, init = {}) => {
      const u = new URL(String(input));
      calls.push({ url: u.toString(), method: init.method || 'GET' });
      const mk = (status, body, headers = {}) => ({
        ok: status >= 200 && status < 300, status,
        headers: { forEach: (fn) => Object.entries(headers).forEach(([k, v]) => fn(v, k)) },
        body: null,
        text: async () => body,
        json: async () => JSON.parse(body),
      });
      if (u.hostname === 'www.googleapis.com') return psi ? mk(200, JSON.stringify(psi)) : mk(500, JSON.stringify({ error: { message: 'no psi' } }));
      if (u.hostname === 'serpapi.com') return serp ? mk(200, JSON.stringify(serp)) : mk(500, JSON.stringify({ error: 'no serp' }));
      const s = SITES[u.hostname];
      if (!s) return mk(404, 'not found');
      if (u.protocol === 'http:' && u.hostname === 'good.example.com') return mk(301, '', { location: `https://good.example.com${u.pathname}` });
      if (u.protocol === 'http:' && u.hostname === 'bad.example.com') return mk(200, BAD_HOME, { 'content-type': 'text/html' }); // http serves the site too: no redirect
      const r = s.routes[u.pathname];
      if (!r) return mk(u.hostname === 'bad.example.com' ? 200 : 404, u.hostname === 'bad.example.com' ? '<html><title>Home</title><body>Oops, but 200</body></html>' : 'Not found', {});
      return mk(r.status, r.body, r.headers);
    },
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
  };
}

const PSI_POOR = { lighthouseResult: { fetchTime: '2026-09-15T00:00:00Z', categories: { performance: { score: 0.31 }, accessibility: { score: 0.62 }, seo: { score: 0.7 }, 'best-practices': { score: 0.8 } }, audits: { 'largest-contentful-paint': { numericValue: 6100 }, 'first-contentful-paint': { numericValue: 3100 }, 'cumulative-layout-shift': { numericValue: 0.31 }, 'total-blocking-time': { numericValue: 900 }, 'speed-index': { numericValue: 7000 }, 'uses-optimized-images': { id: 'uses-optimized-images', title: 'Efficiently encode images', score: 0.2, details: { type: 'opportunity', overallSavingsMs: 2400 } }, 'color-contrast': { id: 'color-contrast', title: 'Background and foreground colors do not have a sufficient contrast ratio.', score: 0 } } } };
const SERP_MISSING = { local_results: [{ position: 1, title: 'Cool Breeze AC', rating: 4.8, reviews: 540, website: 'https://coolbreeze.example' }, { position: 2, title: 'Arctic Air Pros', rating: 4.7, reviews: 310 }, { position: 3, title: 'Sunshine HVAC', rating: 4.9, reviews: 120 }] };
const SERP_PRESENT = { local_results: [{ position: 1, title: 'Cool Breeze AC', rating: 4.8, reviews: 540 }, { position: 2, title: 'Coastal Air & Heat', rating: 4.9, reviews: 212, website: 'https://good.example.com' }, { position: 3, title: 'Sunshine HVAC', rating: 4.9, reviews: 120 }] };

module.exports = { makeFetch, SITES, PSI_POOR, SERP_MISSING, SERP_PRESENT, BAD_HOME, GOOD_HOME };
