/**
 * Apply DecisionCase option → trip metadata constraints + re-ensure downstream cases.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../../trips/budget-os/utils/prisma-json.util';
import { DecisionCaseStoreService } from '../persistence/decision-case.store';
import type { StoredDecisionCase } from '../contracts/decision-case.types';
import { isDecisionCaseProblemId } from '../projections/decision-case.projection';
import { OVERALL_READINESS_CACHE_KEY } from '../../../trips/overall-readiness/utils/overall-readiness-cache.util';

export interface DecisionCaseWritebackResult {
  applied: boolean;
  writebackTargets: string[];
  vehicleType?: string;
  coverageTier?: string;
  caseStatus: StoredDecisionCase['workflowStatus'];
}

@Injectable()
export class DecisionCaseApplyWritebackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: DecisionCaseStoreService,
  ) {}

  canHandle(problemId: string): boolean {
    return isDecisionCaseProblemId(problemId);
  }

  async applyOption(input: {
    tripId: string;
    problemId: string;
    optionId: string;
  }): Promise<DecisionCaseWritebackResult> {
    const decisionCase = await this.store.getCase(input.tripId, input.problemId);
    if (!decisionCase) {
      throw new NotFoundException(`DECISION_CASE_NOT_FOUND: ${input.problemId}`);
    }

    const option = decisionCase.options.find((o) => o.optionId === input.optionId);
    if (!option) {
      throw new NotFoundException(`DECISION_CASE_OPTION_NOT_FOUND: ${input.optionId}`);
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: input.tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const constraints = {
      ...((meta.constraints as Record<string, unknown> | undefined) ?? {}),
    };
    const payload = option.writebackPayload ?? {};

    if (decisionCase.writebackTargets.includes('VEHICLE')) {
      if (typeof payload.vehicleType === 'string') {
        constraints.vehicle_type = payload.vehicleType;
        constraints.vehicleType = payload.vehicleType;
      }
      if (payload.fRoadAllowed !== undefined) {
        constraints.fRoadAllowed = payload.fRoadAllowed;
      }
      if (payload.fRoadCapability !== undefined) {
        constraints.fRoadCapability = payload.fRoadCapability;
      }
      if (payload.highlandsMode !== undefined) {
        constraints.highlandsMode = payload.highlandsMode;
      }
      if (payload.keepFRoad === false) {
        constraints.excludeFRoad = true;
      }
      if (payload.dropHighlands === true) {
        constraints.excludeHighlands = true;
      }
      if (payload.routeMode !== undefined) {
        constraints.routeMode = payload.routeMode;
      }
    }

    if (decisionCase.writebackTargets.includes('INSURANCE')) {
      if (typeof payload.coverageTier === 'string') {
        constraints.insurance_coverage_tier = payload.coverageTier;
        constraints.insuranceCoverageTier = payload.coverageTier;
      }
      if (payload.fordingExcluded === true) {
        constraints.insurance_fording_excluded = true;
      }
    }

    const decisionWritebacks = {
      ...((meta.decisionWritebacks as Record<string, unknown> | undefined) ?? {}),
    };

    if (decisionCase.writebackTargets.includes('ROUTE')) {
      if (typeof payload.routeScope === 'string') {
        meta.routeScope = payload.routeScope;
        constraints.routeScope = payload.routeScope;
      }
      if (typeof payload.routeMode === 'string') {
        constraints.routeMode = payload.routeMode;
      }
      if (typeof payload.landingMode === 'string') {
        meta.landingMode = payload.landingMode;
      }
      if (payload.keepFRoad === false) {
        constraints.excludeFRoad = true;
      }
    }

    if (decisionCase.writebackTargets.includes('LODGING')) {
      if (payload.addLodgingNight === true || payload.addAirportLodging === true) {
        decisionWritebacks.lodgingIntent = {
          addNight: true,
          dayIndex: payload.dayIndex,
          nearAirport: payload.addAirportLodging === true,
          at: nowPlaceholder(),
        };
      }
    }

    if (
      decisionCase.writebackTargets.includes('ITINERARY') ||
      decisionCase.writebackTargets.includes('BOOKING_INTENT')
    ) {
      if (payload.glacierProduct !== undefined) {
        decisionWritebacks.glacierProduct = payload.glacierProduct;
      }
      if (payload.experience !== undefined) {
        decisionWritebacks.experienceIntent = {
          kind: payload.experience,
          add: payload.add !== false,
          departure: payload.departure,
          subjectRef: payload.subjectRef,
        };
      }
      if (payload.dropPoi === true || payload.shiftPoisToNextDay === true) {
        decisionWritebacks.itineraryAdjust = {
          dropPoi: payload.dropPoi === true,
          shiftPoisToNextDay: payload.shiftPoisToNextDay === true,
          dayIndex: payload.dayIndex,
        };
      }
      if (payload.rotateDrivers === true) {
        constraints.rotateDrivers = true;
      }
      if (payload.keepLongDrive === true) {
        decisionWritebacks.acceptedLongDriveDay = payload.dayIndex;
      }
    }

    const now = new Date().toISOString();
    const updatedCase: StoredDecisionCase = {
      ...decisionCase,
      workflowStatus: 'RESOLVED',
      resolvedOptionId: option.optionId,
      resolvedAt: now,
      updatedAt: now,
    };

    const nextMeta: Record<string, unknown> = {
      ...meta,
      constraints,
      decisionWritebacks,
      vehicleConfirmedAt: decisionCase.writebackTargets.includes('VEHICLE')
        ? now
        : meta.vehicleConfirmedAt,
      insuranceConfirmedAt: decisionCase.writebackTargets.includes('INSURANCE')
        ? now
        : meta.insuranceConfirmedAt,
    };
    // 约束变更后整体准备度缓存失效，下次读接口会重算
    delete nextMeta[OVERALL_READINESS_CACHE_KEY];

    await this.prisma.trip.update({
      where: { id: input.tripId },
      data: {
        metadata: toInputJsonValue(nextMeta),
      },
    });

    await this.store.upsertCase(input.tripId, updatedCase);

    return {
      applied: true,
      writebackTargets: decisionCase.writebackTargets,
      vehicleType:
        typeof payload.vehicleType === 'string' ? payload.vehicleType : undefined,
      coverageTier:
        typeof payload.coverageTier === 'string' ? payload.coverageTier : undefined,
      caseStatus: 'RESOLVED',
    };
  }
}

function nowPlaceholder(): string {
  return new Date().toISOString();
}
