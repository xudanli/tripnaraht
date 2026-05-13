import { Test, TestingModule } from '@nestjs/testing';
import { GovernanceLedgerStoreService } from './governance-ledger.store.service';
import { GovernanceModule } from '../../governance/governance.module';
import type { GovernanceLedgerEvent } from './governance-ledger.types';
import { findRepeatedRouteFailures, queryGovernanceHistory } from './query-governance-history.util';

const baseMeta = {
  correlationId: 'corr',
  causalityChainId: 'chain',
  eventLevel: 'L1_operational' as const,
};

describe('GovernanceLedgerStoreService', () => {
  let store: GovernanceLedgerStoreService;

  beforeEach(async () => {
    const m: TestingModule = await Test.createTestingModule({
      imports: [GovernanceModule],
    }).compile();
    store = m.get(GovernanceLedgerStoreService);
  });

  it('appends and queries execution_block by tripId', () => {
    const ev: GovernanceLedgerEvent = {
      id: 'e1',
      tripId: 't1',
      timestamp: 100,
      ...baseMeta,
      eventType: 'execution_block',
      executionDecision: { status: 'halt', reasonCodes: ['x'], enforcedPolicies: {} },
      causedByPolicies: ['p1'],
      policyVersion: 'v1',
      affectedSubsystems: ['itinerary'],
      executionContextSummary: { routeRegion: 'North Iceland' },
    };
    store.appendEvent(ev);
    const q = store.findRecentExecutionBlocks('t1');
    expect(q).toHaveLength(1);
    expect(q[0].id).toBe('e1');
  });

  it('queryGovernanceHistory filters routeRegion substring', () => {
    store.appendEvent({
      id: 'a',
      tripId: 't2',
      timestamp: 1,
      ...baseMeta,
      eventType: 'route_suppressed',
      executionDecision: { status: 'restricted', reasonCodes: [], enforcedPolicies: {} },
      causedByPolicies: [],
      policyVersion: 'v1',
      affectedSubsystems: [],
      executionContextSummary: { routeRegion: 'Snæfellsnes' },
    });
    const hits = queryGovernanceHistory(store.snapshot(), { routeRegion: 'snæf', limit: 10 });
    expect(hits).toHaveLength(1);
  });

  it('findRepeatedRouteFailures returns when minCount met', () => {
    const base = {
      tripId: 't3',
      ...baseMeta,
      executionDecision: { status: 'halt', reasonCodes: [], enforcedPolicies: {} },
      causedByPolicies: ['froad.segment.blocked'],
      policyVersion: 'v1',
      affectedSubsystems: ['itinerary'],
      executionContextSummary: { routeRegion: 'F208 corridor' },
    };
    store.appendEvent({ ...base, id: '1', timestamp: 10, eventType: 'execution_block' });
    store.appendEvent({ ...base, id: '2', timestamp: 20, eventType: 'route_suppressed' });
    const rep = findRepeatedRouteFailures(store.snapshot(), 'f208', { minCount: 2 });
    expect(rep?.count).toBe(2);
  });

  it('replayGovernanceTimeline returns ascending events from memory when DB empty', async () => {
    store.appendEvent({
      id: 'x2',
      tripId: 'tx',
      timestamp: 20,
      ...baseMeta,
      eventType: 'route_suppressed',
      executionDecision: { status: 'restricted', reasonCodes: [], enforcedPolicies: {} },
      causedByPolicies: [],
      policyVersion: 'v1',
      affectedSubsystems: [],
    });
    store.appendEvent({
      id: 'x1',
      tripId: 'tx',
      timestamp: 10,
      ...baseMeta,
      eventType: 'execution_block',
      executionDecision: { status: 'halt', reasonCodes: [], enforcedPolicies: {} },
      causedByPolicies: [],
      policyVersion: 'v1',
      affectedSubsystems: [],
    });
    const r = await store.replayGovernanceTimeline('tx');
    expect(r.map((e) => e.timestamp)).toEqual([10, 20]);
  });
});
