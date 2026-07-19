import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAccounts } from '@/hooks/useAccounts';
import { cn } from '@/lib/cn';
import { fmtInt } from '@/lib/format';
import { ReportPanel, HeaderPill } from '../../shared/ReportUI';
import { computeLossMatrix } from './lossCalc';

/**
 * Loss × Stage breakdown matrix — rows are loss reasons, columns are the
 * stage the account was lost from. Each cell shows the count of accounts
 * lost in [from, to] for that reason/stage combo, and highlights when a
 * meaningful share of them were later reopened (laterReopened / count > 0.3).
 *
 * Reopened accounts are sourced from `stage_history` rows where
 * from_stage='lost' AND to_stage != 'lost', within the same date window
 * (on `changed_at`) as the loss window — i.e. "reopened after being lost
 * during this reporting period".
 */
export function LossBreakdownMatrix({
  from, to, ownerId,
}: {
  from: string;
  to: string;
  ownerId: string | null;
}) {
  const accts = useAccounts();

  const reopenedQuery = useQuery({
    queryKey: ['stage_history', 'lost-reopens', from, to],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('stage_history')
        .select('account_id, from_stage, to_stage, changed_at')
        .eq('from_stage', 'lost')
        .neq('to_stage', 'lost')
        .gte('changed_at', from)
        .lte('changed_at', to);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.account_id as string));
    },
  });

  const scopedAccts = useMemo(() => {
    let list = (accts.data ?? []).filter((a) => !a.merged_into);
    if (ownerId) list = list.filter((a) => a.owner_id === ownerId);
    return list;
  }, [accts.data, ownerId]);

  const matrix = useMemo(
    () => computeLossMatrix(scopedAccts, reopenedQuery.data ?? new Set(), from, to),
    [scopedAccts, reopenedQuery.data, from, to],
  );

  const totalLost = matrix.reasons.reduce(
    (sum, r) => sum + matrix.stages.reduce((s, st) => s + matrix.cell(r, st).count, 0),
    0,
  );

  return (
    <ReportPanel
      title="Loss breakdown"
      subtitle="Loss reason × stage lost from"
      headerRight={<HeaderPill tone={totalLost > 0 ? 'bad' : 'muted'}>{fmtInt(totalLost)} lost</HeaderPill>}
    >
      {matrix.reasons.length === 0 ? (
        <div className="py-6 text-center text-[12.5px] text-text-3">No lost accounts in scope.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                <th className="text-left font-black uppercase tracking-widest text-[10px] text-text-3 pb-2 pr-3">
                  Reason \ Stage
                </th>
                {matrix.stages.map((s) => (
                  <th key={s} className="text-center font-black uppercase tracking-widest text-[10px] text-text-3 pb-2 px-2">
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.reasons.map((r) => (
                <tr key={r}>
                  <td className="font-extrabold text-text pr-3 py-1.5 whitespace-nowrap">{r}</td>
                  {matrix.stages.map((s) => {
                    const c = matrix.cell(r, s);
                    const reopenRate = c.count > 0 ? c.laterReopened / c.count : 0;
                    const highlight = c.count > 0 && reopenRate > 0.3;
                    return (
                      <td key={s} className="px-2 py-1.5 text-center">
                        {c.count === 0 ? (
                          <span className="text-text-3">—</span>
                        ) : (
                          <span
                            className={cn(
                              'inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 tnum font-bold min-w-[2.5rem]',
                              highlight ? 'bg-warn-bg text-warn' : 'text-text',
                            )}
                            title={
                              c.laterReopened > 0
                                ? `${c.laterReopened} of ${c.count} later reopened (${Math.round(reopenRate * 100)}%)`
                                : undefined
                            }
                          >
                            {fmtInt(c.count)}
                            {c.laterReopened > 0 && (
                              <span className="text-[10px] font-black opacity-80">↺{c.laterReopened}</span>
                            )}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportPanel>
  );
}
