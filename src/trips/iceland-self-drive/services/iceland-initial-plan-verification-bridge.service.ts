/**
 * Projects InitialPlanProposal → Verification Snapshot and runs Independent VERIFY.
 * Never writes PlanVersion. Never injects Apply / PlanVersion repository.
 */

import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import type { InitialPlanProposal } from '../types/iceland-initial-plan-proposal.types';
import type { InitialPlanArrangeInput } from '../types/iceland-initial-plan-seed.types';
import type {
  InitialPlanAuthoritativeVerification,
  InitialPlanPreflightResult,
  InitialPlanRepairResult,
  InitialPlanVerificationSnapshot,
  VerificationTripContext,
} from '../types/iceland-initial-plan-verification.types';
import { IcelandInitialPlanPreflightService } from './iceland-initial-plan-preflight.service';
import { IcelandShadowUnifiedAssessmentService } from './iceland-shadow-unified-assessment.service';
import { IcelandInitialPlanRepairOnceService } from './iceland-initial-plan-repair-once.service';
import { computeDriftVector } from '../utils/initial-plan-drift-vector.util';
import {
  buildConsistencyFingerprint,
} from '../utils/initial-plan-session-consistency.util';
import { resolvePlaceAccessFacts } from '../utils/iceland-place-access-facts.util';

export interface IndependentVerifyBridgeResult {
  preflight: InitialPlanPreflightResult;
  snapshot: InitialPlanVerificationSnapshot;
  authoritative: InitialPlanAuthoritativeVerification;
  repair?: InitialPlanRepairResult;
  /** Proposal after optional one repair (still must be re-verified) */
  proposal: InitialPlanProposal;
  writesPlanVersion: false;
  planVersionWriteCount: 0;
}

@Injectable()
export class IcelandInitialPlanVerificationBridgeService {
  constructor(
    private readonly preflight: IcelandInitialPlanPreflightService,
    private readonly shadowUnified: IcelandShadowUnifiedAssessmentService,
    private readonly repairOnce: IcelandInitialPlanRepairOnceService,
  ) {}

  /**
   * Full Independent VERIFY path with at most one repair + second VERIFY.
   */
  verifyProposal(input: {
    proposal: InitialPlanProposal;
    arrange: InitialPlanArrangeInput;
    tripContext: VerificationTripContext;
    dayScopePackIds: string[];
  }): IndependentVerifyBridgeResult {
    let proposal = input.proposal;
    const preflight = this.preflight.run({
      proposal,
      arrange: input.arrange,
      dayScopePackIds: input.dayScopePackIds,
    });

    const snapshot1 = this.toSnapshot({
      proposal,
      arrange: input.arrange,
      tripContext: input.tripContext,
      dayScopePackIds: input.dayScopePackIds,
    });

    const drift1 = computeDriftVector({
      arrange: input.arrange,
      proposal,
    });

    let authoritative = this.shadowUnified.assess({
      snapshot: snapshot1,
      drift_vector: drift1,
    });

    // Session consistency: re-assess identical snapshot → must be ~1.0
    const fp1 = buildConsistencyFingerprint(
      authoritative.aggregateOutcome,
      authoritative.assessments,
      authoritative.audit.dominant_cid,
    );
    const repeat = this.shadowUnified.assess({
      snapshot: snapshot1,
      drift_vector: drift1,
      priorFingerprint: fp1,
    });
    authoritative = {
      ...authoritative,
      audit: {
        ...authoritative.audit,
        session_consistency_score: repeat.audit.session_consistency_score,
        consistencyBand: repeat.audit.consistencyBand,
      },
    };

    let repair: InitialPlanRepairResult | undefined;
    let snapshot = snapshot1;

    if (authoritative.status === 'REPAIR_REQUIRED') {
      const repaired = this.repairOnce.repair({
        proposal,
        authoritative,
      });
      repair = repaired.repair;
      proposal = repaired.proposal;

      snapshot = this.toSnapshot({
        proposal,
        arrange: input.arrange,
        tripContext: input.tripContext,
        dayScopePackIds: input.dayScopePackIds,
      });
      const drift2 = computeDriftVector({
        arrange: input.arrange,
        proposal,
        priorProposal: input.proposal,
      });
      authoritative = this.shadowUnified.assess({
        snapshot,
        drift_vector: drift2,
        priorFingerprint: fp1,
      });

      // Second VERIFY still REPAIR → no loop; terminal BLOCKED / MANUAL_REVIEW
      if (authoritative.status === 'REPAIR_REQUIRED') {
        authoritative = {
          ...authoritative,
          status: 'MANUAL_REVIEW_REQUIRED',
          aggregateOutcome: 'BLOCK',
          allowConfirm: false,
          allowPreview: false,
        };
      }
    }

    // EXECUTION_BLOCK / BLOCK → no confirm
    if (
      authoritative.aggregateOutcome === 'EXECUTION_BLOCK' ||
      authoritative.aggregateOutcome === 'BLOCK'
    ) {
      authoritative = {
        ...authoritative,
        allowConfirm: false,
        allowPreview: authoritative.aggregateOutcome === 'BLOCK' ? false : false,
        status: 'BLOCKED',
      };
    }

    return {
      preflight,
      /** Final snapshot corresponding to `authoritative` (post-repair if any). */
      snapshot,
      authoritative,
      repair,
      proposal,
      writesPlanVersion: false,
      planVersionWriteCount: 0,
    };
  }

  /** Public for fault-injection tests */
  toSnapshot(input: {
    proposal: InitialPlanProposal;
    arrange: InitialPlanArrangeInput;
    tripContext: VerificationTripContext;
    dayScopePackIds: string[];
  }): InitialPlanVerificationSnapshot {
    const { proposal, arrange, tripContext } = input;
    const proposalHash = hashJson({
      id: proposal.proposalId,
      days: proposal.days.map((d) => ({
        i: d.dayIndex,
        items: d.items.map((it) => ({
          id: it.itemId,
          p: it.placeId,
          e: it.experienceProductId,
        })),
      })),
    });
    const contextHash = hashJson(tripContext);

    return {
      verificationId: randomUUID(),
      tripId: proposal.tripId,
      proposalId: proposal.proposalId,
      proposalVersion: proposal.version,
      proposalHash,
      contextHash,
      generatedBy: 'ICELAND_COVERAGE_DAY_ASSIGN',
      verificationMode: 'SHADOW',
      days: proposal.days.map((d) => ({
        dayIndex: d.dayIndex,
        date: d.date,
        startAnchor: d.startAnchor,
        endAnchor: d.endAnchor,
        lodgingAnchor: d.endAnchor,
        subregionId: d.subregionId,
        items: d.items.map((it) => {
          const access = resolvePlaceAccessFacts(it.placeId);
          const cand = arrange.attractionCandidates.find(
            (a) => a.canonicalPlaceId === it.placeId,
          );
          return {
            itemId: it.itemId,
            canonicalPlaceId: it.placeId,
            experienceProductId: it.experienceProductId,
            durationMin: it.endMin - it.startMin,
            startTime: undefined,
            endTime: undefined,
            roadRequirements: {
              requiresFroad: access.requiresFroad,
              requires4wd: access.requires4wd,
              riverCrossingRisk: access.riverCrossingRisk,
            },
            bookingState: it.experienceProductId
              ? 'NEEDS_BOOKING_VERIFICATION'
              : 'NOT_REQUIRED',
            sourceEvidenceRefs: it.evidence.selectedBecause.map(
              (s) => `evidence:${s}`,
            ),
            subregionId: it.evidence.subregionId ?? cand?.subregionId ?? access.subregionId,
            packId: cand?.packId ?? access.packId,
          };
        }),
        totalDrivingMin: d.drivingMinutes,
        totalActivityMin: d.activityMinutes,
        plannedBufferMin: d.bufferMinutes,
        activatedDayScopeRules: input.dayScopePackIds.map((p) => `pack:${p}`),
      })),
      tripContext,
      unresolvedEntities: arrange.unresolvedEntities,
      dayScopePackIds: input.dayScopePackIds,
      writesPlanVersion: false,
    };
  }
}

function hashJson(v: unknown): string {
  return createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 24);
}
