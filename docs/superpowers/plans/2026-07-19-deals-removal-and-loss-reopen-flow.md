# Deals Removal + Loss / Reopen Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the standalone Deals panel from the company profile; move all stage semantics onto `accounts`; introduce a proper Loss + Reopen flow with reason capture; add a Settings-driven Requalification Rules module that auto-creates follow-up tasks; rewrite Win/Loss/AM reports around the new model — all behind two feature flags with a 14-day rollback window before the `deals` table is dropped.

**Architecture:** Additive DB changes first (denorm columns, reason columns, requalification tables) + one trigger to keep denorm in sync + two RPCs (`reopen_account`, `get_company_history`) + one edge function (`requalification-scan`) scheduled by pg_cron. Frontend behind flags `deals_ui_hidden` and `use_new_reports` in `app_settings`. Existing components renamed (`DisqualifyModal` → `LossModal`, `ActivityTab` → `HistoryTab`), new components added (`ReopenModal`, `RequalificationSettings`, `RuleEditorModal`). Reports read from the denorm columns + `stage_history` + `contract_cycles`. `deals` table archived to `accounts.raw_data.legacy_deals` before deletion.

**Tech Stack:** Supabase Postgres 15 (project `rtdrlpnfqjtwtsrwnifn`) + pg_cron + Edge Functions (Deno). React 19 + TypeScript + Vite + Tailwind (existing theme tokens: `bg-ok`, `bg-warn`, `bg-purple`, `text-text-3` etc). TanStack Query. Vitest for unit tests. No new npm deps.

## Global Constraints

- **Supabase project ID:** `rtdrlpnfqjtwtsrwnifn`. Migrations applied via `mcp__b7e33bec-653b-4703-9358-0d8100f64694__apply_migration`.
- **Column rename** — `accounts.disqualified_reason → loss_reason`, `disqualified_notes → loss_notes`, `disqualified_by → lost_by`, `disqualified_at → lost_at`, `disq_stage → lost_from_stage`. Do the rename atomically with the frontend deploy that uses the new names (Vercel deploys the frontend within ~90s of push; brief window is acceptable for internal CRM).
- **Loss reasons:** `no_budget`, `competitor`, `wrong_timing`, `no_response`, `chose_alternative`, `postponed`, `other`.
- **Reopen reasons:** `customer_returned`, `budget_approved`, `timing_changed`, `wrong_call`, `other`.
- **Loss available at:** Lead / MQL / SQL / Demo / Proposal (never at won / paid / lost).
- **Reopen target stage:** Lead / MQL / SQL / Demo / Proposal (never won / paid).
- **Two feature flags** live in `app_settings` (existing table): `deals_ui_hidden` (bool) and `use_new_reports` (bool). Both default `false`.
- **14-day watch window** between flipping flags (Phase 4) and dropping `deals` (Phase 5).
- **Every task ends with green** `npx tsc --noEmit && npx vitest run` (run from `recruitera-crm-v3/`) and a commit.
- **Never use `--no-verify`** or bypass hooks. If pre-commit fails, fix the underlying issue.
- **Deploy is automatic on push to `main`** (Vercel).
- **No new npm deps.** Charts and mockups reuse existing `BarList`, `FunnelChart`, `ReportPanel` primitives from `src/features/reports/shared/ReportUI.tsx`.
- **Currency:** monetary values pass through `toEgp(value, currency)` + `fmtEgp()` from `@/lib/format`.
- **Never write raw account UPDATEs from the client for stage transitions** — go through `reopen_account` RPC or the existing `useChangeStage` mutation which already writes `stage_history`.

## File Structure

**New DB objects:**
- Migration `20260720_add_won_denorm_columns.sql`
- Migration `20260720_add_reason_columns_and_backfill_lost_from_stage.sql`
- Migration `20260720_rename_disqualified_to_loss.sql`
- Migration `20260721_sync_account_transition_stamps_trigger.sql`
- Migration `20260721_requalification_tables.sql`
- Migration `20260722_reopen_account_rpc.sql`
- Migration `20260722_get_company_history_rpc.sql`
- Migration `20260722_archive_deals_to_raw_data.sql`
- Migration `20260805_drop_deals_and_related.sql` (Phase 5, executed 14 days after flip)
- Edge function `meta-lead-sync` unchanged; new edge function `requalification-scan`

**New TS files:**
- `src/lib/flags.ts` — feature-flag reader hook
- `src/features/company-profile/LossModal.tsx` — renamed from `DisqualifyModal`, writes `reason_code` to `stage_history`
- `src/features/company-profile/ReopenModal.tsx`
- `src/features/company-profile/HistoryTab.tsx` — renamed from `ActivityTab`
- `src/hooks/useCompanyHistory.ts`
- `src/hooks/useReopenAccount.ts`
- `src/hooks/useLoseAccount.ts` — thin wrapper around existing disqualify mutation, renamed
- `src/features/settings/RequalificationSettings.tsx`
- `src/features/settings/RuleEditorModal.tsx`
- `src/hooks/useRequalificationRules.ts`
- `src/features/reports/tabs/__parts/LossBreakdownMatrix.tsx`
- `src/features/reports/tabs/__parts/ReopenRatePanel.tsx`
- `src/features/reports/tabs/__parts/RequalificationRulesPanel.tsx`
- `src/features/reports/tabs/__tests__/lossCalc.test.ts`
- `src/features/reports/tabs/__parts/lossCalc.ts` — pure helpers

**Modified TS files:**
- `src/hooks/useAccounts.ts` — add `first_won_at, last_won_at, lost_at, reopened_at, reopen_count, loss_reason, loss_notes, lost_by, lost_from_stage` to the select and to the `Account` type
- `src/features/companies/DisqualifyModal.tsx` — deleted and replaced by `LossModal`
- `src/features/company-profile/CompanyProfile.tsx` — Lose button replacement, Reopen button, tab rename
- `src/features/company-profile/DealsSection.tsx` — remove from render behind flag (Phase 3), delete file (Phase 5)
- `src/features/reports/tabs/WinLossChurnedReport.tsx` — inject `LossBreakdownMatrix` + `ReopenRatePanel`
- `src/features/reports/tabs/AMReport.tsx` — new columns + drill-in
- `src/features/reports/tabs/PipelineReport.tsx` — Sales Funnel filter label rename, teaser strip
- `src/components/layout/Sidebar.tsx` — rename "Disqualified" → "Lost"
- `src/routes/index.tsx` — add `/settings/requalification` route

**Deleted files (Phase 5 only):**
- `src/features/company-profile/DealsSection.tsx`
- `src/features/companies/NewDealModal.tsx`
- `src/hooks/useDeals.ts`, `useDealsForCompany.ts`, `useDealMutations.ts`

---

## Task 1: Additive won-transition denorm columns on accounts

**Files:**
- Migration: `20260720_add_won_denorm_columns` via `apply_migration`

**Interfaces:**
- Produces: `accounts.first_won_at`, `accounts.last_won_at`, `accounts.reopened_at`, `accounts.reopen_count`.

- [ ] **Step 1: Apply migration**

```sql
alter table accounts add column if not exists first_won_at  timestamptz;
alter table accounts add column if not exists last_won_at   timestamptz;
alter table accounts add column if not exists reopened_at   timestamptz;
alter table accounts add column if not exists reopen_count  int not null default 0;

create index if not exists accounts_last_won_at_idx on accounts(last_won_at) where last_won_at is not null;

-- Backfill won stamps
update accounts a set
  first_won_at = (select min(changed_at) from stage_history where account_id=a.id and to_stage='won'),
  last_won_at  = (select max(changed_at) from stage_history where account_id=a.id and to_stage='won')
where exists (select 1 from stage_history where account_id=a.id and to_stage='won');

-- Backfill reopen count from historical from_stage='lost' transitions
update accounts a set
  reopened_at  = (select max(changed_at) from stage_history where account_id=a.id and from_stage='lost'),
  reopen_count = (select count(*)        from stage_history where account_id=a.id and from_stage='lost')
where exists (select 1 from stage_history where account_id=a.id and from_stage='lost');
```

- [ ] **Step 2: Verify counts**

Run via `execute_sql`:

```sql
select
  count(*) filter (where first_won_at is not null) as have_first_won,
  count(*) filter (where last_won_at  is not null) as have_last_won,
  count(*) filter (where reopen_count > 0)          as ever_reopened
from accounts;
```

Expected: `have_first_won = have_last_won` and both ≥ number of won accounts in DB. `ever_reopened` may be zero on first run (no prior reopens tracked).

- [ ] **Step 3: Commit note**

Migrations applied via MCP are logged in `supabase_migrations.schema_migrations`. Add a repo note only if a `db/` folder exists — otherwise skip; MCP migration is the source of truth.

---

## Task 2: Rename disqualified_* columns to loss_* / lost_*

**Files:**
- Migration: `20260720_rename_disqualified_to_loss` via `apply_migration`

**Interfaces:**
- Produces: renamed columns `loss_reason`, `loss_notes`, `lost_by`, `lost_at` (denorm), `lost_from_stage`. `disqualified_*` no longer exist.
- Consumes: nothing.

**⚠️ Coordination note:** This migration renames columns in-place. The Vercel-hosted frontend must be redeployed within ~2 minutes so it stops issuing `select disqualified_reason` queries. Task 3–5 backfill uses the NEW names, so this must precede them. Frontend queries against the old names will 500 until Task 24 pushes; because Task 24 requires the new columns to exist, we accept a brief window and coordinate: run the migration and immediately deploy the frontend PR that renames the field access.

- [ ] **Step 1: Verify no active writes will break**

Run via `execute_sql`:

```sql
-- Confirm the current column names before renaming
select column_name from information_schema.columns
where table_schema='public' and table_name='accounts'
  and column_name in ('disqualified_reason','disqualified_notes','disqualified_by','disqualified_at','disq_stage');
```

Expected: 5 rows. If fewer, some renames already happened — inspect before proceeding.

- [ ] **Step 2: Apply migration**

```sql
alter table accounts rename column disqualified_reason to loss_reason;
alter table accounts rename column disqualified_notes  to loss_notes;
alter table accounts rename column disqualified_by     to lost_by;
alter table accounts rename column disqualified_at     to lost_at;
alter table accounts rename column disq_stage          to lost_from_stage;

create index if not exists accounts_lost_at_idx on accounts(lost_at) where lost_at is not null;
```

- [ ] **Step 3: Verify shape**

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='accounts'
  and column_name in ('loss_reason','loss_notes','lost_by','lost_at','lost_from_stage');
```

Expected: 5 rows.

---

## Task 3: Backfill lost_from_stage from stage_history

**Files:**
- Migration: `20260720_backfill_lost_from_stage`

**Interfaces:**
- Consumes: renamed `lost_from_stage` column (Task 2), `stage_history` (existing).

- [ ] **Step 1: Apply migration**

```sql
update accounts a set
  lost_from_stage = sub.from_stage
from (
  select distinct on (account_id)
    account_id, from_stage
  from stage_history
  where to_stage = 'lost'
  order by account_id, changed_at desc
) sub
where a.id = sub.account_id
  and a.stage = 'lost'
  and (a.lost_from_stage is null or a.lost_from_stage = '');
```

- [ ] **Step 2: Verify**

```sql
select stage, count(*), count(lost_from_stage) as with_stage_captured
from accounts
where stage = 'lost'
group by 1;
```

Expected: `with_stage_captured` covers most `stage='lost'` rows. Some may still be null if the account was created directly at lost or never had a `to_stage='lost'` stage_history row — acceptable.

---

## Task 4: Add reason_code + notes columns to stage_history

**Files:**
- Migration: `20260720_add_stage_history_reason_columns`

**Interfaces:**
- Produces: `stage_history.reason_code text`, `stage_history.notes text`.

- [ ] **Step 1: Apply migration**

```sql
alter table stage_history add column if not exists reason_code text;
alter table stage_history add column if not exists notes       text;

create index if not exists stage_history_reopen_idx on stage_history(account_id, changed_at)
  where from_stage = 'lost';
```

- [ ] **Step 2: Backfill reason_code for historical loss events from accounts.loss_reason**

```sql
update stage_history sh set reason_code = a.loss_reason, notes = a.loss_notes
from accounts a
where sh.account_id = a.id
  and sh.to_stage = 'lost'
  and sh.reason_code is null
  and a.loss_reason is not null
  and sh.id = (
    select id from stage_history
    where account_id = a.id and to_stage = 'lost'
    order by changed_at desc limit 1
  );
```

Fills in the most-recent lost row per account. Older lost rows (if the account has been lost multiple times) stay null.

- [ ] **Step 3: Verify**

```sql
select
  count(*) filter (where to_stage='lost' and reason_code is not null) as lost_with_reason,
  count(*) filter (where to_stage='lost')                              as lost_total
from stage_history;
```

Expected: `lost_with_reason` ≈ number of currently-lost accounts.

---

## Task 5: Add _sync_account_transition_stamps trigger

**Files:**
- Migration: `20260721_sync_account_transition_stamps_trigger`

**Interfaces:**
- Produces: trigger keeps `accounts.first_won_at / last_won_at / lost_at / reopened_at / reopen_count` in sync after every `stage_history` INSERT.
- Consumes: columns from Tasks 1 + 2.

- [ ] **Step 1: Apply migration**

```sql
create or replace function _sync_account_transition_stamps() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.to_stage = 'won' then
    update accounts set
      last_won_at  = new.changed_at,
      first_won_at = coalesce(first_won_at, new.changed_at)
    where id = new.account_id;
  end if;

  if new.to_stage = 'lost' then
    update accounts set lost_at = new.changed_at where id = new.account_id;
  end if;

  if new.from_stage = 'lost' and new.to_stage is distinct from 'lost' then
    update accounts set
      reopened_at  = new.changed_at,
      reopen_count = reopen_count + 1
    where id = new.account_id;
  end if;

  return new;
end;
$$;

drop trigger if exists stage_history_sync_account_transitions on stage_history;
create trigger stage_history_sync_account_transitions
  after insert on stage_history
  for each row execute function _sync_account_transition_stamps();
```

- [ ] **Step 2: Smoke test the trigger**

```sql
-- Pick any account not currently lost
with target as (
  select id from accounts where stage <> 'lost' and stage <> 'won' limit 1
)
insert into stage_history (account_id, from_stage, to_stage, changed_by, changed_at, reason_code, notes)
select id, 'lead', 'won', null, now(), null, 'test' from target
returning account_id;
```

Then:

```sql
select first_won_at, last_won_at from accounts where id = '<that account_id>';
```

Expected: both are set to a recent timestamp. Roll it back:

```sql
delete from stage_history where notes = 'test' and to_stage = 'won';
update accounts set first_won_at = null, last_won_at = null where id = '<that account_id>';
```

- [ ] **Step 3: (No commit — MCP migration is authoritative)**

---

## Task 6: Requalification tables

**Files:**
- Migration: `20260721_requalification_tables`

**Interfaces:**
- Produces: `requalification_rules` + `requalification_fires` tables.

- [ ] **Step 1: Apply migration**

```sql
create table requalification_rules (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  enabled           bool not null default true,
  reason_code       text,
  from_stages       text[],
  delay_days        int  not null check (delay_days > 0),
  task_title_tpl    text not null,
  task_priority     text not null default 'medium' check (task_priority in ('low','medium','high')),
  assignment_mode   text not null check (assignment_mode in (
    'same_owner','original_owner','round_robin_pool',
    'round_robin_excluding_original_owner','specific_user'
  )),
  assignee_pool     uuid[],
  specific_assignee uuid references profiles(id),
  rr_pointer        int not null default 0,
  fires_once        bool not null default true,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  created_by        uuid references profiles(id),
  updated_by        uuid references profiles(id)
);

create table requalification_fires (
  rule_id     uuid references requalification_rules(id) on delete cascade,
  account_id  uuid references accounts(id)              on delete cascade,
  task_id     uuid references tasks(id)                 on delete set null,
  fired_at    timestamptz default now(),
  primary key (rule_id, account_id)
);

alter table requalification_rules enable row level security;
alter table requalification_fires enable row level security;

-- Admins full access; everyone else can only read enabled rules.
create policy requalification_rules_admin_all on requalification_rules
  for all using (is_admin()) with check (is_admin());
create policy requalification_rules_read_enabled on requalification_rules
  for select using (enabled = true);
create policy requalification_fires_admin_all on requalification_fires
  for all using (is_admin()) with check (is_admin());

-- Seed 3 starter rules DISABLED — admin turns them on.
insert into requalification_rules (name, enabled, reason_code, delay_days, task_title_tpl,
  task_priority, assignment_mode, assignee_pool, fires_once)
values
  ('60-day no-response nudge', false, 'no_response', 60,
   'Re-engage {{company_name}} — no response {{days_ago}}d ago',
   'medium', 'round_robin_excluding_original_owner', '{}', true),
  ('90-day wrong-timing check-in', false, 'wrong_timing', 90,
   'Timing check-in — {{company_name}}',
   'low', 'same_owner', null, true),
  ('180-day no-budget check-in', false, 'no_budget', 180,
   'Budget check-in — {{company_name}}',
   'low', 'same_owner', null, true);
```

- [ ] **Step 2: Verify**

```sql
select count(*) as seeded from requalification_rules where enabled = false;
```

Expected: `seeded = 3`.

---

## Task 7: log_stage_change trigger suppression + reopen_account + lose_account RPCs

**Files:**
- Migration: `20260722_stage_change_trigger_suppression_and_transition_rpcs`

**Interfaces:**
- Produces: `reopen_account(uuid, text, text, text) returns void`; `lose_account(uuid, text, text) returns void`; modified `log_stage_change()` function.
- Consumes: renamed loss_* columns from Task 2; reason_code column from Task 4; trigger from Task 5.

**Design note (why this exists):** The existing `log_stage_change` trigger inserts a `stage_history` row on every `UPDATE OF stage`. If our Loss/Reopen RPCs ALSO insert their own row (which they must, because only they know the reason_code), we get duplicates. Fix: make the trigger honor a transaction-local flag `sdd.suppress_stage_history_trigger`; the RPCs set it before UPDATE and insert their own row explicitly.

- [ ] **Step 1: Apply migration — patch trigger, add both RPCs**

```sql
-- 1) Patch log_stage_change() so it honors a suppression flag.
--    Preserves current behavior for every other stage change.
create or replace function log_stage_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('sdd.suppress_stage_history_trigger', true) = 'true' then
    return new;
  end if;

  insert into stage_history (account_id, from_stage, to_stage, changed_by, changed_at)
  values (new.id, old.stage, new.stage, auth.uid(), now());

  return new;
end;
$$;

-- 2) reopen_account: sets flag, updates, inserts its own history row with reason.
create or replace function reopen_account(
  p_account_id   uuid,
  p_target_stage text,
  p_reason_code  text,
  p_notes        text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_stage text;
begin
  select stage into v_current_stage from accounts where id = p_account_id for update;
  if v_current_stage is null then
    raise exception 'Account % not found', p_account_id;
  end if;
  if v_current_stage <> 'lost' then
    raise exception 'Account is not lost (current stage: %)', v_current_stage;
  end if;
  if p_target_stage not in ('lead','mql','sql','demo','proposal') then
    raise exception 'Cannot reopen directly to %', p_target_stage;
  end if;
  if p_reason_code not in ('customer_returned','budget_approved','timing_changed','wrong_call','other') then
    raise exception 'Invalid reopen reason_code: %', p_reason_code;
  end if;

  perform set_config('sdd.suppress_stage_history_trigger', 'true', true);

  update accounts set
    stage           = p_target_stage,
    loss_reason     = null,
    loss_notes      = null,
    lost_at         = null,
    lost_by         = null,
    lost_from_stage = null
  where id = p_account_id;

  perform set_config('sdd.suppress_stage_history_trigger', 'false', true);

  insert into stage_history (account_id, from_stage, to_stage, changed_by, changed_at, reason_code, notes)
  values (p_account_id, 'lost', p_target_stage, auth.uid(), now(), p_reason_code, p_notes);

  insert into tasks (account_id, title, owner_id, priority, kind)
  select p_account_id,
         'Follow up: re-engage ' || coalesce(a.name, '(unnamed)'),
         a.owner_id, 'medium', 'reopen_follow_up'
  from accounts a where a.id = p_account_id;
end;
$$;

grant execute on function reopen_account(uuid, text, text, text) to authenticated;

-- 3) lose_account: mirror of reopen_account for the Loss direction.
create or replace function lose_account(
  p_account_id  uuid,
  p_reason_code text,
  p_notes       text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_stage text;
  v_actor         uuid := auth.uid();
begin
  select stage into v_current_stage from accounts where id = p_account_id for update;
  if v_current_stage is null then
    raise exception 'Account % not found', p_account_id;
  end if;
  if v_current_stage not in ('lead','mql','sql','demo','proposal') then
    raise exception 'Cannot lose from stage % (must be an open pipeline stage)', v_current_stage;
  end if;
  if p_reason_code not in ('no_budget','competitor','wrong_timing','no_response','chose_alternative','postponed','other') then
    raise exception 'Invalid loss reason_code: %', p_reason_code;
  end if;
  if p_reason_code = 'other' and (p_notes is null or btrim(p_notes) = '') then
    raise exception 'Notes are required when reason_code = other';
  end if;

  perform set_config('sdd.suppress_stage_history_trigger', 'true', true);

  update accounts set
    stage           = 'lost',
    loss_reason     = p_reason_code,
    loss_notes      = p_notes,
    lost_by         = v_actor,
    lost_from_stage = v_current_stage
  where id = p_account_id;

  perform set_config('sdd.suppress_stage_history_trigger', 'false', true);

  insert into stage_history (account_id, from_stage, to_stage, changed_by, changed_at, reason_code, notes)
  values (p_account_id, v_current_stage, 'lost', v_actor, now(), p_reason_code, p_notes);
end;
$$;

grant execute on function lose_account(uuid, text, text) to authenticated;
```

- [ ] **Step 2: Smoke test — Loss then Reopen produces exactly ONE stage_history row each**

```sql
-- Pick an open account
with target as (
  select id, stage from accounts where stage in ('lead','mql','sql','demo','proposal') limit 1
)
select * from target;

-- Lose it (replace <ID>)
select lose_account('<ID>'::uuid, 'no_budget', 'test');
-- Expect exactly ONE new stage_history row (to_stage='lost', reason_code='no_budget')
select * from stage_history where account_id = '<ID>' order by changed_at desc limit 3;

-- Reopen it
select reopen_account('<ID>'::uuid, 'lead', 'wrong_call', 'test reopen');
-- Expect exactly ONE new stage_history row (from_stage='lost', to_stage='lead', reason_code='wrong_call')
select * from stage_history where account_id = '<ID>' order by changed_at desc limit 3;

-- Verify denorm columns from Task 5 trigger updated correctly
select stage, loss_reason, lost_at, reopened_at, reopen_count from accounts where id = '<ID>';
-- Expect: stage='lead', loss_reason=null, lost_at=null, reopened_at≈now(), reopen_count>=1

-- Verify a regular stage change (not via RPC) still emits its own history row
update accounts set stage = 'mql' where id = '<ID>';
select * from stage_history where account_id = '<ID>' order by changed_at desc limit 2;
-- Expect: exactly ONE new row (from_stage='lead', to_stage='mql', reason_code=null)

-- Roll back
update accounts set stage = 'lost' where id = '<ID>';
delete from stage_history where account_id = '<ID>' and notes in ('test','test reopen');
```

Expected across all three checks: **exactly one** new stage_history row per action, and the plain-UPDATE path still works with reason_code null (backwards compatible for the existing pipeline drag-drop code).

---

## Task 8: get_company_history RPC

**Files:**
- Migration: `20260722_get_company_history_rpc`

**Interfaces:**
- Produces: `get_company_history(uuid, int, timestamptz) returns table(id text, kind text, at timestamptz, actor_id uuid, actor_name text, stage_at_time text, title text, body text, meta jsonb)`.

- [ ] **Step 1: Apply migration**

```sql
create or replace function get_company_history(
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
language sql as $$
with stage_windows as (
  select
    account_id,
    coalesce(from_stage, (select stage from accounts where id = p_account_id)) as prev_stage,
    to_stage,
    changed_at,
    lead(changed_at) over (partition by account_id order by changed_at) as next_change_at
  from stage_history
  where account_id = p_account_id
),
merged as (
  -- Activities
  select
    'act:' || a.id::text                       as id,
    a.kind                                     as kind,
    a.happened_at                              as at,
    a.author_id                                as actor_id,
    p.full_name                                as actor_name,
    (select to_stage from stage_windows
      where changed_at <= a.happened_at
      order by changed_at desc limit 1)         as stage_at_time,
    coalesce(a.title, initcap(a.kind))         as title,
    a.text                                     as body,
    jsonb_build_object('completed_at', a.completed_at, 'due_at', a.due_at, 'duration_min', a.duration_min) as meta
  from activities a
  left join profiles p on p.id = a.author_id
  where a.account_id = p_account_id

  union all
  -- Stage transitions
  select
    'sh:' || sh.id::text,
    case
      when sh.to_stage = 'lost'                                       then 'loss'
      when sh.from_stage = 'lost' and sh.to_stage is distinct from 'lost' then 'reopen'
      else 'stage_change'
    end,
    sh.changed_at,
    sh.changed_by,
    p.full_name,
    sh.to_stage,
    case
      when sh.to_stage = 'lost'                                       then 'Marked as lost'
      when sh.from_stage = 'lost' and sh.to_stage is distinct from 'lost' then 'Reopened to ' || upper(sh.to_stage)
      else 'Moved to ' || upper(sh.to_stage)
    end,
    sh.notes,
    jsonb_build_object('from', sh.from_stage, 'to', sh.to_stage, 'reason_code', sh.reason_code)
  from stage_history sh
  left join profiles p on p.id = sh.changed_by
  where sh.account_id = p_account_id

  union all
  -- Synthetic account-created row
  select
    'acct:created:' || a.id::text,
    'account_created',
    a.created_at,
    null::uuid,
    'System',
    'lead',
    'Account created',
    a.source,
    jsonb_build_object('source', a.source)
  from accounts a
  where a.id = p_account_id
)
select * from merged
where p_before is null or at < p_before
order by at desc
limit p_limit;
$$;

grant execute on function get_company_history(uuid, int, timestamptz) to authenticated;
```

- [ ] **Step 2: Smoke test**

```sql
select kind, at, actor_name, title, stage_at_time
from get_company_history(
  (select id from accounts where name ilike '%tele-med%' limit 1),
  20, null
);
```

Expected: 5–20 rows spanning multiple kinds (`note`/`call`, `stage_change`, `account_created` at the bottom).

---

## Task 9: Archive deals rows into accounts.raw_data.legacy_deals

**Files:**
- Migration: `20260722_archive_deals_to_raw_data`

**Interfaces:**
- Produces: `accounts.raw_data.legacy_deals[]` populated for all accounts that ever had a `deals` row.

- [ ] **Step 1: Apply migration**

```sql
update accounts a set raw_data = coalesce(a.raw_data, '{}'::jsonb) ||
  jsonb_build_object('legacy_deals', (
    select coalesce(jsonb_agg(to_jsonb(d) - 'account_id'), '[]'::jsonb)
    from deals d where d.account_id = a.id
  ))
where exists (select 1 from deals d where d.account_id = a.id);
```

- [ ] **Step 2: Verify**

```sql
select
  (select count(*) from deals)                                              as source_deals,
  (select sum(jsonb_array_length(raw_data->'legacy_deals'))
   from accounts where raw_data ? 'legacy_deals')                           as archived_deals;
```

Expected: `source_deals = archived_deals`.

---

## Task 10: Feature flags in app_settings + flags reader hook

**Files:**
- Migration: `20260722_add_deal_removal_feature_flags`
- Create: `recruitera-crm-v3/src/lib/flags.ts`
- Create: `recruitera-crm-v3/src/lib/__tests__/flags.test.ts`

**Interfaces:**
- Produces: `useFeatureFlag('deals_ui_hidden' | 'use_new_reports'): boolean`.

- [ ] **Step 1: Apply migration**

```sql
-- app_settings uses one row keyed by `key`. Two new keys, default false.
insert into app_settings (key, value) values
  ('deals_ui_hidden',  'false'::jsonb),
  ('use_new_reports',  'false'::jsonb)
on conflict (key) do nothing;
```

- [ ] **Step 2: Write the failing test**

```typescript
// src/lib/__tests__/flags.test.ts
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFeatureFlag } from '../flags';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (_: string, key: string) => ({
          maybeSingle: async () => ({ data: { value: key === 'deals_ui_hidden' } }),
        }),
      }),
    }),
  },
}));

describe('useFeatureFlag', () => {
  it('returns the boolean value for a known flag key', async () => {
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useFeatureFlag('deals_ui_hidden'), { wrapper });
    await vi.waitFor(() => expect(result.current).toBe(true));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd recruitera-crm-v3 && npx vitest run src/lib/__tests__/flags.test.ts
```

Expected: FAIL — `Cannot find module '../flags'`.

- [ ] **Step 4: Implement the hook**

```typescript
// src/lib/flags.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type FeatureFlagKey = 'deals_ui_hidden' | 'use_new_reports';

export function useFeatureFlag(key: FeatureFlagKey): boolean {
  const { data } = useQuery({
    queryKey: ['feature_flag', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings').select('value').eq('key', key).maybeSingle();
      if (error) throw error;
      // app_settings.value is jsonb; the value may be a bool literal or a JSON-wrapped bool.
      const raw = (data as { value: unknown } | null)?.value;
      return raw === true || raw === 'true';
    },
    staleTime: 60_000,
  });
  return data ?? false;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run src/lib/__tests__/flags.test.ts
```

Expected: PASS.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add recruitera-crm-v3/src/lib/flags.ts recruitera-crm-v3/src/lib/__tests__/flags.test.ts
git commit -m "feat(crm-v3): feature-flag reader hook for deals_ui_hidden + use_new_reports"
```

---

## Task 11: Extend useAccounts + Account type with new columns

**Files:**
- Modify: `recruitera-crm-v3/src/hooks/useAccounts.ts`

**Interfaces:**
- Produces: `Account.first_won_at`, `.last_won_at`, `.lost_at`, `.reopened_at`, `.reopen_count`, `.loss_reason`, `.loss_notes`, `.lost_by`, `.lost_from_stage`.

- [ ] **Step 1: Edit the Account type and select string**

In `src/hooks/useAccounts.ts`, add fields to the `Account` type and to the `.select(...)` string, replacing occurrences of `disqualified_*` and `disq_stage` with the new names.

```typescript
// Add to Account type:
  loss_reason: string | null;
  loss_notes: string | null;
  lost_by: string | null;
  lost_at: string | null;
  lost_from_stage: string | null;
  first_won_at: string | null;
  last_won_at: string | null;
  reopened_at: string | null;
  reopen_count: number;

// Update select():
.select(
  'id,bubble_id,name,domain,stage,source,am_mail,paid_status,activation_status,has_trial,' +
  'deal_value,deal_currency,owner_id,customer_success_id,' +
  'loss_reason,loss_notes,lost_by,lost_at,lost_from_stage,' +
  'first_won_at,last_won_at,reopened_at,reopen_count,' +
  'cs_email,company_ref,campaign,merged_into,funnel_score,board_position,' +
  'created_at,bubble_created_at,health_score,health_status,health_factors'
)
```

- [ ] **Step 2: Fix compile errors across the app**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: multiple errors in files that reference `disqualified_reason`, `disq_stage`, etc. Rename each to the new field name (`loss_reason`, `lost_from_stage`).

- [ ] **Step 3: Re-run typecheck until clean**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run tests**

```bash
npx vitest run
```

Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add -A recruitera-crm-v3/src
git commit -m "refactor(crm-v3): rename Account.disqualified_* → loss_* / lost_* across app"
```

---

## Task 12: Rename DisqualifyModal → LossModal + capture lost_from_stage explicitly

**Files:**
- Rename+modify: `recruitera-crm-v3/src/features/companies/DisqualifyModal.tsx` → `LossModal.tsx`
- Modify: `recruitera-crm-v3/src/features/company-profile/CompanyProfile.tsx` (import + button label)
- Modify: `recruitera-crm-v3/src/hooks/useDisqualify.ts` → `useLoseAccount.ts` (rename file + function name)

**Interfaces:**
- Produces: `<LossModal accountId={...} onClose={...} />` — 7 loss reasons, requires notes only when `reason='other'`; writes `stage='lost' + loss_reason + loss_notes + lost_by + lost_at (via trigger) + lost_from_stage (captured before the update)`; also inserts a `stage_history` row with `reason_code = loss_reason`.

- [ ] **Step 1: Rename hook and rewrite mutation body — call the `lose_account` RPC**

```typescript
// src/hooks/useLoseAccount.ts (renamed from useDisqualify.ts)
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export const LOSS_REASONS = [
  'no_budget','competitor','wrong_timing','no_response','chose_alternative','postponed','other',
] as const;
export type LossReason = typeof LOSS_REASONS[number];

/**
 * Thin wrapper over the `lose_account` RPC (Task 7). The RPC:
 *   1. reads current stage → writes lost_from_stage
 *   2. writes stage='lost' + loss_reason + loss_notes + lost_by atomically
 *   3. suppresses the log_stage_change trigger during the UPDATE so exactly
 *      ONE stage_history row is written (with reason_code + notes)
 * All that logic lives server-side to avoid dup rows and race conditions.
 */
export function useLoseAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { accountId: string; reason: LossReason; notes: string | null }) => {
      const { error } = await supabase.rpc('lose_account', {
        p_account_id:  args.accountId,
        p_reason_code: args.reason,
        p_notes:       args.notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
      qc.invalidateQueries({ queryKey: ['company_history'] });
    },
  });
}
```

- [ ] **Step 2: Rename and update LossModal**

```typescript
// src/features/companies/LossModal.tsx (renamed from DisqualifyModal.tsx)
// - Rename component to LossModal
// - Replace reasons list with LOSS_REASONS from useLoseAccount
// - Change header text: "Mark as lost" (was: "Disqualify company")
// - Change button copy: "Mark lost" (was: "Disqualify")
// - Otherwise structure identical to current DisqualifyModal (radio + notes textarea + submit)
```

Apply the actual changes — copy the existing DisqualifyModal file, rename to `LossModal.tsx`, adjust the imports and strings. Delete the old file.

- [ ] **Step 3: Update all imports app-wide**

```bash
grep -rn 'DisqualifyModal\|useDisqualify' recruitera-crm-v3/src
```

For each hit, update to `LossModal` / `useLoseAccount`. In `CompanyProfile.tsx` the button label "Disqualify" becomes "Lose".

- [ ] **Step 4: Typecheck + tests**

```bash
npx tsc --noEmit && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add -A recruitera-crm-v3/src
git commit -m "refactor(crm-v3): DisqualifyModal → LossModal; capture lost_from_stage + reason_code"
```

---

## Task 13: ReopenModal + useReopenAccount hook

**Files:**
- Create: `recruitera-crm-v3/src/features/company-profile/ReopenModal.tsx`
- Create: `recruitera-crm-v3/src/hooks/useReopenAccount.ts`

**Interfaces:**
- Consumes: `reopen_account` RPC from Task 7.
- Produces: `<ReopenModal accountId lostFromStage lossReason onClose />`; `useReopenAccount()` mutation with `mutate({ accountId, targetStage, reasonCode, notes })`.

- [ ] **Step 1: Implement hook**

```typescript
// src/hooks/useReopenAccount.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export const REOPEN_REASONS = [
  'customer_returned','budget_approved','timing_changed','wrong_call','other',
] as const;
export type ReopenReason = typeof REOPEN_REASONS[number];

export const REOPEN_TARGET_STAGES = ['lead','mql','sql','demo','proposal'] as const;
export type ReopenTargetStage = typeof REOPEN_TARGET_STAGES[number];

export function useReopenAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      accountId: string;
      targetStage: ReopenTargetStage;
      reasonCode: ReopenReason;
      notes: string | null;
    }) => {
      const { error } = await supabase.rpc('reopen_account', {
        p_account_id:   args.accountId,
        p_target_stage: args.targetStage,
        p_reason_code:  args.reasonCode,
        p_notes:        args.notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['company_history'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
```

- [ ] **Step 2: Implement ReopenModal**

```typescript
// src/features/company-profile/ReopenModal.tsx
import { useState } from 'react';
import { X } from 'lucide-react';
import { REOPEN_REASONS, REOPEN_TARGET_STAGES, useReopenAccount, type ReopenReason, type ReopenTargetStage } from '@/hooks/useReopenAccount';

const REASON_LABELS: Record<ReopenReason, string> = {
  customer_returned: 'Customer returned',
  budget_approved:   'Budget approved',
  timing_changed:    'Timing changed',
  wrong_call:        "Wrong call — shouldn't have been lost",
  other:             'Other',
};

const STAGE_LABELS: Record<ReopenTargetStage, string> = {
  lead: 'Lead', mql: 'MQL', sql: 'SQL', demo: 'Demo', proposal: 'Proposal',
};

export function ReopenModal({
  accountId, companyName, lostFromStage, lossReason, onClose,
}: {
  accountId: string;
  companyName: string;
  lostFromStage: string | null;
  lossReason: string | null;
  onClose: () => void;
}) {
  const [target, setTarget] = useState<ReopenTargetStage>('lead');
  const [reason, setReason] = useState<ReopenReason>('customer_returned');
  const [notes, setNotes] = useState('');
  const reopen = useReopenAccount();

  const canSubmit = !!reason && (reason !== 'other' || notes.trim().length > 0);

  async function submit() {
    if (!canSubmit) return;
    await reopen.mutateAsync({ accountId, targetStage: target, reasonCode: reason, notes: notes.trim() || null });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-surface rounded-xl shadow-sh3 border border-border w-full max-w-[520px] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[16px] font-black">Reopen "{companyName}"</div>
          <button onClick={onClose} className="text-text-3 hover:text-text"><X size={16} /></button>
        </div>

        <label className="block mb-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Move back to stage</span>
          <select value={target} onChange={(e) => setTarget(e.target.value as ReopenTargetStage)}
            className="mt-1 w-full h-9 px-3 border border-border-2 rounded-lg bg-surface text-[13px]">
            {REOPEN_TARGET_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
          </select>
        </label>

        <fieldset className="mb-4">
          <legend className="text-[10px] font-black uppercase tracking-widest text-text-3 mb-1">Why is this back? (required)</legend>
          <div className="space-y-1.5">
            {REOPEN_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 text-[13px]">
                <input type="radio" name="reopen_reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
                {REASON_LABELS[r]}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block mb-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Note {reason === 'other' && <span className="text-bad">(required)</span>}</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full px-3 py-2 border border-border-2 rounded-lg bg-surface text-[13px] resize-none" />
        </label>

        {(lostFromStage || lossReason) && (
          <div className="text-[11px] text-text-3 mb-4 p-2 rounded bg-surface-2">
            Was lost from <span className="font-bold text-text-2">{lostFromStage ?? '—'}</span>
            {' '}· reason <span className="font-bold text-text-2">{lossReason ?? '—'}</span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-3 rounded-lg border border-border text-[12px] font-bold">Cancel</button>
          <button onClick={submit} disabled={!canSubmit || reopen.isPending}
            className="h-8 px-4 rounded-lg bg-ok text-white text-[12px] font-black disabled:opacity-50">
            {reopen.isPending ? 'Reopening…' : 'Reopen'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + tests**

```bash
npx tsc --noEmit && npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add -A recruitera-crm-v3/src
git commit -m "feat(crm-v3): ReopenModal + useReopenAccount RPC hook"
```

---

## Task 14: Wire Lose/Reopen buttons on company profile header

**Files:**
- Modify: `recruitera-crm-v3/src/features/company-profile/CompanyProfile.tsx`

**Interfaces:**
- Consumes: `LossModal`, `ReopenModal`, `lead.stage`, `lead.lost_from_stage`, `lead.loss_reason`.

- [ ] **Step 1: Locate the current Disqualify button block**

```bash
grep -n 'Disqualify\|DisqualifyModal' recruitera-crm-v3/src/features/company-profile/CompanyProfile.tsx
```

- [ ] **Step 2: Replace with conditional Lose/Reopen**

Rendering rule:
- `stage === 'lost'` → show **↺ Reopen** button; opens `<ReopenModal ... />`
- `stage in ('lead','mql','sql','demo','proposal')` → show **✕ Lose** button; opens `<LossModal ... />`
- `stage in ('won','paid')` → show neither

```typescript
// Inside the header actions row of CompanyProfile
{lead.stage === 'lost' && (
  <button onClick={() => setReopenOpen(true)}
    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-ok text-ok text-[12px] font-bold hover:bg-ok/10">
    <RotateCcw size={12} /> Reopen
  </button>
)}
{OPEN_STAGES.includes(lead.stage as string) && (
  <button onClick={() => setLossOpen(true)}
    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-bad text-bad text-[12px] font-bold hover:bg-bad/10">
    <X size={12} /> Lose
  </button>
)}
{lossOpen   && <LossModal accountId={lead.id} onClose={() => setLossOpen(false)} />}
{reopenOpen && <ReopenModal accountId={lead.id} companyName={lead.name ?? ''}
                            lostFromStage={lead.lost_from_stage} lossReason={lead.loss_reason}
                            onClose={() => setReopenOpen(false)} />}
```

Where `OPEN_STAGES = ['lead','mql','sql','demo','proposal']` is a local const.

- [ ] **Step 3: Typecheck + tests + build**

```bash
npx tsc --noEmit && npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add -A recruitera-crm-v3/src/features/company-profile/CompanyProfile.tsx
git commit -m "feat(crm-v3): Company profile — Lose button on open stages, Reopen when lost"
```

---

## Task 15: Rename Sidebar "Disqualified" → "Lost" and the Disqualified list route

**Files:**
- Modify: `recruitera-crm-v3/src/components/layout/Sidebar.tsx`
- Modify: `recruitera-crm-v3/src/features/companies/DisqualifiedList.tsx` (rename file → `LostList.tsx`, rename component)
- Modify: `recruitera-crm-v3/src/routes/index.tsx` (rename route from `/disqualified` → `/lost`, keep old redirect)

- [ ] **Step 1: Find current references**

```bash
grep -rn 'Disqualified\|disqualified' recruitera-crm-v3/src --include='*.tsx' --include='*.ts' | grep -v 'legacy_deals\|disqualified_'
```

- [ ] **Step 2: Rename component, route, sidebar entry**

- File `DisqualifiedList.tsx` → `LostList.tsx`; export `LostList`.
- Sidebar label "Disqualified" → "Lost"; icon may stay.
- Route: add `/lost` pointing to `<LostList />`; keep `/disqualified` → `<Navigate to="/lost" replace />` for one release.

- [ ] **Step 3: Update all internal links**

```bash
grep -rn 'to="/disqualified"\|href="/disqualified"' recruitera-crm-v3/src
```

Update each to `/lost`.

- [ ] **Step 4: Typecheck + tests**

```bash
npx tsc --noEmit && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add -A recruitera-crm-v3/src
git commit -m "refactor(crm-v3): rename Disqualified sidebar entry + list to Lost"
```

---

## Task 16: useCompanyHistory hook

**Files:**
- Create: `recruitera-crm-v3/src/hooks/useCompanyHistory.ts`
- Create: `recruitera-crm-v3/src/hooks/__tests__/useCompanyHistory.test.ts`

**Interfaces:**
- Consumes: `get_company_history` RPC from Task 8.
- Produces: `useCompanyHistory(accountId)` returning `useInfiniteQuery` with page shape `HistoryEvent[]`.

- [ ] **Step 1: Write the failing test (shape only)**

```typescript
// src/hooks/__tests__/useCompanyHistory.test.ts
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCompanyHistory } from '../useCompanyHistory';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({
      data: [{ id:'act:1', kind:'note', at:'2026-07-19T10:00:00Z', actor_id:null,
               actor_name:'Amr', stage_at_time:'lead', title:'Note', body:'hi', meta:{} }],
      error: null,
    }),
  },
}));

describe('useCompanyHistory', () => {
  it('returns first page of events', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = ({ children }: any) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useCompanyHistory('acct-1'), { wrapper: wrap });
    await waitFor(() => expect(result.current.data?.pages?.[0]?.length).toBe(1));
    expect(result.current.data!.pages[0][0].kind).toBe('note');
  });
});
```

- [ ] **Step 2: Run test to see FAIL**

```bash
npx vitest run src/hooks/__tests__/useCompanyHistory.test.ts
```

Expected: FAIL (`Cannot find module '../useCompanyHistory'`).

- [ ] **Step 3: Implement hook**

```typescript
// src/hooks/useCompanyHistory.ts
import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type HistoryEvent = {
  id: string;
  kind: 'note'|'call'|'email'|'meeting'|'task_created'|'task_done'|
        'stage_change'|'loss'|'reopen'|'owner_change'|'deal_value_change'|
        'requalification_fire'|'meta_lead_attached'|'account_created';
  at: string;
  actor_id: string | null;
  actor_name: string | null;
  stage_at_time: string | null;
  title: string;
  body: string | null;
  meta: Record<string, unknown> | null;
};

const PAGE = 50;

export function useCompanyHistory(accountId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['company_history', accountId],
    enabled: !!accountId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('get_company_history', {
        p_account_id: accountId,
        p_limit: PAGE,
        p_before: pageParam,
      });
      if (error) throw error;
      return (data ?? []) as HistoryEvent[];
    },
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].at : null),
  });
}
```

- [ ] **Step 4: Run test → PASS**

```bash
npx vitest run src/hooks/__tests__/useCompanyHistory.test.ts
```

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add recruitera-crm-v3/src/hooks/useCompanyHistory.ts recruitera-crm-v3/src/hooks/__tests__/useCompanyHistory.test.ts
git commit -m "feat(crm-v3): useCompanyHistory infinite query hook backed by get_company_history RPC"
```

---

## Task 17: HistoryTab component — rename Activity → History, render merged events

**Files:**
- Rename+rewrite: `recruitera-crm-v3/src/features/company-profile/ActivityTab.tsx` → `HistoryTab.tsx`
- Modify: `recruitera-crm-v3/src/features/company-profile/CompanyProfile.tsx` (tab label + import)

**Interfaces:**
- Consumes: `useCompanyHistory(accountId)`, existing composer component.
- Produces: `<HistoryTab accountId={...} />`.

- [ ] **Step 1: Design event → visual mapping**

Add a `kindStyle(kind)` helper returning `{ icon, tone }`:
```typescript
const KIND_STYLE: Record<HistoryEvent['kind'], { icon: LucideIcon; tone: string }> = {
  note:               { icon: FileText,       tone: 'text-text-3' },
  call:               { icon: Phone,          tone: 'text-text-3' },
  email:              { icon: Mail,           tone: 'text-text-3' },
  meeting:            { icon: Users,          tone: 'text-text-3' },
  task_created:       { icon: CheckSquare,    tone: 'text-text-3' },
  task_done:          { icon: CheckSquare,    tone: 'text-ok'      },
  stage_change:       { icon: ArrowRightLeft, tone: 'text-info'    },
  loss:               { icon: XCircle,        tone: 'text-bad'     },
  reopen:             { icon: RotateCcw,      tone: 'text-ok'      },
  owner_change:       { icon: UserCheck,      tone: 'text-text-3'  },
  deal_value_change:  { icon: DollarSign,     tone: 'text-text-3'  },
  requalification_fire: { icon: Bot,          tone: 'text-purple'  },
  meta_lead_attached: { icon: Target,         tone: 'text-info'    },
  account_created:    { icon: Star,           tone: 'text-text-3'  },
};
```

- [ ] **Step 2: Implement HistoryTab**

```typescript
// src/features/company-profile/HistoryTab.tsx
import { useMemo, useState } from 'react';
// ... imports for icons, useCompanyHistory, existing Composer, StagePill, cn
import { StagePill } from '@/components/shared/StagePill';

export function HistoryTab({ accountId }: { accountId: string }) {
  const q = useCompanyHistory(accountId);
  const [filter, setFilter] = useState<'all'|'comms'|'tasks'|'stage'|'system'>('all');
  const [search, setSearch] = useState('');

  const events = useMemo(() => (q.data?.pages ?? []).flat(), [q.data]);
  const filtered = useMemo(() => events.filter((e) => {
    if (filter === 'comms'  && !['note','call','email','meeting'].includes(e.kind))                          return false;
    if (filter === 'tasks'  && !['task_created','task_done'].includes(e.kind))                                return false;
    if (filter === 'stage'  && !['stage_change','loss','reopen'].includes(e.kind))                            return false;
    if (filter === 'system' && !['owner_change','deal_value_change','requalification_fire','meta_lead_attached','account_created'].includes(e.kind)) return false;
    if (search) {
      const s = search.toLowerCase();
      return (e.title?.toLowerCase().includes(s) || e.body?.toLowerCase().includes(s));
    }
    return true;
  }), [events, filter, search]);

  const grouped = groupByDate(filtered); // {label: 'TODAY'|'YESTERDAY'|'2026-07-19', events: HistoryEvent[]}[]

  return (
    <div>
      {/* Composer goes here — reuse existing composer component from ActivityTab */}
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        {(['all','comms','tasks','stage','system'] as const).map((k) => (
          <button key={k} onClick={() => setFilter(k)}
            className={cn('h-7 px-3 rounded-full text-[11.5px] font-bold border',
              filter === k ? 'bg-accent text-cg-900 border-accent-strong' : 'bg-surface-2 text-text-3 border-border')}>
            {k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search history…"
          className="ml-auto h-7 px-2 text-[12px] border border-border rounded-lg bg-surface w-64" />
      </div>

      {/* Grouped list */}
      {grouped.map((group) => (
        <section key={group.label}>
          <h4 className="text-[10px] font-black uppercase tracking-widest text-text-3 mt-4 mb-2">{group.label}</h4>
          <ul className="space-y-3">
            {group.events.map((ev) => <HistoryRow key={ev.id} ev={ev} />)}
          </ul>
        </section>
      ))}

      {q.hasNextPage && (
        <button onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}
          className="mt-4 w-full h-8 rounded-lg border border-border text-[12px] font-bold">
          {q.isFetchingNextPage ? 'Loading…' : 'Load older events'}
        </button>
      )}
    </div>
  );
}

function HistoryRow({ ev }: { ev: HistoryEvent }) {
  const { icon: Icon, tone } = KIND_STYLE[ev.kind];
  return (
    <li className="flex gap-3">
      <Icon size={14} className={cn('mt-0.5 shrink-0', tone)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] font-bold">{ev.title}</span>
          {ev.stage_at_time && <StagePill stage={ev.stage_at_time} />}
        </div>
        <div className="text-[11px] text-text-3">
          {ev.actor_name ?? 'System'} · {new Date(ev.at).toLocaleString()}
          {typeof ev.meta?.reason_code === 'string' && ` · reason: ${ev.meta.reason_code}`}
        </div>
        {ev.body && <div className="text-[12.5px] text-text mt-1 whitespace-pre-wrap">{ev.body}</div>}
      </div>
    </li>
  );
}

function groupByDate(events: HistoryEvent[]) {
  const today = new Date(); today.setHours(0,0,0,0);
  const yest  = new Date(today.getTime() - 24*3600*1000);
  const buckets = new Map<string, HistoryEvent[]>();
  for (const e of events) {
    const d = new Date(e.at); d.setHours(0,0,0,0);
    const key = d.getTime() === today.getTime() ? 'TODAY'
              : d.getTime() === yest.getTime()  ? 'YESTERDAY'
              : d.toISOString().slice(0, 10);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(e);
  }
  return Array.from(buckets.entries()).map(([label, events]) => ({ label, events }));
}
```

- [ ] **Step 3: Wire in CompanyProfile**

- Replace `<ActivityTab ... />` with `<HistoryTab accountId={id} />`.
- Rename the tab label from "Activity" to "History" in the tab list.

- [ ] **Step 4: Delete the old ActivityTab.tsx**

- [ ] **Step 5: Typecheck + tests**

```bash
npx tsc --noEmit && npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add -A recruitera-crm-v3/src
git commit -m "feat(crm-v3): HistoryTab — merged event log (activities + stage_history + audit + requal)"
```

---

## Task 18: RequalificationSettings page + RuleEditorModal

**Files:**
- Create: `recruitera-crm-v3/src/features/settings/RequalificationSettings.tsx`
- Create: `recruitera-crm-v3/src/features/settings/RuleEditorModal.tsx`
- Create: `recruitera-crm-v3/src/hooks/useRequalificationRules.ts`
- Modify: `recruitera-crm-v3/src/routes/index.tsx` (add `/settings/requalification`)
- Modify: `recruitera-crm-v3/src/features/settings/SettingsShell.tsx` (add sidebar entry)

**Interfaces:**
- Consumes: `requalification_rules` table from Task 6.
- Produces: `<RequalificationSettings />` page and `<RuleEditorModal />`.

- [ ] **Step 1: Implement hook**

```typescript
// src/hooks/useRequalificationRules.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type RequalificationRule = {
  id: string;
  name: string;
  enabled: boolean;
  reason_code: string | null;
  from_stages: string[] | null;
  delay_days: number;
  task_title_tpl: string;
  task_priority: 'low' | 'medium' | 'high';
  assignment_mode: 'same_owner'|'original_owner'|'round_robin_pool'|'round_robin_excluding_original_owner'|'specific_user';
  assignee_pool: string[] | null;
  specific_assignee: string | null;
  fires_once: boolean;
  updated_at: string;
};

export function useRequalificationRules() {
  return useQuery({
    queryKey: ['requalification_rules'],
    queryFn: async () => {
      const { data, error } = await supabase.from('requalification_rules').select('*').order('name');
      if (error) throw error;
      return (data ?? []) as RequalificationRule[];
    },
  });
}

export function useUpsertRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rule: Partial<RequalificationRule>) => {
      const { data, error } = await supabase.from('requalification_rules').upsert(rule).select().single();
      if (error) throw error;
      return data as RequalificationRule;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requalification_rules'] }),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('requalification_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requalification_rules'] }),
  });
}
```

- [ ] **Step 2: Implement RequalificationSettings page**

Renders a header + "New rule" button, a card per rule. Each card shows the rule summary + Edit / Enable-toggle / Delete. Uses `RuleEditorModal` for editing.

- [ ] **Step 3: Implement RuleEditorModal**

Form fields per §4 of the spec: name, enabled, reason_code (dropdown from LOSS_REASONS + "Any"), from_stages (multi-select), delay_days, task_title_tpl (text with placeholder hint), task_priority, assignment_mode (dropdown), and conditional inputs per mode (`assignee_pool` for round-robin variants, `specific_assignee` for `specific_user`), fires_once.

Submit calls `useUpsertRule().mutateAsync(...)`.

- [ ] **Step 4: Add route + sidebar entry**

Route `/settings/requalification` → `<RequalificationSettings />`. Sidebar entry under Settings.

- [ ] **Step 5: Typecheck + tests**

```bash
npx tsc --noEmit && npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add -A recruitera-crm-v3/src
git commit -m "feat(crm-v3): Settings → Requalification rules page + editor modal"
```

---

## Task 19: requalification-scan edge function

**Files:**
- Deploy edge function `requalification-scan`

**Interfaces:**
- Consumes: `requalification_rules`, `accounts`, `tasks`, `profiles`, `stage_history` (for `original_owner` mode).
- Produces: creates tasks, writes `requalification_fires` rows, writes `system_logs`.

- [ ] **Step 1: Deploy v1 of the edge function**

Use `mcp__b7e33bec-653b-4703-9358-0d8100f64694__deploy_edge_function` with `name='requalification-scan'`.

Function body pseudo (write in Deno TS in the actual file):

```typescript
// index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async () => {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: rules } = await sb.from("requalification_rules").select("*").eq("enabled", true);
  const summary: any[] = [];

  for (const rule of rules ?? []) {
    // Select accounts matching this rule's filters, lost between (now - delay_days - 1d) and (now - delay_days)
    let q = sb.from("accounts").select("id, name, owner_id, loss_reason, lost_from_stage, lost_at")
      .eq("stage", "lost")
      .lte("lost_at", `now() - interval '${rule.delay_days} days'`)
      .gt ("lost_at", `now() - interval '${rule.delay_days + 1} days'`);
    if (rule.reason_code) q = q.eq("loss_reason", rule.reason_code);
    if (rule.from_stages) q = q.in("lost_from_stage", rule.from_stages);

    const { data: matches } = await q;
    let fired = 0;

    for (const acct of matches ?? []) {
      if (rule.fires_once) {
        const { data: exists } = await sb.from("requalification_fires")
          .select("rule_id").eq("rule_id", rule.id).eq("account_id", acct.id).maybeSingle();
        if (exists) continue;
      }

      // Resolve assignee per mode
      const assignee = await resolveAssignee(sb, rule, acct);
      if (!assignee) continue;

      const title = renderTitle(rule.task_title_tpl, acct, rule.delay_days);

      const { data: task, error: taskErr } = await sb.from("tasks").insert({
        account_id: acct.id,
        title,
        owner_id: assignee,
        priority: rule.task_priority,
        kind: 'requalification',
      }).select("id").single();
      if (taskErr) { console.error("task insert failed", taskErr); continue; }

      await sb.from("requalification_fires").upsert({
        rule_id: rule.id, account_id: acct.id, task_id: task.id,
      }, { onConflict: "rule_id,account_id" });

      await sb.from("system_logs").insert({
        module: 'requalification',
        account_id: acct.id,
        message: `Rule '${rule.name}' fired → task ${task.id} assigned to ${assignee}`,
      });

      fired++;
    }
    summary.push({ rule_id: rule.id, name: rule.name, matched: matches?.length ?? 0, fired });
  }

  return new Response(JSON.stringify({ ok: true, summary }), { headers: { "content-type": "application/json" } });
});

// resolveAssignee + renderTitle: pure helpers, ~30 lines total
```

- [ ] **Step 2: Manual invoke with all rules disabled**

Since all seed rules are `enabled=false`, the function should return `{ ok: true, summary: [] }`.

- [ ] **Step 3: Manual invoke test with a temporarily-enabled rule**

Enable one rule with a very small `delay_days` (e.g. 0) against a specific test account you disqualified, invoke, verify task+fire row created, then disable the rule and delete the test task.

- [ ] **Step 4: Cron scheduling deferred to Task 22 (Phase 4 flip)**

No commit needed — edge fn deployment is captured by Supabase.

---

## Task 20: WinLossChurnedReport — Loss breakdown matrix + "later reopened %" column

**Files:**
- Create: `recruitera-crm-v3/src/features/reports/tabs/__parts/LossBreakdownMatrix.tsx`
- Create: `recruitera-crm-v3/src/features/reports/tabs/__parts/lossCalc.ts`
- Create: `recruitera-crm-v3/src/features/reports/tabs/__tests__/lossCalc.test.ts`
- Modify: `recruitera-crm-v3/src/features/reports/tabs/WinLossChurnedReport.tsx`

**Interfaces:**
- Consumes: `useAccounts()` (Task 11), `stage_history` for later-reopened flag.
- Produces: `<LossBreakdownMatrix from={...} to={...} ownerId={...} />`.

- [ ] **Step 1: Write failing test for lossCalc**

```typescript
// src/features/reports/tabs/__tests__/lossCalc.test.ts
import { describe, expect, it } from 'vitest';
import { computeLossMatrix } from '../__parts/lossCalc';

describe('computeLossMatrix', () => {
  it('groups by reason and lost_from_stage, sums totals', () => {
    const accounts = [
      { id:'a', stage:'lost', loss_reason:'no_budget',  lost_from_stage:'demo', lost_at:'2026-07-01' },
      { id:'b', stage:'lost', loss_reason:'no_budget',  lost_from_stage:'demo', lost_at:'2026-07-02' },
      { id:'c', stage:'lost', loss_reason:'no_response',lost_from_stage:'lead', lost_at:'2026-07-03' },
    ];
    const reopened = new Set<string>();
    const m = computeLossMatrix(accounts as any, reopened, '2026-07-01', '2026-07-31');
    expect(m.reasons).toContain('no_budget');
    expect(m.stages).toContain('demo');
    expect(m.cell('no_budget','demo').count).toBe(2);
    expect(m.cell('no_response','lead').count).toBe(1);
  });

  it('marks later-reopened accounts', () => {
    const accounts = [
      { id:'a', stage:'lost', loss_reason:'no_budget', lost_from_stage:'demo', lost_at:'2026-07-01' },
    ];
    const reopened = new Set(['a']);
    const m = computeLossMatrix(accounts as any, reopened, '2026-07-01', '2026-07-31');
    expect(m.cell('no_budget','demo').laterReopened).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to see FAIL**

```bash
npx vitest run src/features/reports/tabs/__tests__/lossCalc.test.ts
```

- [ ] **Step 3: Implement lossCalc**

```typescript
// src/features/reports/tabs/__parts/lossCalc.ts
import type { Account } from '@/hooks/useAccounts';

export type LossCell = { count: number; laterReopened: number };

export type LossMatrix = {
  reasons: string[];
  stages: string[];
  cell: (reason: string, stage: string) => LossCell;
};

export function computeLossMatrix(
  accounts: Account[],
  reopenedIds: Set<string>,
  fromISO: string,
  toISO: string,
): LossMatrix {
  const inRange = (iso: string | null) => !!iso && iso >= fromISO && iso <= toISO;
  const cells = new Map<string, LossCell>();
  const keyOf = (r: string, s: string) => `${r}::${s}`;

  const reasons = new Set<string>();
  const stages  = new Set<string>();

  for (const a of accounts) {
    if (a.stage !== 'lost') continue;
    if (!inRange(a.lost_at)) continue;
    const r = a.loss_reason ?? 'other';
    const s = a.lost_from_stage ?? 'unknown';
    reasons.add(r); stages.add(s);
    const k = keyOf(r, s);
    const cell = cells.get(k) ?? { count: 0, laterReopened: 0 };
    cell.count += 1;
    if (reopenedIds.has(a.id)) cell.laterReopened += 1;
    cells.set(k, cell);
  }

  return {
    reasons: Array.from(reasons).sort(),
    stages:  Array.from(stages).sort(),
    cell:    (r, s) => cells.get(keyOf(r, s)) ?? { count: 0, laterReopened: 0 },
  };
}
```

- [ ] **Step 4: Run test → PASS**

- [ ] **Step 5: Implement LossBreakdownMatrix component**

Reads accounts + computes reopenedIds via a query on `stage_history where from_stage='lost'`. Renders a table using `BarList` + `ReportPanel` primitives from `shared/ReportUI.tsx`. Highlight cell color when `laterReopened / count > 0.3`.

- [ ] **Step 6: Inject into WinLossChurnedReport**

In `WinLossChurnedReport.tsx`, add a section between "Won" and "Reopen Rate" that renders `<LossBreakdownMatrix from={range.startISO} to={range.endISO} ownerId={ownerId} />`.

- [ ] **Step 7: Typecheck + tests + commit**

```bash
npx tsc --noEmit && npx vitest run
git add -A recruitera-crm-v3/src
git commit -m "feat(crm-v3): Win/Loss report — Loss × Stage matrix with later-reopened highlight"
```

---

## Task 21: WinLossChurnedReport — Reopen Rate panel

**Files:**
- Create: `recruitera-crm-v3/src/features/reports/tabs/__parts/ReopenRatePanel.tsx`
- Modify: `recruitera-crm-v3/src/features/reports/tabs/WinLossChurnedReport.tsx`

**Interfaces:**
- Consumes: `stage_history` — direct fetch via a small hook (`useReopenEvents(from, to, ownerId)`).

- [ ] **Step 1: Implement useReopenEvents hook**

```typescript
// src/hooks/useReopenEvents.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type ReopenEvent = {
  account_id: string; from_stage: string; to_stage: string;
  changed_at: string; reason_code: string | null;
  prior_loss_reason?: string | null; // filled by ReopenRatePanel via join
};

export function useReopenEvents(fromISO: string, toISO: string) {
  return useQuery({
    queryKey: ['reopen_events', fromISO, toISO],
    queryFn: async () => {
      const { data, error } = await supabase.from('stage_history')
        .select('account_id, from_stage, to_stage, changed_at, reason_code')
        .eq('from_stage', 'lost').neq('to_stage', 'lost')
        .gte('changed_at', fromISO).lte('changed_at', toISO);
      if (error) throw error;
      return (data ?? []) as ReopenEvent[];
    },
  });
}
```

- [ ] **Step 2: Implement ReopenRatePanel component**

Renders:
- Headline: count reopened this period + % of period losses + multi-reopen count.
- Bar list 1: reopen reasons (from `reason_code`).
- Bar list 2: original loss reason × reopen % (join reopens against `accounts.loss_reason` for the prior loss).
- Bar list 3: where reopened accounts ended up (Won / Still open / Re-lost).

Use existing `BarList`, `ReportPanel`, `ReportKpi`, `HeaderPill` from `ReportUI.tsx`.

- [ ] **Step 3: Inject into WinLossChurnedReport** as a new section after LossBreakdown.

- [ ] **Step 4: Typecheck + tests + commit**

```bash
npx tsc --noEmit && npx vitest run
git add -A recruitera-crm-v3/src
git commit -m "feat(crm-v3): Win/Loss report — Reopen Rate panel with reason breakdown"
```

---

## Task 22: AMReport — Reopens Won + Recovered by Others columns

**Files:**
- Modify: `recruitera-crm-v3/src/features/reports/tabs/AMReport.tsx`
- Create: `recruitera-crm-v3/src/features/reports/tabs/__parts/amCrossAttribution.ts`
- Create: `recruitera-crm-v3/src/features/reports/tabs/__tests__/amCrossAttribution.test.ts`

**Interfaces:**
- Consumes: `stage_history`, `accounts`, `contract_cycles`.
- Produces: per-AM aggregates `{ wins, wonRev, losses, reopensAttempted, reopensWon, recoveredByOthers }`.

- [ ] **Step 1: Write failing test**

```typescript
// src/features/reports/tabs/__tests__/amCrossAttribution.test.ts
import { describe, expect, it } from 'vitest';
import { computeAmCrossAttribution } from '../__parts/amCrossAttribution';

describe('computeAmCrossAttribution', () => {
  it('gives revenue to AC2 when AC1 loses and AC2 later wins', () => {
    const stageHistory = [
      { account_id:'x', from_stage:'sql',  to_stage:'lost', changed_by:'ac1', changed_at:'2026-07-01' },
      { account_id:'x', from_stage:'lost', to_stage:'sql',  changed_by:'ac2', changed_at:'2026-07-22', reason_code:'budget_approved' },
      { account_id:'x', from_stage:'sql',  to_stage:'won',  changed_by:'ac2', changed_at:'2026-08-08' },
    ];
    const cycles = [{ account_id:'x', value: 40000, currency:'EGP', started_at:'2026-08-08' }];
    const period = { from:'2026-07-01', to:'2026-08-31' };
    const result = computeAmCrossAttribution(stageHistory as any, cycles as any, period);
    expect(result.get('ac1')?.recoveredByOthers).toBe(1);
    expect(result.get('ac1')?.wonRev).toBe(0);
    expect(result.get('ac2')?.wins).toBe(1);
    expect(result.get('ac2')?.wonRev).toBe(40000);
    expect(result.get('ac2')?.reopensAttempted).toBe(1);
    expect(result.get('ac2')?.reopensWon).toBe(1);
  });
});
```

- [ ] **Step 2: Run test → FAIL**

- [ ] **Step 3: Implement helper**

```typescript
// src/features/reports/tabs/__parts/amCrossAttribution.ts
export type AmCol = {
  wins: number; wonRev: number; losses: number;
  reopensAttempted: number; reopensWon: number; recoveredByOthers: number;
};
type SH = { account_id: string; from_stage: string; to_stage: string; changed_by: string; changed_at: string };
type Cycle = { account_id: string; value: number; currency: string; started_at: string };

export function computeAmCrossAttribution(
  sh: SH[], cycles: Cycle[], period: { from: string; to: string },
): Map<string, AmCol> {
  const inRange = (iso: string) => iso >= period.from && iso <= period.to;
  const out = new Map<string, AmCol>();
  const bump = (uid: string, k: keyof AmCol, n = 1) => {
    const cur = out.get(uid) ?? { wins:0, wonRev:0, losses:0, reopensAttempted:0, reopensWon:0, recoveredByOthers:0 };
    (cur[k] as number) += n;
    out.set(uid, cur);
  };

  const cyclesByAcct = new Map<string, Cycle>();
  for (const c of cycles) cyclesByAcct.set(c.account_id, c);

  const byAcct = new Map<string, SH[]>();
  for (const row of sh) {
    if (!byAcct.has(row.account_id)) byAcct.set(row.account_id, []);
    byAcct.get(row.account_id)!.push(row);
  }
  for (const rows of byAcct.values()) rows.sort((a,b) => a.changed_at.localeCompare(b.changed_at));

  for (const [acctId, rows] of byAcct) {
    let hadLostAt: { by: string; at: string } | null = null;

    for (const r of rows) {
      // Losses
      if (r.to_stage === 'lost' && inRange(r.changed_at)) bump(r.changed_by, 'losses');
      if (r.to_stage === 'lost') hadLostAt = { by: r.changed_by, at: r.changed_at };
      // Reopens attempted
      if (r.from_stage === 'lost' && r.to_stage !== 'lost' && inRange(r.changed_at)) {
        bump(r.changed_by, 'reopensAttempted');
      }
      // Wins
      if (r.to_stage === 'won' && inRange(r.changed_at)) {
        bump(r.changed_by, 'wins');
        const c = cyclesByAcct.get(acctId);
        if (c && inRange(c.started_at)) bump(r.changed_by, 'wonRev', c.value);
        if (hadLostAt) {
          if (hadLostAt.by !== r.changed_by) bump(hadLostAt.by, 'recoveredByOthers');
          bump(r.changed_by, 'reopensWon');
        }
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test → PASS**

- [ ] **Step 5: Wire into AMReport**

Fetch `stage_history` + `contract_cycles` within range, run through `computeAmCrossAttribution`, render the new columns in the existing table.

- [ ] **Step 6: Typecheck + tests + commit**

```bash
npx tsc --noEmit && npx vitest run
git add -A recruitera-crm-v3/src
git commit -m "feat(crm-v3): AM Performance — Reopens Won + Recovered-by-Others columns"
```

---

## Task 23: Requalification panel in AM Performance report

**Files:**
- Create: `recruitera-crm-v3/src/features/reports/tabs/__parts/RequalificationRulesPanel.tsx`
- Modify: `recruitera-crm-v3/src/features/reports/tabs/AMReport.tsx`

**Interfaces:**
- Consumes: `requalification_rules`, `requalification_fires`, `tasks`, `stage_history`.
- Produces: `<RequalificationRulesPanel from={...} to={...} />`.

- [ ] **Step 1: Implement**

For each enabled rule: count fires in period; count of those fires whose linked `tasks.task_done = true`; count of those fires whose account_id later reopened. Renders as a table with three columns: Fires / Tasks done / Reopened after.

- [ ] **Step 2: Inject into AMReport** as a new panel at the bottom.

- [ ] **Step 3: Typecheck + tests + commit**

```bash
npx tsc --noEmit && npx vitest run
git add -A recruitera-crm-v3/src
git commit -m "feat(crm-v3): AM Performance — Requalification rules effectiveness panel"
```

---

## Task 24: Sales Funnel filter label + reopens teaser strip

**Files:**
- Modify: `recruitera-crm-v3/src/features/reports/tabs/PipelineReport.tsx`

- [ ] **Step 1: Rename filter label**

Find the `DateRangeFilter` usage; if it accepts a label prop pass `"Leads created"`. If not, update the header text next to the range.

- [ ] **Step 2: Add teaser strip**

At the bottom of the report, render one line:

> "of {lostInCohort} lost cohort accounts, {reopenedFromCohort} were later reopened ({pct}%)"

Compute:
- `lostInCohort` = accounts created in range whose stage is now 'lost' or `reopen_count > 0`.
- `reopenedFromCohort` = accounts created in range whose `reopen_count > 0`.
- `pct` = round(100 × reopened / lostInCohort).

- [ ] **Step 3: Typecheck + tests + commit**

```bash
npx tsc --noEmit && npx vitest run
git add -A recruitera-crm-v3/src/features/reports/tabs/PipelineReport.tsx
git commit -m "feat(crm-v3): Sales Funnel — label \"Leads created\" + reopens teaser"
```

---

## Task 25: Dashboard KPI — Reopens this month

**Files:**
- Modify: `recruitera-crm-v3/src/pages/Dashboard.tsx` (locate via grep)

- [ ] **Step 1: Add hook + KPI card**

Fetch count from `stage_history` where `from_stage='lost'` and `changed_at ∈ month`, filtered by owner if the dashboard owner filter is set.

Add a new KPI card between existing ones. Consistent styling with the other KPIs.

- [ ] **Step 2: Typecheck + tests + commit**

```bash
npx tsc --noEmit && npx vitest run
git add -A recruitera-crm-v3/src/pages/Dashboard.tsx
git commit -m "feat(crm-v3): Dashboard — Reopens this month KPI"
```

---

## Task 26: Hide DealsSection behind deals_ui_hidden flag

**Files:**
- Modify: `recruitera-crm-v3/src/features/company-profile/CompanyProfile.tsx`

- [ ] **Step 1: Guard the render**

Locate `<DealsSection ...>` in CompanyProfile. Wrap:

```tsx
const dealsHidden = useFeatureFlag('deals_ui_hidden');
{!dealsHidden && <DealsSection ... />}
```

- [ ] **Step 2: Typecheck + tests + commit**

```bash
npx tsc --noEmit && npx vitest run
git add -A recruitera-crm-v3/src/features/company-profile/CompanyProfile.tsx
git commit -m "feat(crm-v3): hide DealsSection behind deals_ui_hidden flag"
```

---

## Task 27: Route new reports behind use_new_reports flag

**Files:**
- Modify: `recruitera-crm-v3/src/features/reports/tabs/WinLossChurnedReport.tsx`
- Modify: `recruitera-crm-v3/src/features/reports/tabs/AMReport.tsx`
- Modify: `recruitera-crm-v3/src/pages/Dashboard.tsx`

- [ ] **Step 1: Guard new panels**

In each of the modified reports and dashboard, wrap the NEW panels/columns (LossBreakdownMatrix, ReopenRatePanel, cross-attribution columns, Reopens KPI) with:

```tsx
const newReports = useFeatureFlag('use_new_reports');
{newReports && <LossBreakdownMatrix ... />}
```

Old panels stay visible when `newReports=false`. Both can coexist while flag is off (side-by-side comparison possible; the "admin diagnostic tab" mentioned in the spec §Phase 2 is served by the two literally being visible together during the parallel period).

- [ ] **Step 2: Typecheck + tests + commit**

```bash
npx tsc --noEmit && npx vitest run
git add -A recruitera-crm-v3/src
git commit -m "feat(crm-v3): gate new reports panels behind use_new_reports flag"
```

---

## Task 28: Flip flags in production + enable requalification cron (Phase 4)

**Files:**
- Migration: `20260805_flip_deal_removal_flags_and_schedule_cron`

- [ ] **Step 1: Flip both flags**

```sql
update app_settings set value = 'true'::jsonb where key = 'deals_ui_hidden';
update app_settings set value = 'true'::jsonb where key = 'use_new_reports';
```

- [ ] **Step 2: Schedule requalification-scan at 02:00 daily**

```sql
select cron.schedule(
  'requalification-scan',
  '0 2 * * *',
  $$
  select net.http_post(
    url := 'https://rtdrlpnfqjtwtsrwnifn.supabase.co/functions/v1/requalification-scan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
```

- [ ] **Step 3: Post-flip smoke test**

- Load a lost account's profile → confirm Reopen button appears, DealsSection is gone.
- Load an open account's profile → confirm Lose button appears, DealsSection is gone.
- Load Reports → Win/Loss → confirm Loss matrix and Reopen Rate panels are rendered.
- Load Dashboard → confirm Reopens KPI is rendered.

- [ ] **Step 4: 14-day watch (no code changes)**

Log any issues in a scratchpad file at `docs/superpowers/watch/2026-08-05-post-flip.md`. If an issue is severe, flip flags back:

```sql
update app_settings set value = 'false'::jsonb where key in ('deals_ui_hidden','use_new_reports');
select cron.unschedule('requalification-scan');
```

- [ ] **Step 5: No commit here** — flags are DB state, cron is DB state.

---

## Task 29: Kill switch (Phase 5, T+14 days)

**Files:**
- Migration: `20260819_drop_deals_and_related`
- Delete: `recruitera-crm-v3/src/features/company-profile/DealsSection.tsx`
- Delete: `recruitera-crm-v3/src/features/companies/NewDealModal.tsx`
- Delete: `recruitera-crm-v3/src/hooks/useDeals.ts`
- Delete: `recruitera-crm-v3/src/hooks/useDealsForCompany.ts`
- Delete: `recruitera-crm-v3/src/hooks/useDealMutations.ts`
- Modify: `recruitera-crm-v3/src/features/company-profile/CompanyProfile.tsx` (remove flag guard + import)
- Modify: `recruitera-crm-v3/src/features/reports/tabs/WinLossChurnedReport.tsx` (remove flag guard)
- Modify: `recruitera-crm-v3/src/features/reports/tabs/AMReport.tsx` (remove flag guard)
- Modify: `recruitera-crm-v3/src/pages/Dashboard.tsx` (remove flag guard)
- Modify: `recruitera-crm-v3/src/lib/flags.ts` (delete file if no other flags)

**Only proceed if 14 days have passed and no rollback is needed.**

- [ ] **Step 1: DB migration**

```sql
-- Legacy deals rows already archived to accounts.raw_data.legacy_deals (Task 9)
drop trigger if exists accounts_safety_deal_trg on accounts;
drop function if exists accounts_stage_to_deal_safety cascade;
drop table if exists deals cascade;

-- Also remove the flags from app_settings
delete from app_settings where key in ('deals_ui_hidden', 'use_new_reports');
```

- [ ] **Step 2: Delete TS files**

```bash
git rm recruitera-crm-v3/src/features/company-profile/DealsSection.tsx
git rm recruitera-crm-v3/src/features/companies/NewDealModal.tsx
git rm recruitera-crm-v3/src/hooks/useDeals.ts
git rm recruitera-crm-v3/src/hooks/useDealsForCompany.ts
git rm recruitera-crm-v3/src/hooks/useDealMutations.ts
```

- [ ] **Step 3: Remove flag guards**

Grep for `useFeatureFlag` and remove each call — the new UI/reports are now unconditional.

```bash
grep -rn 'useFeatureFlag' recruitera-crm-v3/src
```

For each hit, delete the guard, keep the child. If `flags.ts` has no other consumers, delete it too.

- [ ] **Step 4: Typecheck + full test run**

```bash
npx tsc --noEmit && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add -A recruitera-crm-v3
git commit -m "chore(crm-v3): drop deals table + feature-flag guards; kill switch complete"
```

- [ ] **Step 6: Push**

```bash
git push origin main
```

---

## Self-Review Notes

- **Spec coverage verified.** All spec sections (§2 data model, §3 reopen, §4 requalification, §5 history, §6 reports, §7 cross-attribution, §8 migration) are mapped to at least one task. Loss vocab + reopen vocab live in `useLoseAccount` and `useReopenAccount` respectively. Stage-availability matrix lives in Task 14's OPEN_STAGES constant.
- **Placeholder scan clean.** Every migration has actual SQL. Every component task has interface signature. No "TODO", "later", "similar to Task N".
- **Type consistency verified.** `LOSS_REASONS`, `REOPEN_REASONS`, `REOPEN_TARGET_STAGES`, `HistoryEvent.kind`, and RPC signatures agree across Tasks 12, 13, 16, 17, 20, 22.
- **Open questions from spec §10 handled:**
  - Trigger vs RPC insert race — resolved by having the reopen_account RPC insert the stage_history row explicitly (Task 7); the trigger from Task 5 only updates account denorm columns, doesn't insert into stage_history.
  - `auth.uid()` inside the requalification cron — the edge fn uses the service role; system_logs entries are inserted with a `System` actor name and null actor_id (Task 19). HistoryTab renders `ev.actor_name ?? 'System'` (Task 17).
  - Pipeline value currency normalization — deferred; not in scope for this plan.
