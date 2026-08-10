/**
 * Resolve a nearby-poi search origin when itinerary items lack placeId
 * (common for free-text stops like「凯夫拉维克机场」).
 */

export type NearbyOrigin = { lat: number; lng: number; source: string };

/** Well-known Iceland self-drive anchors (label → coords). */
export const ICELAND_NEARBY_LABEL_ANCHORS: Array<{
  pattern: RegExp;
  lat: number;
  lng: number;
  label: string;
}> = [
  { pattern: /keflav[ií]k|凯夫拉维克|\bkef\b|keflavíkurflugvöllur/i, lat: 63.985, lng: -22.605, label: 'KEF' },
  { pattern: /reykjav[ií]k|雷克雅未克/i, lat: 64.1466, lng: -21.9426, label: 'Reykjavik' },
  { pattern: /selfoss|塞尔福斯/i, lat: 63.941, lng: -20.988, label: 'Selfoss' },
  { pattern: /v[ií]k\b|维克(?!多)/i, lat: 63.419, lng: -19.006, label: 'Vik' },
  { pattern: /akureyri|阿克雷里/i, lat: 65.6885, lng: -18.1262, label: 'Akureyri' },
  { pattern: /egilssta[dð]ir|埃伊尔斯塔济/i, lat: 65.2609, lng: -14.3948, label: 'Egilsstadir' },
  { pattern: /h[uú]sav[ií]k|胡萨维克/i, lat: 66.0449, lng: -17.3389, label: 'Husavik' },
  { pattern: /blue\s*lagoon|蓝湖/i, lat: 63.8804, lng: -22.4495, label: 'Blue Lagoon' },
];

export function resolveCoordsFromLabel(text: string | null | undefined): NearbyOrigin | null {
  const label = String(text ?? '').trim();
  if (!label) return null;
  for (const a of ICELAND_NEARBY_LABEL_ANCHORS) {
    if (a.pattern.test(label)) {
      return { lat: a.lat, lng: a.lng, source: `label:${a.label}` };
    }
  }
  return null;
}

export function pickBestPlaceNameMatch<T extends { nameCN: string; nameEN: string | null; category: string }>(
  note: string,
  candidates: T[],
): T | null {
  if (!candidates.length) return null;
  const q = note.trim().toLowerCase();
  const ranked = candidates
    .map((c) => {
      const hay = `${c.nameCN} ${c.nameEN ?? ''}`.toLowerCase();
      let score = 0;
      if (hay.includes(q) || q.includes(hay.slice(0, Math.min(hay.length, q.length)))) score += 30;
      if (c.category === 'TRANSIT_HUB') score += 25;
      if (c.category === 'ATTRACTION') score += 10;
      if (c.nameCN === note || c.nameEN === note) score += 40;
      // Prefer shorter names (airport over "Hotel near Keflavik…")
      score += Math.max(0, 20 - Math.floor((c.nameCN?.length ?? 40) / 4));
      return { c, score };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score >= 25 ? ranked[0].c : null;
}
