import {
  projectTransportFromDecisionCases,
} from './decision-case-transport.util';
import { DECISION_CASE_METADATA_KEY } from '../../../decision-runtime/decision-cases/contracts/decision-case.types';
import {
  SEMANTIC_RENTAL_INSURANCE,
  SEMANTIC_VEHICLE_ROAD_FIT,
} from '../../../decision-runtime/decision-cases/publishers/iceland-p0-case.builders';
import { projectReadinessEvidence } from './project-readiness-evidence.util';
import {
  buildOverallReadinessCache,
  isOverallReadinessCacheFresh,
  readOverallReadinessCache,
} from './overall-readiness-cache.util';
import { assembleOverallReadinessSnapshot } from './assemble-overall-readiness.util';

describe('decision-case-transport.util', () => {
  it('detects open insurance shell as unresolved', () => {
    const meta = {
      [DECISION_CASE_METADATA_KEY]: {
        byProblemId: {
          dc_vehicle: {
            problemId: 'dc_vehicle',
            tripId: 't1',
            semanticKey: SEMANTIC_VEHICLE_ROAD_FIT,
            published: true,
            requiredness: 'BLOCKING',
            domain: 'TRANSPORT',
            workflowStatus: 'RESOLVED',
            resolvedOptionId: 'opt1',
            resolvedAt: '2026-07-15T00:00:00.000Z',
            title: '车型',
            summary: '',
            options: [],
            evidenceRefs: [],
            writebackTargets: [],
            sourceKind: 'REQUIRED_CHOICE',
            scope: 'TRIP',
            actionKind: 'SELECT',
            materiality: { total: 9, breakdown: {} },
            enrichmentStage: 'SHELL',
            type: 'SELECT',
            dimension: 'feasibility',
            enforcement: 'SOFT',
            createdAt: '2026-07-15T00:00:00.000Z',
            updatedAt: '2026-07-15T00:00:00.000Z',
          },
          dc_ins: {
            problemId: 'dc_ins',
            tripId: 't1',
            semanticKey: SEMANTIC_RENTAL_INSURANCE,
            published: true,
            requiredness: 'BLOCKING',
            domain: 'INSURANCE',
            workflowStatus: 'OPEN',
            title: '租车保险',
            summary: '',
            options: [],
            evidenceRefs: [],
            writebackTargets: [],
            sourceKind: 'REQUIRED_CHOICE',
            scope: 'TRIP',
            actionKind: 'SELECT',
            materiality: { total: 9, breakdown: {} },
            enrichmentStage: 'SHELL',
            type: 'SELECT',
            dimension: 'feasibility',
            enforcement: 'SOFT',
            createdAt: '2026-07-15T00:00:00.000Z',
            updatedAt: '2026-07-15T00:00:00.000Z',
          },
        },
        opportunitiesById: {},
      },
    };

    const proj = projectTransportFromDecisionCases(meta);
    expect(proj.vehicleResolved).toBe(true);
    expect(proj.insuranceResolved).toBe(false);
    expect(proj.insuranceOpen).toBe(true);
    expect(proj.openBlockingProblems.some((p) => p.id === 'dc_ins')).toBe(true);
  });
});

describe('project-readiness-evidence.util', () => {
  it('marks expired road evidence as critical', () => {
    const bundle = projectReadinessEvidence({
      tripId: 't1',
      memberCount: 1,
      calculatedAt: '2026-07-15T12:00:00.000Z',
      feasibilityProofs: [
        {
          id: 'p1',
          category: 'environment',
          evidenceType: 'OFFICIAL_API',
          evidenceSource: '道路局',
          conclusion: 'Route 1 开放',
          observedAt: '2026-07-10T00:00:00.000Z',
          validUntil: '2026-07-14T00:00:00.000Z',
          confidence: 1,
        },
      ],
    });
    expect(bundle.expiredCount).toBe(1);
    expect(bundle.hasExpiredCritical).toBe(true);
  });

  it('drives NEEDS_REVALIDATION via assemble', () => {
    const snapshot = assembleOverallReadinessSnapshot({
      tripId: 't1',
      memberCount: 1,
      countryCode: 'IS',
      isSelfDrive: true,
      calculatedAt: '2026-07-15T12:00:00.000Z',
      feasibility: {
        overallScore: 90,
        verdictStatus: 'EXECUTABLE',
        dimensions: [
          { key: 'schedule', score: 90 },
          { key: 'transport', score: 90 },
          { key: 'environment', score: 90 },
          { key: 'itinerary_completeness', score: 90 },
        ],
      },
      accommodation: {
        expectedNightCount: 2,
        coveredNightCount: 2,
        bookedNightCount: 2,
        needBookingNightCount: 0,
        missingDocumentCount: 0,
      },
      transport: {
        hasVehicleOrPrimaryMode: true,
        vehicleConfirmed: true,
        insuranceConfirmed: true,
      },
      members: {
        totalCount: 1,
        confirmedParticipationCount: 1,
        profilingCompletionRate: 100,
        openCriticalDecisionCount: 0,
      },
      feasibilityProofs: [
        {
          id: 'road',
          category: 'environment',
          evidenceType: 'official_api',
          conclusion: '开放',
          validUntil: '2026-07-01T00:00:00.000Z',
          confidence: 1,
        },
      ],
    });
    expect(snapshot.state).toBe('NEEDS_REVALIDATION');
    expect(snapshot.expiredEvidenceCount).toBeGreaterThan(0);
    expect(snapshot.evidence.length).toBeGreaterThan(0);
  });
});

describe('overall-readiness-cache.util', () => {
  it('reads and freshness-checks cache', () => {
    const snapshot = assembleOverallReadinessSnapshot({
      tripId: 't1',
      memberCount: 1,
      calculatedAt: new Date().toISOString(),
    });
    const cache = buildOverallReadinessCache(snapshot);
    const meta = { overallReadinessCache: cache };
    expect(readOverallReadinessCache(meta)?.score).toBe(snapshot.score);
    expect(isOverallReadinessCacheFresh(cache, new Date())).toBe(true);
  });
});
