# Rules & Permissions (ABAC) — Design

**Date:** 2026-06-02
**Status:** Design approved, ready for implementation plan
**Scope:** Recruitera CRM (`rtdrlpnfqjtwtsrwnifn` Supabase project)
**Author of decisions captured here:** a.hammad@icareer.ai

---

## 1. Why we're doing this

The CRM today has two access controls:

1. **Role:** `profiles.role` ∈ {`admin`, `user`} — admin can do anything; user can do less.
2. **Ownership:** `accounts.owner_id` + `can_access_account()` RLS — a user can see/edit accounts they own.

That covers basic cases but blocks several real needs:

- Per-team / per-region account splits (e.g. "Sales Egypt only sees Egypt accounts").
- Per-action gating inside one role (e.g. "Sara can edit accounts but can't disqualify or change owner").
- Field-level masking (e.g. juniors don't see deal values).
- Future rules we don't even know about yet.

ABAC (Attribute-Based Access Control) generalises both: every decision is a function of
`(user attributes, resource attributes, requested action)`. Rules are data, not code, so
super-admins can author them in the app without a deploy.

## 2. Goals (in scope for v1)

- A rule engine that decides ALLOW / DENY for any (user, action, account) triple.
- Defence in depth: enforced at the DB (RLS) **and** the UI (button hiding / row filtering).
- Single source of truth: same evaluator function used by RLS and the UI — they can never drift.
- Super-admin in-app rule editor with simulator.
- Audit log of every DENY decision.
- Migration plan that doesn't lock anyone out (feature flag, default-on policies replicate current behaviour first).

## 3. Non-goals (explicitly out of scope)

- Field-level masking (e.g. hide `deal_value` from certain users). Deferred to v2.
- Time / environment attributes (`env.now`, `env.day_of_week`). Deferred.
- Multi-team users — each user belongs to exactly one team in v1.
- ABAC over activities, files, contacts, contract_cycles as separate resources — they inherit account access via the existing `can_access_account()` chain.
- External policy engine (OPA, Cedar, etc.). Overkill at our scale.
- Per-tenant policies. Recruitera is single-tenant.
- "Show me everything Sara can do" report. Simulator covers debugging.

## 4. Decisions captured during brainstorming

| Decision | Value |
|---|---|
| Approach | (A) JSONB policy table + SECURITY DEFINER evaluator + RLS calls evaluator |
| Resources covered in v1 | `accounts` (children inherit via `can_access_account`) |
| User attributes available | `id`, `role`, `team_id`, `team_name`, `email`, `full_name` |
| Rule authors | Super-admins only (in-app editor) |
| Enforcement boundary | Both DB (RLS) and UI |
| Multi-team users | No — one team per user |
| Audit log in v1 | Yes (DENY-only) |
| Default when no policy matches | DENY (closed world) |
| Admin bypass | Yes — `role='admin'` always allowed; ABAC engine short-circuits |
| Performance | No caching in v1; revisit if profiling shows it matters |
| Error mode (bad policy JSON) | Fail closed — treat as DENY, log to `abac_audit` |
| Policy Editor location | New "Settings" menu in sidebar (admin-only); Rules sub-page |
| Test-before-save in editor | Yes — simulator inline before commit |

## 5. Data model

### 5.1 `teams`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` | |
| `name` | `text` UNIQUE NOT NULL | e.g. "Sales Egypt", "Enterprise" |
| `created_at` | `timestamptz` default `now()` | |

RLS: `SELECT` for any authenticated user. `INSERT`/`UPDATE`/`DELETE` admin-only.

### 5.2 `profiles.team_id` (new column)

```sql
ALTER TABLE public.profiles
  ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;
```

Nullable: a user without a team falls back to role-based rules only.

### 5.3 `abac_policies`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` | |
| `name` | `text` NOT NULL | "Egypt team — read own region" |
| `description` | `text` | optional longer note |
| `resource` | `text` NOT NULL CHECK in (`'accounts'`) | v1 only accounts |
| `action` | `text` NOT NULL CHECK in (`'read'`, `'update'`, `'delete'`, `'disqualify'`, `'merge'`, `'reassign_owner'`, `'mark_won_lost'`) | |
| `effect` | `text` NOT NULL CHECK in (`'allow'`, `'deny'`) | |
| `subject` | `jsonb` NOT NULL DEFAULT `'{}'` | who this applies to: `{role?, team_id?, user_ids?}` |
| `condition` | `jsonb` NOT NULL DEFAULT `'{"all":[]}'` | DSL — see §6 |
| `priority` | `int` NOT NULL DEFAULT 100 | lower = evaluated first |
| `enabled` | `boolean` NOT NULL DEFAULT true | soft-disable without delete |
| `created_at` | `timestamptz` default `now()` | |
| `updated_at` | `timestamptz` default `now()` | trigger keeps fresh |
| `created_by` | `uuid` REFERENCES `auth.users(id)` | |

Index: `(resource, action, enabled, priority)` — primary lookup path.

RLS: `SELECT` for admins only (regular users never see policies). All writes admin-only.

### 5.4 `abac_audit`

| Column | Type | Notes |
|---|---|---|
| `id` | `bigserial` PK | |
| `at` | `timestamptz` default `now()` | |
| `user_id` | `uuid` | `auth.uid()` at decision time |
| `resource` | `text` | `'accounts'` etc. |
| `resource_id` | `uuid` | the row in question (NULL for "can do this at all?" checks) |
| `action` | `text` | |
| `effect` | `text` CHECK in (`'deny'`, `'error'`) | only failures are logged |
| `policy_id` | `uuid` NULL | the policy that fired (NULL for default-deny / errors) |
| `reason` | `text` | "default deny" / "policy X matched" / error message |

Index: `(user_id, at desc)` for "why couldn't Sara see X?" debugging.

RLS: admin-only read; service_role write (function-only).

### 5.5 `app_settings` (small kv table used by the feature flag)

| Column | Type | Notes |
|---|---|---|
| `key` | `text` PK | e.g. `'abac_enabled'` |
| `value` | `jsonb` | `true` / `false` / arbitrary config |
| `updated_at` | `timestamptz` default `now()` | |

Single row needed in v1: `('abac_enabled', false)` until Phase 4 flips it. Admin-only writes. Read by `abac_check` on every call (cheap — one row, hot in cache).

## 6. Rule language

Each `condition` is a small structured DSL stored as JSONB.

### 6.1 Shape

A condition is a **group node** with one of two operators:

```json
{ "all": [<node>, <node>, ...] }   // AND
{ "any": [<node>, <node>, ...] }   // OR
```

Each child is either another group node or a **leaf**:

```json
{ "field": "<field_path>", "op": "<operator>", "value": <literal> }
{ "field": "<field_path>", "op": "<operator>", "value_from": "<field_path>" }
```

`value` is a literal constant. `value_from` resolves another field at evaluation time (this is what makes it ABAC: comparing user attributes to resource attributes).

### 6.2 Allowed field paths

| Prefix | Fields |
|---|---|
| `user.*` | `id`, `role`, `team_id`, `team_name`, `email`, `full_name` |
| `account.*` | every non-secret column on `accounts`: `id`, `stage`, `owner_id`, `deal_value`, `is_disqualified`, `paid_status`, `activation_status`, `has_trial`, `wp_marketing_channel`, `source`, `domain`, `industry`, `size`, `location`, `vacancies`, `am_mail`, etc. (Full list pinned in the evaluator function; unknown fields → DENY.) |

Future: `env.now`, `env.day_of_week`. Not in v1.

### 6.3 Operators

`eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `in`, `not_in`, `is_null`, `is_not_null`, `starts_with`, `contains`.

### 6.4 Examples

**Egypt team reads only Egypt accounts:**

```json
{
  "name": "Egypt team — own region only",
  "resource": "accounts",
  "action": "read",
  "effect": "allow",
  "subject": { "team_id": "<egypt-team-uuid>" },
  "condition": {
    "all": [
      { "field": "account.wp_marketing_channel", "op": "eq", "value": "Egypt" }
    ]
  }
}
```

**Juniors cannot disqualify big deals:**

```json
{
  "name": "Junior disq cap",
  "resource": "accounts",
  "action": "disqualify",
  "effect": "deny",
  "subject": { "role": "user" },
  "condition": {
    "all": [
      { "field": "account.deal_value", "op": "gt", "value": 1000000 }
    ]
  }
}
```

**Owner can update their own accounts (compatibility seed):**

```json
{
  "name": "Owner can update own",
  "resource": "accounts",
  "action": "update",
  "effect": "allow",
  "subject": { "role": "user" },
  "condition": {
    "any": [
      { "field": "account.owner_id", "op": "eq", "value_from": "user.id" },
      { "field": "account.owner_id", "op": "is_null" }
    ]
  }
}
```

### 6.5 Subject match semantics

A `subject` JSON object matches a caller iff **every** specified attribute matches the caller. Specifically:

| `subject` value | Matches |
|---|---|
| `{}` | every caller (everyone) |
| `{ "role": "user" }` | callers whose `profiles.role = 'user'` |
| `{ "team_id": "<uuid>" }` | callers whose `profiles.team_id = <uuid>` |
| `{ "user_ids": ["a","b"] }` | callers whose `auth.uid() ∈ {a,b}` |
| `{ "role": "user", "team_id": "<uuid>" }` | callers with role=user **AND** team_id=uuid |

There is no `any` form for subjects. If you need OR-on-subject, author two separate policies.

### 6.6 Evaluation order

For a request `(user, action, account)`:

1. If `user.role = 'admin'` → ALLOW (admin bypass, short-circuit).
2. Load all `abac_policies WHERE resource='accounts' AND action=<action> AND enabled=true` ordered by `priority ASC` (lower first — see note below).
3. For each, check `subject` matches per §6.5.
4. If subject matches, evaluate `condition`. If true:
   - `effect='deny'` → return DENY immediately. (Deny wins.)
   - `effect='allow'` → record an allow-vote, keep walking (deny can still beat it).
5. After the walk: if any allow-vote, return ALLOW; else DENY (closed world).
6. On any evaluator exception → DENY + write `abac_audit` row with `effect='error'`.

**Note on `priority`:** because deny-wins is hard-coded, priority does not change the final ALLOW/DENY outcome. It only controls which policy is credited in `abac_audit` when multiple denies could fire (first-by-priority wins the audit credit). Authors should use it to order narrow exception denies before broad ones for readable audit logs.

## 7. Enforcement architecture

### 7.1 Evaluator function

```sql
public.abac_check(
  p_action  text,
  p_account public.accounts   -- nullable; NULL means "can the caller do this action at all?"
) RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
```

Reads `auth.uid()`, joins `profiles` → caller's role + team_id + attrs. Implements §6.5.
On DENY, fires `INSERT INTO abac_audit (...)` (best-effort; failures swallowed so RLS itself doesn't break).

A batch variant for UI use:

```sql
public.abac_check_batch(
  p_action      text,
  p_account_ids uuid[]
) RETURNS TABLE (account_id uuid, allowed boolean)
```

### 7.2 RLS

`can_access_account(uuid)` is rewritten to delegate to `abac_check`:

```sql
CREATE OR REPLACE FUNCTION public.can_access_account(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT public.abac_check('read', a) FROM public.accounts a WHERE a.id = p_id;
$$;
```

The four `accounts` policies (SELECT / INSERT / UPDATE / DELETE) call `abac_check` with the appropriate action. Children of `accounts` (activities, files, tags, contacts, icp_scores, contract_cycles) unchanged — they already use `can_access_account()`.

### 7.3 Frontend

For each visible row on the Accounts page or Pipeline kanban, the UI batches an `abac_check_batch` call per action (`update`, `disqualify`, `reassign_owner`, etc.) and stores `{ accountId → boolean }` maps. Action buttons hide when the corresponding map says false.

For single-row drawer / modal contexts the UI uses the per-row `abac_check` RPC.

The Make-a-Deal button and similar one-shot UI elements call `abac_check('update', <account>)` on open.

## 8. UI surface — Policy Editor

Sidebar gains a **Settings** group (admin-only). First sub-page: **Rules & Permissions**. Three tabs:

### 8.1 Policies tab

Table of every policy with columns Name · Resource · Action · Effect · Applies to · Priority · Enabled · Actions. Filter by resource / action / enabled. Toggle Enabled inline. `+ New policy` opens the editor modal. Per-row `Test it` button opens the simulator pre-populated.

### 8.2 Teams tab

CRUD over `teams` + membership: list teams, count of users in each, add/remove members (single-select dropdown per `profile`).

### 8.3 Simulator tab

Three pickers:

1. **User** dropdown (all profiles)
2. **Action** dropdown (allow/deny actions)
3. **Account** typeahead (search by name/domain)

Output:

> **Result:** ALLOW / DENY
> **Matched policy:** "Egypt team — read own region" (allow, priority 100)
> **Subject match:** team_id = `<egypt-uuid>` ✓
> **Condition trace:**
>   `all` →
>     `account.wp_marketing_channel = "Egypt"` ✓

For DENY by default (no policy fired), result is "DENY — no allow policy matched (default deny)".

### 8.4 Policy Editor modal

Visual condition builder. Field dropdown (allowed paths from §6.2), operator dropdown, value input. Toggle leaf between literal and `value_from`. Per-group `ALL`/`ANY` switch. "+ Add group" for nesting.

JSON preview at bottom. **Test this draft** button opens the simulator with the unsaved draft.

### 8.5 UI gating elsewhere

- Pipeline / Accounts: filter out rows for which `abac_check('read', row) = false` (client-side defence in depth — DB already filters).
- Make a Deal / Disqualify / Reassign owner buttons: hidden when respective check returns false.
- BANT modal save: blocked client-side if `abac_check('update', account) = false`.

## 9. Migration plan

Implementing this on a live system requires not locking anyone out.

### Phase 1: Build with engine disabled
- New tables, evaluator function, UI all ship.
- `abac_check` reads a config flag (`public.app_settings(key='abac_enabled')`). If `false`, function returns TRUE for everyone — no-op. RLS still calls evaluator but always passes.
- Existing behaviour unchanged.

### Phase 2: Seed compatibility policies
Author the three policies that replicate today's `can_access_account`:
- `Owner can read own` (allow, role=user, condition: `owner_id = user.id OR owner_id IS NULL`)
- `Owner can update own` (allow, role=user, same condition)
- *(Admins handled by short-circuit, no policy needed.)*

Run regression sweep: for every (user, account) pair check `abac_check('read', acc)` matches what `can_access_account_legacy(acc.id)` returns today. Must be 100% match before flipping.

### Phase 3: Pilot one user
`profiles.abac_pilot = true` for Mariam only. Evaluator switches to real logic for her session, no-op for others. Mariam smoke-tests for 24h.

### Phase 4: Flip globally
Set `abac_enabled = true`. Monitor `abac_audit` for unexpected denies. Rollback = flip back.

### Phase 5: First real new policy
Author your first policy that wasn't compatibility — e.g. "Sales Egypt sees Egypt accounts only".

## 10. Testing strategy

| Layer | Test |
|---|---|
| Evaluator unit (SQL) | Fixed user + policy + account combos in `tests/abac_unit.sql`. Cover: deny-overrides-allow · default-deny · admin-bypass · malformed JSON → fail-closed · disabled policy ignored · subject mismatch ignored |
| RLS integration | psql session as each test user → `SELECT * FROM accounts` returns expected subset · `UPDATE accounts SET stage=...` succeeds only when policy allows |
| UI gating | Manual: render Accounts table as test user, assert hidden buttons + filtered rows match RLS results |
| Audit log | A denied REST request writes one row to `abac_audit` with correct user/policy/action |
| Migration regression | Phase 2 sweep script: for every (user, account) the legacy can_access_account result must equal the new abac_check result |

Tests live in `docs/superpowers/specs/abac/tests/` as SQL files runnable via `psql`.

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Bad policy locks everyone out | Admin bypass · feature flag rollback · default-deny audit log shows what happened |
| Evaluator perf degrades large reads | No cache in v1 but query plan reviewed pre-launch on 1000-row select; index on `(resource, action, enabled, priority)` |
| Drift between UI gates and DB enforcement | Both call `abac_check` — impossible to drift by construction |
| Super-admin makes mistake in editor | "Test this draft" sim · saving doesn't activate until Enabled toggle · audit log catches surprises |
| `abac_check` recurses (e.g. condition reads a column that triggers another RLS check) | Function is `SECURITY DEFINER` with explicit `search_path` and reads only via direct SELECT — avoids recursion |

## 12. Open questions

None at design freeze. Anything raised during implementation goes into a follow-up doc, not back into this spec.

---

**Decisions index** (for future reviewers — what we said no to and why):

- No multi-team users → keeps policy edge cases (`user is in Team A AND Team B → which wins?`) out of v1.
- No field-level masking → would require column-level RLS or view-based wrappers; defer until we have a real ask.
- No `env.*` time-based rules → adds non-determinism to the evaluator; defer.
- No OPA → external service overhead doesn't pay for 5 users + 500 accounts.
- No multi-tenant policy scope → Recruitera is single-tenant.
