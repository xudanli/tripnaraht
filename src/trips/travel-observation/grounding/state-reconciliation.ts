import { isFrozenSemanticKey } from '../semantic-keys';
import type {
  ObservationFact,
  TravelObservationEvent,
  VerificationStatus,
} from '../observation.types';
import { buildObservationContext } from './context-builder';
import { groundRoadMatch } from './geo-grounding';
import type { GroundingHints, GroundingResult } from './grounding.types';
import {
  extractDetectedDrivetrain,
  extractDetectedRoadId,
  extractOperatorName,
} from './grounding.types';
import { assessMeetingPoint } from './meeting-point';
import { assessParkingRules } from './parking-rules';
import { assessVehicleRoadFit } from './vehicle-road-fit';
import { computeLookContextHash } from './context-hash';

function fact(
  semanticType: string,
  semanticKey: string,
  value: unknown,
  confidence = 1,
): ObservationFact | null {
  if (!isFrozenSemanticKey(semanticKey)) return null;
  return {
    semanticType,
    semanticKey,
    value,
    confidence,
    source: 'ON_DEVICE',
  };
}

/**
 * Reconcile visual facts with trip / geo / official road status.
 */
export function reconcileObservationState(
  event: TravelObservationEvent,
  hints: GroundingHints = {},
): GroundingResult {
  const notes: string[] = [];
  const extraFacts: ObservationFact[] = [];

  let detectedRoadId = extractDetectedRoadId(event);
  // Recover F### from userQuestion if fact value was boolean
  if (!detectedRoadId && event.userQuestion) {
    const m = event.userQuestion.match(/\bF\s*([0-9]{2,3})\b/i);
    if (m) detectedRoadId = `F${m[1]}`;
  }

  const road = groundRoadMatch({ event, detectedRoadId, hints });
  notes.push(...road.notes);

  const closedSign = event.observations.some(
    (o) => o.semanticKey === 'OBSERVATION.ROAD.CLOSED_SIGN_DETECTED',
  );
  const froadSign = event.observations.some(
    (o) => o.semanticKey === 'OBSERVATION.ROAD.FROAD_SIGN_DETECTED',
  );

  let officialRoadOpen: boolean | undefined;
  let roadStatusUpdatedAt: string | undefined;
  if (detectedRoadId && hints.roadStatuses?.[detectedRoadId]) {
    const snap = hints.roadStatuses[detectedRoadId];
    officialRoadOpen = snap.isOpen;
    roadStatusUpdatedAt = snap.updatedAt;
    notes.push(
      `Official status for ${detectedRoadId}: ${snap.isOpen ? 'OPEN' : 'CLOSED'} (${snap.source ?? 'hint'})`,
    );
  } else if (detectedRoadId && road.kind === 'MATCHED') {
    const u = fact(
      'DATA_UNCERTAINTY',
      'DATA_UNCERTAINTY.OFFICIAL_DATA_UNAVAILABLE',
      true,
    );
    if (u) extraFacts.push(u);
    notes.push('Official road status snapshot unavailable');
  }

  // Field closed vs official open → conflict
  if (closedSign && officialRoadOpen === true) {
    const c = fact(
      'DATA_CONFLICT',
      'DATA_CONFLICT.ROAD_STATUS_CONFLICT',
      { field: 'CLOSED', official: 'OPEN' },
    );
    if (c) extraFacts.push(c);
    notes.push('Field closed sign vs official OPEN');
  }

  if (road.kind === 'CONFLICT') {
    const c = fact(
      'DATA_CONFLICT',
      'DATA_CONFLICT.IMAGE_LOCATION_MISMATCH',
      true,
    );
    if (c) extraFacts.push(c);
  }

  const drivetrain =
    hints.drivetrain && hints.drivetrain !== 'UNKNOWN'
      ? hints.drivetrain
      : extractDetectedDrivetrain(event) ??
        (hints.vehicleClass === 'SUV_4WD'
          ? '4WD'
          : hints.vehicleClass === 'SEDAN'
            ? '2WD'
            : 'UNKNOWN');

  const plannedRequiresFroad =
    hints.plannedRequiresFroad === true ||
    (hints.plannedRoadIds ?? []).some((r) => /^F/i.test(r));

  const fit = assessVehicleRoadFit({
    detectedFroad: froadSign || /^F/i.test(detectedRoadId ?? ''),
    plannedRequiresFroad,
    drivetrain,
    roadMatch: road.kind,
  });
  notes.push(...fit.notes);

  if (fit.fit === 'MISMATCH') {
    const m = fact(
      'RULE_TRIGGER',
      'RULE_TRIGGER.FROAD_VEHICLE_MISMATCH',
      { drivetrain, roadId: detectedRoadId },
    );
    if (m) extraFacts.push(m);
  }

  const meeting = assessMeetingPoint({
    detectedOperator: extractOperatorName(event),
    bookingOperatorName: hints.bookingOperatorName,
    bookingMeetingPointName: hints.bookingMeetingPointName,
  });
  notes.push(...meeting.notes);

  if (meeting.kind === 'MISMATCH') {
    const m = fact(
      'EXECUTION_DEVIATION',
      'EXECUTION_DEVIATION.WRONG_MEETING_POINT',
      {
        detected: extractOperatorName(event),
        expected: hints.bookingOperatorName ?? hints.bookingMeetingPointName,
      },
    );
    if (m) extraFacts.push(m);
  }

  const hasGps = !!(
    event.spatialContext.latitude != null &&
    event.spatialContext.longitude != null
  );
  const parkingRelevant =
    event.intent === 'CHECK_PARKING' ||
    event.observations.some((o) =>
      o.semanticKey.startsWith('OBSERVATION.PARKING.'),
    );
  const parking = parkingRelevant
    ? assessParkingRules({ event, hints, hasGps })
    : undefined;
  if (parking) {
    notes.push(...parking.notes);
    extraFacts.push(...parking.facts);
  }

  const context = buildObservationContext(event, hints);
  if (roadStatusUpdatedAt) {
    context.externalEvidence.roadStatusUpdatedAt = roadStatusUpdatedAt;
    context.externalEvidence.roadStatusSnapshotId = detectedRoadId
      ? `snap_${detectedRoadId}`
      : undefined;
  }

  let verificationStatus = resolveVerification({
    roadKind: road.kind,
    fit: fit.fit,
    meeting: meeting.kind,
    hasConflictFacts: extraFacts.some((f) =>
      f.semanticKey.startsWith('DATA_CONFLICT.'),
    ),
    hasGps: !!context.spatial.location,
    needsRecapture: (event.extractionMeta?.requiredAdditionalViews.length ?? 0) > 0,
  });
  if (parking?.fit === 'INCOMPLETE') {
    verificationStatus = 'INSUFFICIENT';
  } else if (
    parking?.fit === 'NOT_ALLOWED_NOW' &&
    parking.officialAllowsNow === false
  ) {
    verificationStatus = 'VERIFIED';
  } else if (parking?.fit === 'ALLOWED_NOW' || parking?.fit === 'PAID_REQUIRED') {
    verificationStatus =
      parking.officialAllowsNow !== undefined ? 'CORROBORATED' : 'UNVERIFIED';
  }

  const partial: Omit<GroundingResult, 'contextHash'> = {
    context,
    verificationStatus,
    facts: extraFacts,
    roadMatch: road.kind,
    detectedRoadId,
    vehicleRoadFit: fit.fit,
    meetingPoint: meeting.kind,
    officialRoadOpen,
    roadStatusUpdatedAt,
    notes,
    parkingFit: parking?.fit,
    parkingValidUntil: parking?.validUntil,
    parkingPaidRequired: parking?.paidRequired,
  };

  return {
    ...partial,
    contextHash: computeLookContextHash({
      event,
      grounding: { ...partial, contextHash: '' },
      hints,
    }),
  };
}

function resolveVerification(input: {
  roadKind: GroundingResult['roadMatch'];
  fit: GroundingResult['vehicleRoadFit'];
  meeting: GroundingResult['meetingPoint'];
  hasConflictFacts: boolean;
  hasGps: boolean;
  needsRecapture: boolean;
}): VerificationStatus {
  if (input.needsRecapture) return 'INSUFFICIENT';
  if (input.hasConflictFacts || input.roadKind === 'CONFLICT') {
    return 'CONFLICTING';
  }
  if (!input.hasGps) return 'UNVERIFIED';
  if (input.roadKind === 'MATCHED' && input.fit !== 'UNKNOWN') {
    return input.fit === 'MISMATCH' ? 'VERIFIED' : 'CORROBORATED';
  }
  if (input.meeting === 'MATCH' || input.meeting === 'MISMATCH') {
    return input.meeting === 'MISMATCH' ? 'VERIFIED' : 'CORROBORATED';
  }
  if (input.roadKind === 'UNMATCHED' || input.fit === 'UNKNOWN') {
    return 'INSUFFICIENT';
  }
  return 'UNVERIFIED';
}
