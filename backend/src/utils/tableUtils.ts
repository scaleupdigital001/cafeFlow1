/**
 * Canonical Table Key Normalizer
 * Standardizes table identifiers across CafeFlow (e.g., "Table 12", "T-12", " 12 " -> "12").
 * Guarantees consistent string keys for database queries, session lookups, and unique indexes.
 */
export const canonicalTableKey = (t: string | number | undefined | null): string => {
  if (t === undefined || t === null) return '';
  return String(t).trim().toLowerCase().replace(/^(table|t)[-\s]*/i, '');
};
