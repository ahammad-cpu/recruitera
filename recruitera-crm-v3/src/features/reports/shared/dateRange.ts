export type DateRangeKey = '7d' | '30d' | '90d' | 'qtd' | 'ytd' | 'all' | 'custom';
export type DateRange = { startISO: string; endISO: string; label: string };

const DAY = 86_400_000;
function iso(d: Date) { return d.toISOString().slice(0, 10); }

export function resolveDateRange(
  key: DateRangeKey,
  now: Date,
  customFrom?: string,
  customTo?: string,
): DateRange {
  const endISO = iso(now);
  if (key === 'custom') {
    const from = customFrom || iso(new Date(now.getTime() - 29 * DAY));
    const to = customTo || endISO;
    return {
      startISO: from,
      endISO: to,
      label: from === iso(new Date(now.getTime() - 29 * DAY)) && to === endISO
        ? 'Last 30 days'
        : `${from} → ${to}`,
    };
  }
  if (key === '7d')  return { startISO: iso(new Date(now.getTime() - 6 * DAY)),  endISO, label: 'Last 7 days'  };
  if (key === '30d') return { startISO: iso(new Date(now.getTime() - 29 * DAY)), endISO, label: 'Last 30 days' };
  if (key === '90d') return { startISO: iso(new Date(now.getTime() - 89 * DAY)), endISO, label: 'Last 90 days' };
  // All time — anchor the start well before any real record (Bubble data
  // begins ~2024). Nothing predates this, so every lead is included.
  if (key === 'all') return { startISO: '2000-01-01', endISO, label: 'All time' };
  if (key === 'qtd') {
    const q = Math.floor(now.getUTCMonth() / 3);
    const start = new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1));
    return { startISO: iso(start), endISO, label: `Q${q + 1} ${now.getUTCFullYear()} to date` };
  }
  const yStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  return { startISO: iso(yStart), endISO, label: `${now.getUTCFullYear()} to date` };
}
