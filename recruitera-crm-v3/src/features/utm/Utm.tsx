import { useMemo, useState } from 'react';
import { Copy, Save, RotateCcw, Link2, QrCode, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  useUtmLinks, useUtmCampaigns, useSaveUtmLink, useUtmLinkGroups, useCreateUtmLinkGroup,
} from '@/hooks/useUtmData';
import { useUtmSources, useUtmMediums, useCreateUtmSource, useCreateUtmMedium } from '@/hooks/useUtmOptions';
import { CreatableSelect } from '@/components/shared/CreatableSelect';
import { fmtDate } from '@/lib/format';
import { cn } from '@/lib/cn';

type TabKey = 'generator' | 'history' | 'groups' | 'bulk';

const PRESETS: { label: string; source: string; medium: string }[] = [
  { label: 'LinkedIn organic', source: 'linkedin', medium: 'organic-social' },
  { label: 'LinkedIn ads', source: 'linkedin', medium: 'paid-social' },
  { label: 'Facebook ads', source: 'facebook', medium: 'paid-social' },
  { label: 'Instagram ads', source: 'instagram', medium: 'paid-social' },
  { label: 'Google Ads', source: 'google', medium: 'cpc' },
  { label: 'Newsletter', source: 'newsletter', medium: 'email' },
  { label: 'Partner referral', source: 'partner', medium: 'referral' },
  { label: 'YouTube pre-roll', source: 'youtube', medium: 'video' },
  { label: 'TikTok', source: 'tiktok', medium: 'paid-social' },
];

type FormState = {
  base_url: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
};

function buildUrl(s: FormState) {
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

export default function Utm() {
  const [tab, setTab] = useState<TabKey>('generator');
  const { data: links } = useUtmLinks();
  const { data: groups } = useUtmLinkGroups();
  const { data: campaigns } = useUtmCampaigns();
  const save = useSaveUtmLink();
  const utmSources = useUtmSources();
  const utmMediums = useUtmMediums();
  const createSource = useCreateUtmSource();
  const createMedium = useCreateUtmMedium();

  const sources = Array.from(new Set([
    ...(utmSources.data ?? []).map((s) => s.name),
    ...((links ?? []).map((l) => l.utm_source).filter(Boolean) as string[]),
  ])).sort();
  const mediums = Array.from(new Set([
    ...(utmMediums.data ?? []).map((m) => m.name),
    ...((links ?? []).map((l) => l.utm_medium).filter(Boolean) as string[]),
  ])).sort();

  const [state, setState] = useState<FormState>({
    base_url: 'https://recruitera.ai/',
    utm_source: '',
    utm_medium: '',
    utm_campaign: '',
    utm_content: '',
  });
  const [groupId, setGroupId] = useState<string>('');
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [shortening, setShortening] = useState(false);

  const url = useMemo(() => buildUrl(state), [state]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function applyPreset(source: string, medium: string) {
    setState((s) => ({ ...s, utm_source: source, utm_medium: medium }));
  }

  function copy() {
    navigator.clipboard.writeText(url);
    toast.success('URL copied');
  }

  function reset() {
    setState((s) => ({ ...s, utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '' }));
    setShortUrl(null);
    setQrUrl(null);
    setGroupId('');
    toast.info('Cleared');
  }

  function persist() {
    if (!state.base_url || !state.utm_source) { toast.error('Base URL and Source required'); return; }
    save.mutate({
      base_url: state.base_url,
      utm_source: state.utm_source || null,
      utm_medium: state.utm_medium || null,
      utm_campaign: state.utm_campaign || null,
      utm_content: state.utm_content || null,
      full_url: url,
      short_url: shortUrl,
      group_id: groupId || null,
    });
  }

  async function shorten() {
    if (!state.base_url || !state.utm_source) { toast.error('Fill in the URL first'); return; }
    setShortening(true);
    try {
      const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`shortener ${res.status}`);
      const short = (await res.text()).trim();
      if (!/^https?:\/\//i.test(short)) throw new Error('bad response');
      setShortUrl(short);
      try { await navigator.clipboard.writeText(short); toast.success('Short URL copied'); }
      catch { toast.success('Shortened'); }
    } catch (e) {
      toast.error(`Shortener unavailable: ${String((e as Error).message || e)}`);
    } finally {
      setShortening(false);
    }
  }

  function showQr() {
    if (!state.base_url || !state.utm_source) { toast.error('Fill in the URL first'); return; }
    setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(url)}`);
  }

  const tabs: { key: TabKey; label: string; count: number | null }[] = [
    { key: 'generator', label: 'Generator', count: null },
    { key: 'history', label: 'History', count: links?.length ?? 0 },
    { key: 'groups', label: 'Link Groups', count: groups?.length ?? 0 },
    { key: 'bulk', label: 'Bulk', count: null },
  ];

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      <div className="flex items-center gap-3">
        <h1 className="text-[22px] font-black tracking-tight text-text">UTM Link Generator</h1>
        <span className="text-[12px] text-text-3 font-medium">Track every campaign, every channel</span>
      </div>

      <div className="inline-flex items-center gap-0.5 bg-surface border border-border rounded-xl p-1 shadow-sh1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'inline-flex items-center gap-2 h-9 px-4 rounded-lg text-[13px] transition-colors',
              tab === t.key ? 'bg-cg-900 text-white font-black' : 'text-text-2 font-semibold hover:bg-surface-2',
            )}
          >
            {t.label}
            {t.count != null && (
              <span className={cn(
                'tnum inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black',
                tab === t.key ? 'bg-white/20 text-white' : 'bg-surface-2 text-text-3',
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'generator' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 items-start">
          <div className="flex flex-col gap-4">
            <div className="bg-surface border border-border rounded-2xl p-5 shadow-sh1 space-y-3">
              <div className="text-[10px] font-black tracking-widest uppercase text-text-3 mb-1">Campaign details</div>
              <Field label="Base URL" value={state.base_url} onChange={(v) => set('base_url', v)} />
              <div className="grid grid-cols-2 gap-3">
                <CreatableSelect
                  label="Source"
                  value={state.utm_source}
                  options={sources}
                  onChange={(v) => set('utm_source', v)}
                  onCreate={async (v) => { await createSource.mutateAsync(v); }}
                  creating={createSource.isPending}
                  placeholder="Select or add a source…"
                />
                <CreatableSelect
                  label="Medium"
                  value={state.utm_medium}
                  options={mediums}
                  onChange={(v) => set('utm_medium', v)}
                  onCreate={async (v) => { await createMedium.mutateAsync(v); }}
                  creating={createMedium.isPending}
                  placeholder="Select or add a medium…"
                />
              </div>
              <div>
                <Field
                  label="Campaign name"
                  value={state.utm_campaign}
                  onChange={(v) => set('utm_campaign', v)}
                  placeholder="pick one from the CRM or type a new name"
                  list={campaigns?.map((c) => c.name)}
                />
                <div className="text-[11px] text-text-3 mt-1">
                  {campaigns?.length ?? 0} campaign{(campaigns?.length ?? 0) === 1 ? '' : 's'} already tracked in the CRM.
                </div>
              </div>
              <Field label="Content (optional)" value={state.utm_content} onChange={(v) => set('utm_content', v)} placeholder="e.g. post-v1 / ad-v1" />
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-3">Group (optional)</span>
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="mt-1 w-full h-9 px-3 border border-border-2 rounded-lg bg-surface-2 text-[13px] text-text outline-none focus:border-accent-strong"
                >
                  <option value="">No group</option>
                  {groups?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            </div>

            <div className="bg-surface border border-border rounded-2xl p-5 shadow-sh1">
              <div className="text-[10px] font-black tracking-widest uppercase text-text-3 mb-3">Quick presets</div>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p.source, p.medium)}
                    className="h-8 px-3.5 rounded-full border border-border bg-surface-2 text-[12px] font-semibold text-text-2 hover:bg-surface hover:border-border-2"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-surface border-2 border-border rounded-2xl p-5 shadow-sh1 space-y-1">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[10px] font-black tracking-widest uppercase text-text-3">Generated URL</span>
              <span className="tnum text-[11px] text-text-4 font-mono">{url.length} chars</span>
            </div>
            <div className="font-mono text-[12.5px] text-accent-ink bg-surface-2 border border-border rounded-lg p-3 break-all leading-relaxed">
              {url || '—'}
            </div>

            {(state.utm_source || state.utm_medium || state.utm_campaign || state.utm_content) && (
              <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-border">
                {state.utm_source && <TagChip k="source" v={state.utm_source} />}
                {state.utm_medium && <TagChip k="medium" v={state.utm_medium} />}
                {state.utm_campaign && <TagChip k="campaign" v={state.utm_campaign} />}
                {state.utm_content && <TagChip k="content" v={state.utm_content} />}
              </div>
            )}

            <div className="grid grid-cols-[2fr_1fr_1fr] gap-2 mt-3.5">
              <button onClick={copy} className="inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-accent text-cg-900 border border-accent-strong text-[13px] font-bold hover:bg-accent-strong">
                <Copy size={13} /> Copy URL
              </button>
              <button onClick={persist} disabled={save.isPending} className="inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-surface text-text-2 border border-border-2 text-[13px] font-semibold hover:bg-surface-2 disabled:opacity-50">
                <Save size={13} /> {save.isPending ? '…' : 'Save'}
              </button>
              <button onClick={reset} className="inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-surface text-text-2 border border-border-2 text-[13px] font-semibold hover:bg-surface-2">
                <RotateCcw size={13} /> Reset
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button onClick={shorten} disabled={shortening} className="inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-surface text-text-2 border border-border-2 text-[13px] font-semibold hover:bg-surface-2 disabled:opacity-50">
                <Link2 size={13} /> {shortening ? 'Shortening…' : 'Shorten URL'}
              </button>
              <button onClick={showQr} className="inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-surface text-text-2 border border-border-2 text-[13px] font-semibold hover:bg-surface-2">
                <QrCode size={13} /> Show QR Code
              </button>
            </div>

            {shortUrl && (
              <div className="mt-3 flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-3 py-2.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-text-3 flex-shrink-0">Short</span>
                <a href={shortUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-[12.5px] text-accent-ink flex-1 break-all hover:underline">{shortUrl}</a>
                <button
                  onClick={() => { navigator.clipboard.writeText(shortUrl); toast.success('Short URL copied'); }}
                  className="text-[11px] font-bold text-text-3 px-2 py-1 rounded-md bg-surface border border-border-2 hover:text-text flex-shrink-0"
                >
                  Copy
                </button>
              </div>
            )}

            {qrUrl && (
              <div className="mt-3 flex flex-col items-center gap-2 bg-surface-2 border border-border rounded-lg p-3.5">
                <img src={qrUrl} width={200} height={200} alt="QR code" className="rounded-md bg-white p-2" />
                <button onClick={() => setQrUrl(null)} className="text-[11.5px] font-bold text-text-3 px-2.5 py-1 rounded-md bg-surface border border-border-2 hover:text-text">
                  Hide QR
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'history' && <HistoryTab links={links} groups={groups} />}
      {tab === 'groups' && <GroupsTab groups={groups} links={links} />}
      {tab === 'bulk' && <BulkTab baseUrl={state.base_url} source={state.utm_source} medium={state.utm_medium} />}
    </div>
  );
}

function TagChip({ k, v }: { k: string; v: string }) {
  return (
    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border bg-surface-2">
      <span className="text-[9px] font-black uppercase tracking-wider text-text-3">{k}</span>
      <span className="text-[11px] font-bold text-accent-ink font-mono">{v}</span>
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

function HistoryTab({ links, groups }: { links: ReturnType<typeof useUtmLinks>['data']; groups: ReturnType<typeof useUtmLinkGroups>['data'] }) {
  const groupById = new Map((groups ?? []).map((g) => [g.id, g]));
  const rows = links ?? [];
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sh1">
      <div className="grid grid-cols-[2fr_1fr_1fr_1.4fr_130px_100px] gap-3 px-4 py-2.5 bg-surface-2 text-[10.5px] font-black uppercase tracking-wider text-text-3">
        <div>URL</div><div>Source</div><div>Medium</div><div>Campaign</div><div>Group</div><div className="text-right">Created</div>
      </div>
      {rows.length === 0 && <div className="p-14 text-center text-[13px] text-text-3">No links saved yet. Generate one and hit Save.</div>}
      {rows.map((l) => {
        const g = l.group_id ? groupById.get(l.group_id) : null;
        return (
          <div key={l.id} className="grid grid-cols-[2fr_1fr_1fr_1.4fr_130px_100px] gap-3 px-4 py-3 border-t border-border hover:bg-surface-2 items-center">
            <a href={l.full_url} target="_blank" rel="noopener noreferrer" className="text-accent-ink font-mono text-[12.5px] truncate hover:underline" title={l.full_url}>
              {l.full_url}
            </a>
            <div className="text-[12.5px] text-text-2 font-semibold">{l.utm_source || '—'}</div>
            <div className="text-[12.5px] text-text-2 font-semibold">{l.utm_medium || '—'}</div>
            <div className="text-[12.5px] text-text font-bold truncate">{l.utm_campaign || '—'}</div>
            {g ? (
              <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-text-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: g.color || '#6b7280' }} />
                {g.name}
              </div>
            ) : <span className="text-[12px] text-text-4">—</span>}
            <div className="tnum text-right text-[11.5px] text-text-3">{fmtDate(l.created_at)}</div>
          </div>
        );
      })}
    </div>
  );
}

function GroupsTab({ groups, links }: { groups: ReturnType<typeof useUtmLinkGroups>['data']; links: ReturnType<typeof useUtmLinks>['data'] }) {
  const createGroup = useCreateUtmLinkGroup();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6b7280');
  const rows = groups ?? [];

  function submit() {
    if (!name.trim()) return;
    createGroup.mutate({ name: name.trim(), color }, { onSuccess: () => { setCreating(false); setName(''); } });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => setCreating((v) => !v)}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-accent text-cg-900 border border-accent-strong text-[12.5px] font-bold hover:bg-accent-strong"
        >
          <Plus size={13} strokeWidth={2.5} /> New Group
        </button>
      </div>

      {creating && (
        <div className="bg-surface border border-border rounded-2xl p-4 shadow-sh1 flex items-center gap-2.5">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-9 h-9 rounded-lg border border-border cursor-pointer" />
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setCreating(false); }}
            placeholder="Group name…"
            className="flex-1 h-9 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong"
          />
          <button onClick={submit} disabled={!name.trim() || createGroup.isPending} className="h-9 px-4 rounded-lg bg-cg-900 text-white text-[12.5px] font-bold disabled:opacity-50">
            Create
          </button>
        </div>
      )}

      {rows.length === 0 && (
        <div className="bg-surface border border-border rounded-2xl p-14 text-center text-[13px] text-text-3 shadow-sh1">
          No link groups yet. Create one to bucket related links.
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((g) => {
          const count = (links ?? []).filter((l) => l.group_id === g.id).length;
          return (
            <div key={g.id} className="bg-surface border border-border rounded-xl p-4 shadow-sh1">
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: g.color || '#6b7280' }} />
                <span className="text-[14px] font-black text-text">{g.name}</span>
              </div>
              <div className="tnum text-[11.5px] text-text-3 font-semibold">{count} link{count === 1 ? '' : 's'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BulkTab({ baseUrl, source, medium }: { baseUrl: string; source: string; medium: string }) {
  const [input, setInput] = useState('');
  const [urls, setUrls] = useState<string[] | null>(null);

  function generate() {
    const raw = input.trim();
    if (!raw) { setUrls(null); return; }
    const base = baseUrl || '';
    const src = source ? `&utm_source=${encodeURIComponent(source)}` : '';
    const med = medium ? `&utm_medium=${encodeURIComponent(medium)}` : '';
    const lines = raw.split(/\n+/).map((x) => x.trim()).filter(Boolean);
    const sep = base.includes('?') ? '&' : '?';
    setUrls(lines.map((name) => `${base}${sep}utm_campaign=${encodeURIComponent(name)}${src}${med}`));
  }

  function copyAll() {
    if (!urls?.length) return;
    navigator.clipboard.writeText(urls.join('\n'));
    toast.success('Copied all URLs');
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 shadow-sh1">
      <div className="text-[14px] font-black tracking-tight text-text mb-2">Bulk generate</div>
      <div className="text-[12px] text-text-3 mb-3 leading-relaxed">
        Paste one campaign or content variant per line. Uses the base URL, source, and medium from the Generator tab. Click Generate to build a URL per line — copy the full list at the end.
      </div>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={8}
        placeholder={'q3-launch-a\nq3-launch-b\npost-hero-v1\npost-hero-v2'}
        className="w-full p-3 border border-border-2 rounded-lg font-mono text-[12.5px] bg-surface-2 text-text outline-none resize-vertical leading-relaxed focus:border-accent-strong"
      />
      <div className="flex justify-end mt-2.5">
        <button onClick={generate} className="h-9 px-4.5 rounded-lg bg-accent text-cg-900 border border-accent-strong text-[13px] font-bold hover:bg-accent-strong">
          Generate
        </button>
      </div>

      {urls != null && (
        <div className="mt-3.5">
          {urls.length === 0 ? (
            <div className="p-3.5 border border-dashed border-border-2 rounded-lg text-text-3 text-[12px]">Add at least one line above.</div>
          ) : (
            <>
              <div className="text-[11px] tracking-wider uppercase text-text-3 font-black mb-2">{urls.length} URL{urls.length === 1 ? '' : 's'}</div>
              <div className="space-y-1.5">
                {urls.map((u, i) => (
                  <div key={i} className="p-2 px-2.5 bg-surface-2 border border-border rounded-md font-mono text-[12px] text-accent-ink break-all">{u}</div>
                ))}
              </div>
              <button onClick={copyAll} className="mt-2 h-8 px-3.5 rounded-lg bg-surface text-text-2 border border-border-2 text-[12.5px] font-bold hover:bg-surface-2">
                Copy all
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
