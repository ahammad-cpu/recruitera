export type RequalRuleLite = { id: string; name: string; enabled: boolean };
export type RequalFireLite = { rule_id: string; account_id: string; task_id: string | null; fired_at: string };
export type RequalTaskLite = { id: string; task_done: boolean | null };
export type RequalStageHistoryLite = { account_id: string; from_stage: string | null; changed_at: string };

export type RequalRuleEffectiveness = {
  ruleId: string;
  ruleName: string;
  fires: number;
  tasksWithTask: number;   // fires that have a linked task (task_id not null)
  tasksDone: number;       // of those, how many are completed
  reopened: number;        // fires whose account later left `lost` again
};

/**
 * Per-rule effectiveness for the requalification engine: how many times each
 * enabled rule fired in the period, how many of those fires produced a
 * completed follow-up task, and how many of the fired accounts subsequently
 * moved off `lost` again (a sign the nudge worked).
 *
 * - Fires are scoped to `fired_at` in [fromISO, toISO].
 * - Fires with `task_id === null` (task creation failed) count toward
 *   `fires` but are excluded from the `tasksWithTask` / `tasksDone` denominator.
 * - "Reopened after" checks stage_history for a `from_stage === 'lost'`
 *   transition on the same account with `changed_at` strictly after the
 *   fire's `fired_at` — i.e. the account left `lost` again after this
 *   specific nudge fired.
 * - Rule name/enabled state is resolved by joining against the current
 *   `requalification_rules` rows (rules may have been disabled or deleted
 *   since firing) — fires for a rule no longer present are skipped.
 */
export function computeRequalificationEffectiveness(
  rules: RequalRuleLite[],
  fires: RequalFireLite[],
  tasksById: Map<string, RequalTaskLite>,
  stageHistory: RequalStageHistoryLite[],
  fromISO: string,
  toISO: string,
): RequalRuleEffectiveness[] {
  const enabledRules = rules.filter((r) => r.enabled);
  const ruleById = new Map(enabledRules.map((r) => [r.id, r]));

  const scopedFires = fires.filter(
    (f) => ruleById.has(f.rule_id) && f.fired_at >= fromISO && f.fired_at <= toISO,
  );

  // Group stage_history "left lost" transitions by account for fast lookup.
  const lostExitsByAccount = new Map<string, string[]>();
  stageHistory.forEach((h) => {
    if (h.from_stage !== 'lost') return;
    const arr = lostExitsByAccount.get(h.account_id) ?? [];
    arr.push(h.changed_at);
    lostExitsByAccount.set(h.account_id, arr);
  });

  const acc = new Map<string, RequalRuleEffectiveness>();
  enabledRules.forEach((r) => acc.set(r.id, { ruleId: r.id, ruleName: r.name, fires: 0, tasksWithTask: 0, tasksDone: 0, reopened: 0 }));

  scopedFires.forEach((f) => {
    const row = acc.get(f.rule_id);
    if (!row) return;
    row.fires += 1;

    if (f.task_id) {
      row.tasksWithTask += 1;
      const task = tasksById.get(f.task_id);
      if (task?.task_done) row.tasksDone += 1;
    }

    const exits = lostExitsByAccount.get(f.account_id);
    if (exits?.some((changedAt) => changedAt > f.fired_at)) row.reopened += 1;
  });

  return Array.from(acc.values())
    .filter((r) => r.fires > 0)
    .sort((a, b) => b.fires - a.fires);
}
