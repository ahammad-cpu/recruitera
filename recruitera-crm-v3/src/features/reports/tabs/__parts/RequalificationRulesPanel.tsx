import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fmtInt } from '@/lib/format';
import { ReportPanel, HeaderPill } from '../../shared/ReportUI';
import {
  computeRequalificationEffectiveness,
  type RequalFireLite,
  type RequalRuleLite,
  type RequalStageHistoryLite,
  type RequalTaskLite,
} from './requalificationEffectivenessCalc';

/**
 * Requalification rules effectiveness panel — sits at the bottom of the AM
 * Performance report. Answers "are the requalification rules actually
 * pulling accounts back?" by showing, per enabled rule: how many times it
 * fired this period, how many of those fires led to a completed follow-up
 * task, and how many of the fired accounts later left `lost` again.
 */
export function RequalificationRulesPanel({ from, to }: { from: string; to: string }) {
  const rulesQuery = useQuery({
    queryKey: ['requalification_rules', 'effectiveness'],
    queryFn: async (): Promise<RequalRuleLite[]> => {
      const { data, error } = await supabase.from('requalification_rules').select('id, name, enabled');
      if (error) throw error;
      return (data ?? []) as RequalRuleLite[];
    },
  });

  const firesQuery = useQuery({
    queryKey: ['requalification_fires', from, to],
    queryFn: async (): Promise<RequalFireLite[]> => {
      const { data, error } = await supabase
        .from('requalification_fires')
        .select('rule_id, account_id, task_id, fired_at')
        .gte('fired_at', from)
        .lte('fired_at', to);
      if (error) throw error;
      return (data ?? []) as RequalFireLite[];
    },
  });

  const taskIds = useMemo(
    () => Array.from(new Set((firesQuery.data ?? []).map((f) => f.task_id).filter((id): id is string => !!id))),
    [firesQuery.data],
  );

  const tasksQuery = useQuery({
    queryKey: ['activities', 'requalification-task-status', taskIds],
    queryFn: async (): Promise<RequalTaskLite[]> => {
      if (taskIds.length === 0) return [];
      const { data, error } = await supabase.from('activities').select('id, task_done').in('id', taskIds);
      if (error) throw error;
      return (data ?? []) as RequalTaskLite[];
    },
    enabled: taskIds.length > 0,
  });

  const accountIds = useMemo(
    () => Array.from(new Set((firesQuery.data ?? []).map((f) => f.account_id))),
    [firesQuery.data],
  );

  const stageHistoryQuery = useQuery({
    queryKey: ['stage_history', 'requalification-reopens', accountIds],
    queryFn: async (): Promise<RequalStageHistoryLite[]> => {
      if (accountIds.length === 0) return [];
      const { data, error } = await supabase
        .from('stage_history')
        .select('account_id, from_stage, changed_at')
        .eq('from_stage', 'lost')
        .in('account_id', accountIds);
      if (error) throw error;
      return (data ?? []) as RequalStageHistoryLite[];
    },
    enabled: accountIds.length > 0,
  });

  const tasksById = useMemo(() => {
    const m = new Map<string, RequalTaskLite>();
    (tasksQuery.data ?? []).forEach((t) => m.set(t.id, t));
    return m;
  }, [tasksQuery.data]);

  const rows = useMemo(
    () => computeRequalificationEffectiveness(
      rulesQuery.data ?? [],
      firesQuery.data ?? [],
      tasksById,
      stageHistoryQuery.data ?? [],
      from,
      to,
    ),
    [rulesQuery.data, firesQuery.data, tasksById, stageHistoryQuery.data, from, to],
  );

  const isLoading = rulesQuery.isLoading || firesQuery.isLoading;
  const totalFires = rows.reduce((sum, r) => sum + r.fires, 0);

  return (
    <ReportPanel
      title="Requalification rules"
      subtitle="Rule effectiveness this period"
      headerRight={<HeaderPill tone={totalFires > 0 ? 'accent' : 'muted'}>{fmtInt(totalFires)} fires</HeaderPill>}
    >
      <div className="border border-border rounded-xl overflow-x-auto">
        <div className="grid grid-cols-[1fr_repeat(3,140px)] px-4 py-2.5 bg-surface-2 text-[11px] font-bold uppercase tracking-wider text-text-3 min-w-[640px]">
          <div>Rule</div>
          <div className="text-right">Fires</div>
          <div className="text-right" title="Fires whose follow-up task was completed">Tasks done</div>
          <div className="text-right" title="Fired accounts that later left `lost` again">Reopened after</div>
        </div>
        {isLoading && <div className="p-4 text-[12.5px] text-text-3">Loading…</div>}
        {!isLoading && rows.length === 0 && (
          <div className="p-6 text-center text-[12.5px] text-text-3">No requalification activity in this period.</div>
        )}
        {rows.map((r) => {
          const taskPct = r.tasksWithTask > 0 ? Math.round((r.tasksDone / r.tasksWithTask) * 100) : null;
          const reopenPct = r.fires > 0 ? Math.round((r.reopened / r.fires) * 100) : 0;
          return (
            <div key={r.ruleId} className="grid grid-cols-[1fr_repeat(3,140px)] px-4 py-2.5 border-t border-border hover:bg-surface-2/60 text-[13px] min-w-[640px]">
              <div className="text-text truncate font-semibold" title={r.ruleName}>{r.ruleName}</div>
              <div className="text-right tnum font-bold">{fmtInt(r.fires)}</div>
              <div className="text-right tnum text-ok">
                {r.tasksWithTask > 0 ? `${fmtInt(r.tasksDone)} (${taskPct}%)` : '—'}
              </div>
              <div className="text-right tnum text-warn">
                {r.fires > 0 ? `${fmtInt(r.reopened)} (${reopenPct}%)` : '—'}
              </div>
            </div>
          );
        })}
      </div>
    </ReportPanel>
  );
}
