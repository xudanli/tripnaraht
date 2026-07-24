/**
 * ITINERARY_ADJUST 草案用户话术：体验体感优先，禁止底层硬约束邀功式文案。
 */

import type { ItineraryAdjustScheduleItem } from './itinerary-adjust-optimization-summary.util';
import {
  buildEvidenceBackedPacingBullets,
  buildItineraryAdjustExperienceValidation,
  type ItineraryAdjustExperienceValidation,
} from './itinerary-adjust-narrate-evidence.util';
import {
  classifyPoiExperienceCategory,
  type ExperiencePoiCategory,
} from '../../skills/itinerary/experience-poi-taxonomy.util';

export type { ItineraryAdjustExperienceValidation } from './itinerary-adjust-narrate-evidence.util';
export { buildItineraryAdjustExperienceValidation } from './itinerary-adjust-narrate-evidence.util';

/** 禁止出现在用户可见解释中的系统级/硬约束话术 */
export const BANNED_DRAFT_REASONING_PATTERNS: RegExp[] = [
  /闭园|赶路|重复景点|去重|走廊|黄金圈|adaptive|引擎|数据|清洗|KPI|折返|绕路/i,
  /已去掉其它天/,
  /标准走廊|缓冲范围|锚点/,
  /互斥选项|开放时间提示不必理会/,
];

export function isItineraryAdjustPacingIntent(metadata: Record<string, unknown>): boolean {
  const trigger = metadata.adaptive_replan_trigger;
  if (trigger === 'pacing') return true;
  const msg = String(metadata.intake_user_message ?? '').trim();
  return /太累|好累|疲惫|轻松|别早起|不要太赶|慢节奏|放缓|休息|relax|tired|exhausted/i.test(
    msg,
  );
}

export function isBannedDraftReasoningLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  return BANNED_DRAFT_REASONING_PATTERNS.some((re) => re.test(t));
}

export function sanitizeExperienceCuratorNoteForUser(line: string): string | null {
  const t = line.trim();
  if (!t || isBannedDraftReasoningLine(t)) return null;
  return t
    .replace(/^黄金时刻：/, '观景节奏：')
    .replace(/^日出黄金时刻：/, '清晨观景：')
    .replace(/^感官交替：/, '感官节奏：')
    .replace(/^感官对立唤醒：/, '感官节奏：')
    .replace(/^高潮-余韵：/, '一日节奏：')
    .replace(/^节奏波形：/, '一日节奏：')
    .replace(/^余韵填补：/, '一日收尾：')
    .replace(/^冰火感官顺序：/, '冰火感官顺序：');
}

function normalizeHhmm(window?: string): number | undefined {
  const w = String(window ?? '').trim();
  const m = w.match(/T?(\d{2}):(\d{2})/);
  if (!m) return undefined;
  return Number.parseInt(m[1], 10) * 60 + Number.parseInt(m[2], 10);
}

function scheduleItemCategory(item: ItineraryAdjustScheduleItem): ExperiencePoiCategory {
  return classifyPoiExperienceCategory(item.name ?? '');
}

function findSchedulePoi(
  items: ItineraryAdjustScheduleItem[] | undefined,
  cat: ExperiencePoiCategory,
): ItineraryAdjustScheduleItem | undefined {
  return items?.find((it) => it.type?.toUpperCase() !== 'REST' && scheduleItemCategory(it) === cat);
}

function hasRestBuffer(items: ItineraryAdjustScheduleItem[] | undefined): boolean {
  return (
    items?.some((it) => it.type?.toUpperCase() === 'REST') ||
    items?.some((it) => /留白|休憩|休息空档/i.test(it.name ?? '')) ||
    false
  );
}

function firstActivityStartMinutes(items: ItineraryAdjustScheduleItem[] | undefined): number | undefined {
  const mins = (items ?? [])
    .filter((it) => it.type?.toUpperCase() !== 'REST' && it.name?.trim())
    .map((it) => normalizeHhmm(it.start_window))
    .filter((n): n is number => n != null);
  return mins.length ? Math.min(...mins) : undefined;
}

function lastActivityEndMinutes(items: ItineraryAdjustScheduleItem[] | undefined): number | undefined {
  const mins = (items ?? [])
    .filter((it) => it.type?.toUpperCase() !== 'REST' && it.name?.trim())
    .map((it) => normalizeHhmm(it.end_window))
    .filter((n): n is number => n != null);
  return mins.length ? Math.max(...mins) : undefined;
}

export function buildPacingExperienceThemeZh(
  scheduleItems?: ItineraryAdjustScheduleItem[],
): string | undefined {
  const names = (scheduleItems ?? []).map((it) => it.name ?? '').join(' ');
  if (/米湖|mývatn|myvatn/i.test(names) && /温泉|spa/i.test(names)) {
    return '环米湖松弛疗愈';
  }
  if (/温泉|spa|蓝湖/i.test(names)) return '疗愈松弛日';
  if (/瀑布|foss/i.test(names)) return '自然舒缓日';
  return undefined;
}

export function buildPacingExperienceNarrativeBullets(params: {
  metadata: Record<string, unknown>;
  targetDayNumber?: number;
  targetDateIso: string;
  scheduleItems?: ItineraryAdjustScheduleItem[];
  experienceValidation?: ItineraryAdjustExperienceValidation;
}): string[] {
  const { metadata, targetDayNumber, targetDateIso, scheduleItems } = params;
  const validation =
    params.experienceValidation ??
    buildItineraryAdjustExperienceValidation({ scheduleItems });
  if (validation) {
    const evidenceBullets = buildEvidenceBackedPacingBullets(validation);
    if (evidenceBullets.length >= 2) {
      return evidenceBullets.slice(0, 4);
    }
  }

  const dayLabel =
    targetDayNumber != null ? `第 ${targetDayNumber} 天` : targetDateIso.slice(0, 10);
  const bullets: string[] = [];

  const firstStart = firstActivityStartMinutes(scheduleItems);
  if (firstStart != null && firstStart >= 10 * 60 + 30) {
    bullets.push(
      `顺应身体的生理时钟：考虑到您希望整体更轻松，我们取消了早上的紧凑转场，留出充足的睡眠与慢节奏早餐时间。`,
    );
  } else {
    bullets.push(
      `顺应身体的生理时钟：按您「想轻松一点」的诉求，我们放缓了${dayLabel}的启程节奏，避免一早就被行程推着走。`,
    );
  }

  const waterfall = findSchedulePoi(scheduleItems, 'waterfall');
  const hotspring = findSchedulePoi(scheduleItems, 'hotspring_spa');
  if (waterfall && hotspring) {
    const wfStart = normalizeHhmm(waterfall.start_window);
    const hsStart = normalizeHhmm(hotspring.start_window);
    if (wfStart != null && hsStart != null && wfStart < hsStart) {
      bullets.push(
        `冰火感官的完美顺序：上午先前往「${waterfall.name}」，在人流较少、空气清冽时感受自然；` +
          `下午再进入「${hotspring.name}」，让身体在略带疲惫时泡进温水，作为一天的舒缓收尾，而不是清晨就泡软。`,
      );
    } else {
      bullets.push(
        `感官节奏：将「${waterfall.name}」与「${hotspring.name}」拉开时段，避免震撼景观与温泉疗愈紧挨着堆叠，减少体感过载。`,
      );
    }
  } else if (scheduleItems && scheduleItems.filter((it) => it.type?.toUpperCase() === 'POI').length <= 2) {
    bullets.push(`精简当日景点密度，把赶路时间换成真正可休息的空白。`);
  }

  if (hasRestBuffer(scheduleItems)) {
    bullets.push(
      `留白与私密边界：在景点之间保留了车内安静休憩时段，方便您和家人各自放空，不被连续转场打扰。`,
    );
  } else {
    const lastEnd = lastActivityEndMinutes(scheduleItems);
    if (lastEnd != null && lastEnd <= 16 * 60) {
      bullets.push(
        `留白与私密边界：下午较早收束户外行程，为您留出回酒店前不被安排填满的安静路段。`,
      );
    }
  }

  const curatorNotes = metadata.experience_curator_rationale_zh as string[] | undefined;
  if (Array.isArray(curatorNotes)) {
    for (const raw of curatorNotes.slice(0, 2)) {
      const clean = sanitizeExperienceCuratorNoteForUser(raw);
      if (clean && !bullets.some((b) => b.includes(clean.slice(0, 12)))) {
        bullets.push(clean);
      }
    }
  }

  return bullets.slice(0, 4);
}

/** 生成用户可见草案说明（体验策划脑优先） */
export function buildItineraryAdjustDraftNarrative(params: {
  metadata: Record<string, unknown>;
  targetDateIso: string;
  targetDayNumber?: number;
  scheduleItems?: ItineraryAdjustScheduleItem[];
}): string[] {
  if (isItineraryAdjustPacingIntent(params.metadata)) {
    return buildPacingExperienceNarrativeBullets(params);
  }

  const dayLabel =
    params.targetDayNumber != null
      ? `第 ${params.targetDayNumber} 天`
      : params.targetDateIso.slice(0, 10);
  const msg = String(params.metadata.intake_user_message ?? '').trim();
  const lead = msg
    ? `按您的改排要求，我们只调整了${dayLabel}，其它天不变。`
    : `我们只调整了${dayLabel}的安排，其它天不变。`;
  return [lead];
}
