import { resolveKnowledgeRuntimeSsotEnforceMode } from './resolve-knowledge-ssot-enforce-mode.util';
import {
  auditKnowledgeDecisionIngress,
  enforceKnowledgeDecisionIngress,
  KnowledgeRuntimeSsotViolationError,
} from './assert-knowledge-decision-ingress.util';
import { selectFactsForOntologyHardBlock } from './select-facts-for-ontology-hard-block.util';
import {
  TRAVEL_WORLD_FACT_SCHEMA_ID,
  TRAVEL_WORLD_PREDICATES,
  type TravelWorldFact,
} from '../../travel-ontology/contracts/travel-world-fact.types';
import { TRAVEL_WORLD_STATE_SNAPSHOT_SCHEMA } from '../../decision-runtime/contracts/world-state-snapshot';
import type { EffectiveTravelerContextV1 } from '../../travel-memory/effective-context/effective-traveler-context.types';

function sampleEtc(): EffectiveTravelerContextV1 {
  return {
    schemaId: 'tripnara.effective_traveler_context@v1',
    version: 1,
    consumptionMode: 'ACTIVE',
    subjectId: 'u1',
    tripId: 't1',
    resolvedAt: new Date().toISOString(),
    items: [],
    byDomain: {},
    effective: {},
    tripOverridesApplied: [],
    advisoryHints: [],
    provenance: {
      osProfilePresent: false,
      osBasicsPresent: false,
      osTravelPreferenceKeys: [],
      tmrStructuredKeys: [],
      tmrTripKeys: [],
      itemCount: 0,
      domainCount: 0,
    },
    designPrinciple: 'test',
  };
}

describe('resolveKnowledgeRuntimeSsotEnforceMode', () => {
  it('defaults off', () => {
    expect(resolveKnowledgeRuntimeSsotEnforceMode({})).toBe('off');
  });
  it('parses shadow/active', () => {
    expect(
      resolveKnowledgeRuntimeSsotEnforceMode({
        KNOWLEDGE_RUNTIME_SSOT_ENFORCE: 'shadow',
      }),
    ).toBe('shadow');
    expect(
      resolveKnowledgeRuntimeSsotEnforceMode({
        KNOWLEDGE_RUNTIME_SSOT_ENFORCE: 'active',
      }),
    ).toBe('active');
  });
});

describe('auditKnowledgeDecisionIngress', () => {
  it('passes vector ban + skips snapshot when not required', () => {
    const a = auditKnowledgeDecisionIngress({
      consumer: 'Gate',
      requireSnapshot: false,
      env: { KNOWLEDGE_RUNTIME_SSOT_ENFORCE: 'shadow' },
    });
    expect(a.ok).toBe(true);
    expect(a.checks.vectorHardBlockBan).toBe('pass');
    expect(a.checks.snapshotSsot).toBe('skip');
  });

  it('fails memory OS without ETC when etc active', () => {
    const a = auditKnowledgeDecisionIngress({
      consumer: 'Gate',
      memoryOsDirect: { pace: 1 },
      requireSnapshot: false,
      env: {
        KNOWLEDGE_RUNTIME_SSOT_ENFORCE: 'shadow',
        EFFECTIVE_TRAVELER_CONTEXT_CONSUME: 'active',
      },
    });
    expect(a.ok).toBe(false);
    expect(a.checks.etcSsot).toBe('fail');
  });

  it('accepts ETC when active', () => {
    const a = auditKnowledgeDecisionIngress({
      consumer: 'Gate',
      effectiveTravelerContext: sampleEtc(),
      requireSnapshot: false,
      env: {
        KNOWLEDGE_RUNTIME_SSOT_ENFORCE: 'shadow',
        EFFECTIVE_TRAVELER_CONTEXT_CONSUME: 'active',
      },
    });
    expect(a.checks.etcSsot).toBe('pass');
    expect(a.ok).toBe(true);
  });

  it('throws in active enforce mode on vector hard block', () => {
    expect(() =>
      enforceKnowledgeDecisionIngress({
        consumer: 'Constraint',
        requireSnapshot: false,
        hardBlockFromVector: true,
        env: { KNOWLEDGE_RUNTIME_SSOT_ENFORCE: 'active' },
      }),
    ).toThrow(KnowledgeRuntimeSsotViolationError);
  });

  it('accepts canonical snapshot', () => {
    const a = auditKnowledgeDecisionIngress({
      consumer: 'Constraint',
      snapshot: {
        schemaId: TRAVEL_WORLD_STATE_SNAPSHOT_SCHEMA,
        snapshotId: 'ws_1',
        tripId: 't1',
        revision: '1',
        createdAt: new Date().toISOString(),
        weather: [],
        roads: [],
        hazards: [],
        ferries: [],
        poiStates: [],
        travelMatrix: { matrixId: 'm', entries: [] },
        completeness: {
          roads: 'COMPLETE',
          weather: 'COMPLETE',
          hazards: 'MISSING',
          ferries: 'MISSING',
          openingHours: 'MISSING',
        },
        sourceVersions: [],
      },
      env: { KNOWLEDGE_RUNTIME_SSOT_ENFORCE: 'off' },
    });
    expect(a.checks.snapshotSsot).toBe('pass');
  });
});

describe('selectFactsForOntologyHardBlock', () => {
  it('excludes stale road facts but keeps other domains', () => {
    const base = {
      schemaId: TRAVEL_WORLD_FACT_SCHEMA_ID,
      subjectType: 'RouteSegment',
      scope: {},
      authorityLevel: 'GOVERNMENT' as const,
      source: { provider: 'test' },
      confidence: 0.9,
      verificationStatus: 'VERIFIED' as const,
    };
    const staleRoad: TravelWorldFact = {
      ...base,
      factId: 'f1',
      subjectId: 'segment:is:f208',
      predicate: 'route.currentRoadStatus',
      value: 'CLOSED',
      observedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      freshness: 'STALE',
    };
    const vehicle: TravelWorldFact = {
      ...base,
      factId: 'f2',
      subjectType: 'Vehicle',
      subjectId: 'vehicle:trip:t1',
      predicate: TRAVEL_WORLD_PREDICATES.HAS_DRIVETRAIN,
      value: '2WD',
      observedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      freshness: 'STALE',
    };
    const sel = selectFactsForOntologyHardBlock([staleRoad, vehicle]);
    expect(sel.eligible.map((f) => f.factId)).toEqual(['f2']);
    expect(sel.excluded.map((e) => e.factId)).toEqual(['f1']);
    expect(sel.vectorHardBlockBanned).toBe(true);
  });
});
