/**
 * Write-safety: Independent VERIFY stack must not touch PlanVersion.
 */

import { IcelandInitialPlanPreflightService } from './iceland-initial-plan-preflight.service';
import { IcelandShadowUnifiedAssessmentService } from './iceland-shadow-unified-assessment.service';
import { IcelandInitialPlanRepairOnceService } from './iceland-initial-plan-repair-once.service';
import { IcelandInitialPlanVerificationBridgeService } from './iceland-initial-plan-verification-bridge.service';
import type { InitialPlanProposal } from '../types/iceland-initial-plan-proposal.types';
import type { InitialPlanArrangeInput } from '../types/iceland-initial-plan-seed.types';

describe('Independent VERIFY write safety', () => {
  it('bridge dependencies do not include PlanVersion / Apply services', () => {
    const bridge = new IcelandInitialPlanVerificationBridgeService(
      new IcelandInitialPlanPreflightService(),
      new IcelandShadowUnifiedAssessmentService(),
      new IcelandInitialPlanRepairOnceService(),
    );
    // Structural: only three deps — no prisma planVersion, no apply
    expect(bridge).toBeDefined();
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(bridge))).toEqual(
      expect.arrayContaining(['verifyProposal', 'toSnapshot']),
    );
  });

  it('full verify path reports planVersionWriteCount=0 and writesPlanVersion false', () => {
    const bridge = new IcelandInitialPlanVerificationBridgeService(
      new IcelandInitialPlanPreflightService(),
      new IcelandShadowUnifiedAssessmentService(),
      new IcelandInitialPlanRepairOnceService(),
    );

    const arrange: InitialPlanArrangeInput = {
      tripId: 'ws',
      writesPlanVersion: false,
      requiresPreviewConfirmApply: true,
      attractionCandidates: [
        {
          canonicalPlaceId: 381037,
          label: 'Thingvellir',
          regionId: 'golden_circle',
          packId: 'golden_circle',
          score: 80,
          countsTowardAttractionCoverage: true,
          relationGroupIds: [],
          evidence: {
            source: 'GOLDEN_SET',
            regionId: 'golden_circle',
            selectedBecause: ['golden_set'],
            gateOutcome: { status: 'PASS', codes: [] },
          },
        },
      ],
      supportNodes: [],
      experienceCandidates: [],
      relations: [],
      dayScopeRules: {
        requireSubregionDayScopeByPack: {},
        subregions: [],
        policy: {
          oneHighSpanSubregionPerNaturalDay: true,
          crossSubregionRequiresExplicitTransferDay: true,
          highlandsRequiresExplicitBranch: true,
          doNotCollapseSameRegionIntoSameDay: true,
        },
      },
      softAlternativePairs: [],
      coVisitClusters: [],
      parentChild: [],
      unresolvedEntities: [],
      catalogGaps: [],
      evidence: [],
    };

    const proposal: InitialPlanProposal = {
      proposalId: 'p1',
      tripId: 'ws',
      version: 1,
      days: [
        {
          dayIndex: 1,
          date: '2027-07-10',
          dayId: 'day-1',
          packIds: ['golden_circle'],
          items: [
            {
              itemId: 'i1',
              placeId: 381037,
              label: 'Thingvellir',
              kind: 'ATTRACTION',
              startMin: 600,
              endMin: 680,
              evidence: {
                source: 'GOLDEN_SET',
                regionId: 'golden_circle',
                selectedBecause: ['golden_set'],
                gateOutcome: { status: 'PASS', codes: [] },
              },
              countsTowardAttractionCoverage: true,
            },
          ],
          drivingMinutes: 30,
          activityMinutes: 80,
          bufferMinutes: 30,
          feasibilityStatus: 'ok',
          warnings: [],
        },
      ],
      selectedRegions: [],
      coverageSummary: [],
      requiredConfirmations: [],
      optionalExperiences: [],
      unresolvedIssues: [],
      solverMeta: {
        engine: 'ICELAND_COVERAGE_DAY_ASSIGN',
        strategy: 't',
        version: 't',
        elapsedMs: 0,
        seed: 1,
        candidateId: 'c',
        relationProjection: {
          parentChild: 0,
          coVisitClusters: 0,
          softAlternatives: 0,
          dayScopePacks: 0,
        },
      },
      verificationSummary: {
        status: 'VERIFIED',
        pass: true,
        repaired: false,
        repairAttempts: 0,
        blockingCodes: [],
        warnings: [],
        findings: [],
      },
      evidence: [],
      writesPlanVersion: false,
    };

    const result = bridge.verifyProposal({
      proposal,
      arrange,
      tripContext: {
        startDate: '2027-07-10',
        endDate: '2027-07-10',
        regionIds: ['golden_circle'],
      },
      dayScopePackIds: [],
    });

    expect(result.writesPlanVersion).toBe(false);
    expect(result.planVersionWriteCount).toBe(0);
    expect(result.preflight.writesPlanVersion).toBe(false);
    expect(result.snapshot.writesPlanVersion).toBe(false);
    expect(result.authoritative.writesPlanVersion).toBe(false);
    expect(result.authoritative.audit.session_consistency_score).toBeGreaterThanOrEqual(0.99);
  });
});
