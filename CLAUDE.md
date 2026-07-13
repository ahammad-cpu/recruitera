# Recruitera CRM v7 — Project Context for Claude Code

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

## Recruitera V2 — Design tokens (source of truth)
Imported from the Claude Design handoff (`design-handoff/project-recruiter-v2/`).
These override the boring gray/green palette in the earlier V2 Nuxt spec —
the design uses a lime + deep-teal brand.

**Backgrounds**
- Canvas: `#f7f8f9` — app background
- Content: `#FFFFFF` — cards, panels, table cells
- Sidebar panel: `#F9FAFB` (Settings sidebar is same `#f7f8f9`)
- Lime tint: `#f4f7ec` / `#f4f7ef` — hover states, subtle highlights
- Trial banner: `#FBF5D5` bg + `#4b4636` text + `#33301f` link

**Text**
- Primary: `#1a2b28` — dark forest
- Secondary / labels: `#3a4742`, `#5b6b5f`
- Muted / placeholder: `#8a978f`, `#6b7a74`
- Uppercase field labels: `#8a978f`, `letter-spacing:0.04em`

**Accents**
- Lime: `#C9FD13` — brand accent, active nav pill background at `rgba(201,253,19,0.28–0.38)`
- Lime-on-lime text: `#3f5600` — dark olive, used on lime pills and active nav items
- Deep teal CTA: `#002427` — primary button bg + white text; also `.s-tab.active` underline
- Deep teal (secondary): `#127295` — used in the design-system doc for teal CTAs on light

**Borders**
- Neutral: `#dfe3db`, `#e6e9e1`, `#c8cfc6`
- Focus ring: `#002427` (input `border-color` on focus)

**Nav — active state pattern**
```
.s-child.active { background: rgba(201,253,19,0.28); color: #3f5600 }
.s-child.active .s-bar { background: #3f5600 }   /* 2px left rail */
```
NOT the earlier spec's `#F0FDF4` bg / `#15803D` text / `#16A34A` left border — that spec is superseded.

**Typography**
- Family: system UI (`-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif`) — no webfont download
- Sizes in the design: 11 (uppercase labels) · 12.5–13.5 (secondary) · 14 (body) · 15 (form values) · 16 (subsection titles) · 18 (nav title) · 20 (page title within sections) · 32 (page hero)
- Tabular-nums for data/meta lines

**Radii**
- 6 (chips) · 8–9 (form controls, s-btn) · 10 (cards, primary buttons) · 12 (larger inputs) · 16 (design-system-showcase cards) · 999 (pills)

**Shell dimensions**
- Trial banner height: auto (~40px, padding 10px 48px)
- Top bar: 52px
- Left settings sidebar: 232px wide
- Content padding: varies per section, page-content lives in a scrollable column

## Recruitera V2 — Security & Performance (hard rules)

Applied globally to the Nuxt app. Never regress these.

### Security
- **Security headers** — set in [nuxt.config.ts](recruitera-v2/nuxt.config.ts) `routeRules['/**'].headers`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` locking camera/mic/geo/payment, and CSP-Report-Only. `Strict-Transport-Security` is commented out — enable only once CTO confirms HTTPS hosting (irreversible for 1 year once sent).
- **Auth tokens NEVER in localStorage.** Mock store [auth.store.ts](recruitera-v2/app/stores/auth.store.ts) uses `sessionStorage` as a dev stand-in with `TODO`. When the real API is connected, the server sets an HttpOnly cookie — the frontend never reads the token.
- **All API calls go through [useApi](recruitera-v2/app/composables/useApi.ts)** — it sends `credentials: 'include'` (cookies) and `X-Requested-With: XMLHttpRequest` (CSRF signal). Never call raw `fetch` for mutations.
- **Zod schemas validate every form** before submission. See [types/candidate.schema.ts](recruitera-v2/app/types/candidate.schema.ts). Wire with `vee-validate` + `toTypedSchema`.
- **No `v-html`** anywhere except the future email-template preview and job-description preview components. When those exist, sanitise with `DOMPurify` before rendering.
- **Runtime config** — public values in `runtimeConfig.public`, secrets in `runtimeConfig` root (server-only). `.env` is gitignored; commit `.env.example` with fake values.
- **Auth + subscription middleware** — [middleware/auth.ts](recruitera-v2/app/middleware/auth.ts) and [subscription.ts](recruitera-v2/app/middleware/subscription.ts) exist as skeletons. Apply per-page via `definePageMeta({ middleware: ['auth', 'subscription'] })` once real login/subscription state ship (don't register globally yet — no auth pages exist).
- **Dependency audit** — run `npm audit` after every install; block CI on high-severity.

### Performance
- **Vue Query** — shared config in [lib/query-client.ts](recruitera-v2/app/lib/query-client.ts): `staleTime 60s`, `gcTime 5min`, `retry 1`, `refetchOnWindowFocus false`. `keepPreviousData` on any paginated/filtered query.
- **SSR strategy** — [nuxt.config.ts](recruitera-v2/nuxt.config.ts) `routeRules`: auth pages SSR (fast TTFB); app pages SPA (they're behind auth, no SEO value).
- **`isFetching` dim** — table shows old data at opacity 60 while new data loads. Never blank the table during a filter change.
- **`ErrorBoundary`** ([components/ErrorBoundary.vue](recruitera-v2/app/components/ErrorBoundary.vue)) — wrap heavy sections (candidates table, filter panel, upcoming detail panel). Uses `onErrorCaptured` with `return false` to stop propagation.
- **Lazy-load heavy components** — `defineAsyncComponent(() => import(...))` for modals, popovers, detail panels. `SaveSearchPopover` is already lazy on [candidates/index.vue](recruitera-v2/app/pages/candidates/index.vue).
- **Skeletons match real row height** — `TableRow` and `Skeleton` row are both `h-12`. Prevents CLS on data load.
- **Named lucide imports only** — `import { Users } from 'lucide-vue-next'`, never `import * as Icons`.
- **Avatar dimensions reserved** — `w-8 h-8 rounded-full bg-...` on the placeholder before the image loads, so no CLS.
- **Bundle target** — `< 200KB` gzipped on first load. Audit with `npx nuxi analyze` after `nuxt build`.
- **Core Web Vitals targets** — LCP < 2.5s, CLS < 0.1, INP < 200ms. Check Lighthouse ≥ 90 desktop / ≥ 75 mobile before every release.

### Deferred to when the context exists
- **HttpOnly cookie auth + `GET /api/me`** — after real API ships.
- **`DOMPurify`** — when the first `v-html` component (email template preview, job description) is built.
- **`@nuxt/image` + `@nuxt/fonts`** — when there are real user-uploaded images / a custom font choice is made.
- **Virtual scrolling** — if any list ever switches from pagination to infinite scroll.

## Recruitera V2 — Design system (source of truth for reuse)

**Two hard rules for every new component or page:**

1. **No hex codes in .vue files.** Every color comes from a token in [recruitera-v2/app/assets/css/main.css](recruitera-v2/app/assets/css/main.css). Use `bg-[var(--brand-xxx)]`, `text-[var(--brand-xxx)]`, `border-[var(--brand-xxx)]`. Change any value in `main.css` → propagates instantly through the whole product. If you need a color that isn't in the token list, ADD IT to main.css first, then use it. Do not paste `#hex` codes anywhere.

2. **Reuse brand primitives before writing new markup.** Live in [recruitera-v2/app/components/brand/](recruitera-v2/app/components/brand/) and re-exported via `~/components/brand`. When you finish building any new pattern that's likely to appear on another page, extract it here so future pages inherit changes automatically.

### Existing brand primitives

See [recruitera-v2/app/components/brand/README.md](recruitera-v2/app/components/brand/README.md) for the full inventory and usage examples.

| Component | Purpose |
|---|---|
| `BrandButton` | shadcn Button + brand variants: `primary-teal` / `primary-lime` / `outline` / `ghost` / `danger-ghost` |
| `BrandSearchBar` | Icon + pill input, optional ⌘K hint — every search input |
| `BrandPageTitle` | H1 + optional star favorite — every page hero |
| `BrandDataTable` | Table outer chrome (border, radius, shadow, horizontal scroll) — every list-view table |
| `BrandEmptyState` | Icon + title + description + CTA slot — every "no results" state |
| `BrandCountBadge` | Small gray count pill; zero-state auto-grays |
| `BrandLimeCheckbox` | shadcn Checkbox with lime-fill + olive-tick |
| `BrandSectionTitle` | Uppercase bold section header ("FAVORITES") |
| `BrandFilterGroup` | Filter group wrapper (title + × clear + slot) |
| `BrandFilterOption` | Checkbox row in a filter group (checkbox + label + count) |
| `BrandFavoriteItem` | Favorite row with drag handle + count badge |

**Never write raw inline** `bg-[var(--brand-teal)] text-white h-9 rounded-lg` buttons or `bg-[var(--brand-topbar-pill-bg)] pl-10 ...` search inputs on new pages — use `BrandButton` / `BrandSearchBar`.

### Token categories (all in `main.css`)

- **Brand accent**: `--brand-lime`, `--brand-lime-tint`, `--brand-lime-active-bg`, `--brand-olive`
- **CTA**: `--brand-teal`, `--brand-teal-secondary`
- **Canvas + surfaces**: `--brand-canvas`, `--brand-surface-white/badge/hover/table-alt`
- **Text scale**: `--brand-text`, `-secondary`, `-muted`, `-subtle`, `-quiet`, `-disabled`, `-faint`, `-nav-text`
- **Icons**: `--brand-icon-default`, `--brand-icon-muted`
- **Borders**: `--brand-border`, `-light`, `-mid`, `-divider`, `-fade`, `-key`
- **Semantics**: `--brand-danger`, `--brand-banner-*`, `--brand-topbar-pill-*`

### When to add a new brand primitive

If any of these apply, extract it:
- The pattern appears in 2+ places (or is likely to)
- The design has a specific look that shadcn defaults don't give you
- Removing it would mean copy-pasting >10 lines of Tailwind

Where to put it: `app/components/brand/BrandXxx.vue`, then export from `app/components/brand/index.ts`.

### Example: reusing on a future page (e.g. Jobs)

```vue
<script setup lang="ts">
import { BrandSectionTitle, BrandFilterGroup, BrandFilterOption } from '~/components/brand'
</script>

<template>
  <BrandSectionTitle label="Filters" />
  <BrandFilterGroup title="Department" :active="hasFilter" @clear="clear">
    <BrandFilterOption
      v-for="opt in options" :key="opt.value"
      :label="opt.label" :count="opt.count"
      :model-value="selected.includes(opt.value)"
      @update:model-value="toggle(opt.value)"
    />
  </BrandFilterGroup>
</template>
```

Change the brand's lime accent later? Update `--brand-lime` in `main.css` — every checkbox, hover, and active-state across the whole app updates.

## Recruitera V2 — Nuxt 4 app scaffold (built 2026-07-11)
Location: `recruitera-v2/` (sibling to `crm.html`).
- Nuxt 3.15 + `future.compatibilityVersion: 4` — `app/` source dir
- Tailwind CSS v4 via `@tailwindcss/vite` + `@tailwindcss/postcss` (postcss.config.js)
- shadcn-vue components generated into `app/components/ui/` (21 components installed)
- Vue Query + Pinia + MSW + VeeValidate/Zod + lucide-vue-next
- Design tokens applied in `app/assets/css/main.css` — lime + deep teal (see the V2 design tokens section above)
- **shadcn-nuxt module was removed** — it hard-installs `@nuxtjs/tailwindcss` which conflicts with Tailwind v4. Auto-import of `app/components/ui/**` works via Nuxt's default components directory. `cn()` util in `app/lib/utils.ts`, imported from `@/lib/utils` (Nuxt alias resolves to `app/`).
- Dev server: `npm run dev --prefix recruitera-v2 -- --port 3100`, or `.claude/launch.json` "recruitera-v2" entry.

Phase 1 pages (fully built):
- `/candidates` — filters sidebar + table, MSW returns 30 mock candidates, brand tokens intact
- `/settings/locations` — table with 3 mock locations, edit/more actions
- `/settings/templates/email` — 3-column layout, 10 templates grouped by category, auto-selects default

All 22 module routes exist as "Coming soon" placeholders. To fill any of them in later, follow the repeatable steps in the V2 spec (types → mock handler → composable → store (if UI state) → page).

Known minor issue: hydration mismatch warning on Settings pages — `SettingsSidebar`'s `openKey` is set inside `watchEffect` on client only. Harmless. Fix later with `useState` or SSR-safe initial value.

## Recruitera V2 — Settings module (built 2026-07-11)
- Single-file `settings.html` at repo root, ported from `design-handoff/.../Recruitera Settings.dc.html`
- 29 fully-built section panels toggled by left nav (`.s-child[data-section]` → `.sec#sec-<name>` show/hide)
- Groups: Company (8) · Workflow (6) · Templates (10) · Team (2) · My Account (3)
- Vanilla HTML/CSS/JS, same pattern as `crm.html` / `crm-v2.html`
- Local dev: `.claude/launch.json` runs `npx serve` on :7890, hit `http://localhost:7890/settings`
- Vercel deploy needs a rewrite: `{ "source": "/settings", "destination": "/settings.html" }` in `vercel.json`

**Port transformations applied** (from the `.dc.html` source):
- Stripped `<x-dc>`, `<helmet>`, `<script src="./support.js">`
- Converted `class Component extends DCLogic { componentDidMount() {…} setupCareerSite() {…} renderVals() {…} }` into a plain `document.addEventListener("DOMContentLoaded", function() { … function setupCareerSite() {…} })` and `this.setupCareerSite()` → `setupCareerSite()`
- Added a `[style-hover]` polyfill (26 usages) that toggles inline style on mouseenter/leave
- Removed the design's pre-set `active` on Profile nav and pre-set `open` on My Account accordion (both conflicted with the init script's default of showing Company info)

## ⚠️ Bubble sync PAUSED (2026-05-24 — security review)
Per CTO security review, all Bubble→Supabase syncs are paused and the
Bubble API key removed from everywhere:
- 3 pg_cron jobs (bubble-sync, sync-paid-customers, merge-duplicates) **unscheduled**
- `sync_config.api_key` deleted + `enabled = false`
- `sync-paid-customers` redeployed (v9): hardcoded key removed; now reads
  `BUBBLE_API_KEY` / `BUBBLE_URL` from Supabase secrets and **no-ops** if absent
The CRM keeps serving the data already in Supabase; it just won't refresh
from Bubble until a key is re-added as a secret and the crons are re-scheduled.
