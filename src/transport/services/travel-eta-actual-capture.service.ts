/**
 * ETA-L2-CANARY-01 — Actual capture: net driving time + sample source + quality gate.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  classifyTravelEtaSampleQuality,
  computeActualDurationMin,
  TRAVEL_ETA_ACTUAL_SCHEMA,
  type SampleQualityGateInput,
  type TravelEtaActualCaptureV1,
  type TravelEtaActualDataSource,
  type TravelEtaSampleSourceLabel,
} from '../contracts/travel-eta-actual.contract';
import type { TravelEtaEnvelopeV1 } from '../contracts/travel-eta.contract';
import { TravelEtaReconciliationService } from './travel-eta-reconciliation.service';

export interface CaptureTravelEtaActualInput {
  tripId: string;
  fromItemId?: string;
  toItemId?: string;
  plannedRouteGeometryRef: string;
  actualDepartureAt: string | Date;
  actualArrivalAt: string | Date;
  excludedStopDurationMin?: number;
  routeDeviation: boolean;
  deviationDistanceM?: number;
  weatherObserved?: string;
  roadConditionObserved?: string;
  dataSource: TravelEtaActualDataSource;
  sampleSource: TravelEtaSampleSourceLabel;
  sampleSourceNote?: string;
  /** Optional overrides / extras for quality classifier */
  qualityHints?: Partial<SampleQualityGateInput>;
  /** Planning envelope for reconciliation seed */
  eta?: TravelEtaEnvelopeV1;
  decision?: string;
}

export interface CaptureTravelEtaActualResult {
  capture: TravelEtaActualCaptureV1;
  reconciliationEventId?: string;
  enteredMaeCalibration: boolean;
}

@Injectable()
export class TravelEtaActualCaptureService {
  private readonly logger = new Logger(TravelEtaActualCaptureService.name);
  private readonly captures: TravelEtaActualCaptureV1[] = [];

  constructor(
    @Optional() private readonly reconciliation?: TravelEtaReconciliationService,
  ) {}

  capture(input: CaptureTravelEtaActualInput): CaptureTravelEtaActualResult {
    const net = computeActualDurationMin({
      actualDepartureAt: input.actualDepartureAt,
      actualArrivalAt: input.actualArrivalAt,
      excludedStopDurationMin: input.excludedStopDurationMin,
    });
    if (net == null) {
      throw new Error('Invalid actual timestamps or non-positive net driving duration');
    }

    const dep = new Date(input.actualDepartureAt).getTime();
    const arr = new Date(input.actualArrivalAt).getTime();
    const elapsed = Math.round((arr - dep) / 60_000);

    const providerUnknown =
      input.eta?.provenance.provider === 'UNKNOWN' ||
      input.eta?.providerTraceStatus === 'UNKNOWN' ||
      !!input.qualityHints?.providerUnknown;
    const missingGeometry =
      !input.plannedRouteGeometryRef?.trim() ||
      input.plannedRouteGeometryRef === 'NONE' ||
      !!input.qualityHints?.missingGeometry;

    const classified = classifyTravelEtaSampleQuality({
      hasTrustedEndpoints: input.qualityHints?.hasTrustedEndpoints ?? true,
      routeAlignedWithPlan:
        input.qualityHints?.routeAlignedWithPlan ?? !input.routeDeviation,
      longNonDrivingStopUnresolved:
        input.qualityHints?.longNonDrivingStopUnresolved ?? false,
      provenanceComplete:
        input.qualityHints?.provenanceComplete ??
        (!providerUnknown && !missingGeometry),
      dataSourceTrusted:
        input.qualityHints?.dataSourceTrusted ??
        (input.dataSource === 'GPS' ||
          input.dataSource === 'MOBILE_EXECUTION' ||
          input.dataSource === 'EXTERNAL_TRACK'),
      destinationChanged: input.qualityHints?.destinationChanged ?? false,
      majorReroute:
        input.qualityHints?.majorReroute ??
        (input.routeDeviation && (input.deviationDistanceM ?? 0) > 5_000),
      timestampsImplausible: input.qualityHints?.timestampsImplausible ?? false,
      providerUnknown,
      missingGeometry,
      shortStopEstimable: input.qualityHints?.shortStopEstimable,
      partialGpsGap: input.qualityHints?.partialGpsGap,
      mildDeviation:
        input.qualityHints?.mildDeviation ??
        (input.routeDeviation && (input.deviationDistanceM ?? 0) <= 5_000),
      manualConfirmOnly:
        input.qualityHints?.manualConfirmOnly ??
        input.dataSource === 'MANUAL_CONFIRMATION',
    });

    const segmentKey =
      input.fromItemId && input.toItemId
        ? `${input.fromItemId}->${input.toItemId}`
        : undefined;

    const capture: TravelEtaActualCaptureV1 = {
      schema: TRAVEL_ETA_ACTUAL_SCHEMA,
      tripId: input.tripId,
      fromItemId: input.fromItemId,
      toItemId: input.toItemId,
      segmentKey,
      plannedRouteGeometryRef: input.plannedRouteGeometryRef,
      actualDepartureAt: new Date(input.actualDepartureAt).toISOString(),
      actualArrivalAt: new Date(input.actualArrivalAt).toISOString(),
      actualDurationMin: net,
      excludedStopDurationMin: Math.max(0, Math.round(input.excludedStopDurationMin ?? 0)),
      elapsedDurationMin: elapsed,
      routeDeviation: input.routeDeviation,
      deviationDistanceM: input.deviationDistanceM,
      weatherObserved: input.weatherObserved,
      roadConditionObserved: input.roadConditionObserved,
      dataSource: input.dataSource,
      sampleQuality: classified.quality,
      qualityReasons: classified.reasons.length ? classified.reasons : undefined,
      sampleSource: input.sampleSource,
      sampleSourceNote: input.sampleSourceNote,
    };

    this.captures.push(capture);
    this.logger.log(JSON.stringify({ type: 'travel_eta_actual_capture', ...capture }));

    let reconciliationEventId: string | undefined;
    if (this.reconciliation) {
      try {
        const ev = this.reconciliation.recordActual({
          tripId: input.tripId,
          fromItemId: input.fromItemId,
          toItemId: input.toItemId,
          segmentKey,
          actualDurationMin: net,
          eta: input.eta,
          decision: input.decision,
          sampleQuality: classified.quality,
        });
        reconciliationEventId = ev.eventId;
      } catch (err) {
        this.logger.debug(
          `reconciliation attach skipped: ${(err as Error)?.message ?? err}`,
        );
      }
    }

    return {
      capture,
      reconciliationEventId,
      enteredMaeCalibration: classified.quality === 'VALID',
    };
  }

  listCaptures(limit = 200): TravelEtaActualCaptureV1[] {
    return this.captures.slice(-limit);
  }

  clear(): void {
    this.captures.length = 0;
  }
}
