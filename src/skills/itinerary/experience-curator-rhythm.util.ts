/**
 * ④ 高潮-余韵节奏控制（Rhythm / Waveform）
 */

import { DateTime } from 'luxon';
import type { ItineraryItem } from '../../agent/interfaces/trip-plan.interface';
import type { ExperiencePreferences, PacingStrategy } from './experience-curator.types';
import { poiSensoryEnergy } from './experience-poi-taxonomy.util';

const ZONE = 'Atlantic/Reykjavik';

function intensity(item: ItineraryItem): number {
  const e = poiSensoryEnergy(item.location_ref.name, item.notes);
  const dur = item.metadata?.duration_minutes ?? 90;
  return dur * (e === 'high' ? 1.5 : e === 'low' ? 0.7 : 1);
}

function parseStart(item: ItineraryItem, dateIso: string): DateTime {
  const sw = item.start_window;
  if (/^\d{2}:\d{2}$/.test(sw)) return DateTime.fromISO(`${dateIso}T${sw}`, { zone: ZONE });
  return DateTime.fromISO(sw, { zone: ZONE });
}

function idealClimaxIndex(count: number, strategy: PacingStrategy): number {
  if (count <= 1) return 0;
  if (strategy === 'cinematic_climax') return Math.min(count - 1, Math.round(count * 0.55));
  if (strategy === 'slow_burn') return Math.min(count - 1, Math.round(count * 0.72));
  return Math.min(count - 1, Math.round(count * 0.5));
}

export function applyRhythmWaveform(params: {
  items: ItineraryItem[];
  dateIso: string;
  prefs: ExperiencePreferences;
}): { items: ItineraryItem[]; notes_zh: string[] } {
  const notes_zh: string[] = [];
  const items = params.items.map((it) => ({ ...it }));
  const pois = items.filter((it) => it.type === 'POI');
  if (pois.length < 2) return { items, notes_zh };

  const sorted = [...pois].sort((a, b) => intensity(b) - intensity(a));
  const climaxPoi = sorted[0];
  const climaxIdx = pois.findIndex((p) => p.id === climaxPoi.id);
  const idealIdx = idealClimaxIndex(pois.length, params.prefs.pacingStrategy);

  if (climaxIdx !== idealIdx && pois.length >= 3) {
    const target = pois[idealIdx];
    const ci = items.findIndex((it) => it.id === climaxPoi.id);
    const ti = items.findIndex((it) => it.id === target.id);
    if (ci >= 0 && ti >= 0) {
      const cStart = items[ci].start_window;
      const cEnd = items[ci].end_window;
      items[ci].start_window = items[ti].start_window;
      items[ci].end_window = items[ti].end_window;
      items[ti].start_window = cStart;
      items[ti].end_window = cEnd;
      notes_zh.push(
        `高潮-余韵：将「${climaxPoi.location_ref.name}」置于${params.prefs.pacingStrategy === 'cinematic_climax' ? '午后电影感高潮位' : '日中段高潮位'}，早晚保留舒缓铺垫与余韵。`,
      );
    }
  }

  const morningPois = pois.filter((p) => parseStart(p, params.dateIso).hour < 11);
  if (morningPois.length >= 2 && params.prefs.pacingStrategy !== 'cinematic_climax') {
    notes_zh.push('节奏波形：早晨舒缓启程，避免首日即高强度震撼开场。');
  }

  const hasEveningRest = items.some(
    (it) =>
      (it.type === 'REST' || it.type === 'MEAL' || it.type === 'ACCOMMODATION') &&
      parseStart(it, params.dateIso).hour >= 17,
  );
  if (!hasEveningRest && intensity(climaxPoi) > 120) {
    notes_zh.push('余韵填补：高潮景点后建议极简私密晚餐/酒店休整，不被打扰地收束当日情绪。');
  }

  return { items, notes_zh };
}
