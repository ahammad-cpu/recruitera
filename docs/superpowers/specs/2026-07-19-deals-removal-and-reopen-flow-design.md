# Deals Removal + Reopen Flow — Design Spec

**Date:** 2026-07-19
**Author:** Amr Hammad + Claude
**Status:** Ready for user review
**Trigger:** GM feedback — remove the standalone Deals panel from the company profile; make stage live on the account only; lost accounts must be reopenable to any stage; every action must remain reportable.

---

## Table of contents

1. Problem & goals
2. Data model
3. Reopen flow (UI + RPC)
4. Requalification Rules module (dynamic follow-up automation)
5. Merged History window
6. Reports rewrite
7. AM cross-attribution
8. Migration + kill order
9. Out of scope (YAGNI'd)
10. Open questions

---

## 1. Problem & goals

### Current state

The company profile shows a **Deals** panel with stat tiles (Open / Won / Lifetime Rev) and a **New deal** button. Behind the scenes, a `deals` table holds one row per opportunity per account, and a DB trigger keeps `accounts.stage` in sync with the current deal's stage. AMs create deals to move stages; disqualification writes reason fields to `accounts` but the deals table is largely redundant.

### GM feedback

Remove the Deals panel. Stage lives on the account. Lost accounts must be reopenable to any stage. All history must be retained and reportable.

### Goals

- **G1** — Company profile has no Deals section; stage is edited directly on the account.
- **G2** — Any lost account can be reopened to any pre-lost stage (Lead / MQL / SQL / Demo / Proposal), with reason captured.
- **G3** — The company profile has one unified **History** log showing every event (comms, stage changes, disqualify, reopen, ownership, meta-lead syncs).
- **G4** — Four reports keep working with equivalent numbers: **Won revenue**, **Loss/disqualification breakdown**, **Reopen rate (new)**, **Sales cycle time**.
- **G5** — Follow-up tasks after disqualification are configurable per reason in a Settings module, not hardcoded — with control over delay, assignee, and title template.
- **G6** — AM Performance surfaces cross-attribution: if AC1 disqualifies X and AC2 reopens+wins X, both are visible in the report without double-counting revenue.

### Non-goals

- BANT reporting (E in the report survey) — dropped.
- Forecast / probability-weighted pipeline (F) — dropped.
- One-cycle-per-account model (Approach 3 in brainstorming) — rejected; too invasive.

---

## 2. Data model

### 2.1 Additive changes to `accounts`

Denormalize stage-transition timestamps so date filters don't have to join `stage_history` on every dashboard query.

```sql
alter table accounts add column first_won_at   timestamptz;
alter table accounts add column last_won_at    timestamptz;
alter table accounts add column lost_at        timestamptz;
alter table accounts add column reopened_at    timestamptz;
alter table accounts add column reopen_count   int not null default 0;

create index accounts_last_won_at_idx on accounts(last_won_at) where last_won_at is not null;
create index accounts_lost_at_idx     on accounts(lost_at)     where lost_at is not null;
```

Kept in sync by a single trigger on `stage_history` INSERT (see §2.4). No app code needs to remember to update them.

### 2.2 Additive changes to `stage_history`

Capture the reason on every disqualify **and** every reopen — so reports can answer "which reasons had the highest reopen rate" and "why did AMs bring accounts back."

```sql
alter table stage_history add column reason_code text;
alter table stage_history add column notes       text;

create index stage_history_reopen_idx on stage_history(account_id, changed_at)
  where from_stage='lost';
```

### 2.3 New `requalification_*` tables

See §4 for column list and behavior.

### 2.4 `_sync_account_transition_stamps()` trigger

```sql
create function _sync_account_transition_stamps() returns trigger as $$
begin
  -- Won stamps
  if new.to_stage = 'won' then
    update accounts set
      last_won_at  = new.changed_at,
      first_won_at = coalesce(first_won_at, new.changed_at)
    where id = new.account_id;
  end if;

  -- Lost stamp
  if new.to_stage = 'lost' then
    update accounts set lost_at = new.changed_at where id = new.account_id;
  end if;

  -- Reopen stamp + counter
  if new.from_stage = 'lost' and new.to_stage <> 'lost' then
    update accounts set
      reopened_at  = new.changed_at,
      reopen_count = reopen_count + 1
    where id = new.account_id;
  end if;

  return new;
end $$ language plpgsql security definer;

create trigger stage_history_sync_account_transitions
  after insert on stage_history
  for each row execute function _sync_account_transition_stamps();
```

### 2.5 `disq_stage` capture

`accounts.disq_stage` is what powers the Loss × Stage matrix in Report B. It's not set by the current `DisqualifyModal`, so the field is empty on today's data. Two things fix this:

- **Backfill (one-time, Phase 0):** for each account currently at `stage='lost'`, set `disq_stage` = the `from_stage` on the most recent `stage_history` row with `to_stage='lost'` for that account.
- **Going forward:** `DisqualifyModal` reads `accounts.stage` immediately before writing `stage='lost'` and stores that value in `disq_stage`. Simpler than a trigger; keeps write logic in one place.

### 2.6 Deletions (Phase 5)

- Table `deals` — legacy rows archived to `accounts.raw_data.legacy_deals[]` first
- Trigger `accounts_safety_deal_trg` + function `accounts_stage_to_deal_safety` — the old "Make a deal → SQL" auto-promotion
- All React/TS: `DealsSection.tsx`, `NewDealModal.tsx`, `useDeals.ts`, `useDealsForCompany.ts`, `useDealMutations.ts`

### 2.7 Which date drives each filter

Every date filter uses a **stage-transition** date, not `accounts.created_at`. The one exception is the Sales Funnel report, which is a cohort report by definition.

| Screen | Date field | Notes |
|---|---|---|
| Dashboard "Won this month" | `contract_cycles.started_at` (existing source of truth for booked revenue) | Not `accounts.last_won_at` — cycles are the money |
| Dashboard "Lost this month" | `accounts.lost_at` | denorm |
| Reports A — Won Revenue | `contract_cycles.started_at` | booked |
| Reports B — Loss breakdown | `accounts.lost_at` | current-lost cohort |
| Reports C — Reopen rate | `stage_history.changed_at where from_stage='lost'` | event log |
| Reports D — Cycle time | `accounts.first_won_at − accounts.created_at` | denorm math |
| Lead Generation report | `accounts.created_at` | cohort — unchanged |
| Sales Funnel report | `accounts.created_at` | cohort by definition — label renamed **"Leads created"** for clarity |
| Companies table / Kanban | `accounts.updated_at` (existing) | current state |
| Reopens KPI (new) | `stage_history.changed_at where from_stage='lost'` | event log |

**Note on `deal_value` vs booked revenue.** `accounts.deal_value` is an editable *pipeline estimate*. `contract_cycles.value` is the actual booked revenue. Reports and dashboards use whichever matches the question — see §6.

---

## 3. Reopen flow

### 3.1 Where the Reopen button lives

Visible only when `accounts.stage='lost'`. Gated by the same ABAC permission as Disqualify (owner + admin by default).

| Surface | Placement |
|---|---|
| Company profile header | Replaces the "Disqualify" button in the same slot — becomes **↺ Reopen** |
| Companies table row | Three-dot menu → "Reopen…" |
| Disqualified Kanban view | Icon-button on card hover |
| Pipeline kanban | N/A — lost accounts don't appear |

### 3.2 ReopenModal

Fields:
- **Target stage** — dropdown: Lead / MQL / SQL / Demo / Proposal (never Won/Paid)
- **Reason** (required, radio) — `customer_returned` / `budget_approved` / `timing_changed` / `wrong_call` / `other`
- **Note** (optional textarea)
- **Context strip** at the bottom — read-only, shows original `disq_stage · disqualified_reason`

### 3.3 `reopen_account` RPC

Called exclusively from the modal — no direct UPDATE from client.

```sql
create function reopen_account(
  p_account_id   uuid,
  p_target_stage stage_enum,
  p_reason_code  text,
  p_notes        text default null
) returns void
security definer
as $$
begin
  -- Guards
  if (select stage from accounts where id = p_account_id) <> 'lost' then
    raise exception 'Account is not lost';
  end if;
  if p_target_stage not in ('lead','mql','sql','demo','proposal') then
    raise exception 'Cannot reopen directly to %', p_target_stage;
  end if;
  if p_reason_code not in ('customer_returned','budget_approved','timing_changed','wrong_call','other') then
    raise exception 'Invalid reason_code';
  end if;

  -- 1. Move the account. Nulls the disqualified_* fields — the event is preserved in stage_history.
  update accounts set
    stage               = p_target_stage,
    disqualified_reason = null,
    disqualified_notes  = null,
    disqualified_at     = null,
    disqualified_by     = null,
    disq_stage          = null
  where id = p_account_id;

  -- 2. Log the transition WITH reason. The generic stage-change trigger would insert a bare row;
  --    we insert here so reason_code + notes are captured atomically.
  insert into stage_history (account_id, from_stage, to_stage, changed_by, changed_at, reason_code, notes)
  values (p_account_id, 'lost', p_target_stage, auth.uid(), now(), p_reason_code, p_notes);

  -- 3. Follow-up task (mirrors the standard "first touch" behavior)
  insert into tasks (account_id, title, owner_id, priority, kind)
  select
    p_account_id,
    'Follow up: re-engage ' || a.name,
    a.owner_id,
    'medium',
    'reopen_follow_up'
  from accounts a where a.id = p_account_id;
end $$ language plpgsql;
```

**Concurrency guard.** The generic `stage_history` insert trigger must be suppressed when the RPC does its own explicit insert. Options: (a) add a `set local` session flag the trigger reads, (b) do the update via a `security definer` function that first disables and re-enables the trigger for its row. Option (a) is cleaner. Implementation detail — resolved in the plan.

### 3.4 Kanban drag from Disqualified

Blocked with a modal: "Use the Reopen button to record why this is back." Forces reason capture, keeps Report C clean.

### 3.5 Edge cases

- **Reopen a second time.** Allowed. Every reopen is its own `stage_history` row. `reopen_count` increments.
- **Owner reassignment.** No auto-reassign. If original owner is inactive, ReopenModal shows a warning with a picker.
- **Auto follow-up task.** Created inside the RPC (task kind = `reopen_follow_up`). This is distinct from the requalification-rule tasks in §4, which are for lost accounts that were never reopened.

---

## 4. Requalification Rules module

Dynamic follow-up automation for lost accounts. Configured in Settings, executed by a nightly cron.

### 4.1 Mental model

A rule answers: *"When an account was lost for reason X, N days later, create a task titled Y and assign it to Z."*

### 4.2 Tables

```sql
create table requalification_rules (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  enabled           bool not null default true,
  reason_code       text,                  -- null = any reason
  from_stages       text[],                -- null = any stage
  delay_days        int not null check (delay_days > 0),
  task_title_tpl    text not null,         -- supports {{company_name}}, {{disq_stage}}, {{original_owner}}, {{days_ago}}, {{original_reason_notes}}
  task_priority     text not null default 'medium',
  assignment_mode   text not null,         -- same_owner | original_owner | round_robin_pool | round_robin_excluding_original_owner | specific_user
  assignee_pool     uuid[],                -- required when mode is a round-robin variant
  specific_assignee uuid,                  -- required when mode = specific_user
  rr_pointer        int not null default 0,
  fires_once        bool not null default true,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  created_by        uuid,
  updated_by        uuid
);

create table requalification_fires (
  rule_id     uuid references requalification_rules(id) on delete cascade,
  account_id  uuid references accounts(id)              on delete cascade,
  task_id     uuid,
  fired_at    timestamptz default now(),
  primary key (rule_id, account_id)
);
```

### 4.3 Settings UI — `Settings → Requalification`

Card-per-rule list with edit / disable / delete. Rule editor is a modal with the fields above. See design section 3 of the brainstorm for the mockup.

### 4.4 Cron worker

Edge function `requalification-scan`, invoked daily at 02:00 by pg_cron.

Pseudocode:

```
for each enabled rule R:
  select accounts A where
    A.stage = 'lost'
    and A.lost_at <= now() - R.delay_days::interval
    and A.lost_at >  now() - (R.delay_days + 1)::interval
    and (R.reason_code is null or A.disqualified_reason = R.reason_code)
    and (R.from_stages is null or A.disq_stage = any(R.from_stages))
    and (not R.fires_once or not exists (
      select 1 from requalification_fires
      where rule_id = R.id and account_id = A.id
    ))
  for each A:
    assignee = resolve_assignee(R, A)
    task_title = render(R.task_title_tpl, A)
    insert into tasks (account_id, title, owner_id, priority, kind)
      values (A.id, task_title, assignee, R.task_priority, 'requalification')
      returning id -> task_id
    insert into requalification_fires (rule_id, account_id, task_id)
    log to system_logs: module='requalification' account_id=A.id message="rule '<R.name>' fired"
```

### 4.5 Assignment modes

| Mode | Config | Behavior |
|---|---|---|
| `same_owner` | none | `accounts.owner_id` at fire time |
| `original_owner` | none | Owner at moment of disqualify — read from `stage_history` |
| `round_robin_pool` | `assignee_pool` | Rotates through pool via `rr_pointer` |
| `round_robin_excluding_original_owner` | `assignee_pool` | Round-robin skipping the disqualifier |
| `specific_user` | `specific_assignee` | Always this profile |

### 4.6 Reopen interaction

When an AM reopens an account, its `stage` moves off `lost`, so the scan predicate `A.stage='lost'` stops matching — no more tasks fire for that account from any rule. If it gets lost again later, and `fires_once=false`, the rule can re-fire.

### 4.7 Seed rules

Three starter rules, **disabled** by default so nothing fires until admin turns them on:

1. `no_response` → 60 days → round-robin excluding original owner
2. `wrong_timing` → 90 days → same owner
3. `no_budget` → 180 days → specific user (CS manager)

---

## 5. Merged History window

### 5.1 Change

Rename the current **Activity** tab → **History**. Every event related to the account lands in one scrollable, filterable stream.

### 5.2 Event sources

| Event kind | Icon | Style | Source |
|---|---|---|---|
| Note / Call / Email / Meeting | 📝📞📧🤝 | neutral | `activities` |
| Task created / completed | ☑ / ✓ | subtle | `activities` (kind=task) |
| Stage change | 🔄 | blue | `stage_history` |
| Disqualified | ✕ | muted red | `stage_history` where `to_stage='lost'` |
| Reopened | ↺ | green | `stage_history` where `from_stage='lost'` |
| Owner change | 👤 | subtle | `accounts_audit` |
| Deal value change | 💰 | subtle | `accounts_audit` |
| CS reassignment | 🎓 | subtle | `accounts_audit` |
| Requalification rule fired | 🤖 | purple | `system_logs where module='requalification'` |
| Meta lead attached | 🎯 | subtle | `accounts_audit` (raw_data.meta_leads array grew) |
| Account created | ⭐ | subtle | synthesized from `accounts.created_at` |

### 5.3 Layout

- Composer stays at top (call / email / whatsapp / note).
- Filter chips below composer: **All / Comms / Tasks / Stage / System** with counts.
- Search box across titles + bodies.
- Grouped by date: **TODAY / YESTERDAY / <date>**.
- Right-aligned stage pill on each event = the stage the account was in at that moment.

### 5.4 `get_company_history` RPC

One server-side union, one client call. Enables consistent ordering, pagination, and RLS enforcement.

```sql
create function get_company_history(
  p_account_id uuid,
  p_limit      int         default 100,
  p_before     timestamptz default null
) returns table (
  id             text,
  kind           text,
  at             timestamptz,
  actor_id       uuid,
  actor_name     text,
  stage_at_time  text,
  title          text,
  body           text,
  meta           jsonb
) stable security invoker
```

Body unions:
1. `activities`
2. `stage_history` (mapped to `stage_change` / `disqualify` / `reopen` based on to_stage + from_stage + reason_code)
3. `accounts_audit` filtered to interesting field changes (`owner_id`, `deal_value`, `deal_currency`, `customer_success_id`, `raw_data.meta_leads` growth)
4. `system_logs` where `module='requalification' and account_id = p_account_id`
5. Synthetic row for account creation

Sort `at desc`. Pagination: `where at < p_before limit p_limit`.

**`stage_at_time` computation.** For each returned row, this is the stage the account was in at that moment. The current client-side helper (walks activities chronologically applying `stage_history` transitions) moves server-side: the RPC does one CTE that computes `(account_id, from, to, stage)` windows from `stage_history`, then joins each event to the window covering `event.at`. This keeps the value consistent across all clients and lets the History tab render pills without a second round-trip. Stage-change events themselves report their own `to_stage` as `stage_at_time` (so a "moved to SQL" row shows [SQL]).

### 5.5 Client hook

```typescript
useCompanyHistory(accountId) → useInfiniteQuery({
  queryKey: ['company_history', accountId],
  queryFn: ({ pageParam }) => rpc('get_company_history', {
    p_account_id: accountId, p_limit: 50, p_before: pageParam
  }),
  getNextPageParam: last => last.length === 50 ? last.at(-1)?.at : null,
})
```

Fifty at a time, infinite scroll. No client-side merge.

### 5.6 Removed from UI

- The Overview tab's inline recent-activity list — redundant with the History tab.
- The Deals section entirely.
- The old "Activity" label — becomes "History".

### 5.7 Empty state

> No history yet.
> Log a call, email, or note above to start.

---

## 6. Reports rewrite

### 6.1 Source-of-truth rule

- **Open pipeline value** → `accounts.deal_value` (current estimate)
- **Won revenue (period)** → `contract_cycles.value` where `started_at ∈ range` (booked, unambiguous)
- **Cycle time** → `accounts.first_won_at − accounts.created_at`
- **Loss breakdown** → `accounts where stage='lost'`
- **Reopen rate** → `stage_history where from_stage='lost'`
- **Lead volume** → `accounts.created_at`

### 6.2 Lead Generation report — unchanged

Cohort by `accounts.created_at`. Breakdowns: source / campaign / channel / ad-set.

### 6.3 Sales Funnel report — label only

Filter label renamed **"Leads created"** (was "Created"). Otherwise unchanged. Bottom strip adds a teaser: *"of {N} lost cohort accounts, {M} were later reopened ({%})"*.

### 6.4 Win / Loss / Churned report — restructured into three sub-sections

**Won.**
Total EGP + count + avg cycle days. Breakdowns by source and by AM. Cycle-time bar list.

**Loss / Disqualification breakdown (Report B).**

Reason × Stage matrix.

```sql
select disqualified_reason as reason, disq_stage as lost_from, count(*)
from accounts
where stage = 'lost' and lost_at between :from and :to
group by 1, 2;
```

New column: **"later reopened %"** — of accounts in each cell, how many were later reopened (signal for wrong-call reasons).

**Reopen Rate (Report C, new).**

Headline: reopened this quarter (count + % of period losses); multi-reopens count.

Breakdown 1 — reopen reasons (from `stage_history.reason_code` for reopen rows).
Breakdown 2 — original disqualify reason × reopen % (see below).
Breakdown 3 — where reopened accounts ended up (Won / Still open / Re-lost).

```sql
-- Original-reason × reopen %
with lost_events as (
  select account_id, changed_at as lost_at, reason_code as disq_reason
  from stage_history
  where to_stage='lost' and changed_at between :from and :to
),
reopens as (
  select distinct sh.account_id
  from stage_history sh
  join lost_events le on le.account_id = sh.account_id
  where sh.from_stage='lost' and sh.to_stage <> 'lost'
    and sh.changed_at > le.lost_at
)
select le.disq_reason,
       count(*) as lost,
       count(*) filter (where r.account_id is not null) as reopened,
       round(100.0 * count(*) filter (where r.account_id is not null) / nullif(count(*),0), 0) as reopen_pct
from lost_events le
left join reopens r using (account_id)
group by 1
order by reopen_pct desc;
```

**Churned.** Unchanged — reads `contract_cycles`, untouched by deals removal.

### 6.5 AM Performance — new columns (see §7)

### 6.6 Requalification panel

Inside the AM Performance tab, not its own tab. Rules × fires-this-period × task-completion-rate × downstream reopen rate.

### 6.7 Dashboard KPIs

| KPI | Query |
|---|---|
| Won this month | `sum(contract_cycles.value)` where `started_at ∈ month` (currency-normalized) |
| Collected this month | existing — unchanged |
| Renewals this month | existing — unchanged |
| Open pipeline value | `sum(accounts.deal_value)` where stage in (mql, sql, demo, proposal) |
| **NEW** Reopens this month | `count(distinct account_id) from stage_history where from_stage='lost' and changed_at ∈ month` |

### 6.8 Removed from Reports

- All references to `deals.*` in report queries
- `useDeals` / `useDealsForCompany` hooks used only in reports
- `reconstructArrPipeline(cycles, deals)` refactored to `reconstructArrPipeline(cycles, accounts)` — chart shape identical

---

## 7. AM cross-attribution

### 7.1 Rule

Whoever owns the account at `to_stage='won'` gets the revenue credit — that's the person who closed it. Cross-attribution is surfaced without double-counting.

### 7.2 New columns on AM Performance

| Column | Definition |
|---|---|
| Wins | `to_stage='won'` events, `owner_id_at_win = AM` |
| Won Rev. | `sum(contract_cycles.value)` for those wins, currency-normalized |
| Losses | `to_stage='lost'` events, `changed_by = AM` |
| Reopens attempted | `from_stage='lost' and to_stage <> 'lost'` events, `changed_by = AM` |
| Reopens Won | `to_stage='won'` events, `owner_id_at_win = AM`, account had prior lost row |
| Recovered by Others | `to_stage='won'` events where the account had a prior `to_stage='lost'` row with `changed_by = AM` AND `owner_id_at_win <> AM` |

`owner_id_at_win` = `changed_by` from the `stage_history` row where `to_stage='won'`.

### 7.3 Query for Recovered-by-Others

```sql
select disq.changed_by as ac_who_disqualified,
       count(distinct disq.account_id) as recovered_count
from stage_history disq
join stage_history win
     on win.account_id = disq.account_id
    and win.to_stage = 'won'
    and win.changed_at > disq.changed_at
    and win.changed_by <> disq.changed_by
where disq.to_stage = 'lost'
  and win.changed_at between :from and :to
group by 1;
```

### 7.4 Example — AC1 disqualifies X, AC2 reopens and wins X

| AC1 | AC2 |
|---|---|
| Wins: 0 | Wins: +1 |
| Won Rev.: 0 | Won Rev.: +full amount |
| Losses: +1 | Losses: 0 |
| Reopens attempted: 0 | Reopens attempted: +1 |
| Reopens Won: 0 | Reopens Won: +1 |
| Recovered by Others: +1 | Recovered by Others: 0 |

### 7.5 Drill-in

Click any cell → modal lists the actual accounts.

### 7.6 Anti-gaming

- Credit follows `to_stage='won'` — reassigning after a win doesn't move credit.
- Loss credit is on `changed_by` (whoever clicked Disqualify), not `owner_id` — you can't hand off an about-to-lose account to dodge the loss count.

---

## 8. Migration + kill order

### 8.1 Guiding principles

- Additive first; nothing dropped until the end.
- Old + new run behind a feature flag until we've watched for **14 days**.
- Legacy `deals` rows archived to `accounts.raw_data.legacy_deals[]` before the table is dropped.

### 8.2 Phases

**Phase 0 — Schema prep** (~half day)
- Add denorm columns to `accounts`
- Add `reason_code` + `notes` to `stage_history`
- Create `requalification_rules` + `requalification_fires`
- Backfill denorm columns from existing `stage_history`
- Archive `deals` rows into `accounts.raw_data.legacy_deals[]`

**Phase 1 — Server-side infra** (~1 day)
- `_sync_account_transition_stamps()` trigger on `stage_history`
- `reopen_account()` RPC
- `get_company_history()` RPC
- Deploy `requalification-scan` edge function (cron not yet scheduled)

**Phase 2 — Reports parallel path** (~2 days)
- Add `use_new_reports = false` to `app_settings`
- Write new report queries alongside old ones
- Admin diagnostic tab (Settings → Diagnostics) renders old vs new side-by-side
- Verify numbers reconcile within 0.1%

**Phase 3 — Frontend rewrite behind flag** (~3–4 days)
- Add `deals_ui_hidden = false` flag
- New components: `ReopenModal`, `HistoryTab`, `RequalificationSettings`
- New hooks: `useCompanyHistory`, `useReopenAccount`
- Update `DisqualifyModal` to write `reason_code` to `stage_history`
- Update `WinLossChurnedReport` + `AMPerformanceReport` for new columns
- Seed requalification rules (disabled)

**Phase 4 — Flip in prod** (T = 0, ~15 min + 14-day watch)
- Set both flags to true
- Schedule `requalification-scan` cron for 02:00 daily
- Announce to team

**Phase 5 — Kill switch** (T + 14 days)
- Remove feature flags from code
- Delete DealsSection, NewDealModal, useDeals*, useDealMutations, useDealsForCompany
- Drop trigger `accounts_safety_deal_trg` + function `accounts_stage_to_deal_safety`
- Drop table `deals cascade`

### 8.3 Rollback matrix

| Phase | Reversible | How |
|---|---|---|
| 0 | ✅ | Drop added columns/tables |
| 1 | ✅ | Drop trigger + RPCs; disable edge fn |
| 2 | ✅ | Keep flag off |
| 3 | ✅ | Keep flag off |
| 4 | ✅ within 14 days | Flip flags back |
| 5 | ❌ | Legacy data preserved in `raw_data.legacy_deals`; restore from Supabase backup if a full deals table needs to come back |

### 8.4 File deliverables

**DB migrations** (in order):
1. `20260720_add_account_transition_stamps.sql`
2. `20260720_backfill_transition_stamps_and_archive_deals.sql`
3. `20260721_add_requalification_module.sql`
4. `20260721_sync_transition_stamps_trigger.sql`
5. `20260722_reopen_account_rpc.sql`
6. `20260722_get_company_history_rpc.sql`
7. `20260805_drop_deals_and_related.sql` (Phase 5)

**Edge functions**:
- `requalification-scan` v1

**Frontend (Phase 3)**:
- `src/features/company-profile/ReopenModal.tsx` — new
- `src/features/company-profile/HistoryTab.tsx` — replaces `ActivityTab`
- `src/hooks/useCompanyHistory.ts` — new
- `src/hooks/useReopenAccount.ts` — new
- `src/features/settings/RequalificationSettings.tsx` — new
- `src/features/companies/DisqualifyModal.tsx` — writes `reason_code` to `stage_history`
- `src/features/reports/tabs/WinLossChurnedReport.tsx` — three sub-sections + Reopen Rate panel
- `src/features/reports/tabs/AMPerformanceReport.tsx` — new columns + drill-in
- `src/lib/flags.ts` — new flag reader

**Delete list (Phase 5)**:
- `src/features/company-profile/DealsSection.tsx`
- `src/features/companies/NewDealModal.tsx`
- `src/hooks/useDeals*.ts`, `src/hooks/useDealMutations.ts`, `src/hooks/useDealsForCompany.ts`
- All deals imports from Pipeline / Reports / Renewal

### 8.5 Timeline estimate

| Phase | Duration |
|---|---|
| 0 — Schema + backfill | ~half day |
| 1 — Infra | ~1 day |
| 2 — Parallel reports | ~2 days |
| 3 — Frontend behind flag | ~3–4 days |
| 4 — Flip + 14-day watch | 15 min + 14 days |
| 5 — Kill | ~1 hour |

Total elapsed: ~3 weeks of clock time, ~7 days of engineering work.

---

## 9. Out of scope (YAGNI'd)

- BANT reporting (was carried on `deals.bant_*`) — dropped per §1 non-goals.
- Forecast / probability-weighted pipeline — dropped.
- Per-cycle attempts model (Approach 3) — rejected.
- Deal renaming to "opportunity" or similar — no.
- Sub-second real-time updates on the History tab — 15-minute React Query default is fine.

## 10. Open questions

1. **`stage_history` insert-trigger vs RPC insert.** When the `reopen_account` RPC inserts its own `stage_history` row, we must prevent a generic stage-change trigger from inserting a duplicate. Resolution deferred to the implementation plan — likely a session-local flag pattern.
2. **`auth.uid()` availability inside the requalification cron.** The edge function invokes with the service role; `auth.uid()` will be null when it inserts tasks and stage_history rows. Need to explicitly set an actor field on those inserts (e.g., a sentinel `system` user) so the History tab shows the actor as "System (requalification)".
3. **Currency handling for pipeline value.** `sum(accounts.deal_value)` mixes currencies unless we normalize via `toEgp`. The existing `toEgp` helper reads from a hardcoded table; that's fine for now but a future FX rate table would be cleaner. Not blocking.
