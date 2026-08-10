/**
 * Fault injection: Independent VERIFY must overturn generator-friendly drafts.
 * Never writes PlanVersion.
 */

import { randomUUID } from 'crypto';
import { IcelandInitialPlanPreflightService } from './iceland-initial-plan-preflight.service';
import { IcelandShadowUnifiedAssessmentService } from './iceland-shadow-unified-assessment.service';
import { IcelandInitialPlanRepairOnceService } from './iceland-initial-plan-repair-once.service';
import { IcelandInitialPlanVerificationBridgeService } from './iceland-initial-plan-verification-bridge.service';
import type { InitialPlanProposal } from '../types/iceland-initial-plan-proposal.types';
import type { InitialPlanArrangeInput } from '../types/iceland-initial-plan-seed.types';
import type { InitialPlanVerificationSnapshot } from '../types/iceland-initial-plan-verification.types';
import {
  selectDominantCid,
} from '../utils/initial-plan-dominant-cid.util';
import {
  buildConsistencyFingerprint,
  computeSessionConsistencyScore,
} from '../utils/initial-plan-session-consistency.util';

function emptyArrange(over: Partial<InitialPlanArrangeInput> = {}): InitialPlanArrangeInput {
  return {
    tripId: 'fault-trip',
    writesPlanVersion: false,
    requiresPreviewConfirmApply: true,
    attractionCandidates: [],
    supportNodes: [],
    experienceCandidates: [],
    relations: [],
    dayScopeRules: {
      requireSubregionDayScopeByPack: { north: true, westfjords: true, highlands: true },
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
    ...over,
  };
}

function baseProposal(over: Partial<InitialPlanProposal> = {}): InitialPlanProposal {
  return {
    proposalId: randomUUID(),
    tripId: 'fault-trip',
    version: 1,
    days: [],
    selectedRegions: [],
    coverageSummary: [],
    requiredConfirmations: [],
    optionalExperiences: [],
    unresolvedIssues: [],
    solverMeta: {
      engine: 'ICELAND_COVERAGE_DAY_ASSIGN',
      strategy: 'test',
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
    ...over,
  };
}

function bridge() {
  return new IcelandInitialPlanVerificationBridgeService(
    new IcelandInitialPlanPreflightService(),
    new IcelandShadowUnifiedAssessmentService(),
    new IcelandInitialPlanRepairOnceService(),
  );
}

describe('Independent VERIFY fault injection', () => {
  const svc = bridge();

  it('A: 2WD + F-road place → BLOCK with ICELAND_VEHICLE_FROAD_001', () => {
    const proposal = baseProposal({
      days: [
        {
          dayIndex: 1,
          date: '2027-07-10',
          dayId: 'day-1',
          packIds: ['highlands'],
          items: [
            {
              itemId: 'item_landmannalaugar',
              placeId: 381108,
              label: 'Landmannalaugar',
              kind: 'ATTRACTION',
              startMin: 600,
              endMin: 720,
              evidence: {
                source: 'GOLDEN_SET',
                regionId: 'highlands',
                canonicalPlaceId: 381108,
                selectedBecause: ['INJECTED_FAULT'],
                gateOutcome: { status: 'PASS', codes: [] },
              },
              countsTowardAttractionCoverage: true,
            },
          ],
          drivingMinutes: 60,
          activityMinutes: 120,
          bufferMinutes: 30,
          feasibilityStatus: 'ok',
          warnings: [],
        },
      ],
    });

    const result = svc.verifyProposal({
      proposal,
      arrange: emptyArrange({
        attractionCandidates: [
          {
            canonicalPlaceId: 381108,
            label: 'L',
            regionId: 'highlands',
            packId: 'highlands',
            score: 80,
            countsTowardAttractionCoverage: true,
            relationGroupIds: [],
            evidence: {
              source: 'GOLDEN_SET',
              regionId: 'highlands',
              selectedBecause: [],
              gateOutcome: { status: 'PASS', codes: [] },
            },
          },
        ],
      }),
      tripContext: {
        startDate: '2027-07-10',
        endDate: '2027-07-10',
        regionIds: ['highlands'],
        vehicleProfile: { is4wd: false, allowsFRoad: false },
      },
      dayScopePackIds: ['highlands'],
    });

    expect(result.preflight.authoritative).toBe(false);
    expect(result.authoritative.authoritative).toBe(true);
    expect(result.authoritative.aggregateOutcome).toBe('BLOCK');
    expect(result.authoritative.audit.dominant_cid).toMatch(/ICELAND_VEHICLE_/);
    const froad = result.authoritative.assessments.find(
      (a) => a.cid === 'ICELAND_VEHICLE_FROAD_001',
    );
    expect(froad?.status).toBe('BLOCK');
    expect(froad?.slack).toBeLessThan(0);
    expect(result.writesPlanVersion).toBe(false);
    expect(result.planVersionWriteCount).toBe(0);
  });

  it('B: North same-day multi-subregion → BLOCK day-scope cid', () => {
    const proposal = baseProposal({
      days: [
        {
          dayIndex: 2,
          date: '2027-07-11',
          dayId: 'day-2',
          packIds: ['north'],
          items: [
            {
              itemId: 'ak',
              placeId: 381085,
              label: 'Akureyri',
              kind: 'ATTRACTION',
              startMin: 600,
              endMin: 660,
              evidence: {
                source: 'GOLDEN_SET',
                regionId: 'north',
                subregionId: 'north_west',
                selectedBecause: ['INJECT'],
                gateOutcome: { status: 'PASS', codes: [] },
              },
              countsTowardAttractionCoverage: true,
            },
            {
              itemId: 'detti',
              placeId: 381096,
              label: 'Dettifoss',
              kind: 'ATTRACTION',
              startMin: 720,
              endMin: 780,
              evidence: {
                source: 'GOLDEN_SET',
                regionId: 'north',
                subregionId: 'diamond_circle',
                selectedBecause: ['INJECT'],
                gateOutcome: { status: 'PASS', codes: [] },
              },
              countsTowardAttractionCoverage: true,
            },
          ],
          drivingMinutes: 180,
          activityMinutes: 120,
          bufferMinutes: 30,
          feasibilityStatus: 'ok',
          warnings: [],
        },
      ],
    });

    const result = svc.verifyProposal({
      proposal,
      arrange: emptyArrange({
        attractionCandidates: [
          {
            canonicalPlaceId: 381085,
            label: 'Ak',
            regionId: 'north',
            packId: 'north',
            subregionId: 'north_west',
            score: 50,
            countsTowardAttractionCoverage: true,
            relationGroupIds: [],
            evidence: {
              source: 'GOLDEN_SET',
              regionId: 'north',
              subregionId: 'north_west',
              selectedBecause: [],
              gateOutcome: { status: 'PASS', codes: [] },
            },
          },
          {
            canonicalPlaceId: 381096,
            label: 'D',
            regionId: 'north',
            packId: 'north',
            subregionId: 'diamond_circle',
            score: 50,
            countsTowardAttractionCoverage: true,
            relationGroupIds: [],
            evidence: {
              source: 'GOLDEN_SET',
              regionId: 'north',
              subregionId: 'diamond_circle',
              selectedBecause: [],
              gateOutcome: { status: 'PASS', codes: [] },
            },
          },
        ],
      }),
      tripContext: {
        startDate: '2027-07-10',
        endDate: '2027-07-12',
        regionIds: ['north'],
        vehicleProfile: { is4wd: true, allowsFRoad: true },
      },
      dayScopePackIds: ['north'],
    });

    const scope = result.authoritative.assessments.find((a) =>
      a.cid.includes('DAY_SCOPE_NORTH'),
    );
    expect(scope?.status).toBe('BLOCK');
    expect(scope?.slack).toBeLessThan(0);
    expect(scope?.affectedDayIndex).toBe(2);
    expect(result.authoritative.aggregateOutcome).toBe('BLOCK');
  });

  it('C: lodging mismatch → REPAIR sets endAnchor to confirmed booking', () => {
    const proposal = baseProposal({
      days: [
        {
          dayIndex: 1,
          date: '2027-07-10',
          dayId: 'day-1',
          packIds: ['golden_circle'],
          endAnchor: { placeId: 999999, label: 'Wrong hotel' },
          items: [
            {
              itemId: 'gullfoss',
              placeId: 381084,
              label: 'Gullfoss',
              kind: 'ATTRACTION',
              startMin: 600,
              endMin: 660,
              evidence: {
                source: 'GOLDEN_SET',
                regionId: 'golden_circle',
                selectedBecause: [],
                gateOutcome: { status: 'PASS', codes: [] },
              },
              countsTowardAttractionCoverage: true,
            },
          ],
          drivingMinutes: 40,
          activityMinutes: 60,
          bufferMinutes: 30,
          feasibilityStatus: 'ok',
          warnings: [],
        },
      ],
    });

    const result = svc.verifyProposal({
      proposal,
      arrange: emptyArrange({
        attractionCandidates: [
          {
            canonicalPlaceId: 381084,
            label: 'G',
            regionId: 'golden_circle',
            packId: 'golden_circle',
            score: 80,
            countsTowardAttractionCoverage: true,
            relationGroupIds: [],
            evidence: {
              source: 'GOLDEN_SET',
              regionId: 'golden_circle',
              selectedBecause: [],
              gateOutcome: { status: 'PASS', codes: [] },
            },
          },
        ],
      }),
      tripContext: {
        startDate: '2027-07-10',
        endDate: '2027-07-10',
        regionIds: ['golden_circle'],
        confirmedLodgingPlaceIds: [381045],
        confirmedLodgings: [
          { placeId: 381045, label: 'Vík Hostel', nightDate: '2027-07-10' },
        ],
        vehicleProfile: { is4wd: false },
      },
      dayScopePackIds: [],
    });

    expect(result.repair?.terminal).toBe(false);
    expect(result.repair?.writesPlanVersion).toBe(false);
    expect(result.authoritative.writesPlanVersion).toBe(false);
    expect(
      result.repair?.repairedCids.includes('ICELAND_LODGING_ANCHOR_001') ||
        result.authoritative.assessments.some(
          (a) => a.cid === 'ICELAND_LODGING_ANCHOR_001',
        ),
    ).toBe(true);
    expect(result.proposal.days[0]?.endAnchor?.placeId).toBe(381045);
    expect(result.proposal.days[0]?.endAnchor?.source).toBe('CONFIRMED_BOOKING');
  });

  it('D: experience CONFIRMED without booking proof → NEED_CONFIRM', () => {
    const snapshot: InitialPlanVerificationSnapshot = {
      verificationId: 'v1',
      tripId: 't',
      proposalId: 'p',
      proposalVersion: 1,
      proposalHash: 'h',
      contextHash: 'c',
      generatedBy: 'ICELAND_COVERAGE_DAY_ASSIGN',
      verificationMode: 'SHADOW',
      dayScopePackIds: [],
      unresolvedEntities: [],
      tripContext: {
        startDate: '2027-07-10',
        endDate: '2027-07-10',
        regionIds: ['south_coast'],
      },
      writesPlanVersion: false,
      days: [
        {
          dayIndex: 1,
          date: '2027-07-10',
          items: [
            {
              itemId: 'exp1',
              experienceProductId: 'exp_glacier_hike_skaftafell',
              durationMin: 180,
              bookingState: 'CONFIRMED',
              sourceEvidenceRefs: ['evidence:golden_set'], // no booking:
            },
          ],
          totalDrivingMin: 0,
          totalActivityMin: 180,
          plannedBufferMin: 30,
          activatedDayScopeRules: [],
        },
      ],
    };

    const auth = new IcelandShadowUnifiedAssessmentService().assess({
      snapshot,
      drift_vector: {
        dayAssignmentChanged: 0,
        selectedCandidateChanged: 0,
        excludedCandidateChanged: 0,
        durationChangedMin: 0,
        drivingChangedMin: 0,
        subregionScopeChanged: 0,
      },
    });

    expect(auth.aggregateOutcome).toBe('NEED_CONFIRM');
    expect(
      auth.assessments.some(
        (a) =>
          a.cid === 'ICELAND_EXPERIENCE_BOOKING_001' && a.status === 'NEED_CONFIRM',
      ),
    ).toBe(true);
  });

  it('E: Þórsmörk guided experience needs booking — not river self-drive EXECUTION_BLOCK', () => {
    const proposal = baseProposal({
      days: [
        {
          dayIndex: 4,
          date: '2027-07-13',
          dayId: 'day-4',
          packIds: ['highlands'],
          items: [
            {
              itemId: 'item_thorsmork_exp',
              experienceProductId: 'exp_thorsmork_superjeep',
              label: 'Þórsmörk super jeep / guided highland day',
              kind: 'EXPERIENCE_OPTIONAL',
              startMin: 600,
              endMin: 1080,
              evidence: {
                source: 'EXPERIENCE',
                regionId: 'highlands',
                selectedBecause: ['INJECT'],
                gateOutcome: {
                  status: 'WARN',
                  codes: ['NEEDS_BOOKING_VERIFICATION'],
                },
              },
              countsTowardAttractionCoverage: false,
            },
          ],
          drivingMinutes: 90,
          activityMinutes: 480,
          bufferMinutes: 30,
          feasibilityStatus: 'ok',
          warnings: [],
        },
      ],
      optionalExperiences: [
        {
          experienceProductId: 'exp_thorsmork_superjeep',
          label: 'Þórsmörk super jeep / guided highland day',
          regionId: 'highlands',
          status: 'NEEDS_BOOKING_VERIFICATION',
          meetingPlaceId: 381109,
          selectedBecause: ['golden_set_experience'],
          requiresBookingVerification: true,
        },
      ],
      requiredConfirmations: [
        {
          confirmationId: 'exp:exp_thorsmork_superjeep',
          kind: 'EXPERIENCE_BOOKING',
          message: 'Þórsmörk super jeep needs booking verification',
          experienceProductId: 'exp_thorsmork_superjeep',
          blockingApply: true,
        },
      ],
    });

    const result = svc.verifyProposal({
      proposal,
      arrange: emptyArrange({
        experienceCandidates: [
          {
            experienceProductId: 'exp_thorsmork_superjeep',
            label: 'Þórsmörk super jeep / guided highland day',
            regionId: 'highlands',
            packId: 'highlands',
            meetingPlaceId: 381109,
            regionAnchorPlaceId: 381109,
            bookingRequired: true,
            durationMinutes: 480,
            status: 'NEEDS_BOOKING_VERIFICATION',
            selectedBecause: ['golden_set_experience'],
            gateOutcome: {
              status: 'WARN',
              codes: ['NEEDS_BOOKING_VERIFICATION'],
            },
          },
        ],
      }),
      tripContext: {
        startDate: '2027-07-10',
        endDate: '2027-07-14',
        regionIds: ['highlands'],
        vehicleProfile: {
          is4wd: true,
          allowsFRoad: true,
          allowsRiverCrossing: false,
        },
      },
      dayScopePackIds: ['highlands'],
    });

    expect(
      result.authoritative.assessments.some(
        (a) => a.cid === 'ICELAND_VEHICLE_RIVER_001',
      ),
    ).toBe(false);
    expect(
      result.authoritative.assessments.some(
        (a) =>
          a.cid === 'ICELAND_EXPERIENCE_BOOKING_001' && a.status === 'NEED_CONFIRM',
      ),
    ).toBe(true);
  });

  it('audit: dominant_cid + session_consistency_score deterministic', () => {
    const assessments = [
      {
        cid: 'ICELAND_VEHICLE_FROAD_001',
        status: 'BLOCK' as const,
        slack: -1,
        basis: 'f',
        evidenceRefs: [],
      },
      {
        cid: 'ICELAND_DAY_DRIVE_CAP_001',
        status: 'WARN' as const,
        slack: 10,
        basis: 'd',
        evidenceRefs: [],
      },
    ];
    expect(selectDominantCid(assessments)).toBe('ICELAND_VEHICLE_FROAD_001');
    const fp = buildConsistencyFingerprint('BLOCK', assessments, 'ICELAND_VEHICLE_FROAD_001');
    expect(computeSessionConsistencyScore(fp, fp)).toBe(1);
  });
});
