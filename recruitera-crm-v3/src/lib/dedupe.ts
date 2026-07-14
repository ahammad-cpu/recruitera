import type { Account } from '@/hooks/useAccounts';
import type { Contact } from '@/hooks/useAccountDetail';

/**
 * Junk detector — placeholder / dev rows that shouldn't clutter the CRM.
 * Same rules as /crm-v2: known bad names, 1-char, or blank.
 */
const JUNK_NAMES = new Set(['untitled', 'test', 'tests', 'asdf', 'none', 'n/a', 'na', '-', '.']);

export function isJunkAccount(a: Account): boolean {
  const n = String(a.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!n) return true;
  if (JUNK_NAMES.has(n)) return true;
  if (n.length <= 1) return true;
  return false;
}

// ---------- normalizers ----------
export const normName = (s: string | null | undefined) =>
  String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

export const normDomain = (s: string | null | undefined) =>
  String(s || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

export const normPhone = (s: string | null | undefined) => {
  const digits = String(s || '').replace(/\D+/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const emailDomain = (s: string | null | undefined) => {
  const m = String(s || '').toLowerCase().match(/@([^\s@]+)$/);
  return m ? m[1] : '';
};

// Free-mail providers don't identify a company — exclude them from the
// domain + email-domain indexes so accounts don't falsely collide.
const GENERIC_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'live.com', 'aol.com', 'mail.com', 'protonmail.com', 'yandex.com',
  'msn.com', 'me.com',
]);

export type DupeEntry = { reasons: Set<'name' | 'domain' | 'phone' | 'email'>; partners: Set<string> };

/**
 * Multi-key duplicate detector.
 * Returns a map from account.id → set of reasons it's a duplicate and set
 * of partner account ids that share at least one key.
 *
 * Runs in-memory — for ~500-1000 rows this is sub-millisecond, no DB call
 * needed. If the account book grows past ~5k we'd move to a Postgres
 * function that returns pre-computed dupe groups.
 */
export function buildDupeMap(rows: Account[], contactsByAcct: Map<string, Contact[]>): Map<string, DupeEntry> {
  const primaryContactOf = (a: Account): Contact | undefined => contactsByAcct.get(a.id)?.[0];
  const byKey: Record<'name' | 'domain' | 'phone' | 'email', Map<string, string[]>> = {
    name: new Map(), domain: new Map(), phone: new Map(), email: new Map(),
  };
  const push = (bucket: keyof typeof byKey, key: string, id: string) => {
    if (!key) return;
    if (!byKey[bucket].has(key)) byKey[bucket].set(key, []);
    byKey[bucket].get(key)!.push(id);
  };
  for (const a of rows) {
    const c = primaryContactOf(a);
    push('name', normName(a.name), a.id);
    const dom = normDomain(a.domain);
    if (dom && !GENERIC_DOMAINS.has(dom)) push('domain', dom, a.id);
    push('phone', normPhone(c?.phone), a.id);
    const ed = emailDomain(c?.email);
    if (ed && !GENERIC_DOMAINS.has(ed)) push('email', ed, a.id);
  }
  const out = new Map<string, DupeEntry>();
  for (const [bucket, m] of Object.entries(byKey) as Array<[keyof typeof byKey, Map<string, string[]>]>) {
    for (const ids of m.values()) {
      if (ids.length < 2) continue;
      for (const id of ids) {
        if (!out.has(id)) out.set(id, { reasons: new Set(), partners: new Set() });
        const entry = out.get(id)!;
        entry.reasons.add(bucket);
        for (const other of ids) if (other !== id) entry.partners.add(other);
      }
    }
  }
  return out;
}
