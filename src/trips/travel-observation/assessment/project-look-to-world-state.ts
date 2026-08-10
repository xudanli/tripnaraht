/**
 * Look → WorldStateAssertion (Observation Channel only).
 * NEVER uses predicate `road.status` / authoritative road SSOT.
 */

import type { EntityRef } from '../../guardian-decision-core/contracts/entity-ref.types';
import type { WorldStateAssertion } from '../../guardian-decision-core/contracts/world-state.types';
import type {
  ObservationAssessment,
  ObservationFact,
  TravelObservationEvent,
  VerificationStatus,
} from '../observation.types';

/** Distinct from official `road.status` — Guardians must not treat as SSOT */
export const LOOK_FIELD_OBSERVATION_PREDICATE = 'look.field_observation' as const;

export const LOOK_WORLD_STATE_PROVIDER = 'NARA_LOOK' as const;

export interface LookFieldObservationPayload {
  channel: 'LOOK_FIELD';
  /** Hard marker — not authoritative World State / road SSOT */
  authoritative: false;
  observationId: string;
  assessmentId?: string;
  assessmentRevision?: number;
  captureRevision: number;
  intent: TravelObservationEvent['intent'];
  semanticKey: string;
  semanticType: string;
  value: unknown;
  factSource: ObservationFact['source'];
  verificationStatus: VerificationStatus;
  mediaRefs: string[];
  relatedRoadId?: string;
}

export function isLookFieldObservationAssertion(
  assertion: WorldStateAssertion,
): boolean {
  return assertion.predicate === LOOK_FIELD_OBSERVATION_PREDICATE;
}

export function lookFactSubjectRef(
  observationId: string,
  semanticKey: string,
): EntityRef {
  return {
    kind: 'PLAN_ITEM',
    id: `look_obs:${observationId}:${semanticKey}`,
    label: semanticKey,
  };
}

export function lookAssertionId(
  observationId: string,
  semanticKey: string,
  captureRevision: number,
): string {
  const key = semanticKey.replace(/[^A-Za-z0-9._-]/g, '_');
  return `look_assert_${observationId}_r${captureRevision}_${key}`.slice(0, 180);
}

function relatedRoadIdFromFacts(facts: ObservationFact[]): string | undefined {
  const froad = facts.find(
    (f) => f.semanticKey === 'OBSERVATION.ROAD.FROAD_SIGN_DETECTED',
  );
  if (froad && typeof froad.value === 'string') return froad.value.toUpperCase();
  return undefined;
}

/** Facts worth persisting as WorldState assertions (skip pure noise). */
export function selectLookFactsForWorldState(
  facts: ObservationFact[],
): ObservationFact[] {
  return facts.filter((f) => {
    if (!f.semanticKey) return false;
    // Always skip if somehow labeled as road.status (defense)
    if (f.semanticKey === 'road.status') return false;
    return (
      f.semanticKey.startsWith('OBSERVATION.') ||
      f.semanticKey.startsWith('RULE_TRIGGER.') ||
      f.semanticKey.startsWith('DATA_CONFLICT.') ||
      f.semanticKey.startsWith('DATA_UNCERTAINTY.') ||
      f.semanticKey.startsWith('EXECUTION_DEVIATION.') ||
      f.semanticKey.startsWith('RISK.')
    );
  });
}

export function projectLookFactToWorldStateAssertion(input: {
  event: TravelObservationEvent;
  fact: ObservationFact;
  verificationStatus: VerificationStatus;
  assessment?: Pick<
    ObservationAssessment,
    'assessmentId' | 'assessmentRevision'
  >;
  observedAt?: string;
}): WorldStateAssertion<LookFieldObservationPayload> {
  const { event, fact } = input;
  if (fact.semanticKey === 'road.status') {
    throw new Error('Look must never project road.status assertions');
  }

  const observedAt = input.observedAt ?? event.capturedAt;
  const relatedRoadId = relatedRoadIdFromFacts(event.observations);

  return {
    assertionId: lookAssertionId(
      event.observationId,
      fact.semanticKey,
      event.captureRevision,
    ),
    subjectRef: lookFactSubjectRef(event.observationId, fact.semanticKey),
    predicate: LOOK_FIELD_OBSERVATION_PREDICATE,
    payload: {
      channel: 'LOOK_FIELD',
      authoritative: false,
      observationId: event.observationId,
      assessmentId: input.assessment?.assessmentId,
      assessmentRevision: input.assessment?.assessmentRevision,
      captureRevision: event.captureRevision,
      intent: event.intent,
      semanticKey: fact.semanticKey,
      semanticType: fact.semanticType,
      value: fact.value,
      factSource: fact.source,
      verificationStatus: input.verificationStatus,
      mediaRefs: [...event.mediaRefs],
      relatedRoadId,
    },
    source: {
      provider: LOOK_WORLD_STATE_PROVIDER,
      sourceType: 'USER',
      evidenceRefs: event.mediaRefs.slice(0, 8),
    },
    observedAt,
    validFrom: observedAt,
    confidence: Math.min(1, Math.max(0, fact.confidence)),
    status: 'ACTIVE',
    version: event.captureRevision,
  };
}

export function buildLookWorldStateAssertions(input: {
  event: TravelObservationEvent;
  verificationStatus: VerificationStatus;
  assessment?: Pick<
    ObservationAssessment,
    'assessmentId' | 'assessmentRevision'
  >;
}): WorldStateAssertion<LookFieldObservationPayload>[] {
  const facts = selectLookFactsForWorldState(input.event.observations);
  return facts.map((fact) =>
    projectLookFactToWorldStateAssertion({
      event: input.event,
      fact,
      verificationStatus: input.verificationStatus,
      assessment: input.assessment,
    }),
  );
}
