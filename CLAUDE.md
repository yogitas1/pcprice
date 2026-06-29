# PCPrice — Claude Code Working Memory

> This file is read at the start of every Claude Code session. It contains the full project context, stack, environment variables, and current build stage. Update the "Current Stage" and "Completed" sections at the end of each session.

---

## What We're Building

PCPrice is an autonomous trading exchange for collectibles (K-pop photocards, trading cards, sports cards, toys, comics, vinyl, and other gradable collectibles) — a stock market for physical collector items. Users upload inventory, set a price floor and sell-by date, and an autonomous agent prices, lists, negotiates, and closes the sale. On the buy side, users set standing buy criteria and the agent finds and executes verified matches automatically. Nothing transacts without passing a Quality Scanner (condition grading) and authenticity check, and every counterparty clears a credibility check. Full PRD: `PRD-Autonomous-Trading-Agent.md`.

---

## Stack

| Layer | Tool | Purpose |
|---|---|---|
| Frontend + deploy | Next.js 14 + Vercel | UI, routing, server components |
| Backend | Butterbase | Postgres DB, auth, file storage, edge functions, real-time, KV store |
| AI vision | OpenAI GPT-4o / GPT-4o-mini | Quality Scanner, authenticity verification, listing copy |
| Payments | Stripe Connect | Buyer checkout, seller payouts, escrow hold/release, take-rate |
| General comps | eBay Browse API | Sold comps + active listings for non-card collectibles |
| TCG card prices | JustTCG API | Real-time prices for Pokémon, Magic, Yu-Gi-Oh, etc. |
| TCG card catalog | Pokémon TCG API (pokemontcg.io) | Card names, sets, images for Pokémon |
| TCG card catalog | TCGdex (no key) | Card data for Magic, Yu-Gi-Oh, other TCGs |
| Sentiment — trends | Google Trends (pytrends, no key) | Search volume signals per entity |
| Sentiment — video | YouTube Data API v3 (free) | View velocity signals for artists/franchises |
| Sentiment — events | Internal events table (Butterbase) | Known upcoming releases, comebacks, tournaments |
| Shipping | EasyPost | Optional pre-paid label purchase, tracking webhooks |
| Email | Resend | Delivery alerts, escrow window notifications, payout confirmations |

**Reddit has been dropped** — commercial use restrictions and rate limits make it unsuitable. Sentiment is now handled by Google Trends + YouTube Data API + an internal events table, which is more reliable and fully free.

**TCGplayer API is closed to new developers** — use JustTCG for TCG pricing and eBay for general collectibles.

---

## Data Source Routing

| Item category | Catalog data | Price data |
|---|---|---|
| Pokémon cards | Pokémon TCG API | JustTCG API |
| Magic / Yu-Gi-Oh / other TCG | TCGdex (no key) | JustTCG API |
| Sports cards | Manual seed | eBay Browse API |
| K-pop photocards | Manual seed | eBay Browse API |
| Comics, toys, vinyl, other | Manual seed | eBay Browse API |

## Sentiment Source Routing

| Signal type | Source | How it's used |
|---|---|---|
| Search volume trend | Google Trends (pytrends) | trend_multiplier: rising search = demand signal |
| Video view velocity | YouTube Data API v3 | Spike in views on artist/franchise channel = demand signal |
| Known upcoming events | events table in Butterbase | Comeback, set release, tournament within 30 days = +0.1 multiplier |

---

## Environment Variables

### Frontend (.env.local)
```
NEXT_PUBLIC_BUTTERBASE_URL=
NEXT_PUBLIC_BUTTERBASE_ANON_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Backend / Edge Functions (Butterbase environment)
```
OPENAI_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
EBAY_APP_ID=
EBAY_CLIENT_SECRET=
POKEMON_TCG_API_KEY=
JUSTTCG_API_KEY=
YOUTUBE_API_KEY=
EASYPOST_API_KEY=
RESEND_API_KEY=
```

Note: Google Trends (pytrends) requires no API key — call directly from edge functions.

---

## Database Schema (Butterbase / Postgres)

```sql
-- Catalog items (all collectible categories)
catalog_items (id, name, category, group_name, set_name, version, print_run,
               retail_price, rarity_tier, reference_image_url, created_at)
-- category: tcg | sports_card | kpop_photocard | comic | vinyl | toy | other

-- User inventory items
items (id, user_id, catalog_id, condition_grade, authenticity_score,
       authenticity_status, photos[], scan_status, created_at)
-- scan_status: pending_scan | needs_more_photos | pending_auth |
--              manual_review | verified | rejected

-- Active sell listings
listings (id, item_id, seller_id, floor_price, current_price, sell_by_date,
          status, listing_copy, created_at)
-- status: active | sold | expired | paused | cancelled | floor_reached

-- Listing price history (audit trail — every change logged)
listing_price_history (id, listing_id, old_price, new_price, reason, changed_at)

-- Buy orders (standing limit orders)
buy_orders (id, buyer_id, catalog_id, max_price, min_condition_grade,
            min_seller_tier, execution_mode, spend_cap_mode, spend_cap_amount,
            stripe_payment_intent_id, status, created_at)
-- execution_mode: auto_buy | approve_to_buy
-- spend_cap_mode: per_tier | global
-- status: active | filled | cancelled | reauth_failed

-- Transactions (completed or in-progress sales)
transactions (id, listing_id, buy_order_id, buyer_id, seller_id, sale_price,
              stripe_payment_intent_id, escrow_status, delivered_at,
              confirmed_at, auto_release_at, created_at)
-- escrow_status: held | awaiting_confirmation | released | auto_released |
--                disputed | refunded

-- Market data (sold comps + active listings)
market_comps (id, catalog_id, price, condition, source, is_sold,
              listed_at, sold_at, created_at)
-- source: ebay | justtcg

-- Pricing engine outputs
item_valuations (id, catalog_id, fair_value, quick_sale_price, hold_price,
                 sell_through_rate, momentum, sentiment_multiplier,
                 confidence_score, captured_at)

-- Sentiment signals (Google Trends + YouTube + events)
sentiment_signals (id, catalog_id, entity_name, trend_multiplier,
                   google_trends_score, youtube_view_velocity,
                   signals[], captured_at)

-- Known events driving demand (manually maintained)
events (id, catalog_id, entity_name, event_type, event_date, multiplier_boost, notes)
-- event_type: comeback | set_release | tournament | anniversary | movie_release | other

-- Seller/buyer credibility
seller_profiles (id, user_id, score, tier, external_accounts jsonb,
                 stripe_account_id, created_at)
-- tier: new | verified | trusted | power_seller

-- Review queue (items needing human authenticity review)
review_queue (id, item_id, ai_assessment, flags[], status, created_at)

-- Trust & safety
reports (id, reporter_id, reported_user_id, report_type, evidence_urls[],
         description, status, created_at)
-- report_type: counterfeit | non_delivery | misrepresentation | scam

appeals (id, report_id, seller_id, evidence_urls[], description,
         status, reviewed_at)

scammer_db (id, user_id, email, linked_accounts jsonb, ban_reason, banned_at)

-- Match log (audit trail for matching engine)
match_log (id, buy_order_id, listing_id, matched_at, outcome, outcome_reason)
-- outcome: no_match | pending_approval | auto_executed | declined
```

---

## Key Business Rules (never violate these)

1. **No item lists without passing Quality Scan + Authenticity check** — `scan_status` must be `verified` before a listing can be created. Enforce at both API and UI level.
2. **Price never drops below `floor_price`** without explicit seller re-confirmation.
3. **Auto-release fires exactly 3 days after confirmed delivery** — window starts on delivery timestamp from carrier, not shipment date.
4. **Buyer must receive a "your item arrived" notification immediately** when tracking shows delivered — 3 days is short and buyers must know the clock is running.
5. **Platform is not liable for lost/damaged packages** — this disclaimer must appear in-flow at the shipping step, not only buried in ToS.
6. **Off-platform payment requests must be flagged** and never facilitated by the agent.
7. **Auto-buy spend caps are hard limits** — agent cannot exceed them under any circumstance.
8. **External credibility (eBay reviews) is weighted at max 30%** of starting score and never grants top tier outright.
9. **Do not call TCGplayer API** — closed to new developers. Use JustTCG for TCG prices.
10. **Do not use Reddit API** — commercial restrictions make it unsuitable. Use Google Trends + YouTube instead.
11. **Every price change must be written to `listing_price_history`** — nothing changes silently.

---

## AI Model Usage

| Task | Model | Reason |
|---|---|---|
| Catalog item auto-match | gpt-4o-mini | Simple classification, low cost |
| Quality Scanner (condition grading) | gpt-4o-mini | Cheap, good enough for grading |
| Authenticity verification | gpt-4o | Accuracy critical, worth the cost |
| Listing copy generation | gpt-4o-mini | Simple text task, low cost |

---

## Build Stages

- [x] Stage 0 — Integrations setup (all API keys, accounts, webhooks)
- [x] Stage 1 — Foundation & auth (Next.js + Butterbase + Vercel)
- [x] Stage 2 — Catalog & inventory intake (upload, catalog match, Quality Scanner)
- [x] Stage 3 — Authenticity verification pipeline
- [x] Stage 4 — Pricing engine (eBay + JustTCG comps, fair_value formula, sentiment layer)
- [x] Stage 5 — Sentiment migration + sell-side listings & agent repricing
- [x] Stage 6 — Buy orders & matching engine
- [x] Stage 7 — Payments, escrow & shipping (Stripe + EasyPost + Mercari-style release)
- [x] Stage 8 — Seller credibility & trust & safety
- [x] Stage 9 — Live price chart UI & dashboards

---

## Current Stage
**Stages 0–9 complete. All build stages done.**

## Session Log
- Session 1: Set up all integrations, confirmed env vars.
- Sessions 2–5: Built foundation, catalog/intake, authenticity pipeline, and pricing engine.
- Session 6: Stage 5 — Sentiment migration + sell-side listings + repricing agent. Part A: Rewrote fetch-sentiment to use Google Trends (no key) + YouTube Data API v3 (YOUTUBE_API_KEY) + events table; dropped Reddit entirely. Schema added: listing_offers table, events table, listings.shipping_from, sentiment_signals.google_trends_score + youtube_view_velocity. Seeded 3 test events (BTS comeback Jul 15, BTS anniversary Jul 9, BLACKPINK comeback Jul 20). Part B: Deployed create-listing (verified gate, GPT-4o-mini copy gen, price history write, KV flag), reprice-listing (pct_elapsed tiers 5/7/10%, floor_reached → Resend email), expire-listings (batch expire + Resend emails), handle-offer (auto-accept at asking, auto-counter 90–97% band, notify seller below floor), reprice-scheduler (cron 0 10 * * *), expire-scheduler (cron 0 9 * * *). Frontend: /dashboard/inventory/[id]/list (2-step form → price selection → create), /listings/[id] (photos, condition grade, auth score + tooltip, seller tier badge, price vs fair value indicator, price history Recharts chart, Buy/Make Offer CTA). Updated middleware to protect /listings. Added Listing/ListingPriceHistory/SellerProfile types. Added "Create listing →" CTA to inventory page for verified items. NOTE: YOUTUBE_API_KEY must be added to fetch-sentiment env vars in Butterbase dashboard (console.cloud.google.com → YouTube Data API v3 → Credentials).
- Session 10: Stage 9 complete — 2 Butterbase functions (manage-listing, get-platform-stats) + 5 frontend pages. /admin/events (CRUD for sentiment events table; catalog typeahead, event type/date/boost slider, inline edit/delete; admin-guarded). /catalog/[id] (ticker view: Recharts ComposedChart with Line=fair_value 90d, Scatter=sold comps averaged per day, Area band=active listing min/max via stackId, ReferenceLine=events; stat cards for Fair Value/Sell-Through Rate/14d Momentum/Data Confidence/Sentiment Signal; real-time subscription on item_valuations INSERT; List This Item button gated on verified item ownership; Create Buy Order button). /dashboard/inventory (full rewrite: summary row with Active Listings/Pending Payout/Lifetime Sold/tier badge; ItemCard with sparkline from listing_price_history 14d, deadline progress bar, offer count, quick-action buttons Pause/Resume/Pull + inline Lower Floor and Extend Deadline inputs; status badge from scan_status or listing.status; real-time subscription on listings; calls manage-listing function). /dashboard/buy-orders (enhanced: delivered items awaiting confirmation with EscrowCountdown auto-release timer; real-time subscriptions on match_log INSERT and transactions UPDATE; live notification feed for match/delivered/payout/dispute/reauth events; Confirm Receipt + Report Issue CTAs). /admin (tabbed dashboard — tabs: Platform Stats/Review Queue/Disputes/Reports/Scammer DB; admin guard on load; Platform Stats calls get-platform-stats function showing 8 KPIs; Review Queue calls admin-review-queue/admin-review-action inline; Disputes queries disputes table; Reports sorted by reports-per-user severity count; Scammer DB with email/username search + table; links to /admin/appeals and /admin/events and /admin/review).
- Session 9: Stage 8 — Seller credibility & trust & safety. Schema migration 16: added catalog_items.category (text), seller_profiles.sales_count (integer default 0). Deployed 7 functions: update-credibility (SCORE_DELTAS: sale_completed +3, authenticity_passed +2, condition_accurate +2, fast_ship +1, dispute_opened -8, dispute_confirmed -15, auth_rejected -5, report_received -3, report_confirmed -10, appeal_approved +3; tiers: New 0–30 / Verified 31–55 / Trusted 56–79 / Power Seller 80–100; floor 0 cap 100; Resend email on tier change up or down; increments sales_count on sale_completed), import-ebay-reputation (eBay Feedback API via client_credentials OAuth; raw boost tiers 5/10/18/25 × 0.30 → max ~8 pts; SILENT scammer_db cross-check on email + eBay username — auto-flags for admin, never reveals to user; score boost applied once on first link only), submit-report (validates type, writes reports, fire-and-forget update-credibility report_received, auto-pauses active listings on 3rd+ non-dismissed report), submit-appeal (one appeal per report; verifies report is against current user), admin-review-appeal (admin-only; approve: appeal_approved credibility + restore listings + dismiss report + email; deny: report_confirmed credibility + email; request_more_info: email; guards already-resolved), ban-user (admin-only; writes scammer_db, cancels all active/paused listings, PATCH Butterbase auth admin API to ban), check-new-user (signup scammer check — SILENT ban if email matches scammer_db). Frontend: /dashboard/settings/reputation (ScoreBar with tier zone dividers, eBay link form, re-link support, score_added feedback), /sellers/[id] (public profile — tier badge + ScoreBar, sales count, member since, eBay verified badge), /admin/appeals (admin-check on load; pending/all filter toggle; AppealCard: side-by-side report+appeal, Approve/Deny/Request Info buttons with optional reason, refetches on action). Updated settings page to add Seller Reputation nav card. NOTE: Wire check-new-user to Butterbase post-signup auth webhook in Butterbase dashboard.
- Session 8: Stage 7 — Payments, escrow & shipping. Schema migration 15: created disputes table; added stripe_account_id to seller_profiles; added tracking_number, carrier, tracker_id, easypost_shipment_id, label_url, ship_by_deadline, buyer_shipping_address, application_fee to transactions; added shipping_address to user_profiles. Deployed 11 functions: stripe-connect-onboard (creates Express account + onboarding link, stores account_id before redirect), stripe-connect-return (checks charges_enabled on return), execute-purchase (captures PI at sale_price cents, 8% fee, creates transaction held, marks listing sold + buy_order filled, 3-business-day ship_by_deadline, emails buyer + seller), get-shipping-rates (EasyPost shipment create, returns USPS/UPS/FedEx rates sorted by price), buy-label (purchases EasyPost label, stores tracker_id + label_url), register-tracking (manual tracking number → EasyPost tracker registration), easypost-webhook (on delivered: sets delivered_at + auto_release_at=+72h + awaiting_confirmation, immediate buyer email with confirm/dispute CTAs + low-value photo prompt for <$50), confirm-receipt (transfer payout_cents to seller stripe_account_id, sets released), flag-issue (sets disputed, creates dispute row, emails both parties), auto-release-escrow (transfers 92% at 72h with no buyer action, sets auto_released), auto-release-scheduler (cron */30 * * * *). Frontend: /dashboard/settings/payouts (Stripe Connect onboarding flow, status: not_connected/pending/connected), /dashboard/inventory/[id]/ship (order summary, choose label vs self-ship, rates grid, MANDATORY identical disclaimer in both paths, label purchase + download, tracking registration). NOTE: Register easypost-webhook URL in EasyPost dashboard: https://api.butterbase.ai/v1/app_w2wmfcnqn2j2/fn/easypost-webhook
- Session 7: Stage 6 — Buy orders & matching engine. Schema migration 14: added spend_cap_tiers jsonb, stripe_payment_intent_id, last_reauth_at to buy_orders; expires_at, listing_snapshot jsonb to match_log. Installed @stripe/stripe-js + @stripe/react-stripe-js. Deployed 7 functions: create-buy-order (PI with capture_method=manual + confirm=false, returns client_secret), reauth-order (cancel+recreate PI every 6 days, Resend email on failure), run-matching (every 15 min; MANDATORY verified-only filter; tier CASE expression; spend cap enforcement per global/per_tier mode; auto_buy calls execute-purchase stub; approve_to_buy writes pending_approval + 24h expires_at + Resend email), approve-match (re-validates listing still active + within max_price, triggers execute-purchase), decline-match (buy order stays active, agent resumes), matching-scheduler (cron */15 * * * *), reauth-scheduler (cron 0 8 * * *). Frontend: /dashboard/buy-orders (pending approval section with Countdown timer + Approve/Decline buttons, 30s poll, active orders grid), /dashboard/buy-orders/new (catalog typeahead, max price, condition slider 1–5, tier select, execution mode toggle, spend cap none/global/per-tier, Stripe CardElement for pre-auth). Added BuyOrder/MatchLog/ListingSnapshot types to lib/types.ts.


