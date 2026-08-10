/**
 * Shadow vs platform contrast harness.
 * Peer (offline) + optional ConstraintEvaluationGateway + optional post-Apply buildBundle.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { IcelandShadowUnifiedAssessmentService } from './iceland-shadow-unified-assessment.service';
import { ConstraintEvaluationGatewayService } from '../../../decision-runtime/constraints/constraint-evaluation.gateway.service';
import { UnifiedConstraintAssessmentService } from '../../../decision-runtime/constraints/services/unified-constraint-assessment.service';
import { evaluatePlatformComparableRules } from '../peers/platform-comparable-rule.peer';
import { verificationSnapshotToEvaluatePlan } from '../adapters/verification-snapshot-to-evaluate-plan.adapter';
import { peerFindingsToGuardianAssertions } from '../adapters/peer-findings-to-guardian.adapter';
import {
  mapIcelandCidToPlatformKey,
  PLATFORM_TO_ICELAND_CID_MAP,
} from '../mapping/iceland-to-platform-cid.map';
import {
  contrastPostApplyBundle,
  type PostApplyBundleContrast,
} from '../utils/post-apply-bundle-contrast.util';
import type {
  ContrastMappedPair,
  ContrastSeverityBand,
  GatewayContrastLeg,
  ShadowVsPlatformContrastReport,
} from '../types/iceland-shadow-vs-platform-contrast.types';
import type {
  ConstraintAssessmentEvidence,
  InitialPlanDriftVector,
  InitialPlanVerificationSnapshot,
} from '../types/iceland-initial-plan-verification.types';
import type { ConstraintEvaluationStatus } from '../../../decision-runtime/constraints/contracts/constraint-assertion';
import type { CanonicalOverallStatus } from '../../../decision-runtime/constraints/contracts/canonical-constraint-report';

const ZERO_DRIFT: InitialPlanDriftVector = {
  dayAssignmentChanged: 0,
  selectedCandidateChanged: 0,
  excludedCandidateChanged: 0,
  durationChangedMin: 0,
  drivingChangedMin: 0,
  subregionScopeChanged: 0,
};

function icelandBand(
  status: ConstraintAssessmentEvidence['status'],
): ContrastSeverityBand {
  if (status === 'PASS') return 'PASS';
  if (status === 'WARN' || status === 'NEED_CONFIRM') return 'SOFT';
  return 'HARD';
}

function platformBand(status: ConstraintEvaluationStatus): ContrastSeverityBand {
  if (status === 'PASS') return 'PASS';
  if (status === 'BLOCK') return 'HARD';
  return 'SOFT';
}

function gatewayAllowConfirm(
  status: CanonicalOverallStatus,
): boolean | null {
  if (status === 'FEASIBLE' || status === 'CONDITIONALLY_FEASIBLE') return true;
  if (status === 'INFEASIBLE') return false;
  // UNVERIFIED = completeness / incomplete world — not Shadow Confirm peer
  return null;
}

function worstByCid(
  assessments: ConstraintAssessmentEvidence[],
): Map<string, ConstraintAssessmentEvidence> {
  const rank: Record<string, number> = {
    PASS: 0,
    WARN: 1,
    NEED_CONFIRM: 2,
    REPAIR: 3,
    BLOCK: 4,
    EXECUTION_BLOCK: 5,
  };
  const map = new Map<string, ConstraintAssessmentEvidence>();
  for (const a of assessments) {
    const prev = map.get(a.cid);
    if (!prev || (rank[a.status] ?? 0) > (rank[prev.status] ?? 0)) {
      map.set(a.cid, a);
    }
  }
  return map;
}

@Injectable()
export class IcelandShadowVsPlatformContrastService {
  private readonly logger = new Logger(IcelandShadowVsPlatformContrastService.name);

  constructor(
    private readonly shadowUnified: IcelandShadowUnifiedAssessmentService,
    @Optional()
    private readonly gateway?: ConstraintEvaluationGatewayService,
    @Optional()
    private readonly unifiedAssessment?: UnifiedConstraintAssessmentService,
  ) {}

  /** Sync peer-only contrast (unit fixtures / no Nest gateway). */
  contrast(input: {
    snapshot: InitialPlanVerificationSnapshot;
    fixtureId?: string;
    drift_vector?: InitialPlanDriftVector;
  }): ShadowVsPlatformContrastReport {
    return this.buildPeerReport(input);
  }

  /**
   * Peer + real Gateway.evaluatePlan (when gateway injected).
   * Peer findings BLOCK/WARNING projected as guardianAssertions for ingress.
   */
  async contrastAsync(input: {
    snapshot: InitialPlanVerificationSnapshot;
    fixtureId?: string;
    drift_vector?: InitialPlanDriftVector;
  }): Promise<ShadowVsPlatformContrastReport> {
    const report = this.buildPeerReport(input);
    if (!this.gateway) {
      report.notes.push(
        'ConstraintEvaluationGatewayService not injected — peer-only contrast.',
      );
      return report;
    }

    try {
      const { evaluatePlanInput } = verificationSnapshotToEvaluatePlan(
        input.snapshot,
      );
      const platform = evaluatePlatformComparableRules(input.snapshot);
      const guardianAssertions = peerFindingsToGuardianAssertions(
        input.snapshot.tripId,
        platform.findings,
      );
      const gatewayReport = await this.gateway.evaluatePlan({
        ...evaluatePlanInput,
        guardianAssertions,
      });
      const allowConfirm = gatewayAllowConfirm(gatewayReport.overallStatus);
      const gatewayLeg: GatewayContrastLeg = {
        overallStatus: gatewayReport.overallStatus,
        allowConfirm,
        gateCompareSkipped: allowConfirm === null,
        assertionConstraintTypes: [
          ...new Set(gatewayReport.assertions.map((a) => a.constraintType)),
        ],
        evaluationId: gatewayReport.evaluationId,
        peerIngressAssertionCount: guardianAssertions.length,
      };
      report.platform.gateway = gatewayLeg;
      if (allowConfirm === null) {
        report.gateAlignedWithGateway = undefined;
        report.notes.push(
          `Gateway evaluatePlan overallStatus=${gatewayLeg.overallStatus} peerIngress=${gatewayLeg.peerIngressAssertionCount} — UNVERIFIED completeness; Confirm-gate compare skipped`,
        );
      } else {
        report.gateAlignedWithGateway =
          report.iceland.allowConfirm === allowConfirm;
        report.notes.push(
          `Gateway evaluatePlan overallStatus=${gatewayLeg.overallStatus} peerIngress=${gatewayLeg.peerIngressAssertionCount}`,
        );
        if (report.gateAlignedWithGateway === false) {
          report.notes.push(
            `Gateway gate drift: iceland.allowConfirm=${report.iceland.allowConfirm} gateway.allowConfirm=${allowConfirm}`,
          );
        }
      }
    } catch (err) {
      this.logger.warn(
        `Gateway contrast failed trip=${input.snapshot.tripId}: ${(err as Error).message}`,
      );
      report.notes.push(`Gateway evaluatePlan failed: ${(err as Error).message}`);
    }

    return report;
  }

  /** Post-Apply secondary contrast via UnifiedConstraintAssessmentService.buildBundle. */
  async contrastPostApply(input: {
    prismaTripId: string;
    proposalId: string;
    shadowAllowConfirmAtVerify: boolean;
    userId?: string;
  }): Promise<PostApplyBundleContrast> {
    if (!this.unifiedAssessment) {
      return contrastPostApplyBundle({
        prismaTripId: input.prismaTripId,
        proposalId: input.proposalId,
        shadowAllowConfirmAtVerify: input.shadowAllowConfirmAtVerify,
        error: 'UnifiedConstraintAssessmentService not injected',
      });
    }

    try {
      const bundle = await this.unifiedAssessment.buildBundle(input.prismaTripId, {
        refresh: true,
        userId: input.userId,
      });
      return contrastPostApplyBundle({
        prismaTripId: input.prismaTripId,
        proposalId: input.proposalId,
        shadowAllowConfirmAtVerify: input.shadowAllowConfirmAtVerify,
        bundle,
      });
    } catch (err) {
      this.logger.warn(
        `Post-Apply buildBundle contrast failed trip=${input.prismaTripId}: ${(err as Error).message}`,
      );
      return contrastPostApplyBundle({
        prismaTripId: input.prismaTripId,
        proposalId: input.proposalId,
        shadowAllowConfirmAtVerify: input.shadowAllowConfirmAtVerify,
        error: (err as Error).message,
      });
    }
  }

  private buildPeerReport(input: {
    snapshot: InitialPlanVerificationSnapshot;
    fixtureId?: string;
    drift_vector?: InitialPlanDriftVector;
  }): ShadowVsPlatformContrastReport {
    const drift = input.drift_vector ?? ZERO_DRIFT;
    const iceland = this.shadowUnified.assess({
      snapshot: input.snapshot,
      drift_vector: drift,
    });
    const platform = evaluatePlatformComparableRules(input.snapshot);

    // Keep adapter warm for contract stability even when gateway absent.
    verificationSnapshotToEvaluatePlan(input.snapshot);

    const icelandByCid = worstByCid(iceland.assessments);
    const mapped: ContrastMappedPair[] = [];
    const mappedIcelandCids = new Set<string>();
    const mappedPlatformKeys = new Set<string>();

    for (const [cid, assessment] of icelandByCid) {
      const platformKey = mapIcelandCidToPlatformKey(cid);
      if (!platformKey) continue;
      mappedIcelandCids.add(cid);

      const peerFindings = platform.findings.filter(
        (f) => f.constraintKey === platformKey,
      );
      const worstPeer =
        peerFindings.find((f) => f.status === 'BLOCK') ??
        peerFindings.find((f) => f.status !== 'PASS') ??
        peerFindings[0];

      if (!worstPeer) {
        mapped.push({
          icelandCid: cid,
          platformKey,
          icelandStatus: assessment.status,
          platformStatus: 'UNKNOWN',
          icelandBand: icelandBand(assessment.status),
          platformBand: 'SOFT',
          aligned: icelandBand(assessment.status) === 'PASS',
          dayIndex: assessment.affectedDayIndex,
        });
        continue;
      }

      mappedPlatformKeys.add(platformKey);
      const iBand = icelandBand(assessment.status);
      const pBand = platformBand(worstPeer.status);
      mapped.push({
        icelandCid: cid,
        platformKey,
        icelandStatus: assessment.status,
        platformStatus: worstPeer.status,
        icelandBand: iBand,
        platformBand: pBand,
        aligned: iBand === pBand,
        dayIndex: assessment.affectedDayIndex ?? worstPeer.affectedDayIndex,
      });
    }

    const unmappedIcelandCids = [...icelandByCid.keys()].filter(
      (cid) => !mappedIcelandCids.has(cid),
    );

    const platformKeysPresent = [
      ...new Set(platform.findings.map((f) => f.constraintKey)),
    ];
    const unmappedPlatformKeys = platformKeysPresent.filter((key) => {
      if (mappedPlatformKeys.has(key)) return false;
      const icelandCid = PLATFORM_TO_ICELAND_CID_MAP[key];
      const icelandAssessment = icelandByCid.get(icelandCid);
      return !icelandAssessment;
    });

    const gateAligned = iceland.allowConfirm === platform.allowConfirm;
    const mappedAligned =
      mapped.length === 0 || mapped.every((m) => m.aligned);

    const notes: string[] = [
      'Platform peer is platform_comparable_rule_surface@v1 (offline keys), not Prisma UnifiedConstraintAssessmentService.',
      'Shadow remains Confirm/Apply authority until convergence is proven.',
      'River crossing converged: ICELAND_VEHICLE_RIVER_001 ↔ RIVER_CROSSING_SELF_DRIVE.',
      'Lodging converged: ICELAND_LODGING_ANCHOR_001 ↔ CONFIRMED_LODGING_ANCHOR.',
    ];
    if (!gateAligned) {
      notes.push(
        `Gate drift: iceland.allowConfirm=${iceland.allowConfirm} platform.allowConfirm=${platform.allowConfirm}`,
      );
    }

    return {
      schemaId: 'tripnara.iceland_shadow_vs_platform_contrast@v1',
      fixtureId: input.fixtureId,
      verificationId: input.snapshot.verificationId,
      proposalId: input.snapshot.proposalId,
      tripId: input.snapshot.tripId,
      contrastedAt: new Date().toISOString(),
      iceland: {
        aggregateOutcome: iceland.aggregateOutcome,
        status: iceland.status,
        allowConfirm: iceland.allowConfirm,
        cids: [...icelandByCid.keys()],
      },
      platform: {
        peerId: platform.peerId,
        overallStatus: platform.overallStatus,
        allowConfirm: platform.allowConfirm,
        constraintKeys: platformKeysPresent,
      },
      mapped,
      unmappedIcelandCids,
      unmappedPlatformKeys,
      gateAligned,
      mappedAligned,
      notes,
    };
  }
}
