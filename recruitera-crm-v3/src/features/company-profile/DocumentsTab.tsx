import { ScrollText, Plus, Download, Trash2 } from 'lucide-react';
import { useAccountDocuments } from '@/hooks/useAccountDocuments';

export function DocumentsTab({ accountId }: { accountId: string }) {
  const { data, isLoading } = useAccountDocuments(accountId);
  const files = data ?? [];

  if (isLoading) {
    return (
      <div className="bg-surface border border-border rounded-2xl px-8 py-14 text-center text-[13px] text-text-3">
        Loading documents…
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-2xl px-8 py-14 shadow-sh1 text-center">
        <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border inline-grid place-items-center text-text-3 mb-3.5">
          <ScrollText size={20} />
        </div>
        <div className="text-[16px] font-extrabold tracking-tight mb-1.5">No documents yet</div>
        <div className="text-[13px] text-text-3 font-medium max-w-md mx-auto mb-4">
          Contracts, proposals, and supporting files uploaded here stay attached to this account.
        </div>
        <button className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-accent text-cg-900 text-[13px] font-bold border border-accent-strong hover:bg-accent-strong">
          <Plus size={13} /> Upload first document
        </button>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 shadow-sh1">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-text-3">
          Documents · {files.length}
        </div>
        <button className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-accent text-cg-900 text-[12px] font-bold border border-accent-strong hover:bg-accent-strong">
          <Plus size={12} /> Upload
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {files.map((f) => (
          <div
            key={f.id}
            className="grid grid-cols-[36px_1fr_auto_auto_24px] gap-3.5 items-center px-3.5 py-3 bg-surface-2 border border-border rounded-xl"
          >
            <div className="w-9 h-9 rounded-lg bg-surface border border-border flex items-center justify-center text-[18px]">
              {iconFor(f.mime_type)}
            </div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold text-text truncate">{f.file_name || f.label || '(unnamed)'}</div>
              <div className="text-[11px] text-text-3 font-semibold mt-0.5">{fmtDate(f.created_at)}</div>
            </div>
            <span className="tnum text-[11.5px] text-text-3 font-bold whitespace-nowrap">{fmtBytes(f.size_bytes)}</span>
            <button className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-border bg-surface text-text-2 text-[11.5px] font-bold hover:bg-surface-2">
              <Download size={11} /> Download
            </button>
            <button title="Archive" className="w-7 h-7 rounded-md text-text-3 hover:bg-bad-bg hover:text-bad flex items-center justify-center">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtBytes(n: number | null) {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function iconFor(mime: string | null) {
  const m = (mime || '').toLowerCase();
  if (m.includes('pdf')) return '📕';
  if (m.includes('image')) return '🖼';
  if (m.includes('spreadsheet') || m.includes('excel') || m.includes('csv')) return '📊';
  if (m.includes('word') || m.includes('document')) return '📝';
  if (m.includes('presentation') || m.includes('powerpoint')) return '📽';
  if (m.includes('zip') || m.includes('archive')) return '📦';
  return '📄';
}
