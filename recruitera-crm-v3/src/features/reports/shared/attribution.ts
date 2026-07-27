// Canonical source map. The Bubble/Meta sync writes several spellings for
// the same channel — "Meta Ads" + "Meta Lead Ad" are both Meta paid,
// "LinkedIn" + "linkedin" differ only by case, etc. Reports group by the
// canonical name so one channel is one bar. Raw account.source is left
// untouched (audit trail); this only affects display/grouping.
//
// Key is the raw value lower-cased + trimmed. Add a row here to fold a new
// variant into an existing channel.
const CANONICAL_SOURCE: Record<string, string> = {
  // Meta / Facebook paid — general ads + lead-form ads count as one channel.
  'meta ads': 'Meta Ads',
  'meta lead ad': 'Meta Ads',
  'meta lead ads': 'Meta Ads',
  'meta': 'Meta Ads',
  'facebook': 'Meta Ads',
  'fb': 'Meta Ads',
  'instagram': 'Meta Ads',

  // LinkedIn — case variants.
  'linkedin': 'LinkedIn',

  // Direct / unknown.
  'direct': '(direct)',
  '(direct)': '(direct)',

  // Combined tags — order-independent, roll up to the acquisition channel.
  'demo,trial': 'Trial',
  'trial,demo': 'Trial',

  // Everything else keeps its own name (Trial, Demo, Wuzzuf, Forasna,
  // CFYE, Website, Hub Spot — Old Data, referrals, manual, etc.).
};

/** Fold a raw source string into its canonical channel name. */
export function canonicalSource(raw: string | null | undefined): string {
  const key = (raw ?? '').trim().toLowerCase();
  if (!key) return '(unknown)';
  return CANONICAL_SOURCE[key] ?? (raw as string).trim();
}

export function resolveChannel(
  account: { source: string | null; company_ref: string | null },
  mtByRef: Map<string, { first_source: string | null }>,
): string {
  const ref = account.company_ref;
  if (ref) {
    const row = mtByRef.get(ref);
    if (row?.first_source) return canonicalSource(row.first_source);
  }
  return canonicalSource(account.source);
}
