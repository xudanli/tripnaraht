/**
 * GRD-FR-008 — contextHash for traceable Look assessments.
 * Stable over equivalent grounding inputs; changes when trip/vehicle/road/facts change.
 */

import { createHash } from 'crypto';
import type { TravelObservationEvent } from '../observation.types';
import type { GroundingHints, GroundingResult } from '../grounding/grounding.types';

export function buildLookContextHashPayload(input: {
  event: TravelObservationEvent;
  grounding: Pick<
    GroundingResult,
    | 'verificationStatus'
    | 'roadMatch'
    | 'detectedRoadId'
    | 'vehicleRoadFit'
    | 'meetingPoint'
    | 'officialRoadOpen'
    | 'roadStatusUpdatedAt'
  >;
  hints?: GroundingHints;
}): Record<string, unknown> {
  const { event, grounding, hints } = input;
  const lat = event.spatialContext.latitude;
  const lon = event.spatialContext.longitude;

  return {
    v: 1,
    tripId: event.tripId,
    observationId: event.observationId,
    intent: event.intent,
    captureRevision: event.captureRevision,
    channel: event.channel,
    geo:
      typeof lat === 'number' && typeof lon === 'number'
        ? {
            lat: Math.round(lat * 1e5) / 1e5,
            lon: Math.round(lon * 1e5) / 1e5,
            acc: event.spatialContext.accuracyMeters ?? null,
          }
        : null,
    facts: event.observations
      .map((f) => ({
        k: f.semanticKey,
        v: f.value,
        c: Math.round(f.confidence * 100) / 100,
      }))
      .sort((a, b) => a.k.localeCompare(b.k)),
    vehicle: {
      id: hints?.vehicleId ?? event.tripContext.vehicleId ?? null,
      class: hints?.vehicleClass ?? null,
      drivetrain: hints?.drivetrain ?? null,
    },
    roads: {
      nearby: [...(hints?.nearbyRoadIds ?? [])].sort(),
      planned: [...(hints?.plannedRoadIds ?? [])].sort(),
      requiresFroad: hints?.plannedRequiresFroad ?? null,
      statuses: Object.keys(hints?.roadStatuses ?? {})
        .sort()
        .map((id) => {
          const s = hints!.roadStatuses![id]!;
          return {
            id,
            open: s.isOpen,
            updatedAt: s.updatedAt,
            source: s.source ?? null,
          };
        }),
    },
    booking: {
      id: hints?.bookingId ?? event.tripContext.bookingId ?? null,
      meeting: hints?.bookingMeetingPointName ?? null,
      operator: hints?.bookingOperatorName ?? null,
    },
    parking: hints?.officialParking
      ? {
          allowsNow: hints.officialParking.allowsNow,
          paid: hints.officialParking.paidRequired ?? null,
          validUntil: hints.officialParking.validUntil ?? null,
          updatedAt: hints.officialParking.updatedAt ?? null,
        }
      : null,
    localTimeIso: hints?.localTimeIso ?? null,
    grounding: {
      verificationStatus: grounding.verificationStatus,
      roadMatch: grounding.roadMatch,
      detectedRoadId: grounding.detectedRoadId ?? null,
      vehicleRoadFit: grounding.vehicleRoadFit,
      meetingPoint: grounding.meetingPoint,
      officialRoadOpen: grounding.officialRoadOpen ?? null,
      roadStatusUpdatedAt: grounding.roadStatusUpdatedAt ?? null,
    },
  };
}

export function computeLookContextHash(input: {
  event: TravelObservationEvent;
  grounding: GroundingResult;
  hints?: GroundingHints;
}): string {
  const payload = buildLookContextHashPayload(input);
  const json = JSON.stringify(payload);
  return `lch_${createHash('sha256').update(json).digest('hex').slice(0, 24)}`;
}
