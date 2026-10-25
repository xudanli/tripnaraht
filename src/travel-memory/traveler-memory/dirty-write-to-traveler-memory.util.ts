/**
 * Standing Preference / PreferenceLearning / DNA → Traveler Memory 写入草稿。
 */

import type { WriteTravelerMemoryRequestV1 } from './traveler-memory-contract.types';
import type { TravelerMemoryEvidenceSource } from './traveler-memory-contract.types';

function slugKey(raw: string, max = 48): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max) || 'note';
}

export type StandingPreferenceBridgeInput = {
  userId: string;
  bullets: string[];
  structured?: {
    hotel_style?: string;
    hotel_avoid?: string[];
    dining_preferences?: string;
    transport_preferences?: string;
    general?: string;
  };
  /** 用户明确说「记住/以后都要」→ EXPLICIT+confirm；否则 BEHAVIORAL */
  strongExplicit: boolean;
  conversationId?: string;
  turnId?: string;
};

export function buildStandingPreferenceTravelerWrites(
  input: StandingPreferenceBridgeInput,
): WriteTravelerMemoryRequestV1[] {
  const source: TravelerMemoryEvidenceSource[] = input.strongExplicit
    ? ['EXPLICIT']
    : ['BEHAVIORAL'];
  const explicitConfirm = input.strongExplicit;
  const conf = explicitConfirm ? 0.9 : 0.55;
  const out: WriteTravelerMemoryRequestV1[] = [];
  const sh = input.structured;

  if (sh?.hotel_style?.trim()) {
    out.push({
      subject_id: input.userId,
      domain: 'STAY',
      semantic_type: 'PREFERENCE',
      key: 'hotel_style',
      value: sh.hotel_style.trim(),
      source,
      explicitConfirm,
      confidence: conf,
      conversationId: input.conversationId,
      turnId: input.turnId,
      evidence_refs: [
        { type: 'USER_EXPLICIT', id: `standing:hotel_style:${input.userId}` },
      ],
    });
  }
  if (sh?.hotel_avoid?.length) {
    out.push({
      subject_id: input.userId,
      domain: 'STAY',
      semantic_type: 'AVOIDANCE',
      key: 'hotel_avoid',
      value: [...sh.hotel_avoid],
      source,
      explicitConfirm,
      confidence: conf,
      conversationId: input.conversationId,
      turnId: input.turnId,
      evidence_refs: [
        { type: 'USER_EXPLICIT', id: `standing:hotel_avoid:${input.userId}` },
      ],
    });
  }
  if (sh?.dining_preferences?.trim()) {
    out.push({
      subject_id: input.userId,
      domain: 'FOOD',
      semantic_type: 'PREFERENCE',
      key: 'dining_preferences',
      value: sh.dining_preferences.trim(),
      source,
      explicitConfirm,
      confidence: conf,
      conversationId: input.conversationId,
      turnId: input.turnId,
      evidence_refs: [
        { type: 'USER_EXPLICIT', id: `standing:dining:${input.userId}` },
      ],
    });
  }
  if (sh?.transport_preferences?.trim()) {
    out.push({
      subject_id: input.userId,
      domain: 'MOBILITY',
      semantic_type: 'PREFERENCE',
      key: 'transport_preferences',
      value: sh.transport_preferences.trim(),
      source,
      explicitConfirm,
      confidence: conf,
      conversationId: input.conversationId,
      turnId: input.turnId,
      evidence_refs: [
        { type: 'USER_EXPLICIT', id: `standing:transport:${input.userId}` },
      ],
    });
  }
  if (sh?.general?.trim()) {
    out.push({
      subject_id: input.userId,
      domain: 'EXPERIENCE',
      semantic_type: 'PREFERENCE',
      key: 'general_note',
      value: sh.general.trim(),
      source,
      explicitConfirm,
      confidence: conf,
      conversationId: input.conversationId,
      turnId: input.turnId,
    });
  }

  for (const b of input.bullets) {
    const line = b.trim();
    if (!line) continue;
    out.push({
      subject_id: input.userId,
      domain: 'EXPERIENCE',
      semantic_type: 'PREFERENCE',
      key: `standing_${slugKey(line)}`,
      value: line,
      source,
      explicitConfirm,
      confidence: conf,
      conversationId: input.conversationId,
      turnId: input.turnId,
      evidence_refs: [
        { type: 'CHAT_TURN', id: input.turnId ?? input.conversationId ?? 'standing_bullet' },
      ],
    });
  }

  return out;
}

export type PreferenceLearningBridgeInput = {
  userId: string;
  pace?: 'relaxed' | 'moderate' | 'intensive';
  activities?: string[];
  budget?: number;
  action: string;
};

export function buildPreferenceLearningTravelerWrites(
  input: PreferenceLearningBridgeInput,
): WriteTravelerMemoryRequestV1[] {
  const out: WriteTravelerMemoryRequestV1[] = [];
  const source: TravelerMemoryEvidenceSource[] = ['BEHAVIORAL'];
  const conf =
    input.action === 'preference_stated'
      ? 0.7
      : input.action === 'trip_completed'
        ? 0.65
        : 0.5;

  if (input.pace) {
    const paceMap = {
      relaxed: 'SLOW',
      moderate: 'MODERATE',
      intensive: 'FAST',
    } as const;
    out.push({
      subject_id: input.userId,
      domain: 'PACE',
      semantic_type: 'PREFERENCE',
      key: 'pace',
      value: paceMap[input.pace],
      source,
      confidence: conf,
      evidence_refs: [
        { type: 'OUTCOME', id: `pref_learn:${input.action}:pace` },
      ],
    });
  }

  if (input.activities?.length) {
    out.push({
      subject_id: input.userId,
      domain: 'EXPERIENCE',
      semantic_type: 'PREFERENCE',
      key: 'activities',
      value: [...input.activities],
      source,
      confidence: conf,
      evidence_refs: [
        { type: 'OUTCOME', id: `pref_learn:${input.action}:activities` },
      ],
    });
  }

  if (typeof input.budget === 'number' && Number.isFinite(input.budget)) {
    out.push({
      subject_id: input.userId,
      domain: 'SPENDING',
      semantic_type: 'PREFERENCE',
      key: 'budget_range',
      value: input.budget,
      source,
      confidence: conf,
      evidence_refs: [
        { type: 'OUTCOME', id: `pref_learn:${input.action}:budget` },
      ],
    });
  }

  return out;
}

export type DnaTraitBridgeInput = {
  userId: string;
  costSensitivity?: 'LOW' | 'MEDIUM' | 'HIGH';
  timeSensitivity?: 'LOW' | 'MEDIUM' | 'HIGH';
  dominantAlternative?: string | null;
  reason?: string;
};

export function buildDnaTraitTravelerWrites(
  input: DnaTraitBridgeInput,
): WriteTravelerMemoryRequestV1[] {
  const out: WriteTravelerMemoryRequestV1[] = [];
  const source: TravelerMemoryEvidenceSource[] = ['EPISODIC'];
  if (input.costSensitivity) {
    out.push({
      subject_id: input.userId,
      domain: 'SPENDING',
      semantic_type: 'PREFERENCE',
      key: 'cost_sensitivity',
      value: input.costSensitivity,
      source,
      confidence: 0.55,
      evidence_refs: [
        {
          type: 'OUTCOME',
          id: `dna:cost:${input.reason ?? 'sync'}`,
        },
      ],
    });
  }
  if (input.timeSensitivity) {
    out.push({
      subject_id: input.userId,
      domain: 'DECISION_STYLE',
      semantic_type: 'TRADEOFF',
      key: 'time_sensitivity',
      value: input.timeSensitivity,
      source,
      confidence: 0.55,
      evidence_refs: [
        {
          type: 'OUTCOME',
          id: `dna:time:${input.reason ?? 'sync'}`,
        },
      ],
    });
  }
  if (input.dominantAlternative) {
    out.push({
      subject_id: input.userId,
      domain: 'DECISION_STYLE',
      semantic_type: 'HABIT',
      key: 'dominant_alternative',
      value: input.dominantAlternative,
      source,
      confidence: 0.5,
      evidence_refs: [
        {
          type: 'OUTCOME',
          id: `dna:alt:${input.dominantAlternative}`,
        },
      ],
    });
  }
  return out;
}
