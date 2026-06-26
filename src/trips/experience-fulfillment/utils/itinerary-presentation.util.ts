/**
 * Draft 日程 → PRD §13.3 用户展示层
 */

import type { DraftDay, DraftItineraryItem } from '../../dto/trip-draft.dto';
import type { CandidatePlace } from '../../services/candidate-retrieval.engine';
import { getExperienceAtom } from '../config/mvp-experience-atoms.config';
import type { ExperienceExplanationCard } from '../types/experience-explanation.types';
import { USER_CERTAINTY_LABELS } from '../types/experience-explanation.types';
import type { TravelUnderstandingCard } from '../types/experience-intent.types';
import type {
  CredibleFacts,
  InspirationLayer,
  ItemPresentationBadge,
  ItineraryPresentationBundle,
  LoadLevel,
  PresentedItineraryDay,
  PresentedItineraryItem,
} from '../types/itinerary-presentation.types';

const POETIC_TEMPLATES: Record<string, string[]> = {
  ATTRACTION: ['值得放慢脚步去感受', '把这一站放进今天的记忆里', '风景会在恰当的时刻展开'],
  RESTAURANT: ['用一顿好饭犒劳今天的脚步', '在地风味，也是旅行的一部分', '适合坐下来聊聊今天看到了什么'],
  SHOPPING: ['留一点时间给意外的小惊喜', '逛逛当地，带走一点故事', '轻松收尾，不必赶场'],
  DEFAULT: ['今天行程里的一站', '按节奏推进，不必匆忙', '为今天添一点期待'],
};

const SLOT_LABEL: Record<string, string> = {
  morning: '上午',
  lunch: '午餐',
  afternoon: '下午',
  dinner: '晚餐',
  evening: '晚间',
};

function loadFromScore(score: number): LoadLevel {
  if (score >= 0.75) return 'heavy';
  if (score >= 0.45) return 'moderate';
  return 'light';
}

function formatDistance(meters: number | undefined): string | undefined {
  if (meters == null || meters <= 0) return undefined;
  if (meters < 1000) return `约 ${Math.round(meters)} 米`;
  return `约 ${(meters / 1000).toFixed(1)} 公里`;
}

function formatDuration(minutes: number | undefined): string | undefined {
  if (minutes == null || minutes <= 0) return undefined;
  if (minutes < 60) return `建议停留约 ${minutes} 分钟`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `建议停留约 ${h} 小时 ${m} 分钟` : `建议停留约 ${h} 小时`;
}

function pickPoeticLine(category: string, tags: string[] | undefined): string {
  const key = category?.toUpperCase() || 'DEFAULT';
  const pool = POETIC_TEMPLATES[key] ?? POETIC_TEMPLATES.DEFAULT;
  if (tags?.some((t) => /冰川|瀑布|火山|沙滩|峡湾/i.test(t))) {
    return '自然尺度会提醒你，旅行不必赶时间';
  }
  if (tags?.some((t) => /博物馆|教堂|文化/i.test(t))) {
    return '人文细节往往藏在慢下来的片刻';
  }
  return pool[Math.abs(category.length) % pool.length];
}

function buildExperienceTags(
  candidate: CandidatePlace | undefined,
  understanding?: TravelUnderstandingCard,
): string[] {
  const tags: string[] = [];
  if (candidate?.tags?.length) {
    tags.push(...candidate.tags.slice(0, 2));
  }
  if (understanding?.experienceIntent.experienceIntents.length) {
    for (const intent of understanding.experienceIntent.experienceIntents.slice(0, 2)) {
      const atom = getExperienceAtom(intent.atom);
      if (atom?.displayNameZh) tags.push(atom.displayNameZh);
    }
  }
  return [...new Set(tags)].slice(0, 4);
}

function buildBadges(
  item: DraftItineraryItem,
  candidate: CandidatePlace | undefined,
  understanding?: TravelUnderstandingCard,
  hasElderly?: boolean,
): ItemPresentationBadge[] {
  const badges: ItemPresentationBadge[] = [];
  const riskTags = item.evidence?.riskTags ?? [];
  const draftConfidence = item.evidence?.draftConfidence;

  if (draftConfidence === 'high' && !item.evidence?.validationRequired) {
    badges.push('VERIFIED');
  } else if (draftConfidence === 'medium') {
    badges.push('VERIFIED');
  }

  if (riskTags.some((t) => /weather/i.test(t))) badges.push('WEATHER_SENSITIVE');
  if (hasElderly || riskTags.some((t) => /low_physical|fatigue/i.test(t))) {
    badges.push('LOW_PHYSICAL');
  }
  if (item.alternatives?.length) badges.push('HAS_ALTERNATIVE');

  const mustAtoms = understanding?.experienceIntent.experienceIntents.filter(
    (i) => i.priority === 'MUST_PRESERVE',
  );
  if (mustAtoms?.length && candidate?.tags?.length) {
    const hit = mustAtoms.some((intent) => {
      const atom = getExperienceAtom(intent.atom);
      return atom?.positiveSignals?.some((sig) =>
        candidate.tags!.some((t) => t.includes(sig) || sig.includes(t)),
      );
    });
    if (hit) badges.push('CORE_EXPERIENCE');
  }

  return badges;
}

function buildCredibleFacts(
  item: DraftItineraryItem,
  candidate: CandidatePlace | undefined,
  transport?: string,
  hasElderly?: boolean,
): CredibleFacts {
  const riskTags = item.evidence?.riskTags ?? [];
  const credible: CredibleFacts = {};

  const distance = formatDistance(item.evidence?.distance);
  if (distance) {
    if ((transport || '').toLowerCase() === 'walk') {
      credible.walkHint = `步行 ${distance}`;
    } else {
      credible.driveHint = `车程 ${distance}`;
    }
  }

  if (riskTags.some((t) => /long_drive/i.test(t))) {
    credible.driveHint = credible.driveHint ?? '当日驾驶距离偏长，建议预留缓冲';
  }

  if (hasElderly) {
    credible.walkHint = credible.walkHint ?? '已倾向低体力、短步行安排';
  }

  if ((transport || '').toLowerCase() === 'car') {
    credible.vehicleHint = '自驾出行，请留意道路与车型要求';
  }

  if (riskTags.some((t) => /weather/i.test(t))) {
    credible.weatherHint = '天气可能影响体验，出发前建议再确认';
  }

  if (item.evidence?.openingHours) {
    credible.openingHours = item.evidence.openingHours;
  }

  const visit = formatDuration(candidate?.avgVisitDuration);
  if (visit) credible.visitDuration = visit;

  return credible;
}

function buildInspiration(
  candidate: CandidatePlace | undefined,
  understanding?: TravelUnderstandingCard,
): InspirationLayer {
  const name = candidate?.nameCN ?? '行程站点';
  return {
    placeName: name,
    poeticLine: pickPoeticLine(candidate?.category ?? '', candidate?.tags),
    experienceTags: buildExperienceTags(candidate, understanding),
  };
}

function collectDayItems(day: DraftDay): DraftItineraryItem[] {
  const slots = day.slots ?? {};
  const ordered: DraftItineraryItem[] = [];
  for (const key of ['morning', 'lunch', 'afternoon', 'dinner', 'evening']) {
    const item = (slots as Record<string, DraftItineraryItem | undefined>)[key];
    if (item) ordered.push(item);
  }
  return ordered;
}

function estimateDayLoads(
  items: DraftItineraryItem[],
  candidatesById: Map<number, CandidatePlace>,
  transport?: string,
): { driveLoad: LoadLevel; walkLoad: LoadLevel } {
  let driveScore = 0;
  let walkScore = 0;
  let count = 0;

  for (const item of items) {
    count += 1;
    const c = candidatesById.get(item.placeId);
    const intensity = c?.intensityFactor ?? 1;
    const riskTags = item.evidence?.riskTags ?? [];
    if (riskTags.some((t) => /long_drive/i.test(t))) driveScore += 0.35;
    if (item.evidence?.distance) {
      const km = item.evidence.distance / 1000;
      if ((transport || '').toLowerCase() === 'walk') walkScore += Math.min(km / 8, 0.4);
      else driveScore += Math.min(km / 120, 0.35);
    }
    walkScore += Math.min(intensity * 0.12, 0.25);
  }

  if (!count) return { driveLoad: 'light', walkLoad: 'light' };
  return {
    driveLoad: loadFromScore(driveScore / count),
    walkLoad: loadFromScore(walkScore / count),
  };
}

function buildDayTheme(items: DraftItineraryItem[], candidatesById: Map<number, CandidatePlace>): string {
  const names = items
    .map((i) => candidatesById.get(i.placeId)?.nameCN)
    .filter(Boolean)
    .slice(0, 2);
  if (names.length >= 2) return `${names[0]}与${names[1]}`;
  if (names.length === 1) return `${names[0]}为主`;
  return '按节奏推进的一天';
}

function buildCoreExperience(
  items: DraftItineraryItem[],
  candidatesById: Map<number, CandidatePlace>,
  understanding?: TravelUnderstandingCard,
): string {
  const must = understanding?.experienceIntent.experienceIntents.find(
    (i) => i.priority === 'MUST_PRESERVE',
  );
  if (must) {
    const atom = getExperienceAtom(must.atom);
    if (atom?.displayNameZh) return `核心体验：${atom.displayNameZh}`;
  }
  const anchor = items.find((i) => candidatesById.get(i.placeId)?.poiPlanningAdmissionProtected);
  if (anchor) {
    return `核心体验：${candidatesById.get(anchor.placeId)?.nameCN ?? '重点站点'}`;
  }
  const first = items[0];
  if (first) {
    return `核心体验：${candidatesById.get(first.placeId)?.nameCN ?? '今日主行程'}`;
  }
  return '核心体验：按既定节奏推进';
}

export function buildItineraryPresentationBundle(input: {
  draftDays: DraftDay[];
  candidates: CandidatePlace[];
  understanding?: TravelUnderstandingCard;
  explanation?: ExperienceExplanationCard;
  transport?: string;
  hasElderly?: boolean;
  budgetPerDay?: number;
  currency?: string;
}): ItineraryPresentationBundle {
  const candidatesById = new Map(input.candidates.map((c) => [c.id, c]));
  const explanation = input.explanation;
  const dayCertainty = explanation?.overallLevel ?? 'UNCERTAIN';
  const dayLabel = explanation?.overallLabelZh ?? USER_CERTAINTY_LABELS[dayCertainty];
  const daySummary =
    explanation?.overallSummary ?? '路线已做基础核验，细节可能随天气与道路调整';

  const days: PresentedItineraryDay[] = input.draftDays.map((day) => {
    const items = collectDayItems(day);
    const { driveLoad, walkLoad } = estimateDayLoads(items, candidatesById, input.transport);

    const presentedItems: PresentedItineraryItem[] = items.map((item) => {
      const candidate = candidatesById.get(item.placeId);
      return {
        placeId: item.placeId,
        slot: SLOT_LABEL[item.slot] ?? item.slot,
        startTime: item.startTime,
        endTime: item.endTime,
        badges: buildBadges(item, candidate, input.understanding, input.hasElderly),
        inspiration: buildInspiration(candidate, input.understanding),
        credible: buildCredibleFacts(item, candidate, input.transport, input.hasElderly),
        certaintyLabel: explanation?.dimensions.routeFeasibility.labelZh,
      };
    });

    let budgetHint: string | undefined;
    if (input.budgetPerDay != null && input.budgetPerDay > 0) {
      const cur = input.currency ?? 'CNY';
      budgetHint = `当日预算参考约 ${input.budgetPerDay} ${cur}`;
    }

    return {
      day: day.day,
      date: day.date,
      theme: buildDayTheme(items, candidatesById),
      driveLoad,
      walkLoad,
      budgetHint,
      coreExperience: buildCoreExperience(items, candidatesById, input.understanding),
      certaintyLevel: dayCertainty,
      certaintyLabel: dayLabel,
      certaintySummary: daySummary,
      items: presentedItems,
    };
  });

  return {
    revision: 'v1',
    days,
    overallCertaintyLevel: dayCertainty,
    overallCertaintyLabel: dayLabel,
    overallSummary: daySummary,
  };
}
