/**
 * Canonical Table Key Normalizer (Shared Utility)
 * Standardizes table identifiers across CafeFlow (e.g., "Table 12", "T-12", " 12 " -> "12").
 */
export const canonicalTableKey = (t: string | number | undefined | null): string => {
  if (t === undefined || t === null) return '';
  return String(t).trim().toLowerCase().replace(/^(table|t)[-\s]*/i, '');
};
