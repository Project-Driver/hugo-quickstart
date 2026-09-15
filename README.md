# Pit Board by Project Driver

**Your business on one board, every morning at 7.**

Pit Board is a daily 7 AM text and email for home-service owners (HVAC, plumbing, roofing, and any trade that lives on the phone). It shows yesterday's calls, the ones that were missed, which of those got a text back, new leads by source, what got booked, a response score, today's lineup, and the money still on the table with a one-tap link to fix each item.

It is built on the GoHighLevel (GHL) sub-account Project Driver already installs for clients. Nothing new to log into. The board is sent from the owner's own number and email.

This repository is the whole product:

| Part | Where |
|---|---|
| Marketing site (Hugo, Netlify) | `content/`, `themes/pitboard/` |
| Daily engine (scheduled Netlify function) | `netlify/functions/pitboard-daily.js` |
| GHL client, board logic, renderers | `netlify/functions/lib/` |
| Signup API (posts leads into Project Driver's GHL) | `netlify/functions/pitboard-signup.js` |
| Sample/live board API | `netlify/functions/pitboard-board.js` |
| Manual run / dry run API | `netlify/functions/pitboard-run.js` |
| Unit tests (node:test, no dependencies) | `test/` |
| Product spec, pricing math, launch plan | `docs/PIT-BOARD.md` |

## Run it locally

```bash
npm test                      # 27 unit tests, no network
hugo server -D                # site at http://localhost:1313
node scripts/preview.js       # sample board as SMS and plain text
node scripts/preview.js --html > board.html   # the email
```

To preview a **live** board for a real account without sending anything:

```bash
PITBOARD_ACCOUNTS='[{"id":"acme","name":"Acme Plumbing","locationId":"...","token":"...","ownerContactId":"...","timeZone":"America/New_York"}]' \
node scripts/preview.js --live acme
```

## Deploy (Netlify)

`netlify.toml` builds the site with Hugo, bundles the functions with esbuild, and maps `/api/*` to the functions. `pitboard-daily` runs on the cron in its `config.schedule` (11:00 UTC, which is 7 AM Eastern during daylight time).

Environment variables:

| Variable | Purpose |
|---|---|
| `PITBOARD_ACCOUNTS` | JSON array (or base64 of one) of subscriber accounts. Schema in `netlify/functions/lib/accounts.js`. |
| `PITBOARD_ADMIN_KEY` | Secret for `POST /api/run` (manual send or dry run). |
| `PITBOARD_PREVIEW_KEY` | Secret that lets you open any live board at `/api/board?a=<id>&key=...`. |
| `PD_GHL_TOKEN`, `PD_GHL_LOCATION_ID` | Project Driver's own GHL location, where site signups land as contacts tagged `pitboard-signup`. |
| `PITBOARD_CHECKOUT_BOARD` / `_CREW` / `_PRO` | Where each plan's signup is sent next (GHL payment links). Falls back to the book-a-call page. |
| `PITBOARD_AGENCY_CALL_URL` | Where agency inquiries are sent. |
| `PITBOARD_EMAIL_FROM` | Optional default from-address for the email board. |

Each subscriber needs a GHL **Private Integration** token for their sub-account with these scopes: `conversations.readonly`, `conversations/message.readonly`, `conversations/message.write`, `contacts.readonly`, `calendars.readonly`, `calendars/events.readonly`, `opportunities.readonly`, `invoices.readonly`.

## Manual send and dry run

```bash
curl -X POST https://pitboard.project-driver.com/api/run \
  -H "x-pitboard-key: $PITBOARD_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"accountId":"acme","dryRun":true}'
```

Drop `dryRun` to send for real. Omit `accountId` to run every active account.

## Tests

`npm test` covers the time-zone windows (including a DST change), every board rule (missed-call recovery, waiting replies, stale estimates, unpaid invoices, score, nudges), the SMS length budget, HTML escaping, the account registry, the runner against a mocked GHL API, and the three HTTP functions. `cypress/e2e/basic.cy.js` smoke-tests the built site on Netlify.

## License

MIT, see `LICENSE`.
