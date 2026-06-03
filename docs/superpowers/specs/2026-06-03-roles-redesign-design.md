# Roles Redesign — Design

**Date:** 2026-06-03
**Status:** Design approved verbally; user opted to fast-track to implementation plan
**Scope:** Recruitera CRM Settings → Roles & Permissions
**Builds on:** `2026-06-02-abac-design.md` (the ABAC engine) and the Roles & Permissions UI shipped during that work

---

## 1. Why we're doing this

Today's "Roles" UI is really a list of **teams**: `teams` table doubling as roles. A row like "Sales Egypt" is simultaneously a role label and a real team identity. Consequences:

- The Admin "role" exists as both a `teams` row AND a `profiles.role='admin'` flag — two sources of truth.
- "Team Lead" is a per-team designation (`teams.lead_user_id`) rather than a role you assign — clunky to manage and impossible to grow into "all team leads share permissions X" without code changes.
- Adding a new team like Gulf forces decisions about what the team's role "means" — Sales? Lead? Custom?

The user explicitly asked for three system roles — **Admin / Team Lead / Sales Member** — plus user-defined customs. System roles cannot be deleted. Admin bypasses. Team Lead sees their team. Sales Member sees their own. The cleanest way to deliver that is to split the conflation: **Role and Team are two separate concepts.**

## 2. Goals (in scope for v1)

- One `roles` table with a `type` column (`admin` / `team_lead` / `member` / `custom`).
- Three system roles seeded and protected from deletion.
- ABAC engine recognises `role_id` as a subject matcher and applies the right scoping per role type.
- Existing `teams` table keeps its identity as actual teams; team rows that were really role placeholders ("Admin" team) are removed.
- Settings → Roles & Permissions UI keeps its current shape (left list, right detail, Permissions / Members tabs). Five focused refinements:
  1. SYSTEM badge on protected roles
  2. Locked name + type fields, hidden delete on system roles
  3. Inline team picker on Members rows for role types that require a team
  4. Sub-modal for managing actual teams (Sales Egypt, Gulf, etc)
  5. Crown / Team Lead designation goes away — replaced by assigning the Team Lead role
- Phased migration with regression sweep before any user-visible change.

## 3. Non-goals (explicitly out of scope)

- Per-team policy overrides (e.g. "Sales Egypt Lead has X, Gulf Lead has Y"). System role behaviour is uniform.
- Role hierarchy / inheritance ("Senior Lead extends Team Lead"). Author a Custom role with the toggles you want.
- Per-resource roles (e.g. role permissions for `contacts` vs `accounts`). Only `accounts` is ABAC-protected today.
- Role expiry / scheduled changes ("Sara is Team Lead until July 1").
- Bulk role assignment via CSV import. Single user at a time via UI.

## 4. Decisions captured during brainstorming

| Decision | Value |
|---|---|
| Role and Team modelling | Two separate concepts; `profiles.role_id` and `profiles.team_id` are independent FKs |
| Does Team Lead need a team? | Yes (else "lead of what?") |
| Does Sales Member need a team? | Yes (scoping requires it) |
| Does Admin need a team? | No (bypasses everything) |
| Does Custom role need a team? | Per-role choice (`roles.requires_team` flag) |
| Custom roles inherit a system behaviour? | No — blank slate, configured via toggles |
| Multiple Team Leads per team? | Yes — natural fallout of the two-concept model |
| System roles deletable? | No — `is_system=true` rows are protected in UI |
| Approach chosen | (A) New `roles` table + keep `teams`; user has both `role_id` and `team_id` |
| Role change UX | From the Members tab of the *new* role; old assignment auto-cleared |
| Teams management UX | Sub-modal inside the Roles tab |
| What happens to `team_id` when role doesn't allow a team? | Auto-cleared; UI prevents re-setting |

## 5. Data model

### 5.1 `roles` (new)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` | |
| `name` | `text` NOT NULL UNIQUE (case-insensitive) | "Admin", "Team Lead", "Sales Member", or custom names |
| `type` | `text` NOT NULL CHECK (`admin`, `team_lead`, `member`, `custom`) | drives ABAC engine semantics |
| `description` | `text` | shown in Settings UI |
| `is_system` | `boolean` NOT NULL DEFAULT false | TRUE for the three seeded rows; UI blocks delete + name/type edits |
| `requires_team` | `boolean` NOT NULL DEFAULT false | TRUE for `team_lead` + `member`; FALSE for `admin`; per-row for `custom` |
| `created_at` | `timestamptz` default `now()` | |
| `updated_at` | `timestamptz` default `now()` | UPDATE trigger keeps fresh |

Index: `(type)` for fast filter.

RLS: admin write, authenticated read.

Seeded rows applied by the Phase 1 migration:

| name | type | is_system | requires_team |
|---|---|---|---|
| Admin | `admin` | true | false |
| Team Lead | `team_lead` | true | true |
| Sales Member | `member` | true | true |

### 5.2 `teams` (existing, repurposed semantically)

No schema change. The table goes back to meaning "actual teams" — Sales Egypt, Gulf, Enterprise, etc. Migration cleanup:

- DELETE the "Admin" team row (it was always a role placeholder).
- KEEP "Sales Egypt" and any real team rows.
- DROP `teams.lead_user_id` (Phase 4 cleanup; Team Lead is now a role assignment).

### 5.3 `profiles` (existing, modified)

| Change | Why |
|---|---|
| ADD `role_id uuid REFERENCES roles(id) ON DELETE SET NULL` | each user has a role |
| KEEP `team_id` | for users whose role requires a team |
| DROP `profiles.role` enum (Phase 4) | `roles.type='admin'` is the new source of truth for bypass |

## 6. ABAC semantics per role type

### 6.1 `type = admin`
`abac_check` short-circuits to TRUE for users whose role's type is `admin`. No policies evaluated. No audit log entry.

The existing `is_admin()` function gets rewritten to:

```sql
SELECT EXISTS (
  SELECT 1 FROM public.profiles p
  JOIN public.roles r ON r.id = p.role_id
  WHERE p.id = auth.uid() AND r.type = 'admin'
);
```

### 6.2 `type = team_lead`
A Team Lead can `read` + `update` any account whose owner is in the same team they are. Seeded auto-policies on the Team Lead role:

```json
{
  "name": "auto:role:<team-lead-role-id>:read",
  "resource": "accounts",
  "action": "read",
  "effect": "allow",
  "subject": { "role_id": "<team-lead-role-id>" },
  "condition": {
    "all": [
      { "field": "account.owner_team_id", "op": "eq", "value_from": "user.team_id" }
    ]
  }
}
```

And the same with `action: "update"`. Additional actions (disqualify, mark won/lost, reassign owner) can be granted via toggles in the role's Permissions tab.

### 6.3 `type = member`
A Member can `read` + `update` accounts they own. Seeded auto-policies:

```json
{
  "name": "auto:role:<member-role-id>:read",
  "resource": "accounts",
  "action": "read",
  "effect": "allow",
  "subject": { "role_id": "<member-role-id>" },
  "condition": {
    "any": [
      { "field": "account.owner_id", "op": "eq",        "value_from": "user.id" },
      { "field": "account.owner_id", "op": "is_null" },
      { "field": "account.am_mail",  "op": "eq",        "value_from": "user.email" }
    ]
  }
}
```

This replaces the legacy `Compat — owner reads own` / `Compat — owner updates own` policies.

### 6.4 `type = custom`
No implicit semantics. The role's auto-policies (created when the admin flips toggles) have `condition = {all: []}` (always-true). Scope is entirely defined by what the admin sets up.

### 6.5 Subject matcher extension

Today's `subject` JSON supports `{role: 'user'|'admin'}`, `{team_id}`, `{user_ids}`. We add a new key:

```json
{ "role_id": "<uuid>" }
```

Matches if the caller's `profiles.role_id` equals this value. Replaces the broad `role` enum form. Old `{role: 'user'}` policies (currently the two Compat ones) get disabled during Phase 2, then either deleted or kept as historical record.

### 6.6 Closed-world + admin bypass unchanged
Everything else in `abac_check` stays the same: closed-world default-deny, deny-overrides-allow, fail-closed on evaluator errors. Only the matching step gets the new `role_id` form, and `is_admin()` reads the new source of truth.

## 7. UI changes

The Settings → Roles & Permissions tab keeps its existing structure (roles list left, Permissions / Members sub-tabs right). Five focused refinements:

### 7.1 SYSTEM badge on role cards
Cards for `is_system=true` rows show a small `SYSTEM` chip next to the name (purple). Custom roles show no chip or a neutral `CUSTOM` chip.

### 7.2 Locked editing on system roles
- Name field disabled (cannot rename "Admin")
- Type field disabled (cannot change "Team Lead" type to "Custom")
- Delete button hidden entirely
- Description IS editable
- Toggles ARE editable — admins can extend Team Lead with extra actions

### 7.3 Inline team picker on Members rows
For roles where `requires_team=true`, each member row in the Members tab has an inline **Team:** dropdown next to their name. Picking a team writes `profiles.team_id`. For roles where `requires_team=false`, the dropdown is hidden.

### 7.4 Manage Teams sub-modal
Top of the Roles tab gains a `Manage Teams` button next to `+ Invite User`. Opens a small modal listing teams (Sales Egypt, Gulf, etc) with member counts and add/delete. Clean separation of "edit roles" vs "edit teams."

### 7.5 Crown / Team Lead designation removed
The previous "Make Lead" crown on the Members tab disappears. Being a Team Lead means having the Team Lead role assigned. Promoting a member: go to the Team Lead role's Members tab → Add member → pick them. They're automatically removed from the old role.

### 7.6 Cross-role membership move semantics
Adding a user to a role's Members tab automatically:
- Sets `profiles.role_id` to the new role.
- If the new role's `requires_team=true`, the team picker is shown and required.
- If the new role's `requires_team=false`, `profiles.team_id` is auto-cleared.

Removing a user from a role sets `profiles.role_id` to NULL (they're then "unassigned" and have no access until reassigned).

## 8. Migration plan

Five phases. Each phase is independently rollback-able.

### Phase 1 — Schema + seed (no behavior change)
Single migration `roles_redesign_phase1_schema`:
1. Create `public.roles` table + RLS.
2. Seed: Admin / Team Lead / Sales Member.
3. `ALTER TABLE profiles ADD COLUMN role_id uuid REFERENCES roles(id) ON DELETE SET NULL`. Nullable.
4. Backfill: every user with `profiles.role='admin'` → Admin role. Everyone else → Sales Member role.
5. DELETE the "Admin" team row from `teams`; null out the `team_id` of users who were assigned to it.
6. Leave `profiles.role` enum in place as a safety net.

After Phase 1: schema supports the new model; nothing breaks because no code reads `role_id` yet.

### Phase 2 — ABAC policy migration
Single migration `roles_redesign_phase2_policies`:
1. Add the new `role_id` subject matcher to the `abac_check` subject-match step.
2. Insert auto-policies for the three system roles per §6.1–6.3.
3. Disable legacy `Compat — owner reads own` / `Compat — owner updates own` policies.
4. Disable existing `auto:lead:*` policies (the older Team Lead designation feature).
5. Run regression sweep: every (user, account) read decision must equal pre-Phase-2 results. Required: 0 mismatches.

### Phase 3 — Frontend rollout
Ship updated `crm.html`:
6. Roles list reads from `roles` table (not `teams`).
7. Role detail panel renders SYSTEM chip, locks fields on system roles.
8. Members tab uses `role_id` + inline team picker.
9. Manage Teams sub-modal added.
10. Crown button + handler removed.
11. Old `team_id`-as-role code paths return / no-op gracefully if `role_id` is set.

### Phase 4 — Cleanup
After 24h of stable Phase 3:
12. `ALTER TABLE profiles DROP COLUMN role` (legacy enum).
13. Rewrite `is_admin()` to read `roles.type='admin'`.
14. `ALTER TABLE teams DROP COLUMN lead_user_id` (the crown column).
15. Drop legacy disabled policies if not needed for audit.

### Phase 5 — Documentation
Update `CHANGELOG`, brief the team on the new "to change a role, go to the new role's Members tab" workflow.

## 9. Testing strategy

| Layer | Test |
|---|---|
| Schema sanity | `roles` table exists with 3 seeded rows; `profiles.role_id` populated for all users; "Admin" team gone from `teams` |
| Subject matcher unit | New test in `01_abac_unit.sql`: a policy with `subject={role_id: X}` matches users assigned to role X, ignores others |
| Engine bypass | Admin user → returns TRUE without evaluating policies (existing test passes against new `is_admin`) |
| Engine team_lead | Team Lead with `team_id=X` sees accounts where `owner.team_id=X`; cannot see Y team's accounts |
| Engine member | Member sees only accounts they own / are AM on |
| Migration regression | Phase 2 sweep: for every (user, account) pair, abac_check decision before == after. 0 mismatches required |
| UI behavior | System role's delete button hidden; name field disabled; toggles still editable |
| Move-user flow | Add user to Admin role → team_id cleared; add to Team Lead role → team picker required |

Tests live in `docs/superpowers/specs/roles-redesign/tests/`.

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Backfill mis-assigns users | Backfill is deterministic (admins → Admin, everyone else → Sales Member); easy to manually fix wrong rows |
| Regression sweep finds mismatches | Hold the rollout; debug the seed auto-policies; adjust before flipping Phase 2 |
| User on the live UI during migration | Phase 3 ships behind a feature flag; old UI still reads `team_id` as role until the flag flips |
| Drop `profiles.role` enum breaks legacy code | Phase 4 explicit; one-deploy gap between new code shipping and old enum dropping |
| Custom role created without toggles → user locked out | UI surfaces a warning ("No toggles enabled — members of this role can't see anything") when a custom role has 0 enabled toggles |

## 11. Open / out-of-scope

These are tempting but NOT in v1, per §3:

- Per-team policy overrides
- Role inheritance / hierarchy
- Per-resource role permissions
- Role expiry / scheduled changes
- Bulk CSV role assignment
- A "Users" sub-tab listing every user (deferred; Members-tab-per-role covers the same need for now)
- Role-based field-level masking (deferred to ABAC v2)

If any of these become real asks, they get their own brainstorm and design doc.
