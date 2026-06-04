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

## 2026-06-04 Phase 4 — make role_id authoritative (expand-contract)
Applied. `role_id → roles.type` is now the single source of truth for admin:
- Rewrote `is_admin()`, `is_admin_for()`, and the admin-bypass in both
  `abac_check` and `abac_simulate` to read `roles.type='admin'` via `role_id`
  (no longer the `profiles.role` enum).
- Rewrote `handle_new_user()` to also assign `role_id` (Admin if allowlisted,
  else Sales Member) on signup.
- Added `_sync_profile_role_from_role_id` trigger so `profiles.role` is now an
  auto-maintained **mirror** of `role_id → roles.type`. This keeps the two
  inline RLS policies (`merge_log`, `paid_customers`) and the frontend's
  `AUTH_PROFILE.role` working with zero changes, while role_id stays
  authoritative and the mirror can never drift.
- **Data fix:** `a.hammad@icareer.ai` had drifted to the Sales Member role_id
  during earlier UI testing while still flagged admin via the mirror/allowlist.
  Corrected all true admins' `role_id` to the Admin role.
- Dropped the dead `teams.lead_user_id` column.

### Deliberately NOT done: physically dropping `profiles.role`
`profiles.role` is kept as the trigger-synced mirror rather than `DROP COLUMN`.
Dropping it would require a coordinated frontend deploy (the UI reads
`AUTH_PROFILE.role` in many places) for zero functional gain — `role_id` is
already authoritative and the mirror cannot drift. If a future cleanup wants
the column physically gone, first ship a frontend that derives the role from
`role_id`, verify it live, then `ALTER TABLE public.profiles DROP COLUMN role`.

## How to change someone's role now
Settings → Roles & Permissions → open the **new** role → **Members** sub-tab →
**Add member** → pick them. They're automatically removed from their previous
role. If the role requires a team, set their team from the inline picker on the
member row.
