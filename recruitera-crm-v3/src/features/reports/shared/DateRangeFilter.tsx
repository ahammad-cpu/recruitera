import { cn } from '@/lib/cn';
import type { DateRangeKey } from './dateRange';

const OPTIONS: { key: DateRangeKey; label: string }[] = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: 'qtd', label: 'QTD' },
  { key: 'ytd', label: 'YTD' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
];

export function DateRangeFilter({
  value, customFrom, customTo, onChange,
}: {
  value: DateRangeKey;
  customFrom?: string;
  customTo?: string;
  onChange: (key: DateRangeKey, from?: string, to?: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex gap-0.5 bg-surface-2 border border-border rounded-md p-0.5">
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            onClick={() => onChange(o.key, customFrom, customTo)}
            className={cn(
              'px-2.5 py-1 rounded text-[12px] font-semibold',
              value === o.key ? 'bg-surface text-text shadow-sh1' : 'text-text-3',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {value === 'custom' && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={customFrom ?? ''}
            onChange={(e) => onChange('custom', e.target.value, customTo)}
            className="h-8 px-2 border border-border-2 rounded-md bg-surface text-[12px] outline-none"
          />
          <span className="text-text-3 text-[11px]">→</span>
          <input
            type="date"
            value={customTo ?? ''}
            onChange={(e) => onChange('custom', customFrom, e.target.value)}
            className="h-8 px-2 border border-border-2 rounded-md bg-surface text-[12px] outline-none"
          />
        </div>
      )}
    </div>
  );
}
