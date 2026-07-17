# Reports Rework — Design

**Date:** 2026-07-17
**Status:** Approved, pending implementation plan
**Scope:** `recruitera-crm-v3/src/features/reports/` (the 7-tab Reports module) only.

## Goal

Bring v3's Reports module up to a best-of-all-three superset of v1 (`crm.html`) and v2 (`crm-v2.html`), closing the gaps identified in the pre-brainstorm survey, without carrying forward the parts that were deliberately dropped along the way.

## Background: survey findings

- **v3** has 7 tabs (Key Metrics, Pipeline, Revenue, Acquisition, Renewal, AM, Campaign), a faithful simplified TS port of v2. Renewal has an explicit unbuilt TODO (churn rate + rolling MRR, "Phase 5"). `StubReport.tsx` is an unused placeholder.
- **v2** is nearly identical to v3, plus a global owner/AM filter across all tabs and a non-functional "Export PDF" stub.
- **v1** has no multi-tab Reports section (one monolithic dashboard), but has things v2/v3 lack: a date-range filter (7d/30d/90d/QTD/YTD/Custom), a 30-day ARR-vs-Pipeline trend line chart, an 8-week Won-vs-Lost bar chart, and marketing-channel attribution resolved through UTM/`marketing_tracking` data (more accurate than v2/v3's raw `accounts.source` column).
- v1 also has a Reps/Teams/Org leaderboard (`Team Targeting` view) — it existed briefly in v2's Reports page and was **deliberately removed** (commit: "remove leaderboard widget from Reports page").

## Explicit scope decisions

| Question | Decision |
|---|---|
| Overall goal | Best-of-all-three in v3 (superset of v1+v2) |
| Leaderboard | **Out of scope** — respects the earlier removal decision, not brought into Reports |
| Date-range filter | **Per-tab**, not global — each tab adds its own filter only where the tab's metric is meaningfully time-boxed |
| Owner/AM filter | **Global**, one filter in `ReportsShell` applied to all tabs that use owner-scoped data — restores v2's exact behavior, no separate CS-role filter added |
| PDF export | **Build for real** — replaces the v2 stub with a working export |
| Attribution accuracy | **Switch to MT-resolved** (UTM/`marketing_tracking`-based) attribution, replacing the raw `accounts.source` reads. Numbers on Key Metrics/Acquisition/Campaign will shift from what's shown today — this is intentional, it's a correctness fix. |
| Trend charts | **Split across relevant tabs**: ARR-vs-Pipeline → Revenue tab, Won-vs-Lost → Pipeline tab |
| Renewal churn/MRR TODO | **Finish it** as part of this rework |
| `AMPerformance.tsx` | **Out of scope**, untouched — separate page, not under `/reports` |

## Architecture

### Shared infrastructure (built once, reused across tabs)

1. **`DateRangeFilter` component + `resolveDateRange(key, customFrom?, customTo?)` helper** — supports 7d / 30d / 90d / QTD / YTD / Custom, matching v1. No shared global date state — each tab that renders the filter owns its own local state, per the per-tab decision above.
2. **Global owner filter** — lives once in `ReportsShell` (admin-only "All AMs ▾" picker, same pattern as the Sales/CS dashboard owner pickers already built this session). Passed down as a prop to whichever tabs consume owner-scoped data.
3. **`useResolvedAttribution()` hook** — fetches all `marketing_tracking` rows once, builds a map keyed by `company_ref`, and resolves each account's channel as `marketing_tracking.first_source ?? accounts.source` (v1's fallback order). Consumed by Key Metrics, Acquisition, and Campaign wherever they currently bucket by raw `source`.
4. **`exportReportPdf(elementRef, filename)` utility** — browser print-to-PDF path using print-specific CSS on the active tab's rendered content. No new heavy dependency (no jsPDF/html2canvas) — a clean printable snapshot is sufficient for a CRM report export.

### Per-tab changes

| Tab | Changes |
|---|---|
| `ReportsShell` | Global owner filter; functional "Export PDF" button wired to the active tab |
| `KeyMetrics` | Acquisition-sources bar list switches to MT-resolved attribution; owner-filtered |
| `PipelineReport` | Adds 8-week Won-vs-Lost bar chart (from `deals.closed_at`, see Data Layer); owner-filtered |
| `RevenueReport` | Adds 30-day ARR-vs-Pipeline trend line chart; gets a date-range filter (defaults to QTD, matching the existing attainment metric) |
| `AcquisitionReport` | Switches to MT-resolved attribution; gets a date-range filter bounding the sources breakdown and monthly chart |
| `RenewalReport` | Finishes churn rate + rolling MRR chart (closes the Phase 5 TODO); owner-filtered |
| `AMReport` | Owner-filtered (drill into a single AM's row) |
| `CampaignReport` | Switches to MT-resolved attribution for consistency; gets a date-range filter |
| `StubReport.tsx` | Removed if confirmed orphaned (no route references it) |

## Data layer

No new tables or migrations — everything is computed client-side from data that already exists.

- **MT-resolved attribution**: `useResolvedAttribution()` fetches all `marketing_tracking` rows, maps by `company_ref`, resolves `first_source ?? accounts.source`.
- **Won-vs-Lost weekly chart**: grouped from the `deals` table by `closed_at` (v3 has a real deals table v1 didn't) — falls back to `accounts.stage`/`deal_close_date` only for the rare account with no deals row, consistent with how Pipeline already treats deals-vs-accounts elsewhere in v3.
- **ARR-vs-Pipeline 30-day trend**: reconstructed retroactively from existing timestamps (no snapshot table needed). For each of the last 30 days: ARR = sum of `contract_cycles` active that day (`started_at` ≤ day ≤ `ends_at`); Pipeline = sum of open deal amounts open that day (`created_at` ≤ day, not yet closed). Accurate as long as records aren't heavily retroactively edited — acceptable trade-off given no historical snapshot infra exists.
- **Renewal churn rate + rolling MRR**: same retroactive-reconstruction approach applied to `contract_cycles` over the last N months. MRR(month) = active-cycle value at month start. Churn rate(month) = value of cycles that flipped to `churned` during that month ÷ that month's starting MRR.

## Out of scope

- Reps/Teams/Org leaderboard (stays out per explicit decision)
- `AMPerformance.tsx` (separate page, untouched)
- Any new backend schema/migrations
- CS-role-specific report filtering (only the existing AM/owner filter is restored)

## Testing approach

- Unit tests for the new pure-calculation helpers (`resolveDateRange`, MT-attribution resolution, ARR/Pipeline/MRR/churn reconstruction) — these are testable in isolation from data-fetching.
- Manual verification per tab in the browser after wiring: confirm filters actually change displayed numbers, confirm PDF export produces a readable snapshot, confirm attribution numbers visibly shift from today's raw-source baseline (expected, not a regression).
- `tsc`, `vitest`, `npm run build` before each ship, consistent with this session's established pattern.
