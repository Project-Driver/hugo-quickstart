# Pit Board: product spec, pricing math, launch plan

Written 2026-09-15 for Project Driver (Omar Ramos, Fort Lauderdale).

## Why this product

Project Driver's catalog (31 services in GoHighLevel as of today) is almost entirely one-time builds and monthly plans that run quietly in the background. Recurring revenue on the books right now is Historic Miami Rentals at $225/month and Bottima Barbershop at $300/month. The best client outcome, "Never Miss a Job" running perfectly, is invisible to the owner. Invisible value churns.

Pit Board flips that. It is the one thing a client touches every single day, and it is the proof the rest of the system is working. It reuses assets Project Driver already owns: the GHL sub-accounts, the missed-call text-back workflow, Maya (AI receptionist), and the reporting Omar already promises on the Supported plan.

Owners do not want another dashboard. They want to know, before the first job, whether they missed anything and what it is costing them. That is a text.

## What arrives at 7:00 AM

**Text (three segments, no links):**

```
PIT BOARD · Coastal Air & Heat · Monday
Calls 14 (+3 vs avg) · Missed 4 (3 texted back)
New leads 6 · Booked 5
Reply time 4m · Score 84/100
Today: 4 jobs, first at 8:00a
On the table: 5 · Missed call, no text back: (954) 555-0142
Do this: Text back the missed call nobody answered. Every hour lowers the odds they still need you.
```

**Email (and private web link):** the four stats with a 7-day average, response score, "Do this today", the ranked money-on-the-table list with an Open button per item, and today's lineup with times and addresses. Mondays add a last-7-days recap.

**Money on the table, ranked:**

1. Missed calls with no text back within 10 minutes (yesterday)
2. Conversations where the customer spoke last, 2 hours to 14 days ago
3. Opportunities in an estimate/quote/proposal stage untouched for 3+ days
4. Unpaid or overdue invoices

**Response score (0-100):** 60% share of missed calls that got a text back within 10 minutes, 40% median first-reply speed to inbound texts (0 at 120 minutes). Quiet days score 100.

## Data sources (all read from the client's own GHL sub-account)

| Board item | GHL endpoint |
|---|---|
| Calls, missed, recovered, reply time | `GET /conversations/messages/export` (Call and SMS channels) |
| New leads by source | `POST /contacts/search` with a `dateAdded` range |
| Booked yesterday, today's lineup | `GET /calendars/` then `GET /calendars/events` per active calendar |
| Waiting on a reply | `GET /conversations/search?lastMessageDirection=inbound` |
| Estimates not booked | `GET /opportunities/search?status=open` + `GET /opportunities/pipelines` |
| Unpaid invoices | `GET /invoices/?status=sent|overdue|partially_paid` |
| Delivery | `POST /conversations/messages` (SMS and Email) to the owner contact |

Every source is fetched independently; if one fails the board still goes out and the failure is listed in `board.warnings`.

## Pricing

| Plan | Price | For | Project Driver's cost |
|---|---|---|---|
| Board | $97/mo | Existing GHL users who want the board | Near zero: GHL SMS/email usage, ~$1/mo per account |
| Crew | $247/mo | Owners who want the list worked for them | ~1.5 hours/week of a VA or Omar working the list |
| Pro | $497/mo | Never miss a call: Maya included, tuned monthly | Maya usage (currently sold alone at $247/mo) plus Crew labor |
| Agency | $39/sub-account/mo (first 10), $29 after, min 5 | GHL agencies white-labeling the board for their clients | Near zero per account |

Board is deliberately cheap to be an impulse "yes" for anyone already on GHL, and the daily habit it creates is the upsell path to Crew.

## The $500/day math

$500/day is $15,200/month. Three ways to get there; the realistic one is a mix.

| Mix | Accounts | MRR |
|---|---|---|
| Board only | 157 | $15,229 |
| Crew only | 62 | $15,314 |
| Owners mix: 25 Board + 30 Crew + 8 Pro | 63 | $13,811 |
| Owners mix + 1 agency at 50 sub-accounts | 63 + 50 | $15,371 |
| Owners mix + 3 agencies at 30 sub-accounts each | 63 + 90 | $16,721 |

The agency channel is what makes this reachable for a one-person shop: one GHL agency with 50 sub-accounts is worth more than 15 Board customers and costs one onboarding call.

Existing base to start from: two paying clients (HMR, Bottima) and the "Prospects" pipeline in GHL. Both current clients should get Pit Board free for 30 days as the reference stories.

## Launch plan (first 30 days)

**Week 1: turn it on for the house accounts**
1. Deploy this repo to Netlify at `pitboard.project-driver.com`. Set the env vars in the README.
2. Create a Private Integration token in the Project Driver sub-account and in HMR and Bottima. Add the three accounts to `PITBOARD_ACCOUNTS` with `sendSms: true`, a `viewKey`, and Omar plus the client owner as recipients.
3. Dry run: `POST /api/run {"dryRun": true}`. Read the boards. Fix any bucketing that looks wrong for those businesses (source names, stage names).
4. Send for real. Screenshot the first three boards for the site and social.

**Week 2: make it buyable**
5. In GHL, create the product "Pit Board" with three recurring prices ($97, $247, $497) and payment links. Put the links in `PITBOARD_CHECKOUT_*`.
6. Workflow "PD | PITBOARD | WF01 | Signup": trigger on tag `pitboard-signup`; SMS from Omar within 5 minutes ("Got your Pit Board request for {{contact.company_name}}. Want the 15-min connect call today or tomorrow?"); create opportunity in Sales pipeline; 2-day and 5-day follow-ups; internal notification.
7. Workflow "PD | PITBOARD | WF02 | Onboarded": trigger on tag `pitboard-active`; welcome email with what to expect at 7 AM; day-7 check-in text ("Score this week?"); day-30 review request.
8. Add a "Pit Board" line to the Supported and Fully Managed plan descriptions (it is included there) and a $97 add-on to Self-Managed.

**Week 3-4: distribution**
9. Email the whole Prospects pipeline and the newsletter list one screenshot of a real board with the subject "Did you miss anything yesterday?". One CTA: the sample page.
10. Post one board per weekday on the Project Driver Google Business Profile and socials (the Social Media Management product already does the posting).
11. Offer Maya demo requesters (the `maya-lead` tag) Pit Board Pro: they already want the phone answered.
12. Agency outreach: 20 GHL agencies in Florida, one message: "Your clients stop noticing the system you built. Here is the 7 AM text that fixes that. White-label, $39 a sub-account." Link to `/agencies/`.

## What is built vs. what is still manual

Built and tested in this repo:
- Daily scheduled send, per account, per time zone, with DST handled
- SMS, HTML email, plain text renderings
- Private per-owner web link and admin preview
- Multiple recipients per account
- Monday recap
- Signup API that files leads into Project Driver's GHL with plan and trade tags
- Marketing site: home, sample, pricing, start, agencies, thanks

Manual or next:
- Checkout links and the two GHL workflows above (15 minutes in GHL)
- Monthly pit-stop report: delivered by Omar on Crew/Pro, not generated
- Revenue by source on Pro: needs invoices joined to contact source; the data is available, not wired yet
- Agency self-serve onboarding: accounts are added by editing `PITBOARD_ACCOUNTS`; a small admin page or a GHL custom object would replace that once there are more than ~20 accounts
- Reply-to-act ("reply 1 to open the first item"): possible with a GHL inbound-SMS workflow calling `/api/board?format=text`

## Files

- `netlify/functions/lib/board.js`: every rule above, pure and unit-tested
- `netlify/functions/lib/render.js`: SMS (under 460 chars), email, text
- `netlify/functions/lib/ghl.js`: the API calls, one per data source
- `netlify/functions/lib/time.js`: local-day windows without a date library
- `data/sample_board.json`: the board on the website and in `/api/board`
