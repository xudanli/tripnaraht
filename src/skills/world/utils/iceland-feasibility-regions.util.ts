/**
 * Preset Iceland regions for segment-based feasibility (no polyline).
 * Coordinates align with daylight / wind / classifier skills.
 */

export const ICELAND_PRESET_REGION_COORDS: Record<string, { lat: number; lng: number }> = {
  reykjavik: { lat: 64.1466, lng: -21.9426 },
  akureyri: { lat: 65.6835, lng: -18.1123 },
  vik: { lat: 63.4186, lng: -19.0059 },
  hofn: { lat: 64.2539, lng: -15.2081 },
  egilsstadir: { lat: 65.2637, lng: -14.3944 },
  isafjordur: { lat: 66.0749, lng: -23.1339 },
  /** Southern Westfjords — Látrabjarg / Rauðasandur approach */
  patreksfjordur: { lat: 65.5953, lng: -23.9789 },
  /** Strandir / Steingrímsfjörður — Westfjords entry from Ring */
  holmavik: { lat: 65.7065, lng: -21.6876 },
  highlands_center: { lat: 64.75, lng: -18.0 },
  keflavik: { lat: 63.985, lng: -22.6056 },
};

const ALIASES: Record<string, string> = {
  rvk: 'reykjavik',
  reykjavík: 'reykjavik',
  capital: 'reykjavik',
  kef: 'keflavik',
  keflavík: 'keflavik',
  'selfoss': 'reykjavik',
  'golden_circle': 'reykjavik',
  'south_coast': 'vik',
  'jokulsarlon': 'hofn',
  'jökulsárlón': 'hofn',
  'seydisfjordur': 'egilsstadir',
  'seydisfjörður': 'egilsstadir',
  /** Human itinerary labels → preset keys (MCP / LLM friendly) */
  highlands: 'highlands_center',
  eastfjords: 'egilsstadir',
  east_fjords: 'egilsstadir',
  /** Westfjords → Ísafjörður 走廊锚点（长尾可再拆） */
  westfjords: 'isafjordur',
  west_fjords: 'isafjordur',
  'ísafjörður': 'isafjordur',
  patreksfjörður: 'patreksfjordur',
  latrabjarg: 'patreksfjordur',
  rauðasandur: 'patreksfjordur',
  hólmavík: 'holmavik',
  holmvik: 'holmavik',
  strandir: 'holmavik',
};

/** Heuristic km between preset regions (undirected). Missing → fall back per-segment default in caller. */
const PAIR_KM: Record<string, number> = {
  [pair('reykjavik', 'keflavik')]: 50,
  [pair('reykjavik', 'vik')]: 190,
  [pair('reykjavik', 'hofn')]: 380,
  /** Ring Road 走廊标量（实测级近似；与 storm RING_* 模板一致） */
  [pair('reykjavik', 'akureyri')]: 388,
  [pair('reykjavik', 'egilsstadir')]: 630,
  [pair('reykjavik', 'isafjordur')]: 450,
  [pair('vik', 'hofn')]: 272,
  [pair('hofn', 'egilsstadir')]: 187,
  [pair('egilsstadir', 'akureyri')]: 248,
  [pair('vik', 'highlands_center')]: 120,
  [pair('highlands_center', 'hofn')]: 210,
  [pair('highlands_center', 'akureyri')]: 180,
  /** Westfjords 走廊（启发式；可随实测迭代） */
  [pair('isafjordur', 'akureyri')]: 335,
  [pair('isafjordur', 'egilsstadir')]: 415,
  [pair('isafjordur', 'vik')]: 530,
  [pair('isafjordur', 'hofn')]: 485,
  [pair('isafjordur', 'keflavik')]: 455,
  [pair('isafjordur', 'patreksfjordur')]: 200,
  [pair('isafjordur', 'holmavik')]: 170,
  [pair('holmavik', 'keflavik')]: 235,
  [pair('holmavik', 'reykjavik')]: 225,
  [pair('holmavik', 'patreksfjordur')]: 280,
  [pair('patreksfjordur', 'vik')]: 330,
  [pair('patreksfjordur', 'keflavik')]: 395,
  [pair('patreksfjordur', 'reykjavik')]: 385,
  [pair('holmavik', 'akureyri')]: 310,
};

function pair(a: string, b: string): string {
  const x = a <= b ? a : b;
  const y = a <= b ? b : a;
  return `${x}|${y}`;
}

export function normalizeFeasibilityRegion(raw: string | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, '_');
  if (!s) return null;
  if (ALIASES[s]) return ALIASES[s];
  if (ICELAND_PRESET_REGION_COORDS[s]) return s;
  return null;
}

export function coordsForFeasibilityRegion(key: string | null): { lat: number; lng: number } | null {
  if (!key) return null;
  return ICELAND_PRESET_REGION_COORDS[key] ?? null;
}

/** Northernmost preset among keys — shorter winter civil driving window. */
export function northernmostPresetRegion(keys: string[]): string | null {
  let best: { key: string; lat: number } | null = null;
  for (const k of keys) {
    const c = ICELAND_PRESET_REGION_COORDS[k];
    if (!c) continue;
    if (!best || c.lat > best.lat) best = { key: k, lat: c.lat };
  }
  return best?.key ?? null;
}

export function heuristicDistanceKm(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  if (a === b) return 0;
  return PAIR_KM[pair(a, b)] ?? null;
}
