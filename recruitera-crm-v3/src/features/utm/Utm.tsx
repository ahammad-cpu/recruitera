import { useMemo, useState } from 'react';
import { Copy, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useUtmLinks, useUtmCampaigns, useSaveUtmLink } from '@/hooks/useUtmData';
import { fmtDate } from '@/lib/format';
import { cn } from '@/lib/cn';

const SOURCES = ['google', 'facebook', 'linkedin', 'twitter', 'email', 'newsletter', 'direct'];
const MEDIUMS = ['cpc', 'social', 'email', 'referral', 'display', 'organic', 'affiliate'];

export default function Utm() {
  const [tab, setTab] = useState<'build' | 'saved'>('build');
  const { data: links } = useUtmLinks();
  const { data: campaigns } = useUtmCampaigns();
  const save = useSaveUtmLink();

  const [state, setState] = useState({
    base_url: 'https://recruitera.com',
    utm_source: '',
    utm_medium: '',
    utm_campaign: '',
    utm_content: '',
  });

  const url = useMemo(() => buildUrl(state), [state]);

  function copy() {
    navigator.clipboard.writeText(url);
    toast.success('URL copied');
  }

  function persist() {
    save.mutate({
      base_url: state.base_url,
      utm_source: state.utm_source || null,
      utm_medium: state.utm_medium || null,
      utm_campaign: state.utm_campaign || null,
      utm_content: state.utm_content || null,
      full_url: url,
      group_id: null,
    });
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-text">UTM Generator</h1>
        <p className="text-[12.5px] text-text-3 mt-0.5">Build tagged URLs and save them for the Campaign report.</p>
      </div>

      <div className="flex items-center gap-1.5 border-b border-border pb-3">
        {[
          { k: 'build', label: 'Build' },
          { k: 'saved', label: `Saved (${links?.length ?? 0})` },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k as typeof tab)}
            className={cn(
              'h-9 px-4 rounded-lg text-[12.5px] font-semibold border',
              tab === t.k ? 'bg-cg-900 text-white border-cg-900' : 'bg-surface text-text-2 border-border hover:bg-surface-2',
            )}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'build' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-surface border border-border rounded-2xl p-5 shadow-sh1 space-y-3">
            <Field label="Base URL" value={state.base_url} onChange={(v) => setState((s) => ({ ...s, base_url: v }))} />
            <Field label="Source" value={state.utm_source} onChange={(v) => setState((s) => ({ ...s, utm_source: v }))} list={SOURCES} />
            <Field label="Medium" value={state.utm_medium} onChange={(v) => setState((s) => ({ ...s, utm_medium: v }))} list={MEDIUMS} />
            <Field label="Campaign" value={state.utm_campaign} onChange={(v) => setState((s) => ({ ...s, utm_campaign: v }))} list={campaigns?.map((c) => c.name)} />
            <Field label="Content" value={state.utm_content} onChange={(v) => setState((s) => ({ ...s, utm_content: v }))} placeholder="hero-cta / footer-link / …" />
          </div>

          <div className="bg-surface border border-border rounded-2xl p-5 shadow-sh1 space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-text-3">Preview</div>
            <div className="font-mono text-[12.5px] text-accent-ink bg-surface-2 border border-border rounded-lg p-3 break-all leading-relaxed">
              {url}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={copy} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-surface-2 text-text border border-border hover:bg-surface text-[12.5px] font-semibold">
                <Copy size={12} /> Copy
              </button>
              <button
                onClick={persist}
                disabled={save.isPending || !state.utm_source || !state.utm_medium}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-cg-900 text-white text-[12.5px] font-semibold hover:bg-cg-800 disabled:opacity-50"
              >
                <Save size={12} /> {save.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
            <div className="text-[11px] text-text-3">Source + Medium required to save.</div>
          </div>
        </div>
      )}

      {tab === 'saved' && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sh1">
          <div className="grid grid-cols-[1fr_100px_100px_140px_100px] px-4 py-2.5 bg-surface-2 text-[11px] font-bold uppercase tracking-wider text-text-3">
            <div>Full URL</div><div>Source</div><div>Medium</div><div>Campaign</div><div className="text-right">Created</div>
          </div>
          {!links?.length && <div className="p-8 text-center text-[12.5px] text-text-3">No saved links yet.</div>}
          {links?.map((l) => (
            <div key={l.id} className="grid grid-cols-[1fr_100px_100px_140px_100px] px-4 py-2.5 border-t border-border hover:bg-surface-2 text-[12px]">
              <a href={l.full_url} target="_blank" rel="noopener noreferrer" className="text-accent-ink font-mono truncate hover:underline" title={l.full_url}>
                {l.full_url}
              </a>
              <div className="text-text-2">{l.utm_source || '—'}</div>
              <div className="text-text-2">{l.utm_medium || '—'}</div>
              <div className="text-text-2 truncate">{l.utm_campaign || '—'}</div>
              <div className="text-right text-text-3">{fmtDate(l.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, list,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; list?: string[] }) {
  const listId = list ? `dl-${label}` : undefined;
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-text-3">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        list={listId}
        className="mt-1 w-full h-9 px-3 border border-border-2 rounded-lg bg-surface-2 text-[13px] text-text outline-none focus:border-accent-strong"
      />
      {list && (
        <datalist id={listId}>
          {list.map((o) => <option key={o} value={o} />)}
        </datalist>
      )}
    </label>
  );
}

function buildUrl(s: { base_url: string; utm_source: string; utm_medium: string; utm_campaign: string; utm_content: string }) {
  const base = s.base_url.trim();
  if (!base) return '';
  const params = new URLSearchParams();
  if (s.utm_source) params.set('utm_source', s.utm_source);
  if (s.utm_medium) params.set('utm_medium', s.utm_medium);
  if (s.utm_campaign) params.set('utm_campaign', s.utm_campaign);
  if (s.utm_content) params.set('utm_content', s.utm_content);
  const qs = params.toString();
  if (!qs) return base;
  return base + (base.includes('?') ? '&' : '?') + qs;
}
