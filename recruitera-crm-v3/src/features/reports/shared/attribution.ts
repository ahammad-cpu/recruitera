export function resolveChannel(
  account: { source: string | null; company_ref: string | null },
  mtByRef: Map<string, { first_source: string | null }>,
): string {
  const ref = account.company_ref;
  if (ref) {
    const row = mtByRef.get(ref);
    if (row?.first_source) return row.first_source;
  }
  return account.source || '(unknown)';
}
