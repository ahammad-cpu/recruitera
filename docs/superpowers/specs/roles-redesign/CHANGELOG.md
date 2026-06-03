# Roles redesign — changelog

Splits the old `teams`-as-roles conflation into two clean concepts: a `roles`
table (Admin / Team Lead / Sales Member + custom) and a `teams` table (Sales
Egypt, Gulf, etc). See the design at
`docs/superpowers/specs/2026-06-03-roles-redesign-design.md`.

## 2026-06-03 Phase 1 — schema + seed
- Added `public.roles` table with three system rows (Admin, Team Lead, Sales
  Member). `type`, `is_system`, `requires_team` columns + COMMENTs.
- Added `profiles.role_id`; backfilled (admins → Admin, everyone else → Sales
  Member).
- Removed the legacy "Admin" team row from `public.teams`.

## 2026-06-03 Phase 2 — ABAC policy migration
- `abac_check` and `abac_simulate` now match `subject.role_id`.
- Seeded 4 auto-policies for Sales Member + Team Lead read/update
  (`auto:role:<role_id>:<action>`).
- Disabled the legacy `Compat —` policies and the older `auto:lead:*` policies.
- Regression sweep: **0 mismatches** across all 2,785 (user × account) pairs.
- Unit test for the `role_id` matcher in
  `tests/01_role_id_subject_matcher.sql`; regression sweep in
  `tests/02_roles_regression.sql`.

## 2026-06-03 Phase 3 — frontend rollout
- Roles & Permissions tab now reads from the `roles` table.
- SYSTEM badge on protected rows; Delete + Rename guarded both client-side and
  server-side (`_roles_guard_system` trigger).
- Members tab inline team picker for roles where `requires_team=true`; add/remove
  writes `role_id`.
- Crown / "Make Team Lead" UI removed — promotion is just a role assignment.
- Manage Teams sub-modal added.
- Invite User + Add Role write `role_id` (custom roles are `type=custom`).
- Toggle handler writes `subject.role_id` (was `team_id`) so per-role toggles
  target the role correctly.

## Phase 4 — cleanup (DEFERRED, run ~24h after Phase 3 is stable)
NOT yet applied. When ready:
- Rewrite `is_admin()` to read `roles.type='admin'`.
- Drop `profiles.role` enum.
- Drop `teams.lead_user_id`.
- Run only after `abac_audit` shows no unexpected denies for ~24h.

## How to change someone's role now
Settings → Roles & Permissions → open the **new** role → **Members** sub-tab →
**Add member** → pick them. They're automatically removed from their previous
role. If the role requires a team, set their team from the inline picker on the
member row.
