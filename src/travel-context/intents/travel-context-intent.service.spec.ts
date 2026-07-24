import { BadRequestException } from '@nestjs/common';
import { buildIcelandPlanningContextFixture } from '../../harness/evals/fixtures/contexts/iceland-planning.fixture';
import { TravelContextIntentService } from './travel-context-intent.service';
import { TravelContextRevisionConflictException } from './travel-context-revision-conflict.exception';
import type { TravelContextSnapshotBuilderService } from '../snapshot/travel-context-snapshot-builder.service';
import type { ExplorationOrchestratorService } from '../../trips/exploration/services/exploration-orchestrator.service';
import type { ExplorationScenarioService } from '../../trips/exploration/services/exploration-scenario.service';
import type { TravelContextDiffService } from '../diff/travel-context-diff.service';
import { domainsChanged } from './travel-context-intent.util';

describe('TravelContextIntentService', () => {
  const baseSnapshot = buildIcelandPlanningContextFixture();
  let builder: jest.Mocked<Pick<TravelContextSnapshotBuilderService, 'build'>>;
  let orchestrator: jest.Mocked<
    Pick<
      ExplorationOrchestratorService,
      'selectRoute' | 'materialize' | 'savePrinciples' | 'generateCandidates'
    >
  >;
  let scenarios: jest.Mocked<Pick<ExplorationScenarioService, 'patchConditions'>>;
  let diffService: jest.Mocked<Pick<TravelContextDiffService, 'recordTransition'>>;
  let service: TravelContextIntentService;

  beforeEach(() => {
    builder = { build: jest.fn() };
    orchestrator = {
      selectRoute: jest.fn(),
      materialize: jest.fn(),
      savePrinciples: jest.fn(),
      generateCandidates: jest.fn(),
    };
    scenarios = { patchConditions: jest.fn() };
    diffService = {
      recordTransition: jest.fn((_contextId, before, after) => ({
        contextId: before.identity.contextId,
        fromRevision: before.meta.revision,
        toRevision: after.meta.revision,
        changedDomains: domainsChanged(before, after),
        changes: [],
      })),
    };
    service = new TravelContextIntentService(
      builder as unknown as TravelContextSnapshotBuilderService,
      orchestrator as unknown as ExplorationOrchestratorService,
      scenarios as unknown as ExplorationScenarioService,
      diffService as unknown as TravelContextDiffService,
    );
  });

  it('throws REVISION_CONFLICT when basedOnRevision is stale', async () => {
    builder.build.mockResolvedValue(baseSnapshot);

    await expect(
      service.submit(baseSnapshot.identity.contextId, 'user-1', {
        type: 'SELECT_ROUTE',
        basedOnRevision: baseSnapshot.meta.revision - 1,
        payload: { routeId: 'route_x' },
      }),
    ).rejects.toBeInstanceOf(TravelContextRevisionConflictException);

    expect(orchestrator.selectRoute).not.toHaveBeenCalled();
  });

  it('SELECT_ROUTE delegates to orchestrator and returns APPLIED with revision bump', async () => {
    const after = structuredClone(baseSnapshot);
    after.meta.revision = baseSnapshot.meta.revision + 1;
    after.plan.selectedRouteId = 'route_fixture_b';

    builder.build
      .mockResolvedValueOnce(baseSnapshot)
      .mockResolvedValueOnce(after);
    orchestrator.selectRoute.mockResolvedValue({
      routeId: 'route_fixture_b',
      strategyId: 'strat_b',
    });

    const result = await service.submit(baseSnapshot.identity.contextId, 'user-1', {
      type: 'SELECT_ROUTE',
      basedOnRevision: baseSnapshot.meta.revision,
      payload: { routeId: 'route_fixture_b' },
    });

    expect(orchestrator.selectRoute).toHaveBeenCalledWith(
      'user-1',
      baseSnapshot.identity.contextId,
      expect.objectContaining({ routeId: 'route_fixture_b' }),
    );
    expect(result.outcome).toBe('APPLIED');
    expect(result.revision).toBe(after.meta.revision);
    expect(result.changedDomains).toEqual(domainsChanged(baseSnapshot, after));
  });

  it('MATERIALIZE_TRIP idempotent replay → APPLIED even when revision unchanged', async () => {
    builder.build.mockResolvedValue(baseSnapshot);
    orchestrator.materialize.mockResolvedValue({
      scenarioId: baseSnapshot.identity.contextId,
      tripId: 'trip-1',
      tripVersion: 1,
      decisionContractVersion: 0,
      materialized: true,
      idempotentReplay: true,
    });

    const result = await service.submit(baseSnapshot.identity.contextId, 'user-1', {
      type: 'MATERIALIZE_TRIP',
      basedOnRevision: baseSnapshot.meta.revision,
    });

    expect(result.outcome).toBe('APPLIED');
    expect(result.domainResult).toMatchObject({ idempotentReplay: true });
  });

  it('rejects unsupported harness-only intents', async () => {
    builder.build.mockResolvedValue(baseSnapshot);

    await expect(
      service.submit(baseSnapshot.identity.contextId, 'user-1', {
        type: 'APPLY_PLAN',
        basedOnRevision: baseSnapshot.meta.revision,
        payload: { planVersionId: 'pv_x' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('SELECT_ROUTE without routeId → INVALID_INTENT_PAYLOAD', async () => {
    builder.build.mockResolvedValue(baseSnapshot);

    await expect(
      service.submit(baseSnapshot.identity.contextId, 'user-1', {
        type: 'SELECT_ROUTE',
        basedOnRevision: baseSnapshot.meta.revision,
        payload: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('domainsChanged', () => {
  it('detects plan changes', () => {
    const before = buildIcelandPlanningContextFixture();
    const after = structuredClone(before);
    after.plan.selectedRouteId = 'route_new';
    expect(domainsChanged(before, after)).toContain('plan');
  });
});
