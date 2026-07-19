import { toEgp } from '@/lib/format';

export type AmCol = {
  wins: number;
  wonRev: number;
  losses: number;
  reopensAttempted: number;
  reopensWon: number;
  recoveredByOthers: number;
};

export type SH = {
  account_id: string;
  from_stage: string;
  to_stage: string;
  changed_by: string;
  changed_at: string;
};

export type Cycle = {
  account_id: string;
  value: number;
  currency: string;
  started_at: string;
};

const EMPTY_AM_COL: AmCol = {
  wins: 0,
  wonRev: 0,
  losses: 0,
  reopensAttempted: 0,
  reopensWon: 0,
  recoveredByOthers: 0,
};

/**
 * Per-AM cross-attribution for the AM Performance report.
 *
 * Whoever owned the account at the moment it hit `to_stage='won'` gets the
 * win + revenue credit. If a different AM had previously lost the account
 * (a `to_stage='lost'` row logged before the win), that earlier AM is
 * credited with `recoveredByOthers` — the deal they lost came back and
 * closed under someone else's watch. The AM who actually reopened+won it
 * gets `reopensWon` in addition to the normal `wins`/`wonRev`.
 *
 * `reopensAttempted` counts every `from_stage='lost' -> to_stage!=lost`
 * transition (whether or not it eventually won), credited to whoever
 * performed the reopen.
 *
 * All bumps are gated on the transition's `changed_at` (or the matching
 * contract_cycle's `started_at` for revenue) falling inside `period`.
 */
export function computeAmCrossAttribution(
  sh: SH[],
  cycles: Cycle[],
  period: { from: string; to: string },
): Map<string, AmCol> {
  const out = new Map<string, AmCol>();
  if (!sh?.length || !cycles?.length) return out;

  const inRange = (iso: string) => iso >= period.from && iso <= period.to;

  const bump = (uid: string, k: keyof AmCol, n = 1) => {
    const cur = out.get(uid) ?? { ...EMPTY_AM_COL };
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
  for (const rows of byAcct.values()) rows.sort((a, b) => a.changed_at.localeCompare(b.changed_at));

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
        if (c && inRange(c.started_at)) bump(r.changed_by, 'wonRev', toEgp(c.value, c.currency));
        if (hadLostAt) {
          if (hadLostAt.by !== r.changed_by) bump(hadLostAt.by, 'recoveredByOthers');
          bump(r.changed_by, 'reopensWon');
        }
      }
    }
  }

  return out;
}
