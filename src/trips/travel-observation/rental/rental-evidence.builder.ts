/**
 * Build / hash helpers for rental EvidencePackage.
 */

import { createHash } from 'crypto';
import type { TravelObservationEvent } from '../observation.types';
import type { GroundingHints } from '../grounding/grounding.types';
import {
  RENTAL_P0_REQUIRED_VIEWS,
  type RentalCaptureView,
  type RentalEvidencePackage,
  type RentalHandoverType,
} from './rental-evidence.types';

export function hashMediaRef(mediaRef: string): string {
  return `mh_${createHash('sha256').update(mediaRef).digest('hex').slice(0, 16)}`;
}

export function maskPlate(raw: string): string {
  const cleaned = raw.replace(/\s+/g, '').toUpperCase();
  if (cleaned.length < 4) return '***';
  return `${cleaned.slice(0, 2)}-***-${cleaned.slice(-2)}`;
}

function factValue(
  event: TravelObservationEvent,
  key: string,
): unknown {
  return event.observations.find((o) => o.semanticKey === key)?.value;
}

export function resolveCapturedViews(
  event: TravelObservationEvent,
  hints?: GroundingHints,
): RentalCaptureView[] {
  const fromHint = hints?.rentalHandover?.capturedViews;
  if (fromHint?.length) return [...new Set(fromHint)];

  // Infer from mediaRef tokens e.g. media_front_left
  const inferred: RentalCaptureView[] = [];
  for (const ref of event.mediaRefs) {
    const r = ref.toLowerCase();
    if (r.includes('front_left') || /(^|[_-])fl([_-]|$)/.test(r))
      inferred.push('FRONT_LEFT');
    else if (r.includes('front_right') || /(^|[_-])fr([_-]|$)/.test(r))
      inferred.push('FRONT_RIGHT');
    else if (r.includes('rear_left') || /(^|[_-])rl([_-]|$)/.test(r))
      inferred.push('REAR_LEFT');
    else if (r.includes('rear_right') || /(^|[_-])rr([_-]|$)/.test(r))
      inferred.push('REAR_RIGHT');
    else if (r.includes('left') && !r.includes('front') && !r.includes('rear'))
      inferred.push('LEFT');
    else if (r.includes('right') && !r.includes('front') && !r.includes('rear'))
      inferred.push('RIGHT');
    else if (r.includes('front')) inferred.push('FRONT');
    else if (r.includes('rear') || r.includes('back')) inferred.push('REAR');
    else if (r.includes('dash')) inferred.push('DASHBOARD');
    else if (r.includes('fuel') || r.includes('charge'))
      inferred.push('FUEL_OR_CHARGE');
    else if (r.includes('tire') || r.includes('tyre')) inferred.push('TIRES');
    else if (r.includes('roof') || r.includes('wind'))
      inferred.push('ROOF_OR_WINDSHIELD');
  }
  return [...new Set(inferred)];
}

export function buildRentalEvidencePackage(input: {
  event: TravelObservationEvent;
  hints?: GroundingHints;
}): RentalEvidencePackage {
  const handoverType: RentalHandoverType =
    input.hints?.rentalHandover?.handoverType ??
    (factValue(input.event, 'OBSERVATION.RENTAL.HANDOVER_TYPE') === 'RETURN'
      ? 'RETURN'
      : 'PICKUP');

  const requiredViews =
    input.hints?.rentalHandover?.requiredViews ?? [...RENTAL_P0_REQUIRED_VIEWS];
  const capturedViews = resolveCapturedViews(input.event, input.hints);
  const missingViews = requiredViews.filter((v) => !capturedViews.includes(v));

  const plateRaw = factValue(input.event, 'OBSERVATION.RENTAL.PLATE_DETECTED');
  const plateMasked =
    input.hints?.rentalHandover?.plateMasked ??
    (typeof plateRaw === 'string' ? maskPlate(plateRaw) : undefined);

  const mileage = factValue(input.event, 'OBSERVATION.RENTAL.MILEAGE_DETECTED');
  const fuel = factValue(input.event, 'OBSERVATION.RENTAL.FUEL_LEVEL_DETECTED');
  const model = factValue(input.event, 'OBSERVATION.VEHICLE.MODEL_DETECTED');
  const damage = factValue(input.event, 'OBSERVATION.RENTAL.DAMAGE_SUSPECTED');

  const suspectedDamageAreas: string[] = Array.isArray(damage)
    ? damage.map(String)
    : damage
      ? [String(damage)]
      : [];

  const complete = missingViews.length === 0 && input.event.mediaRefs.length > 0;

  return {
    packageId: `ep_rental_${input.event.observationId}`,
    tripId: input.event.tripId,
    observationId: input.event.observationId,
    type: handoverType === 'RETURN' ? 'RENTAL_RETURN' : 'RENTAL_PICKUP',
    handoverType,
    observationIds: [input.event.observationId],
    mediaRefs: [...input.event.mediaRefs],
    mediaHashes: input.event.mediaRefs.map(hashMediaRef),
    bookingId:
      input.hints?.rentalHandover?.bookingId ??
      input.hints?.bookingId ??
      input.event.tripContext.bookingId,
    plateMasked,
    vehicleModel: typeof model === 'string' ? model : undefined,
    mileage:
      typeof mileage === 'number' || typeof mileage === 'string'
        ? mileage
        : undefined,
    fuelOrChargeLevel: typeof fuel === 'string' ? fuel : undefined,
    suspectedDamageAreas,
    userConfirmedDamage: [
      ...(input.hints?.rentalHandover?.userConfirmedDamage ?? []),
    ],
    requiredViews,
    capturedViews,
    missingViews,
    complete,
    liabilityAssigned: false,
    autoSentToLessor: false,
    generatedAt: new Date().toISOString(),
    exportStatus: 'NOT_REQUESTED',
    writesPlanVersion: false,
  };
}
