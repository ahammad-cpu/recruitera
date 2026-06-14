# Recruitera CRM v7 — Full Specs & Module Reference

Living spec for the Recruitera internal CRM. Reflects everything shipped through **2026-06-14**.

- **App URL**: `crm.recruitera.ai/crm`
- **Repo**: a single-file vanilla-JS HTML app (`crm.html`, ~620KB, 15 inline `<script>` blocks)
- **Hosting**: Vercel (static)
- **Auth + DB**: Supabase (project `rtdrlpnfqjtwtsrwnifn`, region `eu-central-1`)
- **Staging DB**: `oswuvlahxlktxjzqudxg` (also home of the Competitive Hub tables)

---

## 1. Architecture

```
                   ┌──────────────────────────────────────┐
                   │              Bubble.io               │
                   │  Unified_Company · Company           │
                   │  Marketing_Tracking                  │
                   └──────────────┬───────────────────────┘
                                  │ every 15 min (pg_cron)
                  ┌───────────────┴────────────────┐
                  ▼                                ▼
       ┌────────────────────┐         ┌────────────────────────┐
       │   bubble-sync      │         │ sync-paid-customers    │
       │   (v13, Unified)   │         │ (v16, Company)         │
       └─────────┬──────────┘         └───────────┬────────────┘
                 ▼                                ▼
        ┌─────────────────────────────────────────────┐
        │       Supabase  (eu-central-1)              │
        │   ┌─────────────┐  ┌────────────────────┐   │
        │   │  accounts   │  │  paid_customers    │   │
        │   │  contacts   │  │  contract_cycles   │   │
        │   │  activities │  │  marketing_tracking│   │
        │   │  tags       │  │  notifications     │   │
        │   │  profiles   │  │  roles + abac      │   │
        │   └─────────────┘  └────────────────────┘   │
        └────────────────────────┬────────────────────┘
                                 │ REST + JWT
                                 ▼
                       ┌──────────────────┐
                       │   crm.html       │
                       │   (vanilla JS)   │
                       └──────────────────┘
```

**Key design rules**
- Single source of truth per column. `bubble-sync` owns names/contact/raw_data; `sync-paid-customers` owns `paid_status`/`activation_status`. No ping-pong.
- All client-side filtering is layered on top of `accounts` rows + tab predicates. The DB never returns less than the user is entitled to see (ABAC handles entitlement).
- Bubble API key lives in Supabase Edge Function secrets only; never in DB rows or repo.

---

## 2. Supabase Schema (production project)

### 2.1 `accounts` — main companies table
Critical columns:

| Column | Notes |
|---|---|
| `id` (uuid) | Primary key |
| `bubble_id` | Unique reference to the Bubble record |
| `name`, `domain`, `website`, `industry`, `size`, `location` | Company facts |
| `stage` | `lead` \| `mql` \| `sql` \| `demo` \| `proposal` \| `won` \| `lost` |
| `is_disqualified`, `disq_stage`, `disq_reason` | Disqualification flow |
| `source`, `medium`, `campaign`, `utm_*` | Attribution |
| `paid_status` | `Paid` \| `Without Charge` \| `Free Trial` \| `Not Paid` |
| `activation_status` | `Active` \| `Expired` \| `null` |
| `has_trial`, `trial_end_date`, `trial_status` | Trial lifecycle |
| `am_mail`, `rc_mail`, `owner_id` | Account Manager / Recruitera consultant |
| `recruitera_score` | Persisted ICP score (0–100) |
| `region` | For Egypt/MENA scoping in ABAC policies |
| `company_ref` | Bubble Company linkage |
| `merged_into` | Soft-merge pointer; merged rows are hidden |
| `bubble_created_at`, `created_at` | bubble = real business date; created_at = Supabase insert |

### 2.2 Auth + RBAC tables

- **`profiles`** — one row per CRM user. Trigger-synced `role` text mirror of `role_id → roles.type`.
- **`roles`** — system + custom roles. `module_access` JSONB controls sidebar visibility. Flag `all_accounts: true` lifts ABAC row filter for that role (Admin, Customer Success, Team Lead).
- **`teams`** — used by ABAC subjects + Team Lead designation (`profiles.reports_to`).
- **`abac_policies`** + **`abac_audit`** — policy rows with `subject` (role/role_id/team/user_ids), `condition`, `effect`, `priority`. `abac_check(action, account)` is the SECURITY DEFINER evaluator hit by every RLS policy on accounts.
- **`app_settings`** — singleton-row jsonb config (abac_enabled, lead_assignment_config, edge_function_url, service_role_key for the notification trigger).

### 2.3 Sales / lifecycle tables

| Table | Purpose |
|---|---|
| `paid_customers` | Synced from Bubble `Company`. Mirrors paid status into `accounts`. |
| `contract_cycles` | One row per contract. Drives Renewal kanban + ARR. Fields: `started_at`, `ends_at`, `value`, `plan_tier`, `auto_renew`, `cycle_number`, `status` (active/renewed/churned). |
| `targets` | Quarterly/monthly sales + renewal targets per user / team. |
| `activities` | Notes, calls, emails, meetings, tasks. Stores `mentions` array for `@user` triggers. |
| `stage_history` | Every stage change with old/new/by/at. |
| `icp_scores` | Per-account ICP override scores (newer scoring lives in `recruitera_score`). |

### 2.4 Marketing + tagging

| Table | Purpose |
|---|---|
| `marketing_tracking` | Webflow + System tracking, first/last touch attribution. Drives Reports → Campaign performance. |
| `tags` | Case-insensitive unique label + colour. RLS: any authed user can read/write. |
| `account_tags` | M2M with PK `(account_id, tag_id)`. Cascading FK delete. |

### 2.5 Notifications

`notifications` table + 3 triggers:
- `targets_notify` — fires on `targets` insert/update of `amount_egp`. Notifies the target owner.
- `activities_notify_mentions` — fires on `activities` insert when `mentions` array is non-empty. Notifies each matched user.
- `notifications_email_dispatch` — fires on `notifications` insert. Calls the `send-notification-email` Edge Function via `pg_net.http_post`. Reads `app_settings.edge_function_url` + `service_role_key`.

Plus the `request_account_handoff` RPC inserts a `kind='handoff_request'` row when a rep asks to take over an account from another rep (Account Collision flow).

### 2.6 Competitive Hub (staging Supabase only)

5 tables in project `oswuvlahxlktxjzqudxg`, all `ci_*` prefixed, all readable by anon: `ci_competitors`, `ci_features`, `ci_battles`, `ci_porter_forces`, `ci_ai_dimensions`. See `CI-HUB-PROJECT.md`.

---

## 3. Edge Functions

| Slug | Version | Trigger | Purpose |
|---|---|---|---|
| `bubble-sync` | v13 | every 15 min cron + manual | Pull `Unified_Company` → upsert `accounts`. Owns name/domain/contact/raw_data. Deliberately does **NOT** write `paid_status` or `activation_status`. |
| `sync-paid-customers` | v16 (logic v11) | every 15 min cron | Pull `Company` → upsert `paid_customers`. Mirrors status to `accounts` via 3 match paths (Company_Ref → domain → name). Owns `paid_status` + `activation_status`. |
| `sync-marketing-tracking` | v9 | every 15 min cron | Pull `Marketing_Tracking` → upsert. Drives Reports + Campaign performance. |
| `merge-duplicates` | v5 | every 6 h cron | Auto-merge obvious duplicates. |
| `invite-user` | v3 | admin UI | Create auth user + profile + module_access row, with default password. |
| `webflow-demo-intake` | v6 | inbound webhook from webflow | Capture demo signups. |
| `send-notification-email` | v5 | called by pg trigger | SMTP send via SendGrid (uses Supabase Auth's existing SMTP creds). Auto-swaps SMTP_FROM/SMTP_PASS if misconfigured. |

---

## 4. Frontend modules

### 4.1 Sidebar / Module access

Sidebar items map to `module_access` keys: `dashboard`, `team_targeting`, `reports`, `accounts`, `sales_pipeline`, `renewal`, `competitive_hub`, `logs`, `settings`, `utm_generator`.

Each role has a `module_access` JSONB. Admin role bypasses; everyone else respects the toggles. `all_accounts: true` lifts the AM-mail row filter on the Accounts table (Admin / CS / Team Lead).

### 4.2 Sales Pipeline (kanban)

Columns: **MQL · SQL · Demo · Proposal · Won · Lost**. (Lead is a *pre-MQL* bucket living in Accounts → Leads tab, not the kanban — per design.)

Stage rules:
- **Default for new accounts**: `lead` (was `mql` until 2026-06-14). Null-stage rows from Bubble sync now land in Accounts → Leads instead of auto-MQL.
- **MQL gate**: drag-to-MQL only allowed if `validateMqlGate(lead).ok === true`. The gate delegates to `calcRecruiteraScore`:

  | Tier | Score | Verdict |
  |---|---|---|
  | 🔥 Hot | ≥ 80 | Strong fit — promote |
  | ✓ Warm | ≥ 50 | Qualified — safe for MQL |
  | ⚠ Cool | ≥ 30 | Borderline — enrich first |
  | ✗ Cold | < 30 | Unqualified — keep in Lead |

  Threshold for MQL = warm or hot (≥ 50). Demotions to MQL (from SQL/Demo/Proposal) bypass the gate.

- **SQL gate**: opens the BANT modal. Save runs `applyStageChange`.
- **Make a Deal modal** → sets stage to SQL via BANT.
- **Re-check** button (admin only) on the MQL column header: walks current MQL leads and demotes any failing the gate back to Lead.

Score breakdown weights:
- Title (35 pts) — exec/HR/recruiting roles score highest
- Email (25 pts) — business email vs gmail/yahoo
- Hiring volume (30 pts) — > 10/year required
- Company name (10 pts) — valid, not junk

### 4.3 Accounts page

Tabs: **All · Leads · In pipeline · Paid · Without Charge · MQL · Disqualified · Unreachable**.

Filters: Search company, Status, All stages, All sources, ICP tier, Trial, Tag.

Cross-team **collision banner** (account collision lookup): when the search returns global matches that aren't already in the user's visible book, a banner appears above the empty table listing them with current owner + **Request handoff** button.

Row chips show DB-backed tags (unique-label `tags` table, M2M via `account_tags`). Tag picker popover lets users toggle/create tags inline.

### 4.4 Renewal Pipeline

Kanban over paid customers + their `contract_cycles`. Columns:

- **Active (no contract)** — paid customer, no contract on file yet
- **Upcoming (60d+)** — ≥ 60 days to end_date (catches everything 60+ days out)
- **30 days out**, **Overdue**, **Renewed**, **Churned**

Sidebar count = total paid customers (`isLeadPaidCustomer`) so the badge matches what's visible in the view, even for items that don't fit any column predicate.

### 4.5 Reports (Dashboard)

KPI strip: Pipeline Value, Active Trials, Demos, Win Rate, Customers, Won Value, Lost Value, Net Retention. Sparklines for last 7 days.

Sections:
- **Total ARR** hero — sums `contract_cycles.value` for active cycles per paid customer (fallback to `gAcv()` only when no cycle exists).
- **Sources** — `account.source` first-touch breakdown.
- **Conversion funnel** — stage counts.
- **Campaign performance** — from `marketing_tracking`. Counts **unique companies** per campaign (not raw mt rows). Source/medium = mode of all rows for that campaign (mode wins, not last-write). Filters test campaigns (`test*`, `clean-test*`, `bubble-flow*`, `temp*`, `demo-*`, `dev-*`, `sandbox*`). Trials = has_trial OR paid_customer OR contract_cycles exists.
- **Cycle by source** — avg time from visit → trial signup.
- **Date filter pills**: All / 7d / 30d / 90d / QTD / YTD + Owner dropdown.

### 4.6 Team Targeting / Forecast

Quarterly/monthly/yearly targets per user. Forecast view shows:
- Per-rep performance table (admin sees all reps; team lead sees own + direct reports; member sees self).
- "Set targets" mode for admins.
- Categories: sales / renewal / all (combined).

### 4.7 Competitive Hub

Native-inlined 8-tab dashboard: Dashboard, Intel Center, Feature Explorer, Pricing Lab, Five Forces, AI Maturity, Profiles, Market Map. Data from staging Supabase via REST + anon key. Chart.js lazy-loaded on first visit. All CSS scoped under `.ci-scope` so class names don't collide with the CRM.

### 4.8 Settings (admin)

Tabs:
- **Roles & Permissions** — toggle UI over ABAC policies. Lists each role, permission catalog, module visibility, members.
- **Test access (Simulator)** — pick user + account, see ABAC verdict per action with policy trace.
- **Templates** — shared notes/email/meeting/call templates.
- **Lead Assignment** — see §5.
- **Advanced** — raw ABAC policy editor.

### 4.9 Logs (admin)

Every stage change, qualification edit, and activity across all accounts. Filterable by account, user, field, kind, free-text.

### 4.10 UTM Generator (admin)

Build campaign URLs from saved `utm_campaigns` + history (`utm_links`).

---

## 5. Lead Assignment Engine

Admin-configurable rule that decides which sales person becomes the AM for every new account. CRM is the source of truth — overrides Bubble's `AM Mail`.

**Modes**:

| Mode | Behavior |
|---|---|
| Off | Keep Bubble's `AM Mail` as-is |
| Round-robin | Cycle through eligible reps in order. Pointer persists in `app_settings`. |
| Weighted | Random pick weighted by % per rep. Must sum to 100. |
| Score-based | Match the account's `recruitera_score` to a range → rep. |

**Implementation**:
- Config singleton row in `app_settings.lead_assignment_config` (jsonb).
- `pick_next_account_manager(score)` SECURITY DEFINER returns next assignee + advances round_robin_pointer.
- BEFORE INSERT trigger on `accounts` overrides `am_mail` when mode ≠ off.
- `redistribute_all_accounts()` RPC retroactively reassigns every non-disqualified account through the active rule (admin-only).

**UI** lives at Settings → Lead Assignment. Eligible reps come from `profiles` (active only). Save validates: weighted sum must = 100; at least one member must be selected.

---

## 6. Account Collision Lookup

Solves the "rep finds a company on LinkedIn but it's already owned by another rep" problem without exposing full account data.

**Components**:
- `lookup_accounts(q)` SECURITY DEFINER RPC. Returns a minimal payload (name, domain, am_email, am_name, stage, paid_status, last_activity_at) for any authenticated user. Strips ABAC.
- Topbar "Search the book…" input. Debounced lookup; position:fixed dropdown to escape `.content` overflow:hidden.
- Accounts page "Search company…" input ALSO fires the lookup. Matches outside the user's local leads render in a banner above the table.
- Add Lead modal runs a dupe-check before insert. Strict name match triggers a collision modal with "Cancel / Request handoff / Create anyway".
- `request_account_handoff(account_id, reason)` RPC: inserts a `kind='handoff_request'` notification for the current AM (or all admins if AM isn't a CRM user). The notification email trigger pings the owner.

---

## 7. Auth + Session

- **Login flow**: `login.html` → email + password → Supabase Auth → JWT in localStorage.
- **JWT expiry**: configurable in Supabase Dashboard → Project Settings → JWT Keys → Legacy. Currently 24h (was 1h).
- **Frontend session helper** (`_getValidAccessToken`): synchronous read of `sb-rtdrlpnfqjtwtsrwnifn-auth-token`. Returns token if expiry > 60s away, else null.
- **Boot gate**: if no valid token, redirect to `/login?back=<current>`.
- **Roles trigger**: `profiles.role` is a generated mirror of `roles.type` via `role_id`. Admin role = `is_admin()` true.

---

## 8. Notifications + Email

Bell dropdown reads from `notifications`. Kinds:
- `mention` — `@user` in an activity
- `target_set`, `target_updated` — manager set / changed a target
- `handoff_request` — rep requested an account handoff

Every insert dispatches via the `dispatch_notification_email` trigger → `send-notification-email` Edge Function → SendGrid SMTP. Subject format: `[Recruitera] <title>`. HTML email has a CTA button deep-linking to the account.

---

## 9. ABAC Engine (row-level access)

`abac_check(action, account_row) → boolean`. Used in every RLS policy on `accounts` and the per-account child tables (`activities`, `contacts`, `icp_scores`, `stage_history`, `contract_cycles`).

Evaluation order:
1. If `app_settings.abac_enabled` is false AND user isn't a pilot → return true (engine disabled).
2. If user is admin (`role_type='admin'`) → return true.
3. Walk `abac_policies` for the resource + action, ordered by `priority`. For each enabled policy:
   - Match subject (role / role_id / team_id / user_ids).
   - Evaluate `condition` (jsonb DSL: `eq`/`ne`/`is_null`/`gt`/etc., with `account.<field>` and `user.<field>` references).
   - First matching `deny` → return false. Otherwise `allow` → continue.
4. Default deny.

Audit rows logged to `abac_audit` for every deny + error.

System roles seed auto-policies named `auto:role:<role_id>:<action>`. Adjustable via the toggle UI but managed so they survive resync.

---

## 10. Database functions (RPCs called from frontend)

| Function | Caller | Purpose |
|---|---|---|
| `lookup_accounts(q)` | Account search | Cross-ABAC company lookup |
| `request_account_handoff(id, reason)` | Account collision UI | Insert handoff notification |
| `pick_next_account_manager(score)` | INSERT trigger | Returns next AM per current config |
| `redistribute_all_accounts()` | Settings → Lead Assignment | Bulk reassign existing accounts |
| `is_admin()` | Many RLS policies | Cached role check |
| `can_access_account(account_id)` | child-table policies | Wraps abac_check |
| `abac_simulate(...)` | Settings → Test access | Returns full policy trace for a user×account×action |

---

## 11. Stage flow (canonical)

```
        ┌───────┐  validateMqlGate (score ≥ 50)
        │ Lead  │  ────────────────────────────▶ MQL
        └───────┘
            │                                     │
            │                                     │ BANT modal
            │                                     ▼
            ▼                                   SQL
       Accounts                                   │
        Leads                                     │  Proposal modal
         tab                                      ▼
                                              Proposal
                                                  │
                                                  ▼
                                             Demo
                                                  │
                                          Won  /  Lost
```

Disqualification is orthogonal — any stage can be flagged `is_disqualified=true` with a reason; those rows skip the kanban and live in Accounts → Disqualified.

---

## 12. Activities

Activities are append-only logs per account. Types: `note`, `call`, `email`, `meeting`, `task`, `demo`, `stage`. Notes support `@mentions` → triggers a notification for the mentioned user.

Tasks have `task_due_date`, `task_done`, `assigned_to`. Open tasks for the current user are pulled into `window.MY_OPEN_TASKS` and shown on the Home dashboard widget.

---

## 13. Recently shipped (chronological, June 2026)

| Date | Item | Commit |
|---|---|---|
| 2026-06-09 | Customer Success + Team Lead see all accounts | 3fbba21 |
| 2026-06-09 | Accounts tab renderer respects `all_accounts` flag | 0026334 |
| 2026-06-09 | DB-backed tags (unique label) + Accounts page filter + row chips | 6f64613 |
| 2026-06-09 | Lead-detail Tags modal switched from localStorage to DB | 8338f47 |
| 2026-06-09 | Competitive Hub — iframed first, then native inline | 82c217f → 86a8a69 |
| 2026-06-09 | Renewal sidebar count fix + bucket fix | 5c09e31, be38da1 |
| 2026-06-09 | Total ARR fix (read from `contract_cycles.value`) | ec104d5 |
| 2026-06-09 | Campaign performance: source/medium attribution, tests filtered, real trials, unique companies | d636c7b, ff1e111 |
| 2026-06-10 | Auth refresh (later reverted to keep 1h-token simple validator) | df59a36 → a038e34 |
| 2026-06-10 | Stage default lead, MQL re-check button, Make-a-Deal demotion fix | 683b2a7 |
| 2026-06-11 | Lead Assignment engine (DB + UI) | e010eb8, c96b0a8 |
| 2026-06-12 | Account collision lookup (topbar + Add Lead) | b5cf9fb, 1ea6409, 9c4e125 |
| 2026-06-12 | Accounts page collision banner | b168deb |
| 2026-06-14 | Default stage = lead (not mql); MQL score threshold 60 → 50 | 1d83eb2, a107a90, 1330761 |

---

## 14. Pending / open work

- Hardened JWT refresh path (was reverted; sessions are 24h via raw JWT_EXP for now).
- Approve / Decline buttons inside the handoff-request notification (one-click reassign).
- Health Score module for paid customers (brainstorming paused — see superpowers/specs once resumed).
- Dashboard widget for traffic sources using marketing_tracking data.
- Per-user "Email notifications" opt-out toggle.

---

## 15. Operational notes

- **Cache-Control**: HTML routes set `max-age=0, s-maxage=0, must-revalidate` via `vercel.json`. Other static assets cached normally.
- **Deploy**: push to `main` → Vercel auto-deploys (~60s).
- **Validation**: `node --check`-equivalent inside Node REPL across all 15 inline `<script>` blocks before every commit (see most commits' message footer).
- **Cron jobs** (Supabase pg_cron, all 15-min except merge-duplicates which is every 6h):
  - `bubble-sync`, `sync-paid-customers`, `sync-marketing-tracking`, `merge-duplicates`
  - All include `Authorization: Bearer <service_role_key from app_settings>` in the `net.http_post` body so the `verify_jwt:true` Edge Functions accept the call.
- **Bubble API key** is in Supabase Edge Function secrets only (`BUBBLE_API_KEY`, `BUBBLE_URL`). Not in DB rows. Not in repo.

---

_Last updated 2026-06-14 by Amr Hammad._
