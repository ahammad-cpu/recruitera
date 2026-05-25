# Recruitera CRM v7 — Project Context for Codex

## What this is
A single-file CRM (HTML + inline CSS + inline JS) deployed to Vercel at `crm.recruitera.ai/crm`. Pulls data from Supabase. Connects to Bubble.io via edge functions for sync.

## Key file
- `crm.html` — the entire app, ~580KB single file with 7 inline `<script>` blocks. Edit this directly.

## Tech stack
- **Frontend**: Vanilla JS, no framework. Inline CSS with custom properties.
- **Backend**: Supabase project `rtdrlpnfqjtwtsrwnifn` (eu-central-1)
- **Data sync**: Bubble.io → Supabase via 3 edge functions (every 15min cron)
- **Hosting**: Vercel (static)

## Supabase project ID
`rtdrlpnfqjtwtsrwnifn`

## Database tables
- `accounts` — main companies table (486 rows). Key columns: `id`, `bubble_id`, `name`, `domain`, `stage`, `source`, `am_mail`, `paid_status`, `activation_status`, `has_trial`, `company_ref`, `utm_*`, `wp_marketing_channel`, `raw_data`, `created_at`, `bubble_created_at`
- `marketing_tracking` — first/last touch attribution per trial signup. FK to accounts via `company_ref`
- `paid_customers` — paid customer records from Bubble
- `contacts` — contact persons per account
- `activities` — notes, calls, emails, meetings, tasks logged per account
- `profiles` — user auth profiles
- `sync_config`, `sync_state` — for edge function sync state
- `tags`, `account_tags` — tagging (unused in current UI)
- `icp_scores` — ICP scoring saved per account
- `stage_history` — stage change log

## Edge functions deployed
1. `bubble-sync` v6 — pulls Unified_Company from Bubble → upserts to accounts
2. `sync-paid-customers` v7 — pulls Company (paid path) → upserts to paid_customers + updates accounts paid_status
3. `sync-marketing-tracking` v1 — pulls Marketing_Tracking → upserts to marketing_tracking

## STATUS pill logic (Accounts table)
- `paid_status` IN ('Paid', 'Without Charge') AND `activation_status` = 'Active' → ● Paid (green)
- Everything else → ● Prospect (purple)
- Function: `isLeadPaidCustomer(lead)`

## Main views (controlled by `switchMainView(view)`)
- `board-view` — Sales Pipeline (default, visible on load). Block element with `flex:1`.
- `accounts-view` — Accounts table. `position:absolute; top:0; bottom:0; overflow-y:auto`
- `insights-view` — Insights/Analytics. Same positioning as accounts-view.
- `lead-page` — Lead detail overlay. `position:absolute; inset:0; z-index:50`. Toggled via `.open` class.

## Layout chain (important — don't break this)
```
.app (height:100vh, flex row)
  .sidebar (fixed width 64px, expands on mobile)
  .main (flex:1, flex-col, overflow:hidden)
    .topbar (60px, flex-shrink:0)
    .content (flex:1, overflow:hidden, position:relative, display:flex, flex-direction:column, min-height:0)
      board-view (flex:1, overflow:auto, block layout for children stack)
      accounts-view (position:absolute, top:0/bottom:0, overflow-y:auto)
      insights-view (position:absolute, top:0/bottom:0, overflow-y:auto)
      lead-page (position:absolute, inset:0, z:50, hidden until .open)
```

## Key JS functions
- `sbFetch()` — loads accounts from Supabase REST API with pagination
- `init()` — called after data loads. Seeds localStorage cache, calls renderBoard/kpis/updateDisqCount
- `renderBoard()` — renders pipeline columns
- `renderAccountsTable()` — renders accounts table
- `renderLdHero(lead)` — renders the hero card on lead detail page (wrapped in try/catch for visibility)
- `renderLdRight(lead)` — renders the right rail (Contact Person, Company Details, Attribution panels)
- `switchMainView(view)` — pipeline | accounts | insights
- `openDrawer(id, from)` — opens lead detail page
- `closeDrawer()` — closes lead detail page

## Recently completed work
- ✅ Added attribution fields to accounts (utm_*, wp_marketing_channel, etc.)
- ✅ Created marketing_tracking table for first/last touch attribution
- ✅ Updated bubble-sync edge function (v6) to pull attribution fields
- ✅ Created sync-marketing-tracking edge function (v1)
- ✅ Redesigned Accounts page (tabs, filters incl Trial filter, ICP column instead of HEALTH)
- ✅ Redesigned Lead Detail hero card (avatar + name + stage pill + 7-cell stat strip)
- ✅ Added Tags panel — then REMOVED on user request
- ✅ Added ld-actions-row to hero — then REMOVED on user request (kept only the composer below tabs)
- ✅ Added Recruitera logo as favicon (embedded base64 PNG)
- ✅ Mobile sidebar redesign (240px width, full labels when open)
- ✅ Layout fixes: views use proper flex/absolute positioning, no gaps on Accounts/Insights

## Recently fixed bugs
- Sales Pipeline showing blank on load (board-view had `display:none` default)
- Accounts/Insights showing 300px gap (views had `top:60px` inside .content which was already below 60px topbar)
- Accounts table not scrolling (was missing `min-height:0` on flex chain)
- Tags panel showing literal `${renderLdTags(id)}` text (escaped template literal)
- Hero card top section missing (template literal nested escape issue in trial cell)

## Known caveats
- Dead code still in file: `ldQuickLog()`, `ldAddTag()`, `ldRemoveTag()`, `renderLdTags()` functions exist but are no longer called from UI. Safe to delete but harmless to leave.
- The file has multiple CSS override blocks for the same selectors (legacy theme overrides). Be careful when editing CSS — check for `!important` overrides.
- The file has 7 separate `<script>` blocks. Validate with `node --check` after edits.

## Deployment
File is deployed via Vercel. To update:
1. Edit `crm.html` directly
2. Commit & push to the Vercel-connected git repo
3. Vercel auto-deploys
4. Hard refresh browser (Cmd+Shift+R) to bypass cache

## Pending work
- Dashboard for traffic sources using marketing_tracking data (not yet built)
- Cron schedule for sync-marketing-tracking edge function (not yet configured)

## Testing approach
- JS syntax: `node --check` each extracted `<script>` block
- Layout: open in browser, check Sales Pipeline + Accounts + Insights + Lead Detail render correctly
- Data: check browser console for `[CRM] sbFetch returned X accounts` — should be 486

## ⚠️ Bubble sync PAUSED (2026-05-24 — security review)
Per CTO security review, all Bubble→Supabase syncs are paused and the
Bubble API key removed from everywhere:
- 3 pg_cron jobs (bubble-sync, sync-paid-customers, merge-duplicates) **unscheduled**
- `sync_config.api_key` deleted + `enabled = false`
- `sync-paid-customers` redeployed (v9): hardcoded key removed; now reads
  `BUBBLE_API_KEY` / `BUBBLE_URL` from Supabase secrets and **no-ops** if absent
The CRM keeps serving the data already in Supabase; it just won't refresh
from Bubble until a key is re-added as a secret and the crons are re-scheduled.
