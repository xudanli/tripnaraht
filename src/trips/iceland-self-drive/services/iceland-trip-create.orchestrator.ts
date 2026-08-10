/**
 * Application orchestrator:
 * Seed → Arrange → Day-Assign (Preview Engine) → Proposal
 * → Preflight → Independent VERIFY → (Repair once) → VERIFY
 * Never writes PlanVersion. Never auto-applies.
 */

import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import type { CreateIcelandSelfDriveTripDto } from '../dto/create-iceland-self-drive-trip.dto';
import { PRODUCT_LINE_ICELAND_SELF_DRIVE } from '../dto/iceland-self-drive-enums';
import type {
  BuildInitialPlanProposalCommand,
  BuildInitialPlanProposalResult,
  BuildInitialPlanProposalStatus,
  InitialPlanDecision,
  InitialPlanVerification,
} from '../types/iceland-initial-plan-proposal.types';
import type {
  InitialPlanArrangeInput,
  InitialPlanSeedResult,
} from '../types/iceland-initial-plan-seed.types';
import { IcelandInitialPlanPipelineService } from './iceland-initial-plan-pipeline.service';
import { IcelandInitialPlanSolverAdapter } from './iceland-initial-plan-solver.adapter';
import { IcelandInitialPlanDayAssignSolver } from './iceland-initial-plan-day-assign.solver';
import { IcelandInitialPlanProposalBuilder } from './iceland-initial-plan-proposal.builder';
import { IcelandInitialPlanProposalStore } from './iceland-initial-plan-proposal.store';
import { IcelandInitialPlanVerificationBridgeService } from './iceland-initial-plan-verification-bridge.service';

@Injectable()
export class IcelandTripCreateOrchestrator {
  private readonly logger = new Logger(IcelandTripCreateOrchestrator.name);
  private readonly adapter = new IcelandInitialPlanSolverAdapter();
  private readonly dayAssign = new IcelandInitialPlanDayAssignSolver();
  private readonly proposalBuilder = new IcelandInitialPlanProposalBuilder();

  constructor(
    private readonly pipeline: IcelandInitialPlanPipelineService,
    private readonly proposalStore: IcelandInitialPlanProposalStore,
    private readonly verifyBridge: IcelandInitialPlanVerificationBridgeService,
  ) {}

  async buildInitialPlanProposal(
    command: BuildInitialPlanProposalCommand,
  ): Promise<BuildInitialPlanProposalResult> {
    const tripId = command.tripId;
    const createDto = this.toCreateDto(command);

    const { seed, arrange } = await this.pipeline.buildArrangeInputFromCreate(
      {
        tripId,
        dto: createDto,
        vehicleProfile: command.vehicleProfile,
        preferences: command.preferences,
        dailyDrivingLimitMin: command.dailyDrivingLimitMin,
      },
      { softAltMaxAttractions: command.softAltMaxAttractions },
    );

    const bundle = this.adapter.adapt(arrange, {
      startDate: command.createInput.dateRange.startDate,
      endDate: command.createInput.dateRange.endDate,
      dailyDrivingLimitMin: command.dailyDrivingLimitMin,
      maxActivitiesPerDay:
        command.preferences?.pace === 'relaxed'
          ? 2
          : command.preferences?.pace === 'intensive'
            ? 4
            : 3,
      seed: hashToSeed(tripId),
    });

    // Vehicle / drive-cap affect seed gates & day-assign; include in cache key
    // so shell driving-settings PATCH invalidates Preview reuse.
    const cacheHash = createHash('sha256')
      .update(
        JSON.stringify({
          arrange: bundle.arrangeInputHash,
          vehicle: command.vehicleProfile ?? null,
          dailyDrivingLimitMin: command.dailyDrivingLimitMin ?? null,
        }),
      )
      .digest('hex')
      .slice(0, 24);

    const cached = this.proposalStore.getByTripAndHash(tripId, cacheHash);
    if (cached) {
      this.logger.log(
        `Reuse proposal ${cached.proposalId} for trip=${tripId} hash=${cacheHash}`,
      );
      return cached;
    }

    const solved = this.dayAssign.solve(bundle);
    const candidate0 = solved.response.candidates[0];
    if (!candidate0 || solved.response.status === 'INFEASIBLE') {
      const result = this.buildNoFeasibleResult({
        tripId,
        arrangeInputHash: cacheHash,
        arrange,
        seed,
        decisions: solved.decisions,
        startDate: command.createInput.dateRange.startDate,
        endDate: command.createInput.dateRange.endDate,
      });
      this.proposalStore.put(result);
      return result;
    }

    // Draft proposal from Preview Arrangement Engine (not authoritative)
    const draftProposal = this.proposalBuilder.build({
      tripId,
      seed,
      arrange,
      bundle,
      candidate: candidate0,
      verification: {
        status: 'VERIFIED',
        summary: {
          status: 'VERIFIED',
          pass: true,
          repaired: false,
          repairAttempts: 0,
          blockingCodes: [],
          warnings: ['PREFLIGHT_PENDING'],
          findings: [],
        },
        executionBlocked: false,
        writesPlanVersion: false,
      },
    });

    const dayScopePackIds = Object.entries(
      arrange.dayScopeRules.requireSubregionDayScopeByPack,
    )
      .filter(([, v]) => v)
      .map(([k]) => k);

    const lodgingBookings = (command.createInput.bookings ?? []).filter(
      (b) => b.kind === 'lodging' && typeof b.placeId === 'number' && b.placeId > 0,
    );
    const lodgingIds = lodgingBookings.map((b) => b.placeId!);
    const confirmedLodgings = lodgingBookings.map((b) => ({
      placeId: b.placeId!,
      label: b.name,
      // Empty startDate ⇒ undated (fill all nights in assign + Shadow)
      nightDate: b.startDate?.trim() ? b.startDate : undefined,
    }));

    const bridge = this.verifyBridge.verifyProposal({
      proposal: draftProposal,
      arrange,
      tripContext: {
        startDate: command.createInput.dateRange.startDate,
        endDate: command.createInput.dateRange.endDate,
        regionIds: command.createInput.regionIds ?? [],
        vehicleProfile: command.vehicleProfile,
        confirmedLodgingPlaceIds: lodgingIds.length ? lodgingIds : undefined,
        confirmedLodgings: confirmedLodgings.length
          ? confirmedLodgings
          : undefined,
        dailyDrivingLimitMin: command.dailyDrivingLimitMin,
      },
      dayScopePackIds,
    });

    const proposal = bridge.proposal;
    const auth = bridge.authoritative;
    const verification = this.toLegacyVerification(auth, bridge.preflight);
    const status = this.mapStatus(auth, arrange, solved.response.status);

    const result: BuildInitialPlanProposalResult = {
      tripId,
      proposalId: proposal.proposalId,
      status,
      arrangeInputHash: cacheHash,
      proposal: {
        ...proposal,
        verificationSummary: verification.summary,
        writesPlanVersion: false,
      },
      verification,
      preflight: bridge.preflight,
      authoritativeVerification: auth,
      verificationSnapshot: bridge.snapshot,
      unresolvedEntities: arrange.unresolvedEntities,
      decisions: solved.decisions,
      writesPlanVersion: false,
      planVersionWriteCount: 0,
    };

    if (result.writesPlanVersion !== false || proposal.writesPlanVersion !== false) {
      throw new Error('Initial Plan Proposal must not write PlanVersion');
    }
    if (!auth.allowConfirm && status === 'READY_FOR_PREVIEW' && auth.aggregateOutcome === 'EXECUTION_BLOCK') {
      throw new Error('EXECUTION_BLOCK must not be READY_FOR_PREVIEW');
    }

    this.proposalStore.put(result);
    this.logger.log(
      `InitialPlanProposal trip=${tripId} status=${status} auth=${auth.aggregateOutcome} dominant=${auth.audit.dominant_cid} writesPlanVersion=false`,
    );
    return result;
  }

  getProposal(tripId: string, proposalId: string): BuildInitialPlanProposalResult | undefined {
    const row = this.proposalStore.getByProposalId(proposalId);
    if (!row || row.tripId !== tripId) return undefined;
    return row;
  }

  private mapStatus(
    auth: NonNullable<BuildInitialPlanProposalResult['authoritativeVerification']>,
    arrange: InitialPlanArrangeInput,
    solverStatus: string,
  ): BuildInitialPlanProposalStatus {
    if (solverStatus === 'INFEASIBLE') return 'NO_FEASIBLE_PLAN';
    if (
      auth.status === 'BLOCKED' ||
      auth.status === 'MANUAL_REVIEW_REQUIRED' ||
      auth.aggregateOutcome === 'EXECUTION_BLOCK' ||
      auth.aggregateOutcome === 'BLOCK'
    ) {
      return 'NO_FEASIBLE_PLAN';
    }
    if (arrange.unresolvedEntities.some((u) => u.severity === 'ERROR')) {
      return 'PARTIAL';
    }
    if (auth.allowPreview) return 'READY_FOR_PREVIEW';
    return 'PARTIAL';
  }

  private toLegacyVerification(
    auth: NonNullable<BuildInitialPlanProposalResult['authoritativeVerification']>,
    preflight: NonNullable<BuildInitialPlanProposalResult['preflight']>,
  ): InitialPlanVerification {
    const status =
      auth.status === 'BLOCKED' || auth.status === 'MANUAL_REVIEW_REQUIRED'
        ? 'INFEASIBLE'
        : auth.status === 'REPAIR_REQUIRED'
          ? 'REPAIR_REQUIRED'
          : auth.status === 'VERIFIED_WITH_CONFIRMATIONS'
            ? 'VERIFIED_WITH_CONFIRMATIONS'
            : 'VERIFIED';
    return {
      status,
      summary: {
        status,
        pass: auth.allowPreview && auth.status !== 'BLOCKED',
        repaired: false,
        repairAttempts: 0,
        blockingCodes: auth.audit.blockingCids,
        warnings: [
          `preflight:${preflight.status}`,
          ...auth.assessments
            .filter((a) => a.status === 'WARN' || a.status === 'NEED_CONFIRM')
            .map((a) => a.cid),
        ],
        findings: auth.assessments
          .filter((a) => a.status !== 'PASS')
          .map((a) => ({
            code: a.cid,
            severity:
              a.status === 'EXECUTION_BLOCK'
                ? ('EXECUTION_BLOCK' as const)
                : a.status === 'BLOCK'
                  ? ('BLOCK' as const)
                  : ('WARN' as const),
            message: a.basis,
            dayIndex: a.affectedDayIndex,
            itemId: a.affectedItemIds?.[0],
            placeId: undefined,
          })),
      },
      executionBlocked:
        auth.aggregateOutcome === 'EXECUTION_BLOCK' || !auth.allowConfirm,
      writesPlanVersion: false,
    };
  }

  private buildNoFeasibleResult(input: {
    tripId: string;
    arrangeInputHash: string;
    arrange: InitialPlanArrangeInput;
    seed: InitialPlanSeedResult;
    decisions: InitialPlanDecision[];
    startDate: string;
    endDate: string;
  }): BuildInitialPlanProposalResult {
    const bundle = this.adapter.adapt(input.arrange, {
      startDate: input.startDate,
      endDate: input.endDate,
    });
    const verification: InitialPlanVerification = {
      status: 'INFEASIBLE',
      summary: {
        status: 'INFEASIBLE',
        pass: false,
        repaired: false,
        repairAttempts: 0,
        blockingCodes: ['NO_FEASIBLE_CANDIDATE'],
        warnings: [],
        findings: [
          {
            code: 'NO_FEASIBLE_CANDIDATE',
            severity: 'BLOCK',
            message: 'Preview arrangement engine produced no feasible day plan',
          },
        ],
      },
      executionBlocked: true,
      writesPlanVersion: false,
    };
    const proposal = this.proposalBuilder.build({
      tripId: input.tripId,
      seed: input.seed,
      arrange: input.arrange,
      bundle,
      candidate: {
        candidateId: 'empty',
        operation: 'REROUTE',
        label: 'empty',
        dayPlans: [],
      },
      verification,
    });
    return {
      tripId: input.tripId,
      proposalId: proposal.proposalId,
      status: 'NO_FEASIBLE_PLAN',
      arrangeInputHash: input.arrangeInputHash,
      proposal,
      verification,
      unresolvedEntities: input.arrange.unresolvedEntities,
      decisions: input.decisions,
      writesPlanVersion: false,
      planVersionWriteCount: 0,
    };
  }

  private toCreateDto(command: BuildInitialPlanProposalCommand): CreateIcelandSelfDriveTripDto {
    const c = command.createInput;
    return {
      destinationCode: (c.destinationCode as 'IS') ?? 'IS',
      productLine:
        (c.productLine as typeof PRODUCT_LINE_ICELAND_SELF_DRIVE) ??
        PRODUCT_LINE_ICELAND_SELF_DRIVE,
      dateRange: c.dateRange,
      travelerCount: c.travelerCount ?? 2,
      startLocationCode: (c.startLocationCode as 'keflavik') ?? 'keflavik',
      endLocationCode: (c.endLocationCode as 'keflavik') ?? 'keflavik',
      endSameAsStart: c.endSameAsStart ?? true,
      vehicleAcquisition: (c.vehicleAcquisition as 'rent') ?? 'rent',
      regionIds: c.regionIds as CreateIcelandSelfDriveTripDto['regionIds'],
      bookings: c.bookings as CreateIcelandSelfDriveTripDto['bookings'],
    };
  }
}

function hashToSeed(tripId: string): number {
  const h = createHash('sha256').update(tripId).digest();
  return h.readUInt32BE(0) % 1_000_000;
}
