/**
 * Experience Intent Compiler — 规则表 MVP（PRD §8.1 + §9.2）
 * 生产路径可替换为 LLM；输出与 TripIntent 编译器并列使用。
 */

import { listMvpExperienceAtoms } from '../config/mvp-experience-atoms.config';
import type { ExperienceAtomCode } from '../types/experience-atom.types';
import type {
  ExperienceIntentAtom,
  ExperienceIntentDigest,
  NegativePreference,
  TravelUnderstandingCard,
} from '../types/experience-intent.types';
import type { TripContextSchema } from '../types/trip-context.types';

export interface ExperienceIntentCompileInput {
  message?: string;
  tripContext?: Partial<TripContextSchema>;
  /** 快捷体验标签（PRD §9.1） */
  quickTags?: readonly string[];
}

const QUICK_TAG_ATOM_MAP: Record<string, ExperienceAtomCode[]> = {
  世界尽头: ['REMOTE_WORLD_EDGE', 'WILD_COAST_SOLITUDE'],
  放松治愈: ['HEALING_HOT_SPRING', 'SLOW_TRAVEL_RELAXATION'],
  电影感摄影: ['CINEMATIC_PHOTOGRAPHY'],
  户外挑战: ['GLACIER_ADVENTURE', 'EPIC_WATERFALL'],
  亲子: ['LOW_EFFORT_NATURE'],
  带父母: ['LOW_EFFORT_NATURE', 'SLOW_TRAVEL_RELAXATION'],
  小众: ['REMOTE_WORLD_EDGE', 'WILD_COAST_SOLITUDE'],
  美食: [],
  少走路: ['LOW_EFFORT_NATURE'],
  自驾: [],
};

function normalizeText(text: string): string {
  return text.toLowerCase();
}

function matchAtomsFromText(text: string): Map<ExperienceAtomCode, { weight: number; priority?: ExperienceIntentAtom['priority'] }> {
  const normalized = normalizeText(text);
  const hits = new Map<ExperienceAtomCode, { weight: number; priority?: ExperienceIntentAtom['priority'] }>();

  for (const atom of listMvpExperienceAtoms()) {
    let score = 0;
    for (const expr of atom.userExpressions) {
      if (normalized.includes(normalizeText(expr))) {
        score = Math.max(score, 0.75);
      }
    }
    if (score > 0) {
      hits.set(atom.code, { weight: score });
    }
  }

  // 强化关键词
  if (normalized.includes('冰川') || normalized.includes('glacier')) {
    hits.set('GLACIER_ADVENTURE', { weight: 0.9, priority: 'MUST_PRESERVE' });
  }
  if (normalized.includes('世界尽头') || normalized.includes('world edge')) {
    hits.set('REMOTE_WORLD_EDGE', { weight: 0.9, priority: 'HIGH' });
  }
  if (
    normalized.includes('父母') ||
    normalized.includes('老人') ||
    normalized.includes('elderly') ||
    normalized.includes('走太久') ||
    normalized.includes('不能走')
  ) {
    hits.set('LOW_EFFORT_NATURE', { weight: 0.85 });
    hits.set('SLOW_TRAVEL_RELAXATION', { weight: 0.8 });
  }
  if (
    normalized.includes('不要太赶') ||
    normalized.includes('轻松') ||
    normalized.includes('松弛') ||
    normalized.includes('not rushed')
  ) {
    hits.set('SLOW_TRAVEL_RELAXATION', { weight: 0.85 });
  }

  return hits;
}

function inferNegativePreferences(text: string, tripContext?: Partial<TripContextSchema>): NegativePreference[] {
  const normalized = normalizeText(text);
  const prefs: NegativePreference[] = [];

  if (normalized.includes('不要太赶') || normalized.includes('少开车')) {
    prefs.push({ type: 'LONG_DRIVE', weight: 0.7 });
  }
  if (normalized.includes('小众') || normalized.includes('人少')) {
    prefs.push({ type: 'HIGH_CROWD', weight: 0.7 });
  }
  const hasElderly =
    normalized.includes('父母') ||
    normalized.includes('老人') ||
    tripContext?.members?.some((m) => m.mobilityLimited);
  if (hasElderly) {
    prefs.push({ type: 'HIGH_PHYSICAL_EFFORT', weight: 0.8 });
  }

  return prefs;
}

export function compileExperienceIntent(input: ExperienceIntentCompileInput): ExperienceIntentDigest {
  const textParts: string[] = [];
  if (input.message) textParts.push(input.message);
  if (input.quickTags?.length) {
    for (const tag of input.quickTags) {
      textParts.push(tag);
      const mapped = QUICK_TAG_ATOM_MAP[tag];
      if (mapped) {
        for (const code of mapped) {
          textParts.push(code);
        }
      }
    }
  }
  const blob = textParts.join(' ');
  const atomHits = matchAtomsFromText(blob);

  const experienceIntents: ExperienceIntentAtom[] = Array.from(atomHits.entries()).map(
    ([atom, meta]) => ({
      atom,
      weight: meta.weight,
      ...(meta.priority ? { priority: meta.priority } : {}),
      ...(atom === 'LOW_EFFORT_NATURE' &&
      (blob.includes('父母') || blob.includes('老人'))
        ? { participants: ['father', 'mother'] }
        : {}),
    }),
  );

  if (!experienceIntents.length) {
    experienceIntents.push({
      atom: 'SLOW_TRAVEL_RELAXATION',
      weight: 0.5,
      priority: 'NORMAL',
    });
  }

  const negativePreferences = inferNegativePreferences(blob, input.tripContext);

  const matchCount = experienceIntents.filter((i) => i.weight >= 0.7).length;
  const confidence = Math.min(0.95, 0.45 + matchCount * 0.12);

  return {
    revision: 'v1',
    experienceIntents,
    negativePreferences,
    confidence,
    source: 'rule',
  };
}

export function buildTravelUnderstandingCard(
  input: ExperienceIntentCompileInput,
): TravelUnderstandingCard {
  const experienceIntent = compileExperienceIntent(input);
  const text = input.message ?? '';
  const days = input.tripContext?.tripDays;

  const travelGoals: string[] = [];
  if (experienceIntent.experienceIntents.some((i) => i.atom === 'REMOTE_WORLD_EDGE')) {
    travelGoals.push('希望拍摄具有世界尽头感的照片');
  }
  if (experienceIntent.experienceIntents.some((i) => i.atom === 'GLACIER_ADVENTURE')) {
    travelGoals.push('希望完成一次冰川徒步');
  }
  if (experienceIntent.experienceIntents.some((i) => i.atom === 'CINEMATIC_PHOTOGRAPHY')) {
    travelGoals.push('追求电影感摄影画面');
  }
  if (!travelGoals.length) {
    travelGoals.push('体验冰岛自然景观');
  }

  const memberConditions: string[] = [];
  if (text.includes('父母') || text.includes('老人')) {
    memberConditions.push('父母步行能力有限');
    memberConditions.push('需要低强度替代活动');
    memberConditions.push('用户可能接受部分成员分流');
  }

  const coreConstraints: string[] = [];
  if (days) coreConstraints.push(`${days}天行程`);
  if (input.tripContext?.maxDailyDriveMinutes) {
    coreConstraints.push(`每日驾驶不超过 ${Math.round(input.tripContext.maxDailyDriveMinutes / 60)} 小时`);
  }
  const mustPreserve = experienceIntent.experienceIntents.filter(
    (i) => i.priority === 'MUST_PRESERVE',
  );
  for (const m of mustPreserve) {
    coreConstraints.push(`必须保留：${m.atom}`);
  }

  const systemAssumptions: string[] = ['假设用户可以自驾'];
  const vehicle = input.tripContext?.vehicle?.accessClass;
  if (vehicle === '2WD') {
    systemAssumptions.push('使用 2WD 车型');
  } else if (!vehicle) {
    systemAssumptions.push('车型尚未确认（默认按 2WD 保守核验）');
  }
  systemAssumptions.push('住宿以舒适型为主');

  return {
    revision: 'v1',
    travelGoals,
    memberConditions,
    coreConstraints,
    systemAssumptions,
    experienceIntent,
  };
}
