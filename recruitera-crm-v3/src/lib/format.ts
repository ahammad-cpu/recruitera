export const FX_TO_EGP: Record<string, number> = { EGP: 1, USD: 49.43, EUR: 53.0, SAR: 13.15 };

export function toEgp(value: number | null | undefined, currency?: string | null) {
  const n = Number(value) || 0;
  if (!n) return 0;
  const rate = FX_TO_EGP[(currency || 'EGP').toUpperCase()] || 1;
  return n * rate;
}

export const fmtInt = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n || 0));
export const fmtEgp = (n: number) => `EGP ${fmtInt(n)}`;
export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
export const initials = (s?: string | null) => {
  if (!s) return '?';
  const parts = s.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
};
