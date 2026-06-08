/**
 * 旅行体验评分：节奏弧线、多样性、摩擦、留白
 */

import type { Itinerary, ItineraryItem } from '../../agent/interfaces/trip-plan.interface';
import type { ExperienceFlowModel } from '../../trips/decision/models/experience-flow.model';
import type { ExperienceAlignInsight, ExperienceAlignScoreBreakdown } from './experience-align.types';
import {
  classifyPoiExperienceCategory,
  poiSensoryEnergy,
  type ExperiencePoiCategory,
} from './experience-poi-taxonomy.util';

export { classifyPoiExperienceCategory } from './experience-poi-taxonomy.util';

function intensityScore(item: ItineraryItem): number {
  const energy = poiSensoryEnergy(item.location_ref.name, item.notes);
  const duration = item.metadata?.duration_minutes ?? 90;
  const catWeight = energy === 'high' ? 1.4 : energy === 'low' ? 0.7 : 1.0;
  return duration * catWeight;
}

function scoreDiversity(categories: ExperiencePoiCategory[]): number {
  if (categories.length <= 1) return categories.length === 0 ? 50 : 40;
  const unique = new Set(categories).size;
  let consecutivePenalty = 0;
  for (let i = 1; i < categories.length; i++) {
    if (categories[i] === categories[i - 1] && categories[i] !== 'other') {
      consecutivePenalty += 12;
    }
  }
  const base = Math.min(100, (unique / categories.length) * 100 + unique * 8);
  return Math.max(0, Math.round(base - consecutivePenalty));
}

function scoreRhythmArc(items: ItineraryItem[], tempo: ExperienceFlowModel['tempo']): number {
  const pois = items.filter((it) => it.type === 'POI');
  if (pois.length === 0) return 60;

  const intensities = pois.map(intensityScore);
  const maxIdx = intensities.indexOf(Math.max(...intensities));
  const arcIdeal = tempo === 'EMPATHY_RECOVERY' ? 0.45 : 0.55;
  const arcPos = pois.length > 1 ? maxIdx / (pois.length - 1) : 0.5;
  const arcFit = 100 - Math.abs(arcPos - arcIdeal) * 120;

  const hasRest = items.some((it) => it.type === 'REST' || it.type === 'MEAL');
  const restBonus = hasRest ? 15 : tempo === 'EMPATHY_RECOVERY' ? -20 : -5;

  return Math.max(0, Math.min(100, Math.round(arcFit + restBonus)));
}

function scoreFriction(items: ItineraryItem[], flow: ExperienceFlowModel): number {
  const pois = items.filter((it) => it.type === 'POI');
  if (pois.length <= 2) return 85;
  const transitions = pois.length - 1;
  const capacity = flow.currentFrictionCapacity;
  const idealMax = 2 + capacity * 3;
  if (transitions <= idealMax) return 90;
  return Math.max(20, Math.round(90 - (transitions - idealMax) * 15));
}

function scoreRestQuality(items: ItineraryItem[], tempo: ExperienceFlowModel['tempo']): number {
  const rests = items.filter((it) => it.type === 'REST' || it.type === 'MEAL');
  if (rests.length === 0) return tempo === 'EMPATHY_RECOVERY' ? 25 : 55;
  if (rests.length >= 2) return 92;
  return 78;
}

export function scoreItineraryExperience(params: {
  items: ItineraryItem[];
  experienceFlow: ExperienceFlowModel;
}): { score: ExperienceAlignScoreBreakdown; insights: ExperienceAlignInsight[] } {
  const { items, experienceFlow } = params;
  const pois = items.filter((it) => it.type === 'POI');
  const categories = pois.map((p) => classifyPoiExperienceCategory(p.location_ref.name, p.notes));

  const rhythm_arc = scoreRhythmArc(items, experienceFlow.tempo);
  const diversity = scoreDiversity(categories);
  const friction_budget = scoreFriction(items, experienceFlow);
  const rest_quality = scoreRestQuality(items, experienceFlow.tempo);
  const overall = Math.round(
    rhythm_arc * 0.3 + diversity * 0.25 + friction_budget * 0.25 + rest_quality * 0.2,
  );

  const insights: ExperienceAlignInsight[] = [];

  if (diversity < 55) {
    insights.push({
      dimension: 'diversity',
      severity: 'suggestion',
      message_zh: '连续同类景观偏多，建议穿插小镇漫步、温泉或室内点，降低审美疲劳。',
    });
  }
  if (rest_quality < 60 && experienceFlow.tempo === 'EMPATHY_RECOVERY') {
    insights.push({
      dimension: 'rest_quality',
      severity: 'warning',
      message_zh: '恢复型节奏下休息留白不足，建议插入咖啡/午餐或明确休息空档。',
    });
  }
  if (friction_budget < 50) {
    insights.push({
      dimension: 'friction_budget',
      severity: 'suggestion',
      message_zh: '转场偏多，体验会被「赶路感」稀释，可考虑合并或删减次要景点。',
    });
  }
  if (rhythm_arc < 55) {
    insights.push({
      dimension: 'rhythm_arc',
      severity: 'suggestion',
      message_zh: '高潮活动时段与当日节奏弧线不匹配，建议将高强度活动放在日中、早晚留白。',
    });
  }

  return {
    score: { rhythm_arc, diversity, friction_budget, rest_quality, overall },
    insights,
  };
}
