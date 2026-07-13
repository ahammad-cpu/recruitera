import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

// ─── Internal domains — never merge these ─────────────
const EXCLUDED_DOMAINS = new Set([
  'basharsoft.com', 'icareer.com.eg', 'icareer.ai', 'recruitera.ai',
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'icloud.com', 'live.com', 'me.com', 'msn.com', 'aol.com',
]);

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // ── Step 1: Find all duplicate domains ──────────────
    const { data: dupes, error: dupErr } = await supabase
      .from('accounts')
      .select('id, name, domain, created_at, stage, deal_value, am_mail, source, campaign, medium, is_disqualified')
      .not('domain', 'is', null)
      .neq('domain', '')
      .order('domain', { ascending: true })
      .order('created_at', { ascending: true });

    if (dupErr) throw new Error('Fetch error: ' + dupErr.message);
    if (!dupes || dupes.length === 0) {
      return new Response(JSON.stringify({ status: 'ok', merged: 0, message: 'No accounts with domain' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Group by domain
    const byDomain: Record<string, typeof dupes> = {};
    for (const acc of dupes) {
      const d = (acc.domain as string).toLowerCase();
      if (EXCLUDED_DOMAINS.has(d)) continue;
      if (!byDomain[d]) byDomain[d] = [];
      byDomain[d].push(acc);
    }

    let totalMerged = 0;
    const mergeResults: Array<{ domain: string; kept: string; merged: number }> = [];

    // ── Step 2: Merge each duplicate group ──────────────
    for (const [domain, accounts] of Object.entries(byDomain)) {
      if (accounts.length < 2) continue;

      // Keep the oldest record (first created_at)
      // BUT prefer the one with the most advanced pipeline stage
      const stageOrder: Record<string, number> = {
        lost: 0, lead: 1, mql: 2, sql: 3, demo: 4, proposal: 5, won: 6,
      };

      accounts.sort((a, b) => {
        // Prefer higher stage first, then oldest
        const stageDiff = (stageOrder[b.stage] ?? 1) - (stageOrder[a.stage] ?? 1);
        if (stageDiff !== 0) return stageDiff;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

      const keeper = accounts[0];
      const toMerge = accounts.slice(1).map(a => a.id);

      // ── Step 3: Re-parent related records ───────────────
      for (const mergedId of toMerge) {
        // Re-parent activities
        await supabase
          .from('activities')
          .update({ account_id: keeper.id })
          .eq('account_id', mergedId);

        // Re-parent contacts
        await supabase
          .from('contacts')
          .update({ account_id: keeper.id })
          .eq('account_id', mergedId);

        // Re-parent files
        await supabase
          .from('files')
          .update({ account_id: keeper.id })
          .eq('account_id', mergedId);

        // Re-parent stage_history
        await supabase
          .from('stage_history')
          .update({ account_id: keeper.id })
          .eq('account_id', mergedId);

        // Merge tags — insert new account_tags avoiding conflicts
        const { data: mergeTags } = await supabase
          .from('account_tags')
          .select('tag_id')
          .eq('account_id', mergedId);

        if (mergeTags && mergeTags.length > 0) {
          const newTags = mergeTags.map(t => ({ account_id: keeper.id, tag_id: t.tag_id }));
          await supabase
            .from('account_tags')
            .upsert(newTags, { onConflict: 'account_id,tag_id', ignoreDuplicates: true });
          // Delete old
          await supabase.from('account_tags').delete().eq('account_id', mergedId);
        }

        // Merge ICP scores if keeper has none
        const { data: keeperIcp } = await supabase
          .from('icp_scores')
          .select('account_id')
          .eq('account_id', keeper.id)
          .single();

        if (!keeperIcp) {
          const { data: mergeIcp } = await supabase
            .from('icp_scores')
            .select('scores')
            .eq('account_id', mergedId)
            .single();
          if (mergeIcp) {
            await supabase
              .from('icp_scores')
              .upsert({ account_id: keeper.id, scores: mergeIcp.scores });
          }
        }
        await supabase.from('icp_scores').delete().eq('account_id', mergedId);

        // ── Merge fields: fill missing info on keeper ──────
        const mergedAcc = accounts.find(a => a.id === mergedId);
        if (mergedAcc) {
          const updates: Record<string, unknown> = {};
          if (!keeper.deal_value && mergedAcc.deal_value) updates.deal_value = mergedAcc.deal_value;
          if (!keeper.am_mail && mergedAcc.am_mail) updates.am_mail = mergedAcc.am_mail;
          if (!keeper.source && mergedAcc.source) updates.source = mergedAcc.source;
          if (!keeper.campaign && mergedAcc.campaign) updates.campaign = mergedAcc.campaign;
          if (!keeper.medium && mergedAcc.medium) updates.medium = mergedAcc.medium;
          if (Object.keys(updates).length > 0) {
            await supabase.from('accounts').update(updates).eq('id', keeper.id);
          }
        }

        // ── Delete the duplicate account ───────────────────
        await supabase.from('accounts').delete().eq('id', mergedId);
      }

      // ── Log the merge ──────────────────────────────────
      await supabase.from('merge_log').insert({
        domain,
        kept_account_id: keeper.id,
        merged_count: toMerge.length,
        merged_ids: toMerge,
      });

      // ── Log activity on kept account ──────────────────
      await supabase.from('activities').insert({
        account_id: keeper.id,
        type: 'note',
        text: `Auto-merged ${toMerge.length} duplicate(s) with domain ${domain}`,
      });

      totalMerged += toMerge.length;
      mergeResults.push({ domain, kept: keeper.name, merged: toMerge.length });
    }

    return new Response(
      JSON.stringify({
        status: 'ok',
        total_merged: totalMerged,
        groups: mergeResults.length,
        details: mergeResults,
        ran_at: new Date().toISOString(),
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('[merge-duplicates] Error:', err);
    return new Response(
      JSON.stringify({ status: 'error', message: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
