/**
 * Single source of truth for pipeline-stage display labels.
 * The DB stage enum stores lowercase values (lead/mql/sql/demo/proposal/won/paid/lost);
 * the UI labels them consistently through this map. Use `stageLabel(s)` — never
 * s.toUpperCase() — so renames like paid → Collected happen in one place.
 */
export const STAGE_LABEL: Record<string, string> = {
  lead:     'Lead',
  mql:      'MQL',
  sql:      'SQL',
  demo:     'Demo',
  proposal: 'Proposal',
  won:      'Won',
  paid:     'Collected',
  lost:     'Lost',
};

export function stageLabel(stage: string | null | undefined): string {
  if (!stage) return '—';
  const key = String(stage).toLowerCase();
  return STAGE_LABEL[key] ?? String(stage);
}

/** Canonical ordering used by dropdowns/pickers. Excludes lost (transitions
 *  into lost go through the Lose/Disqualify modals, not a plain picker). */
export const STAGE_ORDER = ['lead', 'mql', 'sql', 'demo', 'proposal', 'won', 'paid'] as const;
