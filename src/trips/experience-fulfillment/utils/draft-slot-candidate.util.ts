/**
 * Trip Draft LLM slots → ExperienceCandidate 校验（Round 3）
 *
 * LLM 偶发会选出真实存在但不在本次候选池的 placeId（幻觉或跨池记忆）。
 * 硬失败会拖垮 HYBRID bootstrap；先就地修复再校验。
 */

import type { CreateTripDraftDto } from '../../dto/trip-draft.dto';
import type { CandidatePlace } from '../../services/candidate-retrieval.engine';
import type { ExperienceCandidate } from '../types/candidate-contract.types';
import { validateExperienceCandidate } from '../validators/contract.validators';
import { compileExperienceIntent } from '../services/experience-intent.compiler';

const SLOT_KEYS = ['morning', 'lunch', 'afternoon', 'dinner', 'evening'] as const;

export type DraftSlotValidationResult = {
  valid: boolean;
  errors: string[];
  candidates: ExperienceCandidate[];
  /** 池外 placeId 被替换 / deferred 的说明 */
  repairs: string[];
};

type SlotObj = {
  deferred?: boolean;
  placeId?: number;
  reason?: string;
  alternatives?: number[];
  confidence?: string;
  validationRequired?: boolean;
  riskTags?: string[];
};

function inferAtomsFromPlace(place: CandidatePlace): ExperienceCandidate['proposedExperienceAtoms'] {
  const blob = [
    place.nameCN,
    place.nameEN ?? '',
    place.category,
    place.type,
    ...(place.tags ?? []),
  ]
    .join(' ')
    .toLowerCase();

  const digest = compileExperienceIntent({ message: blob });
  if (!digest.experienceIntents.length) {
    return [{ atom: 'LOW_EFFORT_NATURE', expectedStrength: 0.5, priority: 'NORMAL' }];
  }
  return digest.experienceIntents.slice(0, 3).map((i) => ({
    atom: i.atom,
    expectedStrength: i.weight,
    priority: i.priority ?? 'NORMAL',
  }));
}

/**
 * 将池外 placeId 替换为 alternatives 中第一个在池内的 id；
 * 若无可替换则标记 deferred，避免硬失败。
 */
export function repairDraftLlmSlotsToCandidatePool(
  parsed: { days?: unknown[] },
  candidatePlaces: CandidatePlace[],
): { days: unknown[]; repairs: string[] } {
  const byId = new Map(candidatePlaces.map((c) => [c.id, c]));
  const repairs: string[] = [];
  const days = Array.isArray(parsed.days) ? parsed.days : [];

  const repairedDays = days.map((dayRow) => {
    if (!dayRow || typeof dayRow !== 'object') return dayRow;
    const dayNum = Number((dayRow as { day?: number }).day);
    const slotsIn = (dayRow as { slots?: Record<string, unknown> }).slots ?? {};
    const slotsOut: Record<string, unknown> = { ...slotsIn };

    for (const slotKey of SLOT_KEYS) {
      const raw = slotsOut[slotKey];
      if (!raw || typeof raw !== 'object') continue;
      const slot = { ...(raw as SlotObj) };
      if (slot.deferred) {
        slotsOut[slotKey] = slot;
        continue;
      }

      const placeId = Number(slot.placeId);
      if (!Number.isFinite(placeId)) {
        slotsOut[slotKey] = slot;
        continue;
      }
      if (byId.has(placeId)) {
        slotsOut[slotKey] = slot;
        continue;
      }

      const alts = Array.isArray(slot.alternatives)
        ? slot.alternatives.map(Number).filter((id) => Number.isFinite(id) && byId.has(id))
        : [];
      if (alts.length > 0) {
        const replacement = alts[0];
        repairs.push(
          `day ${dayNum} ${slotKey}: placeId ${placeId} ∉ pool → replaced with alternative ${replacement}`,
        );
        slot.placeId = replacement;
        slot.alternatives = alts.filter((id) => id !== replacement);
        slot.reason = `${slot.reason ?? ''}（已将池外景点 ${placeId} 替换为候选 ${replacement}）`.trim();
        slot.validationRequired = true;
        slotsOut[slotKey] = slot;
        continue;
      }

      repairs.push(
        `day ${dayNum} ${slotKey}: placeId ${placeId} ∉ pool → deferred (no in-pool alternative)`,
      );
      slot.deferred = true;
      delete slot.placeId;
      slot.reason = `${slot.reason ?? ''}（原选 ${placeId} 不在候选池，已留白待补全）`.trim();
      slot.confidence = slot.confidence ?? 'low';
      slot.validationRequired = true;
      slotsOut[slotKey] = slot;
    }

    return { ...(dayRow as object), slots: slotsOut };
  });

  return { days: repairedDays, repairs };
}

export function validateDraftLlmSlotsAsCandidates(
  parsed: { days?: unknown[] },
  candidatePlaces: CandidatePlace[],
  dto: CreateTripDraftDto,
  dayDates: Array<{ day: number; date: string }>,
  options?: { repairOutOfPool?: boolean },
): DraftSlotValidationResult {
  const repairOutOfPool = options?.repairOutOfPool !== false;
  let working = parsed;
  let repairs: string[] = [];
  if (repairOutOfPool) {
    const repaired = repairDraftLlmSlotsToCandidatePool(parsed, candidatePlaces);
    working = { days: repaired.days };
    repairs = repaired.repairs;
    // 写回调用方可变对象，便于后续编排使用修复后的 days
    if (Array.isArray(parsed.days)) {
      parsed.days.splice(0, parsed.days.length, ...repaired.days);
    }
  }

  const errors: string[] = [];
  const candidates: ExperienceCandidate[] = [];
  const byId = new Map(candidatePlaces.map((c) => [c.id, c]));
  const userDigest = compileExperienceIntent({
    message: [dto.style, dto.intensity, dto.destination].filter(Boolean).join(' '),
  });

  const days = Array.isArray(working.days) ? working.days : [];
  for (const dayRow of days) {
    if (!dayRow || typeof dayRow !== 'object') continue;
    const dayNum = Number((dayRow as { day?: number }).day);
    const dateMeta = dayDates.find((d) => d.day === dayNum);
    const slots = (dayRow as { slots?: Record<string, unknown> }).slots ?? {};

    for (const slotKey of SLOT_KEYS) {
      const slot = slots[slotKey];
      if (!slot || typeof slot !== 'object') continue;
      const deferred = (slot as { deferred?: boolean }).deferred;
      if (deferred) continue;

      const placeId = Number((slot as { placeId?: number }).placeId);
      if (!Number.isFinite(placeId)) {
        errors.push(`day ${dayNum} ${slotKey}: missing placeId`);
        continue;
      }

      const place = byId.get(placeId);
      if (!place) {
        errors.push(`day ${dayNum} ${slotKey}: placeId ${placeId} not in candidate pool`);
        continue;
      }

      const candidate: ExperienceCandidate = {
        candidateId: `draft-day${dayNum}-${slotKey}-${placeId}`,
        poiId: String(placeId),
        proposedExperienceAtoms: inferAtomsFromPlace(place),
        intendedParticipants: ['party'],
        proposedTimeWindow: {
          start: dateMeta?.date ? `${dateMeta.date}T09:00:00Z` : `day-${dayNum}-start`,
          end: dateMeta?.date ? `${dateMeta.date}T18:00:00Z` : `day-${dayNum}-end`,
        },
        expectedDwellMinutes: place.avgVisitDuration ?? 60,
        itineraryRole: userDigest.experienceIntents.some((i) => i.priority === 'MUST_PRESERVE')
          ? 'ANCHOR'
          : 'RECOMMENDED',
        rationale: String((slot as { reason?: string }).reason ?? place.nameCN),
        evidenceRefs: [`candidate-pool:${placeId}`],
      };

      const validation = validateExperienceCandidate(candidate);
      if (!validation.valid) {
        errors.push(...validation.errors.map((e) => `${candidate.candidateId}: ${e}`));
      }
      candidates.push(candidate);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    candidates,
    repairs,
  };
}
