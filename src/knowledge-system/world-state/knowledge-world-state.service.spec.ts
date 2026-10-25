import {
  assertDecisionConsumerUsesSnapshot,
  WorldStateSsotViolationError,
} from './snapshot-ssot.guard.util';
import { diffCanonicalSnapshots } from './snapshot-diff.util';
import {
  assessTravelWorldFactStale,
  filterFactsForHardBlock,
} from './travel-world-fact-stale.util';
import { KnowledgeWorldStateService } from './knowledge-world-state.service';
import { EntityIdentityRegistryService } from '../identity/entity-identity-registry.service';
import type { CanonicalWorldStateSnapshot } from '../../decision-runtime/contracts/world-state-snapshot';
import {
  TRAVEL_WORLD_FACT_SCHEMA_ID,
  TRAVEL_WORLD_PREDICATES,
} from '../../travel-ontology/contracts/travel-world-fact.types';
import { TRAVEL_WORLD_STATE_SNAPSHOT_SCHEMA } from '../../decision-runtime/contracts/world-state-snapshot';

function emptyCompleteness(): CanonicalWorldStateSnapshot['completeness'] {
  return {
    roads: 'COMPLETE',
    weather: 'COMPLETE',
    hazards: 'MISSING',
    ferries: 'MISSING',
    openingHours: 'MISSING',
  };
}

describe('snapshot-ssot.guard', () => {
  it('throws when only WorldModelContext provided', () => {
    expect(() =>
      assertDecisionConsumerUsesSnapshot('Gate', {
        worldModelContext: { physical: {} },
      }),
    ).toThrow(WorldStateSsotViolationError);
  });

  it('accepts canonical snapshot', () => {
    const snap = assertDecisionConsumerUsesSnapshot('Gate', {
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
        completeness: emptyCompleteness(),
        sourceVersions: [],
      },
    });
    expect(snap.snapshotId).toBe('ws_1');
  });
});

describe('stale + diff + KnowledgeWorldStateService', () => {
  it('marks STALE freshness and excludes from hard block', () => {
    const fact = {
      schemaId: TRAVEL_WORLD_FACT_SCHEMA_ID,
      factId: 'f1',
      subjectType: 'RouteSegment',
      subjectId: 'segment:is:f208',
      predicate: TRAVEL_WORLD_PREDICATES.CURRENT_ROAD_STATUS,
      value: 'CLOSED',
      scope: {},
      authorityLevel: 'OFFICIAL_OPERATOR' as const,
      source: { provider: 'road.is' },
      observedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      confidence: 0.9,
      freshness: 'STALE' as const,
      verificationStatus: 'VERIFIED' as const,
    };
    const a = assessTravelWorldFactStale(fact);
    expect(a.stale).toBe(true);
    expect(a.excludeFromHardBlock).toBe(true);
    const { eligible, excluded } = filterFactsForHardBlock([fact]);
    expect(eligible).toHaveLength(0);
    expect(excluded).toHaveLength(1);
  });

  it('diffs OPEN → CLOSED on demo seeds (product summary + changes)', () => {
    const identity = new EntityIdentityRegistryService();
    identity.onModuleInit();
    const svc = new KnowledgeWorldStateService(identity);
    svc.onModuleInit();

    const diff = svc.diff('ws_demo_phase2_open', 'ws_demo_phase2_closed');
    expect(diff.summary.total).toBeGreaterThan(0);
    expect(diff.summary.worsened + diff.summary.updated + diff.summary.added).toBeGreaterThan(0);
    expect(
      diff.changes.some(
        (c) =>
          c.category === 'road' &&
          (c.kind === 'WORSENED' || c.kind === 'UPDATED') &&
          c.newValue === 'CLOSED',
      ),
    ).toBe(true);
    expect(diff.engineSummary.changed + diff.engineSummary.added).toBeGreaterThan(0);

    const list = svc.listSnapshots({});
    expect(list.items[0]).toMatchObject({
      factCount: expect.any(Number),
      staleFactCount: expect.any(Number),
      status: expect.stringMatching(/HEALTHY|DEGRADED|STALE|INCOMPLETE/),
    });

    const mon = svc.monitoring();
    expect(mon.sources.some((s) => s.sourceId === 'road.is')).toBe(true);
    expect(mon.kpis).toHaveProperty('freshnessPassRate');
    expect(Array.isArray(mon.alerts)).toBe(true);

    const facts = svc.listFacts({
      country: 'IS',
      freshness: 'ALL',
      factType: 'road',
      pageSize: 10,
    });
    expect(facts.filtersApplied.country).toBe('IS');
    expect(facts.total).toBeGreaterThanOrEqual(0);

    const gen = svc.generateSnapshot({ tripId: 'demo-ks-phase2', mode: 'clone_latest' });
    expect(gen.snapshotId).toMatch(/^ws_gen_/);
    expect(svc.getSnapshot(gen.snapshotId).tripId).toBe('demo-ks-phase2');

    const stale = svc.listStaleFacts();
    expect(stale.total).toBeGreaterThanOrEqual(1);

    const cov = svc.coverageStats();
    expect(cov.snapshotSsotCoverage).toBeGreaterThan(0);
  });

  it('diffCanonicalSnapshots utility', () => {
    const a: CanonicalWorldStateSnapshot = {
      schemaId: TRAVEL_WORLD_STATE_SNAPSHOT_SCHEMA,
      snapshotId: 'a',
      tripId: 't',
      revision: '1',
      createdAt: '2026-01-01T00:00:00.000Z',
      weather: [],
      roads: [{ roadId: 'F208', status: 'OPEN' }],
      hazards: [],
      ferries: [],
      poiStates: [],
      travelMatrix: { matrixId: 'm', entries: [] },
      completeness: emptyCompleteness(),
      sourceVersions: [],
    };
    const b = {
      ...a,
      snapshotId: 'b',
      roads: [{ roadId: 'F208', status: 'CLOSED' as const }],
    };
    const d = diffCanonicalSnapshots(a, b);
    expect(d.changes.some((c) => c.from === 'OPEN' && c.to === 'CLOSED')).toBe(true);
  });
});
