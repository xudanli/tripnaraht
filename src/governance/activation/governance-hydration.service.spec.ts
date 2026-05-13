import { Test } from '@nestjs/testing';
import type { GovernanceLedgerEvent } from '../../agent/ledger/governance-ledger.types';
import { GovernanceLedgerStoreService } from '../../agent/ledger/governance-ledger.store.service';
import { GovernanceHydrationService } from './governance-hydration.service';

describe('GovernanceHydrationService', () => {
  it('hydrates snapshot with activations when open blocks exist', async () => {
    const events: GovernanceLedgerEvent[] = [
      {
        id: 'b1',
        tripId: 'trip-x',
        timestamp: 1000,
        eventLevel: 'L1_operational',
        eventType: 'execution_block',
        correlationId: 'c',
        causalityChainId: 'h',
        executionDecision: { status: 'halt', reasonCodes: [], enforcedPolicies: {} },
        causedByPolicies: ['vehicle.2wd'],
        policyVersion: 'v',
        affectedSubsystems: [],
        executionContextSummary: { routeRegion: 'North Iceland winter' },
      },
    ];
    const ledger = { replayGovernanceTimeline: jest.fn().mockResolvedValue(events) } as unknown as GovernanceLedgerStoreService;
    const mod = await Test.createTestingModule({
      providers: [GovernanceHydrationService, { provide: GovernanceLedgerStoreService, useValue: ledger }],
    }).compile();
    const svc = mod.get(GovernanceHydrationService);
    const ctx = await svc.hydrateGovernanceSnapshot('trip-x', { heuristicResolveBlocks: false });
    expect(ctx.snapshot.unresolvedBlocks).toHaveLength(1);
    expect(ctx.activations.some((a) => a.activationType === 'trigger_replanning')).toBe(true);
    expect(ctx.activations.find((a) => a.activationType === 'trigger_replanning')?.replanningIntent?.trigger).toBe(
      'execution_block',
    );
    expect(ctx.runtimeState).toBe('NORMAL');
    expect(ctx.driftAssessment).toBeDefined();
    expect(ctx.driftAssessment.recoveryQuality.recoveryCycleCount).toBe(0);
    expect(ctx.driftInfluences).toEqual([]);
  });

  it('heuristically resolves blocks after later allow', async () => {
    const events: GovernanceLedgerEvent[] = [
      {
        id: 'allow1',
        tripId: 't',
        timestamp: 3000,
        eventLevel: 'L1_operational',
        eventType: 'readiness_validated',
        correlationId: 'c',
        causalityChainId: 'h',
        executionDecision: { status: 'allow', reasonCodes: [], enforcedPolicies: {} },
        causedByPolicies: [],
        policyVersion: 'v',
        affectedSubsystems: [],
      },
      {
        id: 'blk',
        tripId: 't',
        timestamp: 1000,
        eventLevel: 'L1_operational',
        eventType: 'execution_block',
        correlationId: 'c',
        causalityChainId: 'h',
        executionDecision: { status: 'halt', reasonCodes: [], enforcedPolicies: {} },
        causedByPolicies: [],
        policyVersion: 'v',
        affectedSubsystems: [],
      },
    ];
    const ledger = { replayGovernanceTimeline: jest.fn().mockResolvedValue(events) } as unknown as GovernanceLedgerStoreService;
    const mod = await Test.createTestingModule({
      providers: [GovernanceHydrationService, { provide: GovernanceLedgerStoreService, useValue: ledger }],
    }).compile();
    const svc = mod.get(GovernanceHydrationService);
    const ctx = await svc.hydrateGovernanceSnapshot('t');
    const b = ctx.snapshot.unresolvedBlocks[0];
    expect(b.resolvedAt).toBe(3000);
    expect(b.resolutionEventId).toBe('allow1');
    expect(ctx.activations.some((a) => a.activationType === 'trigger_replanning')).toBe(false);
    expect(ctx.runtimeState).toBe('NORMAL');
    expect(ctx.driftAssessment.signals.length).toBeGreaterThanOrEqual(0);
    expect(ctx.driftInfluences).toEqual([]);
  });

  it('surfaces driftAssessment when duplicate resolutions target the same block', async () => {
    const { buildGovernanceResolutionLedgerEvent } = await import(
      '../runtime-state-machine/governance-resolution-ledger.util'
    );
    const r1 = buildGovernanceResolutionLedgerEvent({
      tripId: 'trip-d',
      requestId: 'a',
      resolvedLedgerEventId: 'blk-x',
      resolutionKind: 'recovery_closure',
      reasonCodes: [],
    });
    r1.timestamp = 100;
    const r2 = buildGovernanceResolutionLedgerEvent({
      tripId: 'trip-d',
      requestId: 'b',
      resolvedLedgerEventId: 'blk-x',
      resolutionKind: 'recovery_closure',
      reasonCodes: [],
    });
    r2.timestamp = 200;
    const ledger = {
      replayGovernanceTimeline: jest.fn().mockResolvedValue([r1, r2]),
    } as unknown as GovernanceLedgerStoreService;
    const mod = await Test.createTestingModule({
      providers: [GovernanceHydrationService, { provide: GovernanceLedgerStoreService, useValue: ledger }],
    }).compile();
    const svc = mod.get(GovernanceHydrationService);
    const ctx = await svc.hydrateGovernanceSnapshot('trip-d', { heuristicResolveBlocks: false });
    expect(ctx.driftAssessment.signals.some((s) => s.type === 'recurring_block')).toBe(true);
    expect(ctx.driftAssessment.driftPolicySuggestions.length).toBeGreaterThan(0);
    expect(ctx.driftInfluences).toEqual([]);
  });

  it('injects driftInfluences when allowDriftFeedbackInjection is true (GFIL gate open)', async () => {
    const { buildGovernanceResolutionLedgerEvent } = await import(
      '../runtime-state-machine/governance-resolution-ledger.util'
    );
    const r1 = buildGovernanceResolutionLedgerEvent({
      tripId: 'trip-gfil',
      requestId: 'a',
      resolvedLedgerEventId: 'blk-y',
      resolutionKind: 'recovery_closure',
      reasonCodes: [],
    });
    r1.timestamp = 100;
    const r2 = buildGovernanceResolutionLedgerEvent({
      tripId: 'trip-gfil',
      requestId: 'b',
      resolvedLedgerEventId: 'blk-y',
      resolutionKind: 'recovery_closure',
      reasonCodes: [],
    });
    r2.timestamp = 200;
    const ledger = {
      replayGovernanceTimeline: jest.fn().mockResolvedValue([r1, r2]),
    } as unknown as GovernanceLedgerStoreService;
    const mod = await Test.createTestingModule({
      providers: [GovernanceHydrationService, { provide: GovernanceLedgerStoreService, useValue: ledger }],
    }).compile();
    const svc = mod.get(GovernanceHydrationService);
    const ctx = await svc.hydrateGovernanceSnapshot('trip-gfil', {
      heuristicResolveBlocks: false,
      allowDriftFeedbackInjection: true,
    });
    expect(ctx.driftInfluences.length).toBeGreaterThan(0);
    expect(ctx.driftInfluences[0].target).toBe('search_constraints');
  });
});
