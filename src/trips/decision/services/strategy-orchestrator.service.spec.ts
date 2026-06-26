/**
 * StrategyOrchestrator：Neptune 修复后 Abu/Dre 复核闭环
 */

import { StrategyOrchestratorService } from './strategy-orchestrator.service';
import type { RoutePlanDraft, WorldModelContext } from '../shared/world-model.types';
import type { DecisionResult } from '../shared/decision-result.types';

function allowResult(overrides: Partial<DecisionResult> = {}): DecisionResult {
  return {
    allowed: true,
    action: 'ALLOW',
    logs: [],
    ...overrides,
  };
}

describe('StrategyOrchestratorService post-Neptune revalidation', () => {
  const plan: RoutePlanDraft = {
    tripId: 'trip-orchestrator-01',
    routeDirectionId: 'rd-1',
    segments: [],
  };
  const repairedPlan: RoutePlanDraft = {
    ...plan,
    segments: [
      {
        segmentId: 'seg-repaired',
        dayIndex: 1,
        distanceKm: 80,
        ascentM: 100,
        slopePct: 4,
      },
    ],
  };
  const world = {
    physical: { month: 6, countryCode: 'IS' },
  } as WorldModelContext;

  let abuEvaluate: jest.Mock;
  let dreEvaluate: jest.Mock;
  let nepEvaluate: jest.Mock;
  let orchestrator: StrategyOrchestratorService;

  beforeEach(() => {
    abuEvaluate = jest.fn();
    dreEvaluate = jest.fn();
    nepEvaluate = jest.fn();
    const logStorage = {
      saveLogEntries: jest.fn().mockResolvedValue(undefined),
    };
    const moduleRef = {
      get: jest.fn().mockReturnValue(undefined),
    };
    orchestrator = new StrategyOrchestratorService(
      { evaluate: abuEvaluate } as never,
      { evaluate: dreEvaluate } as never,
      { evaluate: nepEvaluate } as never,
      logStorage as never,
      moduleRef as never,
    );
  });

  it('does not re-run Abu/Dre when Neptune leaves plan unchanged', async () => {
    abuEvaluate.mockResolvedValueOnce(allowResult());
    dreEvaluate.mockResolvedValueOnce(allowResult());
    nepEvaluate.mockResolvedValueOnce(allowResult());

    const result = await orchestrator.run(world, plan);

    expect(abuEvaluate).toHaveBeenCalledTimes(1);
    expect(dreEvaluate).toHaveBeenCalledTimes(1);
    expect(nepEvaluate).toHaveBeenCalledTimes(1);
    expect(result.allowed).toBe(true);
    expect(result.finalAction).toBe('ALLOW');
  });

  it('runs Abu then Dre revalidation after Neptune REPLACE', async () => {
    abuEvaluate
      .mockResolvedValueOnce(allowResult())
      .mockResolvedValueOnce(
        allowResult({
          logs: [
            {
              persona: 'ABU',
              action: 'ALLOW',
              explanation: 'revalidated',
              reasonCodes: [],
              timestamp: new Date().toISOString(),
              decisionSource: 'PHYSICAL',
              decisionStage: 'ABU_GATE',
            },
          ],
        }),
      );
    dreEvaluate
      .mockResolvedValueOnce(allowResult())
      .mockResolvedValueOnce(
        allowResult({
          action: 'ADJUST',
          updatedPlan: repairedPlan,
        }),
      );
    nepEvaluate.mockResolvedValueOnce(
      allowResult({
        action: 'REPLACE',
        updatedPlan: repairedPlan,
      }),
    );

    const result = await orchestrator.run(world, plan);

    expect(abuEvaluate).toHaveBeenCalledTimes(2);
    expect(dreEvaluate).toHaveBeenCalledTimes(2);
    expect(abuEvaluate.mock.calls[1][1]).toEqual(repairedPlan);
    expect(result.allowed).toBe(true);
    expect(result.finalAction).toBe('REPLACE');
    expect(result.plan).toEqual(repairedPlan);
    const revalidationLogs = result.logs.filter(
      (l) =>
        (l.metadata as Record<string, unknown> | undefined)?.revalidationPass ===
        'POST_NEPTUNE_REPAIR',
    );
    expect(revalidationLogs.length).toBeGreaterThan(0);
  });

  it('REJECTs when Abu revalidation fails after Neptune repair', async () => {
    abuEvaluate
      .mockResolvedValueOnce(allowResult())
      .mockResolvedValueOnce({
        allowed: false,
        action: 'REJECT',
        logs: [
          {
            persona: 'ABU',
            action: 'REJECT',
            explanation: 'F-road 两驱车不可通行',
            reasonCodes: ['HC_VEHICLE'],
            timestamp: new Date().toISOString(),
            decisionSource: 'PHYSICAL',
            decisionStage: 'ABU_GATE',
          },
        ],
      });
    dreEvaluate.mockResolvedValueOnce(allowResult());
    nepEvaluate.mockResolvedValueOnce(
      allowResult({
        action: 'REPLACE',
        updatedPlan: repairedPlan,
      }),
    );

    const result = await orchestrator.run(world, plan);

    expect(result.allowed).toBe(false);
    expect(result.plan).toBeNull();
    expect(result.finalAction).toBe('REJECT');
    expect(dreEvaluate).toHaveBeenCalledTimes(1);
  });
});
