import type { ContextRecallBaselineCase } from './context-recall-baseline.types';

/** 上下文召回 golden cases — 对齐 AgentMemoryContext contract */
export const CONTEXT_RECALL_BASELINE_CASES: ContextRecallBaselineCase[] = [
  {
    id: 'cr-01-l1-profile',
    title: 'L1 画像应进入 travelPreference 摘要',
    context: {
      userId: 'user-1',
      tripId: 'trip-1',
      userProfile: {
        userId: 'user-1',
        pacePreference: 'SLOW',
        riskTolerance: 'LOW',
        confidence: 0.85,
        source: 'explicit',
        updatedAt: new Date('2026-06-01'),
      },
      travelPreference: {
        pacePreference: 'SLOW',
        riskTolerance: 'LOW',
        confidence: 0.85,
      },
      observability: { layers: ['L1'] },
    },
    mustPresent: ['userId', 'userProfile.pacePreference', 'travelPreference.pacePreference'],
  },
  {
    id: 'cr-02-route-party',
    title: '同行体能应进入 routePartyProfile 与 travelPreference',
    context: {
      userId: 'user-2',
      routePartyProfile: {
        fitness_level: 'low',
        party_total: 4,
        has_elderly: true,
      },
      travelPreference: {
        route_fitness_level: 'low',
        route_party_total: 4,
        route_has_elderly: true,
      },
      observability: { layers: ['L1', 'route_party'] },
    },
    mustPresent: [
      'routePartyProfile.fitness_level',
      'travelPreference.route_fitness_level',
      'travelPreference.route_has_elderly',
    ],
  },
  {
    id: 'cr-03-trip-digests',
    title: 'Trip 域 digest 应可被决策链读取',
    context: {
      userId: 'user-3',
      tripId: 'trip-3',
      wishConstraintDigest: {
        schemaVersion: 1,
        mustAvoidCount: 2,
        mustDoCount: 1,
      } as any,
      decisionProfilingDigest: {
        schemaVersion: 1,
        travelStyleLabel: '慢节奏',
      } as any,
      observability: { layers: ['trip_domain'] },
    },
    mustPresent: ['wishConstraintDigest.mustAvoidCount', 'decisionProfilingDigest.travelStyleLabel'],
  },
  {
    id: 'cr-04-privacy-negative',
    title: '未授权场景不应泄漏私密愿望正文',
    context: {
      userId: 'user-4',
      privateWishDigest: null,
      wishConstraintDigest: { schemaVersion: 1, mustAvoidCount: 1 } as any,
      observability: { layers: ['trip_domain'] },
    },
    mustPresent: ['wishConstraintDigest.mustAvoidCount'],
    mustAbsent: ['privateWishDigest.items'],
  },
  {
    id: 'cr-05-decision-ledger',
    title: 'L2 决策账本节点应可召回',
    context: {
      userId: 'user-5',
      decisionLedger: {
        schemaVersion: 1,
        nodes: [{ id: 'n1', status: 'VALID' }],
      } as any,
      observability: { layers: ['L2'] },
    },
    mustPresent: ['decisionLedger.nodes'],
  },
];
