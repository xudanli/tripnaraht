/**
 * Experience Outcome Graph — 行中反馈与规划期 intent 对齐（PRD §14）
 */

import type { ExperienceFulfillmentState } from '../types/experience-fulfillment-state.types';
import type { TravelUnderstandingCard } from '../types/experience-intent.types';
import type {
  ExperienceFulfillmentReview,
  ExperienceOutcomeRecord,
  ExperienceTagMatchOption,
} from '../types/experience-outcome.types';
import { EXPERIENCE_TAG_MATCH_OPTIONS } from '../types/experience-outcome.types';
import type { ExperienceAtomCode } from '../types/experience-atom.types';
import type { SubmitExperiencePulseInput } from '../../in-trip-execution/types/experience-loop.types';

export const TRIP_EXPERIENCE_OUTCOME_METADATA_KEY = 'experienceOutcomeGraph' as const;
export const TRIP_EXPERIENCE_FULFILLMENT_METADATA_KEY = 'experienceFulfillment' as const;
export const TRIP_EXPERIENCE_UNDERSTANDING_METADATA_KEY = 'experienceUnderstanding' as const;

export function extractPlannedAtomsFromTripMetadata(
  metadata: unknown,
): ExperienceAtomCode[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const m = metadata as Record<string, unknown>;
  const fulfillment = m[TRIP_EXPERIENCE_FULFILLMENT_METADATA_KEY] as ExperienceFulfillmentState | undefined;
  const understanding = m[TRIP_EXPERIENCE_UNDERSTANDING_METADATA_KEY] as TravelUnderstandingCard | undefined;
  const physical = m.physicalValidationLatest as { experienceFulfillment?: ExperienceFulfillmentState } | undefined;

  const intents =
    fulfillment?.experienceIntent?.experienceIntents ??
    physical?.experienceFulfillment?.experienceIntent?.experienceIntents ??
    understanding?.experienceIntent?.experienceIntents ??
    [];

  return intents.map((i) => i.atom);
}

export function mapTagToAtom(tag: ExperienceTagMatchOption): ExperienceAtomCode | undefined {
  const opt = EXPERIENCE_TAG_MATCH_OPTIONS.find((o) => o.value === tag);
  return opt?.mapsToAtom;
}

export function isTagAlignedWithPlannedAtoms(
  tag: ExperienceTagMatchOption | undefined,
  plannedAtoms: ExperienceAtomCode[],
): boolean {
  if (!tag || tag === 'NOT_AS_EXPECTED' || tag === 'GOOD_BUT_ORDINARY') return false;
  const mapped = mapTagToAtom(tag);
  if (mapped && plannedAtoms.includes(mapped)) return true;
  if (tag === 'EPIC_BUT_CROWDED' && plannedAtoms.includes('EPIC_WATERFALL')) return true;
  return false;
}

export function buildExperienceOutcomeRecord(params: {
  tripId: string;
  memberId: string;
  input: SubmitExperiencePulseInput;
  plannedAtoms: ExperienceAtomCode[];
}): ExperienceOutcomeRecord {
  const tag = params.input.experienceTagMatch;
  const matchedExpectedAtom = tag ? mapTagToAtom(tag) : undefined;
  const fulfillmentAligned = isTagAlignedWithPlannedAtoms(tag, params.plannedAtoms);

  return {
    id: `outcome-${Date.now()}`,
    tripId: params.tripId,
    memberId: params.memberId,
    recordedAt: new Date().toISOString(),
    activityName: params.input.activityName,
    triggerType: params.input.triggerType,
    experienceTagMatch: tag,
    expectationConfirmation: params.input.expectationConfirmation,
    emotionalValueScore: params.input.emotionalValueScore,
    matchedExpectedAtom,
    fulfillmentAligned,
    freeText: params.input.freeText,
  };
}

export function appendOutcomeToMetadata(
  metadata: unknown,
  record: ExperienceOutcomeRecord,
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  const prev = Array.isArray(base[TRIP_EXPERIENCE_OUTCOME_METADATA_KEY])
    ? (base[TRIP_EXPERIENCE_OUTCOME_METADATA_KEY] as ExperienceOutcomeRecord[])
    : [];
  base[TRIP_EXPERIENCE_OUTCOME_METADATA_KEY] = [...prev, record].slice(-200);
  return base;
}

export function buildExperienceFulfillmentReview(
  metadata: unknown,
): ExperienceFulfillmentReview | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const m = metadata as Record<string, unknown>;
  const outcomes = Array.isArray(m[TRIP_EXPERIENCE_OUTCOME_METADATA_KEY])
    ? (m[TRIP_EXPERIENCE_OUTCOME_METADATA_KEY] as ExperienceOutcomeRecord[])
    : [];
  if (!outcomes.length) return undefined;

  const plannedIntents = extractPlannedAtomsFromTripMetadata(metadata);
  const withTag = outcomes.filter((o) => o.experienceTagMatch);
  const alignedCount = outcomes.filter((o) => o.fulfillmentAligned).length;
  const tagCounts = new Map<ExperienceTagMatchOption, number>();
  for (const o of withTag) {
    if (!o.experienceTagMatch) continue;
    tagCounts.set(o.experienceTagMatch, (tagCounts.get(o.experienceTagMatch) ?? 0) + 1);
  }
  const topMatchedTags = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const alignmentRate =
    outcomes.length > 0 ? Math.round((alignedCount / outcomes.length) * 100) / 100 : 0;

  let summaryZh = `共收到 ${outcomes.length} 条体验反馈，${alignedCount} 条与规划预期一致。`;
  if (plannedIntents.length) {
    summaryZh += ` 规划期核心体验：${plannedIntents.slice(0, 3).join('、')}。`;
  }
  if (alignmentRate >= 0.7) {
    summaryZh += ' 整体兑现良好。';
  } else if (alignmentRate >= 0.4) {
    summaryZh += ' 部分体验与预期存在差距，可作为下次推荐校准依据。';
  } else {
    summaryZh += ' 体验与预期差距较大，建议回顾行程节奏与点位选择。';
  }

  return {
    plannedIntents,
    outcomeCount: outcomes.length,
    alignedCount,
    alignmentRate,
    topMatchedTags,
    summaryZh,
  };
}
