# ABAC Module — Changelog

## 2026-06-03 — ABAC engine live; first production policy authored

**Phase 4 (Task 17)** — `app_settings.abac_enabled` flipped to `true`. Every authenticated user now runs through `abac_check`. Smoke test passed (admin saw all 557 accounts; role=user RLS-filtered count equalled `abac_check_batch` allowed count).

**Phase 5 (Task 18) — first production policy**
- Created team `Sales Egypt`, assigned `mariam.samir@recruitera.ai`.
- Inserted two deny policies (one for `read`, one for `update`) at priority 50:
  - **`Egypt team — non-Egypt accounts hidden`** — denies read of accounts where `wp_marketing_channel <> 'Egypt'` OR `wp_marketing_channel IS NULL` for any user whose team_id matches the Sales Egypt team.
  - **`Egypt team — non-Egypt accounts read-only (deny update)`** — mirror of the read deny for `update`.
- Compose with the existing Compat policies (owner-reads-own / owner-updates-own): the Compat allows fire FIRST, then these denies prune non-Egypt accounts from what she could otherwise see.
- Verified via spoofed-JWT smoke: an Egypt account Mariam owns → ALLOW; a non-Egypt account she previously owned → DENY (Egypt policy fired).

**Note on current data state**: at the time of authoring, the `accounts` table contains 0 rows with `wp_marketing_channel='Egypt'`. Mariam's `abac_check`-allowed count therefore drops from 557 → 0 until Egypt-tagged accounts are sourced (via Bubble sync or manual tagging). The policy is correctly wired; the data simply has not yet been populated with the Egypt region tag.

**Rollback** — to revert this scoping without breaking the engine:
```sql
UPDATE public.abac_policies SET enabled=false WHERE name LIKE 'Egypt team —%';
```
**Rollback the engine entirely:**
```sql
UPDATE public.app_settings SET value='false'::jsonb WHERE key='abac_enabled';
```
