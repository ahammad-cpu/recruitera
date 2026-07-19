import type { Account } from '@/hooks/useAccounts';

export type LossCell = { count: number; laterReopened: number };

export type LossMatrix = {
  reasons: string[];
  stages: string[];
  cell: (reason: string, stage: string) => LossCell;
};

/**
 * Groups currently-lost accounts by `loss_reason x lost_from_stage`, within
 * the [fromISO, toISO] window on `lost_at`. Cells also carry a
 * `laterReopened` count — how many of the accounts in that cell have since
 * been reopened (per the `reopenedIds` set, sourced from `stage_history`
 * rows where from_stage='lost' AND to_stage != 'lost').
 *
 * Missing loss_reason -> 'other'; missing lost_from_stage -> 'unknown'.
 */
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
