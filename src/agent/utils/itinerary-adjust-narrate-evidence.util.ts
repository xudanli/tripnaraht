/**
 * ITINERARY_ADJUST pacing：时空/地理/生理事实依据（理性物理 × 感性体验缝合层）
 */

import type { ItineraryAdjustScheduleItem } from './itinerary-adjust-optimization-summary.util';
import {
  classifyPoiExperienceCategory,
  type ExperiencePoiCategory,
} from '../../skills/itinerary/experience-poi-taxonomy.util';

export type PacingEvidenceRegionProfile =
  | 'myvatn_north_iceland'
  | 'generic_waterfall_hotspring';

export type ExperienceMetricValidationFacts = {
  route_efficiency: string;
  micro_climate_safety: string;
  physiological_pacing: string;
  crowd_dynamics?: string;
  thermal_sequence?: string;
};

export type ItineraryAdjustExperienceValidation = {
  reasoning_type: 'EXPERIENCE_METRIC_VALIDATION';
  region_profile: PacingEvidenceRegionProfile;
  evidence_facts: ExperienceMetricValidationFacts;
};

function normalizeHhmm(window?: string): number | undefined {
  const w = String(window ?? '').trim();
  const m = w.match(/T?(\d{2}):(\d{2})/);
  if (!m) return undefined;
  return Number.parseInt(m[1], 10) * 60 + Number.parseInt(m[2], 10);
}

function findPoiByCategory(
  items: ItineraryAdjustScheduleItem[] | undefined,
  cat: ExperiencePoiCategory,
): ItineraryAdjustScheduleItem | undefined {
  return items?.find(
    (it) =>
      it.type?.toUpperCase() !== 'REST' &&
      classifyPoiExperienceCategory(it.name ?? '') === cat,
  );
}

function isWaterfallBeforeHotspring(
  items: ItineraryAdjustScheduleItem[] | undefined,
): boolean {
  const wf = findPoiByCategory(items, 'waterfall');
  const hs = findPoiByCategory(items, 'hotspring_spa');
  if (!wf || !hs) return false;
  const wfStart = normalizeHhmm(wf.start_window);
  const hsStart = normalizeHhmm(hs.start_window);
  return wfStart != null && hsStart != null && wfStart < hsStart;
}

export function detectPacingEvidenceRegion(
  scheduleItems?: ItineraryAdjustScheduleItem[],
): PacingEvidenceRegionProfile | null {
  const names = (scheduleItems ?? []).map((it) => it.name ?? '').join(' ');
  const hasWf = /瀑布|foss|fall/i.test(names) || !!findPoiByCategory(scheduleItems, 'waterfall');
  const hasHs =
    /温泉|spa|蓝湖|blue lagoon/i.test(names) ||
    !!findPoiByCategory(scheduleItems, 'hotspring_spa');
  if (!hasWf || !hasHs) return null;
  if (/米湖|mývatn|myvatn|众神|goðafoss|godafoss/i.test(names)) {
    return 'myvatn_north_iceland';
  }
  return 'generic_waterfall_hotspring';
}

function buildMyvatnNorthIcelandFacts(params: {
  waterfallName: string;
  hotspringName: string;
}): ExperienceMetricValidationFacts {
  const { waterfallName, hotspringName } = params;
  return {
    route_efficiency:
      `${waterfallName}位于米湖以西约 40 公里，${hotspringName}在东侧山丘；` +
      `先完成西侧户外徒步，再向东约 40–45 分钟车程收尾温泉。` +
      `泡完后当日行程直接闭环，可回米湖酒店休息或进入车内放空转场，不再安排强风户外景点。`,
    micro_climate_safety:
      `6 月初冰岛北部早晚气温约 5–10°C，一号公路山区 09:00 前后易起晨雾、路面湿滑。` +
      `将户外启程延后至 11:00 左右，能见度与瀑布侧光更佳，降低清晨山区驾驶容错风险。`,
    physiological_pacing:
      `${waterfallName}为全开放徒步景点（约 30–45 分钟，冷风刺激）→ ` +
      `${hotspringName}（38–40°C 地热温泉，热疗愈）→ 泡完自然思睡闭环，` +
      `符合疲劳状态下自主神经从兴奋到恢复的节律。`,
    crowd_dynamics:
      `${waterfallName}在 11:00–14:00 为跟团大巴最密集时段；` +
      `上午 11:00 抵达或下午温泉错峰，可降低排队与被迫社交的心智成本。`,
    thermal_sequence:
      `若清晨先泡 ${hotspringName}（毛孔张开、全身发软）再进入 5–10°C 强风 ${waterfallName}，` +
      `热冷剧烈交替有感冒与体力透支风险；先冷后热是生理学上的正向能量补偿（Thermal Reward）。`,
  };
}

function buildGenericWaterfallHotspringFacts(params: {
  waterfallName: string;
  hotspringName: string;
}): ExperienceMetricValidationFacts {
  const { waterfallName, hotspringName } = params;
  return {
    route_efficiency:
      `先完成户外徒步型 ${waterfallName}，再以 ${hotspringName} 作为当日收尾，` +
      `避免泡完温泉后仍需在冷风户外二次转场。`,
    micro_climate_safety:
      `将清晨启程延后，避开山区公路晨雾与低温湿滑时段，户外能见度更稳定。`,
    physiological_pacing:
      `瀑布冷风消耗 → 温泉热疗愈 → 泡完闭环休息，符合「想轻松一点」的体力回收曲线。`,
    thermal_sequence:
      `先冷后热的感官顺序，避免清晨泡软后立刻承受户外冷风刺激。`,
  };
}

export function buildItineraryAdjustExperienceValidation(params: {
  scheduleItems?: ItineraryAdjustScheduleItem[];
}): ItineraryAdjustExperienceValidation | undefined {
  const region = detectPacingEvidenceRegion(params.scheduleItems);
  if (!region || !isWaterfallBeforeHotspring(params.scheduleItems)) return undefined;

  const waterfall = findPoiByCategory(params.scheduleItems, 'waterfall')!;
  const hotspring = findPoiByCategory(params.scheduleItems, 'hotspring_spa')!;
  const names = {
    waterfallName: waterfall.name,
    hotspringName: hotspring.name,
  };

  const evidence_facts =
    region === 'myvatn_north_iceland'
      ? buildMyvatnNorthIcelandFacts(names)
      : buildGenericWaterfallHotspringFacts(names);

  return {
    reasoning_type: 'EXPERIENCE_METRIC_VALIDATION',
    region_profile: region,
    evidence_facts,
  };
}

/** 将 evidence_facts 缝合为用户可见、可反驳性低的说明 bullets */
export function buildEvidenceBackedPacingBullets(
  validation: ItineraryAdjustExperienceValidation,
): string[] {
  const f = validation.evidence_facts;
  const wfHs =
    validation.region_profile === 'myvatn_north_iceland'
      ? [
          `热量顺序与生理成本：${f.thermal_sequence ?? f.physiological_pacing}`,
          `动线与转场闭环：${f.route_efficiency}`,
          `微气候与人群避峰：${f.micro_climate_safety} ${f.crowd_dynamics ?? ''}`.trim(),
        ]
      : [
          `生理节奏：${f.physiological_pacing}`,
          `动线收束：${f.route_efficiency}`,
          `出行安全：${f.micro_climate_safety}`,
        ];

  return wfHs.map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
}
