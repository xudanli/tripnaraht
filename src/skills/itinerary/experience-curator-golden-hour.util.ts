/**
 * ① 黄金时刻锚定：SunCalc 真实日落 + POI「最佳日落机位」标签 + 极光 Kp 窗
 */

import { DateTime } from 'luxon';
import type { ItineraryItem } from '../../agent/interfaces/trip-plan.interface';
import type { ExperiencePreferences } from './experience-curator.types';
import type { ExperienceAuroraContext } from './experience-curator-aurora.util';
import { buildAuroraCurationNotes } from './experience-curator-aurora.util';
import {
  buildPoiViewpointIndex,
  pickBestSunsetAnchor,
} from './experience-curator-poi-viewpoint.util';
import {
  resolveExperienceSolarTimes,
  resolveSolarAnchorFromItems,
  type ExperienceSolarTimes,
} from './experience-curator-solar.util';

const ZONE = 'Atlantic/Reykjavik';

function parseItemStart(item: ItineraryItem, dateIso: string): DateTime {
  const sw = item.start_window;
  if (/^\d{2}:\d{2}$/.test(sw)) {
    return DateTime.fromISO(`${dateIso}T${sw}`, { zone: ZONE });
  }
  return DateTime.fromISO(sw, { zone: ZONE });
}

function shiftItemWindow(item: ItineraryItem, dateIso: string, deltaMinutes: number): void {
  const start = parseItemStart(item, dateIso).plus({ minutes: deltaMinutes });
  const end = DateTime.fromISO(item.end_window.includes('T') ? item.end_window : `${dateIso}T${item.end_window}`, {
    zone: ZONE,
  }).plus({ minutes: deltaMinutes });
  item.start_window = start.toISO() ?? item.start_window;
  item.end_window = end.toISO() ?? item.end_window;
}

export function applyGoldenHourAlignment(params: {
  items: ItineraryItem[];
  dateIso: string;
  prefs: ExperiencePreferences;
  researchData?: Record<string, unknown>;
  solarTimes?: ExperienceSolarTimes;
  auroraContext?: ExperienceAuroraContext;
}): { items: ItineraryItem[]; notes_zh: string[]; golden_hour_fit: number } {
  const notes_zh: string[] = [];
  const items = params.items.map((it) => ({ ...it }));
  if (!params.prefs.goldenHourAlignment.sunset && !params.prefs.goldenHourAlignment.sunrise) {
    return { items, notes_zh, golden_hour_fit: 70 };
  }

  const anchorCoords = resolveSolarAnchorFromItems(items);
  const solar =
    params.solarTimes ??
    resolveExperienceSolarTimes({
      dateIso: params.dateIso,
      lat: anchorCoords.lat,
      lng: anchorCoords.lng,
    });

  const poiIndex = buildPoiViewpointIndex(params.researchData);
  const pois = items.filter((it) => it.type === 'POI');

  if (params.prefs.goldenHourAlignment.sunset) {
    const anchorPick = pickBestSunsetAnchor(pois, poiIndex);
    if (anchorPick && anchorPick.score > 0) {
      const anchor = anchorPick.item;
      const anchorStart = parseItemStart(anchor, params.dateIso);
      const targetArrival = solar.goldenHourStart;
      const delta = Math.round(targetArrival.diff(anchorStart, 'minutes').minutes);
      const clamped = Math.max(-45, Math.min(45, delta));

      const tagHint =
        anchorPick.source === 'poi_tag' && anchorPick.tagLabel
          ? `（POI 标签：${anchorPick.tagLabel}）`
          : '';

      if (Math.abs(clamped) >= 5) {
        const idx = items.findIndex((it) => it.id === anchor.id);
        if (idx >= 0) shiftItemWindow(items[idx], params.dateIso, clamped);
        notes_zh.push(
          `黄金时刻锚定${tagHint}：将「${anchor.location_ref.name}」微调 ${clamped > 0 ? '+' : ''}${clamped} 分钟，` +
            `对齐 SunCalc 日落 ${solar.sunset.toFormat('HH:mm')}（黄金时刻自 ${solar.goldenHourStart.toFormat('HH:mm')} 起）。`,
        );
        for (const poi of pois) {
          if (poi.id !== anchor.id) {
            const pidx = items.findIndex((it) => it.id === poi.id);
            if (pidx >= 0 && Math.abs(clamped) > 10) {
              shiftItemWindow(items[pidx], params.dateIso, Math.round(clamped * -0.35));
            }
          }
        }
      } else {
        notes_zh.push(
          `黄金时刻锚定${tagHint}：「${anchor.location_ref.name}」已接近 SunCalc 最佳日落窗（${solar.sunset.toFormat('HH:mm')}）。`,
        );
      }
    } else if (params.prefs.goldenHourAlignment.sunset) {
      notes_zh.push(
        `黄金时刻：当日日落约 ${solar.sunset.toFormat('HH:mm')}（SunCalc @ ${solar.lat.toFixed(2)}, ${solar.lng.toFixed(2)}），暂无可锚定的日落机位 POI。`,
      );
    }
  }

  if (params.prefs.goldenHourAlignment.sunrise && pois.length > 0) {
    const morningTarget = solar.goldenHourEnd;
    const morningPoi = pois[0];
    const morningStart = parseItemStart(morningPoi, params.dateIso);
    const delta = Math.round(morningTarget.diff(morningStart, 'minutes').minutes);
    const clamped = Math.max(-30, Math.min(30, delta));
    if (Math.abs(clamped) >= 8) {
      const idx = items.findIndex((it) => it.id === morningPoi.id);
      if (idx >= 0) shiftItemWindow(items[idx], params.dateIso, clamped);
      notes_zh.push(
        `日出黄金时刻：将「${morningPoi.location_ref.name}」微调 ${clamped > 0 ? '+' : ''}${clamped} 分钟，对齐日出 ${solar.sunrise.toFormat('HH:mm')}。`,
      );
    }
  }

  let fit = 72;
  const anchorPick = pickBestSunsetAnchor(pois, poiIndex);
  if (params.prefs.goldenHourAlignment.sunset) {
    if (anchorPick?.source === 'poi_tag') fit = 92;
    else if (anchorPick && anchorPick.score > 0) fit = 86;
    else fit = 58;
  }

  if (params.prefs.goldenHourAlignment.auroraOrMilkyWay) {
    if (params.auroraContext) {
      notes_zh.push(...buildAuroraCurationNotes(params.auroraContext));
      if (params.auroraContext.opportunity.observationTier === 'HIGH' ||
          params.auroraContext.opportunity.observationTier === 'EXCEPTIONAL') {
        fit = Math.min(98, fit + 6);
      }
    } else {
      notes_zh.push('极光/银河观测窗：尚未获取 Kp 实时数据，建议出发前再确认磁活动与云图。');
    }
  }

  return { items, notes_zh, golden_hour_fit: fit };
}
