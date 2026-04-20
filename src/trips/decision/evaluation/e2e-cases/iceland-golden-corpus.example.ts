import { E2ECase } from '../e2e-case.types';

export const icelandGoldenRingRoadCapturedCase: E2ECase = {
  id: 'golden-iceland-ring-road-2026q3-001',
  name: 'Golden Iceland Ring Road Capture',
  description: 'Captured-style golden replay case for a stable, low-risk Iceland ring-road itinerary.',
  input: {
    userProfile: {
      pacePreference: 'MEDIUM',
      altitudeTolerance: 'LOW',
      riskTolerance: 'LOW',
      travelPhilosophy: 'comfort',
      preferredRouteTypes: ['ring-road', 'coastal', 'scenic'],
    },
    season: 8,
    countryCode: 'IS',
    userQuery: '8月冰岛环岛，优先稳定和舒适体验。',
  },
  expected: {
    routeDirectionTags: ['ring-road', 'coastal'],
    abuExpected: {
      action: 'ALLOW',
      reasonCodes: [],
    },
    drdreExpected: {
      mustAdjust: false,
    },
    neptuneExpected: {
      mustRepair: false,
    },
    finalState: {
      allowed: true,
      planDays: 8,
    },
    traceSummary: {
      schemaVersion: 'trace/v1',
      metaDecisionAudit: 'golden-meta-budget entropy=0.24 cand=8 repair=1',
      candidateSearchBudget: {
        maxCandidates: 8,
        repairMaxIters: 1,
        repairTopKPerCandidate: 2,
        maxNewCandidatesPerIter: 8,
        maxPoolSize: 16,
        stopWhenFeasibleCount: 5,
      },
      candidateSearchAudit: {
        budget: {
          maxCandidates: 8,
          repairMaxIters: 1,
          repairTopKPerCandidate: 2,
          maxNewCandidatesPerIter: 8,
          maxPoolSize: 16,
          stopWhenFeasibleCount: 5,
        },
        initialVariantCount: 3,
        iterations: [
          {
            iter: 0,
            poolSizeBeforeProjection: 4,
            feasibleCountAfterProjection: 4,
            infeasibleCountAfterProjection: 0,
            repairsGenerated: 0,
            repairsAccepted: 0,
            poolSizeAfterDedup: 4,
          },
        ],
        finalCandidateCount: 4,
        finalFeasibleCount: 4,
        stopReason: 'COMPLETED',
      },
    },
    scientificExpected: {
      optimization: {
        mustEmitTrace: true,
        minCandidateSearchIterations: 1,
        minFinalFeasibleCount: 4,
        allowedStopReasons: ['COMPLETED'],
        metaDecisionAuditIncludes: ['cand=8', 'repair=1'],
      },
    },
    timelineExpected: {
      requiredStages: ['ABU_GATE', 'PLAN_SCORE'],
      forbiddenStages: ['PACE_ADJUST', 'SPATIAL_REPAIR'],
      orderedStages: ['ABU_GATE', 'PLAN_SCORE'],
    },
  },
  metadata: {
    tags: ['golden', 'iceland', 'ring-road'],
    priority: 'P1',
    source: 'captured-iceland-2026q3',
    description: 'Golden corpus baseline capture for stable ring-road planning.',
    fixtureKind: 'golden',
  },
};

export const icelandGoldenHighlandsRepairCapturedCase: E2ECase = {
  id: 'golden-iceland-highlands-2026q3-002',
  name: 'Golden Iceland Highlands Repair Capture',
  description:
    'Captured-style golden replay case where the system remains allowed but performs spatial repair under degraded highlands conditions.',
  input: {
    userProfile: {
      pacePreference: 'MEDIUM',
      altitudeTolerance: 'MEDIUM',
      riskTolerance: 'LOW',
      travelPhilosophy: 'adventure',
      preferredRouteTypes: ['highlands', 'nature'],
    },
    season: 7,
    countryCode: 'IS',
    userQuery: '7月冰岛高地，保守一些，但尽量保留体验核心。',
  },
  expected: {
    routeDirectionTags: ['highlands', 'nature'],
    abuExpected: {
      action: 'ALLOW',
    },
    drdreExpected: {
      mustAdjust: false,
    },
    neptuneExpected: {
      mustRepair: true,
      replacementTypes: ['SEGMENT'],
    },
    finalState: {
      allowed: true,
      planDays: 7,
    },
    traceSummary: {
      schemaVersion: 'trace/v1',
      metaDecisionAudit: 'golden-meta-budget entropy=0.61 cand=16 repair=3',
      candidateSearchBudget: {
        maxCandidates: 16,
        repairMaxIters: 3,
        repairTopKPerCandidate: 4,
        maxNewCandidatesPerIter: 16,
        maxPoolSize: 36,
        stopWhenFeasibleCount: 8,
      },
      candidateSearchAudit: {
        budget: {
          maxCandidates: 16,
          repairMaxIters: 3,
          repairTopKPerCandidate: 4,
          maxNewCandidatesPerIter: 16,
          maxPoolSize: 36,
          stopWhenFeasibleCount: 8,
        },
        initialVariantCount: 5,
        iterations: [
          {
            iter: 0,
            poolSizeBeforeProjection: 6,
            feasibleCountAfterProjection: 2,
            infeasibleCountAfterProjection: 4,
            repairsGenerated: 5,
            repairsAccepted: 2,
            poolSizeAfterDedup: 7,
          },
          {
            iter: 1,
            poolSizeBeforeProjection: 7,
            feasibleCountAfterProjection: 5,
            infeasibleCountAfterProjection: 2,
            repairsGenerated: 3,
            repairsAccepted: 1,
            poolSizeAfterDedup: 8,
          },
        ],
        finalCandidateCount: 8,
        finalFeasibleCount: 5,
        stopReason: 'COMPLETED',
      },
    },
    scientificExpected: {
      optimization: {
        mustEmitTrace: true,
        minCandidateSearchIterations: 2,
        minFinalFeasibleCount: 5,
        allowedStopReasons: ['COMPLETED'],
        metaDecisionAuditIncludes: ['cand=16', 'repair=3'],
      },
    },
    timelineExpected: {
      requiredStages: ['ABU_GATE', 'PLAN_SCORE', 'SPATIAL_REPAIR'],
      forbiddenStages: ['PACE_ADJUST'],
      orderedStages: ['ABU_GATE', 'PLAN_SCORE', 'SPATIAL_REPAIR'],
    },
  },
  metadata: {
    tags: ['golden', 'iceland', 'highlands', 'repair'],
    priority: 'P1',
    source: 'captured-iceland-2026q3',
    description: 'Golden corpus highlands capture with stable spatial-repair outcome.',
    fixtureKind: 'golden',
  },
};
