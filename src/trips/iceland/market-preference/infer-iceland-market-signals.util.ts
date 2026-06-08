// src/trips/iceland/market-preference/infer-iceland-market-signals.util.ts

import type { IcelandMarketRoutingInput, IcelandMarketVehicleClass } from './iceland-market-preference.types';

const USA_LOCALE = /^en-US\b/i;
const UK_LOCALE = /^en-GB\b/i;

export function normalizeIsoCountry(code: string | undefined): string | undefined {
  if (!code) return undefined;
  const t = code.trim().toUpperCase();
  if (t === 'USA') return 'US';
  if (t.length >= 2 && t.length <= 3) return t;
  return undefined;
}

export function inferVehicleClassFromQuery(userQuery: string | undefined): IcelandMarketVehicleClass | undefined {
  const m = (userQuery ?? '').trim();
  if (!m) return undefined;
  if (/私家团|private\s+tour|包车带司机/i.test(m)) return 'private_guide';
  if (/豪华|奢华|luxury|retreat|米其林|精品酒店/i.test(m)) return 'luxury_suv';
  if (/\b4\s*[x×]\s*4\b|四驱|SUV|越野|f\s*路|f-road|\bf\s*\d{2,4}\b|高地|内陆/i.test(m)) return '4x4';
  if (/两驱|2wd|小车|经济型/i.test(m)) return '2wd';
  return undefined;
}

export function inferMonthFromStartDate(startDate: string | undefined): number | undefined {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return undefined;
  const month = parseInt(startDate.slice(5, 7), 10);
  return month >= 1 && month <= 12 ? month : undefined;
}

export function isIcelandPlanningContext(input: IcelandMarketRoutingInput): boolean {
  if (input.countryCode?.toUpperCase() === 'IS') return true;
  const q = (input.userQuery ?? '').trim();
  if (!q) return false;
  return /冰岛|\bIceland\b|雷克雅未克|Reykjavik|黄金圈|环岛|南岸|高地|极光/i.test(q);
}

export function localeMatchesPrefix(locale: string | undefined, prefixes: readonly string[]): number {
  if (!locale) return 0;
  const l = locale.trim().toLowerCase();
  for (const p of prefixes) {
    const pref = p.toLowerCase();
    if (l === pref || l.startsWith(`${pref}-`) || l.startsWith(pref)) return 1;
  }
  if (USA_LOCALE.test(locale)) {
    return prefixes.some((p) => p.toLowerCase() === 'en-us') ? 1 : 0;
  }
  if (UK_LOCALE.test(locale)) {
    return prefixes.some((p) => p.toLowerCase() === 'en-gb') ? 1 : 0;
  }
  return 0;
}

export function residencyMatchesSegment(
  residency: string | undefined,
  nationality: string | undefined,
  countries: readonly string[],
): number {
  const r = normalizeIsoCountry(residency);
  const n = normalizeIsoCountry(nationality);
  const set = new Set(countries.map((c) => c.toUpperCase()));
  if (r && set.has(r)) return 1;
  if (n && set.has(n)) return 0.85;
  return 0;
}
