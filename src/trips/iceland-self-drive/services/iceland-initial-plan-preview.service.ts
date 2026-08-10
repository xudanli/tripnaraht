/**
 * Trip Shell + Initial Plan Preview / Confirm application service.
 * Confirm persists acknowledgments only. Never writes PlanVersion.
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { IcelandTripCreateOrchestrator } from './iceland-trip-create.orchestrator';
import { IcelandTripShellRepository } from './iceland-trip-shell.repository';
import { IcelandStoredProposalRepository } from './iceland-stored-proposal.repository';
import type {
  ApplyProposalRequest,
  ApplyProposalResponse,
  AppliedInitialPlanItem,
  AppliedInitialPlanVersion,
  ConfirmProposalRequest,
  ConfirmProposalResponse,
  CreateProposalResponse,
  CreateTripShellRequest,
  CreateTripShellResponse,
  IcelandTripShellContextPayload,
  InitialPlanGenerationTrace,
  InitialPlanPreviewResponse,
  ProposalConfirmationRecord,
  StoredInitialPlanProposal,
  StoredProposalStatus,
  TripShell,
} from '../types/iceland-trip-shell-preview.types';
import type {
  BuildInitialPlanProposalResult,
  ProposalIssue,
} from '../types/iceland-initial-plan-proposal.types';
import type { ConstraintAssessmentEvidence } from '../types/iceland-initial-plan-verification.types';
import { IcelandAppliedPlanRepository } from './iceland-applied-plan.repository';
import { IcelandInitialPlanPrismaApplyService } from './iceland-initial-plan-prisma-apply.service';
import { IcelandShadowVsPlatformContrastService } from './iceland-shadow-vs-platform-contrast.service';
import { toContrastPreviewSummary } from '../types/iceland-shadow-vs-platform-contrast-preview.types';
import type { ShadowVsPlatformContrastReport } from '../types/iceland-shadow-vs-platform-contrast.types';
import { bootstrapShellDrivingSettings } from '../utils/iceland-shell-driving-settings.util';

const PIPELINE_VERSION = 'iceland-initial-plan-preview@v1';
const GOLDEN_SET_VERSION = '2026-07-qa1';
const RULE_SET_VERSION = 'iceland-shadow-unified@v1';

@Injectable()
export class IcelandInitialPlanPreviewService {
  private readonly logger = new Logger(IcelandInitialPlanPreviewService.name);
  private readonly inflight = new Map<string, Promise<CreateProposalResponse>>();
  readonly generationTraces: InitialPlanGenerationTrace[] = [];

  constructor(
    private readonly shells: IcelandTripShellRepository,
    private readonly proposals: IcelandStoredProposalRepository,
    private readonly appliedPlans: IcelandAppliedPlanRepository,
    private readonly prismaApply: IcelandInitialPlanPrismaApplyService,
    private readonly orchestrator: IcelandTripCreateOrchestrator,
    private readonly shadowVsPlatform: IcelandShadowVsPlatformContrastService,
  ) {}

  createTripShell(
    ownerId: string,
    body: CreateTripShellRequest,
  ): CreateTripShellResponse {
    if (body.destinationCode !== 'IS') {
      throw new ConflictException({
        code: 'UNSUPPORTED_DESTINATION',
        message: 'Only IS self-drive shells are supported on this endpoint',
      });
    }

    const vehicle = normalizeVehicle(body.vehicleProfile);
    const drivingSettings = bootstrapShellDrivingSettings(vehicle);
    const contextPayload: IcelandTripShellContextPayload = {
      regionIds: body.regionIds,
      vehicleProfile: vehicle,
      drivingSettings,
      requestedPlaceIds: toNums(body.requestedPlaceIds),
      excludedPlaceIds: toNums(body.excludedPlaceIds),
      confirmedLodgings: (body.confirmedLodgings ?? []).map((l) => ({
        placeId: l.placeId != null ? Number(l.placeId) : undefined,
        label: l.label,
        nightDate: l.nightDate,
      })),
      preferences: body.preferences,
      startLocationCode: body.startLocationCode ?? 'keflavik',
      endLocationCode: body.endLocationCode ?? 'keflavik',
      endSameAsStart: body.endSameAsStart ?? true,
      travelerCount: body.travelerCount ?? 2,
    };

    const contextHash = hashJson({
      dates: { startDate: body.startDate, endDate: body.endDate },
      ...contextPayload,
    });

    const now = new Date().toISOString();
    const shell: TripShell = {
      tripId: `trip_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      ownerId,
      lifecycle: 'PLANNING',
      creationStatus: 'CONTEXT_SAVED',
      destinationCode: 'IS',
      travelDates: { startDate: body.startDate, endDate: body.endDate },
      contextVersion: 1,
      contextHash,
      contextPayload,
      createdAt: now,
      updatedAt: now,
    };

    this.shells.create(shell);
    this.logger.log(
      `TripShell created tripId=${shell.tripId} contextHash=${contextHash} writesPlanVersion=false`,
    );

    return {
      tripId: shell.tripId,
      creationStatus: 'CONTEXT_SAVED',
      contextVersion: 1,
      contextHash,
      writesPlanVersion: false,
    };
  }

  async createProposal(
    ownerId: string,
    tripId: string,
    idempotencyKey?: string,
  ): Promise<CreateProposalResponse> {
    const shell = this.requireOwnedShell(ownerId, tripId);

    const idem = idempotencyKey ?? `auto:${shell.contextHash}`;
    const lockKey = `${ownerId}::${tripId}::${shell.contextVersion}::${idem}`;

    const existing = this.proposals.getByIdempotency(
      tripId,
      shell.contextVersion,
      idem,
    );
    if (existing && existing.status !== 'STALE' && existing.status !== 'SUPERSEDED') {
      return this.toCreateResponse(existing);
    }

    const inflight = this.inflight.get(lockKey);
    if (inflight) return inflight;

    const run = this.runGenerate(shell, idem);
    this.inflight.set(lockKey, run);
    try {
      return await run;
    } finally {
      this.inflight.delete(lockKey);
    }
  }

  getProposal(
    ownerId: string,
    tripId: string,
    proposalId: string,
  ): InitialPlanPreviewResponse {
    this.requireOwnedShell(ownerId, tripId);
    const row = this.proposals.get(proposalId);
    if (!row || row.tripId !== tripId) {
      throw new NotFoundException({ code: 'PROPOSAL_NOT_FOUND', message: 'Proposal not found' });
    }
    return this.toPreviewResponse(row);
  }

  getCurrentProposal(ownerId: string, tripId: string): InitialPlanPreviewResponse {
    const shell = this.requireOwnedShell(ownerId, tripId);
    if (!shell.activeProposalId) {
      throw new NotFoundException({
        code: 'NO_ACTIVE_PROPOSAL',
        message: 'No active initial plan proposal',
      });
    }
    return this.getProposal(ownerId, tripId, shell.activeProposalId);
  }

  /**
   * Confirm Contract: acknowledge required confirmations.
   * Does not write PlanVersion. Apply remains closed (canApply=false).
   */
  confirmProposal(
    ownerId: string,
    tripId: string,
    proposalId: string,
    body: ConfirmProposalRequest,
  ): ConfirmProposalResponse {
    this.requireOwnedShell(ownerId, tripId);
    const row = this.proposals.get(proposalId);
    if (!row || row.tripId !== tripId) {
      throw new NotFoundException({ code: 'PROPOSAL_NOT_FOUND', message: 'Proposal not found' });
    }

    if (row.status === 'CONFIRMED' && row.confirmationRecord) {
      return this.toConfirmResponse(row);
    }

    if (row.status === 'STALE' || row.status === 'SUPERSEDED') {
      throw new ConflictException({
        code: 'PROPOSAL_STALE',
        message: 'Proposal is stale; regenerate Preview before Confirm',
      });
    }

    if (!computeCanConfirm(row)) {
      throw new ConflictException({
        code: 'CONFIRM_NOT_ALLOWED',
        message:
          'Shadow VERIFY does not allow Confirm (blocked, failed, or already closed)',
        details: {
          status: row.status,
          allowConfirm: row.verification.allowConfirm,
          aggregateOutcome: row.verification.aggregateOutcome,
        },
      });
    }

    const requiredIds = row.confirmations
      .filter((c) => c.blockingApply)
      .map((c) => c.confirmationId);
    const ack = new Set(body.acknowledgedConfirmationIds ?? []);
    const missing = requiredIds.filter((id) => !ack.has(id));
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'CONFIRMATIONS_INCOMPLETE',
        message: 'All blockingApply confirmations must be acknowledged',
        details: { missingConfirmationIds: missing },
      });
    }

    const unknown = [...ack].filter(
      (id) => !row.confirmations.some((c) => c.confirmationId === id),
    );
    if (unknown.length > 0) {
      throw new BadRequestException({
        code: 'UNKNOWN_CONFIRMATION_IDS',
        message: 'One or more confirmationIds are not on this proposal',
        details: { unknownConfirmationIds: unknown },
      });
    }

    const record: ProposalConfirmationRecord = {
      confirmedAt: new Date().toISOString(),
      confirmedBy: ownerId,
      acknowledgedConfirmationIds: [...ack],
      note: body.note,
    };

    const confirmed: StoredInitialPlanProposal = {
      ...row,
      status: 'CONFIRMED',
      confirmationRecord: record,
      writesPlanVersion: false,
    };
    this.proposals.put(confirmed);
    this.proposals.planVersionWriteCount = 0;

    this.shells.update(tripId, {
      creationStatus: 'PREVIEW_CONFIRMED',
      activeProposalId: confirmed.proposalId,
    });

    this.logger.log(
      `Proposal confirmed proposal=${proposalId} trip=${tripId} acks=${record.acknowledgedConfirmationIds.length} writesPlanVersion=false`,
    );

    return this.toConfirmResponse(confirmed);
  }

  /**
   * Apply Contract: materialize confirmed dayPlans into Prisma Trip/ItineraryItem
   * + Iceland PlanVersion audit record.
   * Provenance remains day-assign + Shadow VERIFY + user Confirm — not OR-Tools.
   */
  async applyProposal(
    ownerId: string,
    tripId: string,
    proposalId: string,
    body: ApplyProposalRequest = {},
  ): Promise<ApplyProposalResponse> {
    const shell = this.requireOwnedShell(ownerId, tripId);
    const row = this.proposals.get(proposalId);
    if (!row || row.tripId !== tripId) {
      throw new NotFoundException({ code: 'PROPOSAL_NOT_FOUND', message: 'Proposal not found' });
    }

    const existingApplied = this.appliedPlans.getByProposal(proposalId);
    if (row.status === 'APPLIED' && existingApplied) {
      return this.toApplyResponse(row, existingApplied);
    }

    if (row.status === 'STALE' || row.status === 'SUPERSEDED') {
      throw new ConflictException({
        code: 'PROPOSAL_STALE',
        message: 'Proposal is stale; regenerate and Confirm before Apply',
      });
    }

    if (!computeCanApply(row, shell)) {
      throw new ConflictException({
        code: 'APPLY_NOT_ALLOWED',
        message: 'Apply requires CONFIRMED proposal with matching shell context',
        details: {
          status: row.status,
          hasConfirmation: Boolean(row.confirmationRecord),
        },
      });
    }

    if (
      body.contextVersion != null &&
      body.contextVersion !== shell.contextVersion
    ) {
      throw new ConflictException({
        code: 'CONTEXT_VERSION_CONFLICT',
        message: 'contextVersion does not match trip shell',
      });
    }
    if (body.contextHash != null && body.contextHash !== shell.contextHash) {
      throw new ConflictException({
        code: 'CONTEXT_HASH_CONFLICT',
        message: 'contextHash does not match trip shell',
      });
    }
    if (
      row.contextVersion !== shell.contextVersion ||
      row.contextHash !== shell.contextHash
    ) {
      throw new ConflictException({
        code: 'CONTEXT_STALE',
        message: 'Proposal context no longer matches shell; regenerate Preview',
      });
    }

    const projected = projectDayPlansToAppliedItems(row);
    if (projected.length === 0) {
      throw new BadRequestException({
        code: 'NO_APPLIABLE_ITEMS',
        message: 'Confirmed proposal has no place-backed items to apply',
      });
    }

    const planVersionId = `pv_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const prismaResult = await this.prismaApply.materialize({
      shell,
      ownerId,
      proposal: row,
      planVersionId,
      projectedItems: projected,
    });
    const version = prismaResult.version;

    this.appliedPlans.put(version);

    const appliedRow: StoredInitialPlanProposal = {
      ...row,
      status: 'APPLIED',
      appliedPlanVersionId: planVersionId,
      writesPlanVersion: true,
    };

    const prismaTripId = prismaResult.prismaTripId ?? shell.tripId;
    try {
      const postApply = await this.shadowVsPlatform.contrastPostApply({
        prismaTripId,
        proposalId,
        shadowAllowConfirmAtVerify: row.verification.allowConfirm,
        userId: ownerId,
      });
      if (appliedRow.shadowVsPlatformContrast) {
        appliedRow.shadowVsPlatformContrast = {
          ...appliedRow.shadowVsPlatformContrast,
          postApplyBundle: postApply,
        };
      }
      this.logger.log(
        `PostApply bundle contrast proposal=${proposalId} gateAligned=${postApply.gateAlignedWithShadow} worst=${postApply.bundle.worstAggregateStatus} error=${postApply.error ?? 'none'}`,
      );
    } catch (err) {
      this.logger.warn(
        `PostApply bundle contrast skipped proposal=${proposalId}: ${(err as Error).message}`,
      );
    }

    this.proposals.put(appliedRow);

    this.shells.update(tripId, {
      creationStatus: 'ITINERARY_APPLIED',
      activeProposalId: proposalId,
      activePlanVersionId: planVersionId,
    });

    this.logger.log(
      `Proposal applied proposal=${proposalId} planVersion=${planVersionId} items=${version.appliedItemCount} persistence=prisma writesPlanVersion=true`,
    );

    return this.toApplyResponse(appliedRow, version);
  }

  /** Test spy — PlanVersion writes only via Apply */
  getPlanVersionWriteCount(): number {
    return this.appliedPlans.planVersionWriteCount;
  }

  private async runGenerate(
    shell: TripShell,
    idempotencyKey: string,
  ): Promise<CreateProposalResponse> {
    const started = Date.now();
    this.shells.update(shell.tripId, { creationStatus: 'GENERATING_PREVIEW' });

    const ctx = shell.contextPayload;
    let result: BuildInitialPlanProposalResult;
    try {
      result = await this.orchestrator.buildInitialPlanProposal({
        tripId: shell.tripId,
        skipTripShell: true,
        createInput: {
          destinationCode: 'IS',
          dateRange: shell.travelDates,
          regionIds: ctx.regionIds,
          startLocationCode: ctx.startLocationCode,
          endLocationCode: ctx.endLocationCode,
          endSameAsStart: ctx.endSameAsStart,
          travelerCount: ctx.travelerCount,
          vehicleAcquisition: 'rent',
          bookings: (ctx.confirmedLodgings ?? [])
            .filter((l) => l.placeId != null)
            .map((l, i) => ({
              clientId: `lodging-${i}`,
              kind: 'lodging' as const,
              name: l.label ?? `Lodging ${l.placeId}`,
              placeId: l.placeId,
              // Preserve undated: empty startDate → seed fills all nights
              startDate: l.nightDate ?? '',
            })),
        },
        vehicleProfile: ctx.vehicleProfile,
        preferences: {
          mustIncludePlaceIds: ctx.requestedPlaceIds,
          excludePlaceIds: ctx.excludedPlaceIds,
          pace: ctx.preferences?.pace,
        },
        dailyDrivingLimitMin: ctx.preferences?.dailyDrivingLimitMin,
      });
    } catch (err) {
      this.shells.update(shell.tripId, { creationStatus: 'PREVIEW_FAILED' });
      this.logger.error(
        `Preview generation failed trip=${shell.tripId}: ${(err as Error).message}`,
      );
      throw err;
    }

    const auth = result.authoritativeVerification;
    const preflight = result.preflight;
    const status = mapStoredStatus(auth?.status, auth?.aggregateOutcome);
    const proposalHash = hashJson({
      days: result.proposal.days.map((d) => ({
        i: d.dayIndex,
        items: d.items.map((it) => it.placeId ?? it.itemId),
      })),
    });
    const verificationSnapshotHash = hashJson({
      outcome: auth?.aggregateOutcome,
      cids: auth?.assessments.map((a) => a.cid),
      dominant: auth?.audit.dominant_cid,
    });

    let shadowVsPlatformContrast: ShadowVsPlatformContrastReport | undefined;
    if (result.verificationSnapshot) {
      try {
        shadowVsPlatformContrast = await this.shadowVsPlatform.contrastAsync({
          snapshot: result.verificationSnapshot,
        });
        this.logger.log(
          `ShadowVsPlatform contrast proposal=${result.proposalId} gateAligned=${shadowVsPlatformContrast.gateAligned} mappedAligned=${shadowVsPlatformContrast.mappedAligned} gateway=${shadowVsPlatformContrast.platform.gateway?.overallStatus ?? 'none'}`,
        );
      } catch (err) {
        this.logger.warn(
          `ShadowVsPlatform contrast failed proposal=${result.proposalId}: ${(err as Error).message}`,
        );
      }
    }

    this.proposals.markAllStaleForTrip(shell.tripId);

    const stored: StoredInitialPlanProposal = {
      proposalId: result.proposalId,
      tripId: shell.tripId,
      proposalVersion: result.proposal.version,
      status,
      sourceEngine: 'ICELAND_COVERAGE_DAY_ASSIGN',
      verificationAuthority: 'ICELAND_SHADOW_UNIFIED_ASSESSMENT',
      contextVersion: shell.contextVersion,
      contextHash: shell.contextHash,
      arrangeInputHash: result.arrangeInputHash,
      proposalHash,
      verificationSnapshotHash,
      dayPlans: result.proposal.days,
      coverageSummary: result.proposal.coverageSummary,
      selectedRegions: result.proposal.selectedRegions,
      confirmations: result.proposal.requiredConfirmations,
      warnings: [
        ...result.proposal.unresolvedIssues.filter((i) => i.severity === 'WARNING'),
        ...(preflight?.issues
          .filter((i) => i.severity === 'WARN')
          .map((i) => ({
            code: i.code,
            severity: 'WARNING' as const,
            message: i.message,
            dayIndex: i.dayIndex,
          })) ?? []),
        ...(auth?.assessments ?? [])
          .filter((a) => a.status === 'WARN')
          .map((a) => mapAssessmentToIssue(a, 'WARNING')),
      ],
      blockingIssues: (auth?.assessments ?? [])
        .filter((a) => a.status === 'BLOCK' || a.status === 'EXECUTION_BLOCK')
        .map((a) => mapAssessmentToIssue(a, 'ERROR')),
      unresolvedEntities: result.unresolvedEntities,
      preflight: preflight ?? {
        status: 'PREFLIGHT_PASS',
        issues: [],
        authoritative: false,
        checkType: 'PREFLIGHT',
        writesPlanVersion: false,
      },
      verification: auth ?? {
        verificationId: 'missing',
        proposalId: result.proposalId,
        status: 'BLOCKED',
        aggregateOutcome: 'BLOCK',
        assessments: [],
        audit: {
          drift_vector: {
            dayAssignmentChanged: 0,
            selectedCandidateChanged: 0,
            excludedCandidateChanged: 0,
            durationChangedMin: 0,
            drivingChangedMin: 0,
            subregionScopeChanged: 0,
          },
          session_consistency_score: 1,
          consistencyBand: 'CONSISTENT',
          delta_reason: [],
          delta_utility: 0,
          blockingCids: [],
          confirmCids: [],
          affectedDayIndexes: [],
          criticalSlacks: [],
        },
        authoritative: true,
        allowConfirm: false,
        allowPreview: false,
        writesPlanVersion: false,
      },
      audit:
        auth?.audit ??
        ({
          drift_vector: {
            dayAssignmentChanged: 0,
            selectedCandidateChanged: 0,
            excludedCandidateChanged: 0,
            durationChangedMin: 0,
            drivingChangedMin: 0,
            subregionScopeChanged: 0,
          },
          session_consistency_score: 1,
          consistencyBand: 'CONSISTENT',
          delta_reason: [],
          delta_utility: 0,
          blockingCids: [],
          confirmCids: [],
          affectedDayIndexes: [],
          criticalSlacks: [],
        } as StoredInitialPlanProposal['audit']),
      shadowVsPlatformContrast,
      writesPlanVersion: false,
      createdAt: new Date().toISOString(),
      idempotencyKey,
    };

    this.proposals.put(stored);
    this.proposals.planVersionWriteCount = 0;

    const creationStatus =
      status === 'BLOCKED'
        ? 'PREVIEW_BLOCKED'
        : status === 'FAILED'
          ? 'PREVIEW_FAILED'
          : result.status === 'PARTIAL'
            ? 'PREVIEW_PARTIAL'
            : 'PREVIEW_READY';

    this.shells.update(shell.tripId, {
      creationStatus,
      activeProposalId: stored.proposalId,
    });

    this.generationTraces.push({
      traceId: randomUUID(),
      tripId: shell.tripId,
      proposalId: stored.proposalId,
      contextHash: shell.contextHash,
      pipelineVersion: PIPELINE_VERSION,
      goldenSetVersion: GOLDEN_SET_VERSION,
      ruleSetVersion: RULE_SET_VERSION,
      verificationProvider: 'ICELAND_SHADOW_UNIFIED_ASSESSMENT',
      preflightOutcome: stored.preflight.status,
      firstVerifyOutcome: auth?.aggregateOutcome ?? 'UNKNOWN',
      repairTriggered: Boolean(auth?.audit.delta_reason?.length),
      dominantCid: auth?.audit.dominant_cid,
      elapsedMs: Date.now() - started,
    });

    this.logger.log(
      `Preview proposal=${stored.proposalId} status=${status} auth=${auth?.aggregateOutcome} allowConfirm=${stored.verification.allowConfirm} writesPlanVersion=false`,
    );

    return this.toCreateResponse(stored);
  }

  private toCreateResponse(row: StoredInitialPlanProposal): CreateProposalResponse {
    const confirmAllowed = computeCanConfirm(row);
    const applyAllowed = row.status === 'CONFIRMED';
    return {
      tripId: row.tripId,
      proposalId: row.proposalId,
      status: row.status,
      previewAvailable: row.status !== 'FAILED',
      confirmAllowed,
      applyAllowed,
      writesPlanVersion: false,
      links: {
        self: `/api/iceland-self-drive/trips/${row.tripId}/initial-plan/proposals/${row.proposalId}`,
        ...(confirmAllowed
          ? {
              confirm: `/api/iceland-self-drive/trips/${row.tripId}/initial-plan/proposals/${row.proposalId}/confirm`,
            }
          : {}),
        ...(applyAllowed
          ? {
              apply: `/api/iceland-self-drive/trips/${row.tripId}/initial-plan/proposals/${row.proposalId}/apply`,
            }
          : {}),
      },
    };
  }

  private toConfirmResponse(row: StoredInitialPlanProposal): ConfirmProposalResponse {
    const record = row.confirmationRecord!;
    return {
      tripId: row.tripId,
      proposalId: row.proposalId,
      status: 'CONFIRMED',
      confirmedAt: record.confirmedAt,
      acknowledgedConfirmationIds: record.acknowledgedConfirmationIds,
      confirmAllowed: false,
      applyAllowed: true,
      writesPlanVersion: false,
      preview: this.toPreviewResponse(row),
      links: {
        self: `/api/iceland-self-drive/trips/${row.tripId}/initial-plan/proposals/${row.proposalId}/confirm`,
        preview: `/api/iceland-self-drive/trips/${row.tripId}/initial-plan/proposals/${row.proposalId}`,
        apply: `/api/iceland-self-drive/trips/${row.tripId}/initial-plan/proposals/${row.proposalId}/apply`,
      },
    };
  }

  private toApplyResponse(
    row: StoredInitialPlanProposal,
    version: AppliedInitialPlanVersion,
  ): ApplyProposalResponse {
    const summary = row.shadowVsPlatformContrast
      ? toContrastPreviewSummary(row.shadowVsPlatformContrast)
      : undefined;
    return {
      tripId: row.tripId,
      proposalId: row.proposalId,
      planVersionId: version.planVersionId,
      status: 'APPLIED',
      appliedAt: version.appliedAt,
      appliedItemCount: version.appliedItemCount,
      confirmAllowed: false,
      applyAllowed: false,
      writesPlanVersion: true,
      planVersionWriteCount: this.appliedPlans.planVersionWriteCount,
      persistence: version.persistence ?? 'prisma',
      prismaTripId: version.prismaTripId ?? row.tripId,
      preview: this.toPreviewResponse(row),
      calibration: summary?.postApplyBundle
        ? { postApplyBundle: summary.postApplyBundle }
        : undefined,
      links: {
        self: `/api/iceland-self-drive/trips/${row.tripId}/initial-plan/proposals/${row.proposalId}/apply`,
        preview: `/api/iceland-self-drive/trips/${row.tripId}/initial-plan/proposals/${row.proposalId}`,
        planVersion: `/api/iceland-self-drive/trips/${row.tripId}/initial-plan/plan-versions/${version.planVersionId}`,
      },
    };
  }

  private toPreviewResponse(row: StoredInitialPlanProposal): InitialPlanPreviewResponse {
    const placeIds = new Set(
      row.dayPlans.flatMap((d) =>
        d.items.map((i) => i.placeId).filter((x): x is number => x != null),
      ),
    );
    const drivingMinutes = row.dayPlans.reduce((s, d) => s + d.drivingMinutes, 0);
    const previewStatus =
      row.status === 'SUPERSEDED' || row.status === 'STALE'
        ? 'STALE'
        : row.status === 'VERIFIED' ||
            row.status === 'VERIFIED_WITH_CONFIRMATIONS' ||
            row.status === 'CONFIRMED' ||
            row.status === 'APPLIED' ||
            row.status === 'BLOCKED' ||
            row.status === 'FAILED'
          ? row.status
          : 'FAILED';

    const canConfirm = computeCanConfirm(row);
    const canApply = row.status === 'CONFIRMED' && Boolean(row.confirmationRecord);

    return {
      tripId: row.tripId,
      proposalId: row.proposalId,
      status: previewStatus,
      summary: {
        dayCount: row.dayPlans.length,
        selectedPlaceCount: placeIds.size,
        drivingMinutes,
        unresolvedEntityCount: row.unresolvedEntities.length,
      },
      days: row.dayPlans.map((d) => ({
        dayIndex: d.dayIndex,
        date: d.date,
        subregionId: d.subregionId,
        startAnchor: d.startAnchor
          ? {
              placeId: d.startAnchor.placeId,
              label: d.startAnchor.label,
              nightDate: d.startAnchor.nightDate,
              source: d.startAnchor.source,
            }
          : undefined,
        endAnchor: d.endAnchor
          ? {
              placeId: d.endAnchor.placeId,
              label: d.endAnchor.label,
              nightDate: d.endAnchor.nightDate,
              source: d.endAnchor.source,
            }
          : undefined,
        items: d.items.map((it) => ({
          itemId: it.itemId,
          placeId: it.placeId,
          label: it.label,
          startMin: it.startMin,
          endMin: it.endMin,
          selectedBecause: it.evidence.selectedBecause,
          excludedAlternatives: it.evidence.excludedAlternatives,
          visitClusterId: it.visitClusterId,
        })),
        drivingMinutes: d.drivingMinutes,
        activityMinutes: d.activityMinutes,
        warnings: d.warnings,
      })),
      coverage: row.coverageSummary,
      confirmations: row.confirmations,
      warnings: row.warnings,
      blockingIssues: row.blockingIssues,
      verification: {
        aggregateOutcome: row.verification.aggregateOutcome,
        dominantCid: row.audit.dominant_cid,
        sessionConsistencyScore: row.audit.session_consistency_score,
        authoritative: true,
        authorityProvider: 'ICELAND_SHADOW_UNIFIED_ASSESSMENT',
        allowConfirm: row.verification.allowConfirm,
      },
      confirmation: row.confirmationRecord,
      appliedPlanVersionId: row.appliedPlanVersionId,
      audit: {
        contextHash: row.contextHash,
        arrangeInputHash: row.arrangeInputHash,
        proposalHash: row.proposalHash,
        verificationSnapshotHash: row.verificationSnapshotHash,
        driftVector: row.audit.drift_vector,
      },
      capabilities: {
        canPreview: row.status !== 'FAILED',
        canConfirm,
        canApply,
      },
      calibration: row.shadowVsPlatformContrast
        ? {
            shadowVsPlatform: toContrastPreviewSummary(
              row.shadowVsPlatformContrast,
            ),
          }
        : undefined,
      productCopy: productCopyFor(row.status, row.verification.aggregateOutcome),
      writesPlanVersion: row.writesPlanVersion === true,
    };
  }

  /** Full contrast report (ops / debug). Does not affect Confirm/Apply. */
  getShadowVsPlatformContrast(
    ownerId: string,
    tripId: string,
    proposalId: string,
  ): ShadowVsPlatformContrastReport {
    this.requireOwnedShell(ownerId, tripId);
    const row = this.proposals.get(proposalId);
    if (!row || row.tripId !== tripId) {
      throw new NotFoundException({
        code: 'PROPOSAL_NOT_FOUND',
        message: 'Proposal not found',
      });
    }
    if (!row.shadowVsPlatformContrast) {
      throw new NotFoundException({
        code: 'CONTRAST_NOT_AVAILABLE',
        message:
          'Shadow vs platform contrast was not computed for this proposal',
      });
    }
    return row.shadowVsPlatformContrast;
  }

  private requireOwnedShell(ownerId: string, tripId: string): TripShell {
    const shell = this.shells.get(tripId);
    if (!shell) {
      throw new NotFoundException({ code: 'TRIP_NOT_FOUND', message: 'Trip shell not found' });
    }
    if (shell.ownerId !== ownerId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not trip owner' });
    }
    return shell;
  }
}

/** Confirm gate: Shadow VERIFY allowConfirm + eligible status + not already confirmed */
export function computeCanConfirm(row: StoredInitialPlanProposal): boolean {
  if (row.status === 'CONFIRMED' || row.status === 'APPLIED') return false;
  if (row.status === 'STALE' || row.status === 'SUPERSEDED' || row.status === 'FAILED') {
    return false;
  }
  if (row.status === 'BLOCKED' || row.status === 'GENERATING') return false;
  if (!row.verification.allowConfirm) return false;
  return (
    row.status === 'VERIFIED' || row.status === 'VERIFIED_WITH_CONFIRMATIONS'
  );
}

export function computeCanApply(
  row: StoredInitialPlanProposal,
  shell: TripShell,
): boolean {
  if (row.status !== 'CONFIRMED') return false;
  if (!row.confirmationRecord) return false;
  if (row.contextVersion !== shell.contextVersion) return false;
  if (row.contextHash !== shell.contextHash) return false;
  return true;
}

function projectDayPlansToAppliedItems(
  row: StoredInitialPlanProposal,
): AppliedInitialPlanItem[] {
  const items: AppliedInitialPlanItem[] = [];
  for (const day of row.dayPlans) {
    for (const it of day.items) {
      if (it.placeId == null) continue;
      if (it.kind === 'EXPERIENCE_OPTIONAL') continue;
      items.push({
        itineraryItemId: `ii_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        sourceItemId: it.itemId,
        dayIndex: day.dayIndex,
        date: day.date,
        placeId: it.placeId,
        label: it.label,
        startMin: it.startMin,
        endMin: it.endMin,
        startTime: minutesToHhMm(it.startMin),
        endTime: minutesToHhMm(it.endMin),
        kind: it.kind,
      });
    }
  }
  return items;
}

function minutesToHhMm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function mapStoredStatus(
  authStatus: string | undefined,
  outcome: string | undefined,
): StoredProposalStatus {
  if (authStatus === 'VERIFIED_WITH_CONFIRMATIONS' || outcome === 'NEED_CONFIRM') {
    return 'VERIFIED_WITH_CONFIRMATIONS';
  }
  if (authStatus === 'VERIFIED' || outcome === 'PASS' || outcome === 'WARN') {
    return 'VERIFIED';
  }
  if (
    authStatus === 'BLOCKED' ||
    outcome === 'BLOCK' ||
    outcome === 'EXECUTION_BLOCK'
  ) {
    return 'BLOCKED';
  }
  if (authStatus === 'REPAIR_REQUIRED' || outcome === 'REPAIR') {
    return 'BLOCKED';
  }
  return 'FAILED';
}

function productCopyFor(
  status: StoredProposalStatus,
  outcome: string,
): { title: string; body: string } {
  const title = '初始行程草案';
  if (status === 'APPLIED') {
    return {
      title: '初始行程已写入',
      body: '已确认的草案已写入行程（PlanVersion）。编排引擎为覆盖日分配 + 独立约束检查，并非 OR-Tools 权威优化闭环。',
    };
  }
  if (status === 'CONFIRMED') {
    return {
      title,
      body: '你已确认此初始行程草案。可以写入正式行程（Apply）；写入前仍可重新生成 Preview。',
    };
  }
  if (status === 'BLOCKED' || outcome === 'EXECUTION_BLOCK' || outcome === 'BLOCK') {
    return {
      title,
      body: '当前草案存在阻断条件，暂不能进入确认。已完成独立约束检查，尚未写入正式行程。',
    };
  }
  if (status === 'VERIFIED_WITH_CONFIRMATIONS') {
    return {
      title,
      body: '草案基本可行，但仍有事项需要确认。确认后仍不会自动写入正式行程。',
    };
  }
  return {
    title,
    body: '当前草案未发现阻断性约束，可以确认。确认后仍不会自动写入正式行程。',
  };
}

function normalizeVehicle(
  v: CreateTripShellRequest['vehicleProfile'],
): IcelandTripShellContextPayload['vehicleProfile'] {
  if (!v) return undefined;
  const driveType = v.driveType?.toUpperCase();
  const isFourWheel = driveType === '4WD' || driveType === 'AWD';
  return {
    ...v,
    is4wd: v.is4wd ?? isFourWheel,
    allowsFRoad: v.allowsFRoad ?? isFourWheel,
    allowsRiverCrossing:
      v.allowsRiverCrossing ?? v.riverCrossingQualified === true,
  };
}

function toNums(ids?: Array<string | number>): number[] | undefined {
  if (!ids?.length) return undefined;
  return ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
}

function hashJson(v: unknown): string {
  return createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 24);
}

function parseEvidenceInt(refs: string[], prefix: string): number | undefined {
  const raw = refs.find((r) => r.startsWith(prefix))?.slice(prefix.length);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseEvidenceStr(refs: string[], prefix: string): string | undefined {
  return refs.find((r) => r.startsWith(prefix))?.slice(prefix.length);
}

function humanizeLodgingBasis(basis: string, dayIndex?: number): string {
  const day = dayIndex != null ? `Day ${dayIndex}` : 'Overnight';
  switch (basis) {
    case 'missing_lodging_anchor_with_confirmed_stay':
      return `${day}: confirmed lodging was not applied as an overnight endAnchor`;
    case 'invalid_lodging_place':
      return `${day}: confirmed lodging place is invalid or not a Golden Set LODGING`;
    case 'end_anchor_vs_confirmed_lodging':
      return `${day}: overnight endAnchor does not match confirmed lodging`;
    case 'partial_night_soft_fill':
      return `${day}: soft Golden Set lodging fill (other nights have confirmed bookings)`;
    case 'uncovered_overnight_with_partial_confirmed':
      return `${day}: no overnight lodging while other nights have confirmed bookings`;
    case 'lodging_remote_from_day_scope':
      return `${day}: overnight lodging is remote from that day's activity packs`;
    default:
      return `${day}: lodging anchor issue (${basis})`;
  }
}

function mapAssessmentToIssue(
  a: ConstraintAssessmentEvidence,
  severity: 'WARNING' | 'ERROR',
): ProposalIssue {
  const placeId =
    parseEvidenceInt(a.evidenceRefs, 'expected:') ??
    parseEvidenceInt(a.evidenceRefs, 'lodging:') ??
    parseEvidenceInt(a.evidenceRefs, 'place:') ??
    parseEvidenceInt(a.evidenceRefs, 'confirmed:');
  const nightDate = parseEvidenceStr(a.evidenceRefs, 'night:');
  const message =
    a.cid === 'ICELAND_LODGING_ANCHOR_001'
      ? humanizeLodgingBasis(a.basis, a.affectedDayIndex)
      : a.basis;
  return {
    code: a.cid,
    severity,
    message,
    dayIndex: a.affectedDayIndex,
    placeId,
    nightDate,
  };
}
