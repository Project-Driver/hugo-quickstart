# Instant Teardown: the coin-operated product

A stranger lands on `/teardown/`, types their website, gets a free score in about a minute, and pays $79 (or $249 with a call) for the full report. Nobody at Project Driver touches it. Every buyer lands in GHL tagged by grade and trade, so the human Diagnostic, Get Booked Online and Local SEO offers follow automatically.

## How it works

```
/teardown/ form  ─POST─>  teardown-start ──> stores scan (Netlify Blobs) ──> teardown-run-background (15-min budget)
                                                                                   │ crawl up to 25 pages, robots, sitemap, llms.txt
                                                                                   │ Google PageSpeed (Lighthouse) in parallel
                                                                                   │ Google Maps local pack via SerpApi in parallel
                                                                                   │ 45+ rule checks -> findings -> score -> 30-day plan
page polls  <─GET─  teardown-status  (free summary: score, categories, teaser, finding titles; never the fixes)
"Unlock" ─POST─> teardown-checkout ──> Stripe Checkout ──> success: /teardown/report/?id&session_id
Stripe ──webhook──> teardown-webhook ──> mark paid, upsert contact in Project Driver GHL, email the report link
/api/teardown-report?id&k=<key>  (paid)  or  ?session_id=  (verified with Stripe if the webhook has not landed yet)
```

The report is a standalone dark page with "Save as PDF" (print stylesheet). The private link in the email is permanent.

## What the scanner checks

Sixty-nine rules in `netlify/functions/lib/teardown/checks.js`, each with a plain-English "what it costs you", the fix, the evidence, the pages, an effort estimate, and the Project Driver product that fixes it. Run `node scripts/rules.js` to print the current inventory; the count below is generated from the source, so it and the code cannot drift apart. Categories and weights:

| Category | Weight | Examples |
|---|---|---|
| Speed & mobile | 25% | HTTPS and redirect, viewport, server response time, page weight, compression, Lighthouse performance, LCP, CLS, TBT |
| Search | 25% | robots and noindex, sitemap, soft 404s, titles (missing, duplicate, generic "Home", too long, no city), descriptions, H1s, thin pages, per-service pages, broken structured data, Open Graph |
| Local & AI search | 20% | LocalBusiness / FAQ / Service schema, phone, address, city mentions, hours, Florida license number by trade (CAC, CFC, CCC, EC, CGC, CPC), map embed, Google Maps position vs. competitors, review count vs. leader, llms.txt |
| Getting the call | 20% | tap-to-call, phone above the fold, booking or quote path, form length, "text us", emergency/same-day wording, financing, trust line, analytics/tracking, reviews on site |
| Accessibility | 10% | images without alt, unlabeled inputs, heading skips, empty and generic links, lang attribute, Lighthouse accessibility |

Scores: each category starts at 100 and loses 30 / 16 / 8 / 3 per critical / high / medium / low finding. Speed blends 50/50 with Lighthouse when available. Overall is the weighted sum. A 90+, B 80+, C 65+, D 50+, else F.

Not measured, and the report says so: color contrast, anything behind a login, and call handling (that is what Pit Board and Never Miss a Job are for).

## How pages are found

Discovery reads the sitemap first, then the homepage's own links. That order matters: on most WordPress sites half the service and city pages are not linked from the homepage at all, so a link-only crawl misses exactly the pages that rank. We look at `/sitemap.xml`, every `Sitemap:` line in `robots.txt`, and one level of a sitemap index, up to five sitemap documents.

Candidates are then deduplicated by a canonical key that folds together `www` and bare domains, `http` and `https`, trailing slashes, `index.php` and friends, casing, and tracking parameters. Pages are ranked so the ones that decide whether somebody calls (services, contact, booking, reviews, service areas) come before the blog archive, with shallower URLs preferred. After fetching, pages are deduplicated a second time by their final URL, because two addresses can redirect to the same page.

The crawl is capped at 25 pages and runs five requests at a time so a small business host is never flooded. When the site has more pages than the cap, the report says so on the front page and in the footer: "10 of 38 pages crawled". Raise it from the command line with `--max-pages`.

## When the site cannot be read

A scan that cannot load the homepage is marked `blocked`, not `done`. It gets no score, no grade, no report, and checkout refuses it with HTTP 409 so nobody is ever charged for a site we could not read. The blocked reason is written for the owner: a dead address, a 404 homepage, a server error, or, most often, a security plugin or CDN refusing automated visitors.

Because that last case is common on small-business sites, the crawler identifies itself honestly first and, only if that request is refused with a firewall-style status (401, 403, 405, 406, 409, 429, 503), retries the page once with an ordinary Chrome user agent. If both are refused the scan is blocked and says so, including the fact that the same firewall may be blocking search engines.

## Setup checklist (about an hour)

1. **Stripe.** Create two Products with one-time Prices: "Instant Teardown" $79 and "Instant Teardown + call" $249. Put the price ids in `STRIPE_PRICE_TEARDOWN` and `STRIPE_PRICE_TEARDOWN_CALL`, the secret key in `STRIPE_SECRET_KEY`. Add a webhook endpoint for `checkout.session.completed` pointing at `https://<site>/api/teardown-webhook` and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
2. **Google PageSpeed API key.** Free. Create it in Google Cloud (PageSpeed Insights API) and set `PAGESPEED_API_KEY`. Without it Google's shared quota runs out fast and the speed section falls back to our own crawl.
3. **SerpApi** (optional but the competitor section sells the report). Set `SERPAPI_KEY`. About $50/month at launch volume.
4. **GHL.** `PD_GHL_TOKEN` and `PD_GHL_LOCATION_ID` for the Project Driver sub-account (same as Pit Board). Buyers arrive with tags `teardown-paid`, `teardown-plan-report|call`, `trade-<trade>`, `teardown-grade-<a-f>`. Build one workflow on `teardown-paid`: a text from Omar within an hour ("Your Teardown came back a D. Want me to walk it with you?"), an opportunity in the Sales pipeline, and a 7-day follow-up offering the Diagnostic with the $79 credited.
5. **Site.** `URL` is set by Netlify automatically. Set `TEARDOWN_RUNNER_SECRET` (any random string) so only the site can start background scans, and `TEARDOWN_CALL_URL` to the Diagnostic booking calendar for the $249 plan.
6. **Netlify Blobs** is on by default for sites on the current build system; nothing to configure.

## Running a real scan from the command line

```bash
npm run teardown -- residentialgaragedoorservice.net \
  --business "Residential Garage Door Service" --city Jupiter --trade garage-doors
```

It prints the score, the category breakdown and every finding, then writes the full HTML report next to you. `PAGESPEED_API_KEY` and `SERPAPI_KEY` are read from the environment if set. `--out <file>` chooses the report path, `--json <file>` also dumps the raw scan record, `--max-pages <n>` changes the crawl cap, and `--allow-private` permits localhost for local testing.

## Testing without money

- `npm test` runs 56 tests: the whole pipeline against two fixture websites (a neglected one and a good one), Stripe signature checks, and `test/teardown-live.test.js`, which starts a real HTTP server on loopback and exercises the actual network stack: gzip, 301 redirects, robots, soft 404s, request timeouts, a firewall that blocks the scanner and is retried as a browser, a site that blocks everything and must end up unsellable, pages reachable only through a sitemap index, a homepage served at five different addresses, icon links named by image alt or aria-label, and the concurrency cap.
- On the deployed site, run a scan; the free result shows without Stripe. To see the paid report for a scan without paying: `/api/teardown-report?id=<id>&key=<PITBOARD_PREVIEW_KEY>`.
- Stripe test mode works end to end with a test card; the webhook can be sent from the Stripe dashboard.

## Economics

| | Report | Report + call |
|---|---|---|
| Price | $79 | $249 |
| Direct cost | ~$0.15 (PageSpeed free, SerpApi ~$0.10, Netlify function minutes) | same + 30 minutes of Omar |
| Stripe fee | ~$2.60 | ~$7.50 |

$500/day is six to seven $79 reports, or three of the $249. Reports also seed the rest of the catalog: every buyer is a warm, tagged lead who has just read a ranked list of what is broken and which Project Driver product fixes it.

## Traffic (the honest part)

A vending machine needs foot traffic. What this one is built to do:
- The free score is the shareable moment. Post one anonymized score card per weekday on Google Business Profile and socials.
- "Free website score for [trade] in [city]" is a cheap search-ad phrase; the free scan converts curiosity before the sale.
- Run it on every prospect in the GHL Prospects pipeline and send them their own score. That is the cold email.
- Agencies and other GHL users can white-label it later; the report footer and product names are the only branded parts.

## What is built vs. next

Built: everything in the diagram, 45 rules, free/paid split, Stripe checkout and webhook, session-verified success page, delivery by GHL email, printable report, 16 new tests.

Next, in order of value: a Claude-written narrative on top of the rule-based summary (the rules stay the source of truth), competitor page comparison (crawl the top three and show what they have that you do not), a PDF attachment on the email, and a weekly re-scan subscription ($19/month) that emails only what changed.
