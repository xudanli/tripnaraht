/**
 * Parking rule grounding — RealityOS P0-A scene B.
 * Visual facts alone never claim “绝对不会被罚款”.
 */

import type { ObservationFact, TravelObservationEvent } from '../observation.types';
import { isFrozenSemanticKey } from '../semantic-keys';
import type { GroundingHints } from './grounding.types';

export type ParkingFitKind =
  | 'ALLOWED_NOW'
  | 'NOT_ALLOWED_NOW'
  | 'PAID_REQUIRED'
  | 'INCOMPLETE'
  | 'VISUAL_ONLY'
  | 'UNKNOWN';

export interface ParkingGroundingResult {
  fit: ParkingFitKind;
  facts: ObservationFact[];
  notes: string[];
  validUntil?: string;
  paidRequired?: boolean;
  officialAllowsNow?: boolean;
}

function pushFact(
  facts: ObservationFact[],
  semanticType: string,
  semanticKey: string,
  value: unknown,
  confidence = 1,
): void {
  if (!isFrozenSemanticKey(semanticKey)) return;
  if (facts.some((f) => f.semanticKey === semanticKey)) return;
  facts.push({
    semanticType,
    semanticKey,
    value,
    confidence,
    source: 'ON_DEVICE',
  });
}

export function assessParkingRules(input: {
  event: TravelObservationEvent;
  hints: GroundingHints;
  hasGps: boolean;
}): ParkingGroundingResult {
  const facts: ObservationFact[] = [];
  const notes: string[] = [];
  const obs = input.event.observations;

  const incomplete = obs.some(
    (o) => o.semanticKey === 'DATA_UNCERTAINTY.PARKING_RULE_INCOMPLETE',
  );
  const noParking = obs.some(
    (o) => o.semanticKey === 'OBSERVATION.PARKING.NO_PARKING_DETECTED',
  );
  const paid = obs.some(
    (o) => o.semanticKey === 'OBSERVATION.PARKING.PAID_ZONE_DETECTED',
  );
  const resident = obs.some(
    (o) => o.semanticKey === 'OBSERVATION.PARKING.RESIDENT_ONLY_DETECTED',
  );
  const timeFact = obs.find(
    (o) => o.semanticKey === 'OBSERVATION.PARKING.TIME_LIMIT_DETECTED',
  );
  const sign = obs.some(
    (o) => o.semanticKey === 'OBSERVATION.PARKING.SIGN_DETECTED',
  );

  if (!input.hasGps) {
    notes.push('No GPS — parking conclusion is visual explanation only');
    return {
      fit: sign || noParking || paid ? 'VISUAL_ONLY' : 'UNKNOWN',
      facts,
      notes,
      validUntil:
        typeof timeFact?.value === 'string' ? timeFact.value : undefined,
      paidRequired: paid || undefined,
    };
  }

  const official = input.hints.officialParking;
  if (!official) {
    pushFact(
      facts,
      'DATA_UNCERTAINTY',
      'DATA_UNCERTAINTY.OFFICIAL_DATA_UNAVAILABLE',
      true,
    );
    notes.push('Official parking rules unavailable');
  }

  if (incomplete || (!sign && !noParking && !paid && !resident)) {
    notes.push('Parking plate incomplete or unreadable');
    return {
      fit: 'INCOMPLETE',
      facts,
      notes,
      validUntil:
        typeof timeFact?.value === 'string' ? timeFact.value : undefined,
      paidRequired: paid || undefined,
      officialAllowsNow: official?.allowsNow,
    };
  }

  if (official && official.allowsNow === false) {
    pushFact(
      facts,
      'RULE_TRIGGER',
      'RULE_TRIGGER.PARKING_NOT_ALLOWED_NOW',
      {
        reason: official.reason ?? 'OFFICIAL',
        localTime: input.hints.localTimeIso,
      },
    );
    notes.push('Official parking: not allowed now');
    return {
      fit: 'NOT_ALLOWED_NOW',
      facts,
      notes,
      validUntil: official.validUntil,
      paidRequired: official.paidRequired,
      officialAllowsNow: false,
    };
  }

  if (noParking && official?.allowsNow !== true) {
    // Visual no-parking without official override → not allowed (context grounded)
    pushFact(
      facts,
      'RULE_TRIGGER',
      'RULE_TRIGGER.PARKING_NOT_ALLOWED_NOW',
      { reason: 'NO_PARKING_SIGN' },
    );
    notes.push('No-parking sign detected');
    return {
      fit: 'NOT_ALLOWED_NOW',
      facts,
      notes,
      paidRequired: false,
      officialAllowsNow: official?.allowsNow,
    };
  }

  if (paid || official?.paidRequired) {
    notes.push('Paid parking zone');
    return {
      fit: 'PAID_REQUIRED',
      facts,
      notes,
      validUntil:
        official?.validUntil ??
        (typeof timeFact?.value === 'string' ? timeFact.value : undefined),
      paidRequired: true,
      officialAllowsNow: official?.allowsNow ?? true,
    };
  }

  if (resident && official?.allowsNow !== true) {
    notes.push('Resident/permit-only cue without confirmation');
    return {
      fit: 'INCOMPLETE',
      facts,
      notes,
      officialAllowsNow: official?.allowsNow,
    };
  }

  return {
    fit: 'ALLOWED_NOW',
    facts,
    notes,
    validUntil:
      official?.validUntil ??
      (typeof timeFact?.value === 'string' ? timeFact.value : undefined),
    paidRequired: false,
    officialAllowsNow: official?.allowsNow ?? true,
  };
}
