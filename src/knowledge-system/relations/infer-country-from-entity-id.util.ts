/**
 * Infer ISO-3166 alpha-2 from canonical entity ids (CPRE `is.gullfoss`, `segment:is:f208`).
 * Does not assume a default country.
 */

export function inferCountryFromEntityId(id: string): string | undefined {
  const t = id.trim();
  if (!t) return undefined;
  const dotted = /^([a-z]{2})\./i.exec(t);
  if (dotted) return dotted[1]!.toUpperCase();
  const colon = /^(?:segment|road|weather-region|hazard|place):([a-z]{2}):/i.exec(t);
  if (colon) {
    const cc = colon[1]!.toLowerCase();
    if (cc === 'db') return undefined; // place:db:{numericId} is not a country
    return cc.toUpperCase();
  }
  return undefined;
}
