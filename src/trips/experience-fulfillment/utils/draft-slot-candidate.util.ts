/**
 * Trip Draft LLM slots → ExperienceCandidate 校验（Round 3）
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

export function validateDraftLlmSlotsAsCandidates(
  parsed: { days?: unknown[] },
  candidatePlaces: CandidatePlace[],
  dto: CreateTripDraftDto,
  dayDates: Array<{ day: number; date: string }>,
): DraftSlotValidationResult {
  const errors: string[] = [];
  const candidates: ExperienceCandidate[] = [];
  const byId = new Map(candidatePlaces.map((c) => [c.id, c]));
  const userDigest = compileExperienceIntent({
    message: [dto.style, dto.intensity, dto.destination].filter(Boolean).join(' '),
  });

  const days = Array.isArray(parsed.days) ? parsed.days : [];
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
  };
}
