import { OrToolsPlanningOrchestratorShadowBridge } from './ortools-planning-orchestrator-shadow.bridge';
import type { OrToolsSolverClient } from '../ortools-solver.client';

describe('OrToolsPlanningOrchestratorShadowBridge', () => {
  const prevUrl = process.env.OR_TOOLS_SOLVER_URL;
  const prevShadow = process.env.OR_TOOLS_REPAIR_SHADOW;

  afterEach(() => {
    if (prevUrl === undefined) delete process.env.OR_TOOLS_SOLVER_URL;
    else process.env.OR_TOOLS_SOLVER_URL = prevUrl;
    if (prevShadow === undefined) delete process.env.OR_TOOLS_REPAIR_SHADOW;
    else process.env.OR_TOOLS_REPAIR_SHADOW = prevShadow;
  });

  const items = [
    {
      itemId: 'a1',
      label: 'A',
      startTime: new Date('2026-07-20T09:00:00.000Z'),
      endTime: new Date('2026-07-20T10:00:00.000Z'),
      travelFromPreviousDurationMin: 15,
    },
    {
      itemId: 'a2',
      label: 'B',
      startTime: new Date('2026-07-20T11:00:00.000Z'),
      endTime: new Date('2026-07-20T12:00:00.000Z'),
      travelFromPreviousDurationMin: 20,
    },
  ];

  it('returns null when shadow disabled', async () => {
    delete process.env.OR_TOOLS_SOLVER_URL;
    const bridge = new OrToolsPlanningOrchestratorShadowBridge({
      solve: jest.fn(),
    } as unknown as OrToolsSolverClient);
    const out = await bridge.runForOptimizeRoute({
      tripId: 't1',
      dayIndex: 1,
      contextVersion: 3,
      planVersionId: '1',
      legacyChanges: [],
      items,
    });
    expect(out).toBeNull();
  });

  it('attaches shadowAuthority=false and does not claim write', async () => {
    process.env.OR_TOOLS_SOLVER_URL = 'http://127.0.0.1:8091';
    process.env.OR_TOOLS_REPAIR_SHADOW = '1';
    const solve = jest.fn().mockResolvedValue({
      schemaId: 'tripnara.solver_response@v1',
      requestId: 'r1',
      status: 'SOLVED',
      candidates: [
        {
          candidateId: 'ortools:0',
          operation: 'SWAP',
          label: 'swap-0',
          dayPlans: [
            {
              dayId: 'day-1',
              nodeIds: ['depot', 'a2', 'a1'],
              startMin: [480, 500, 600],
            },
          ],
          objectiveValue: 35,
        },
      ],
      solverMeta: {
        engine: 'OR_TOOLS_ROUTING',
        version: 'test',
        strategy: 'GUIDED_LOCAL_SEARCH',
        nativeCpSat: false,
        seed: 42,
        elapsedMs: 8,
      },
    });

    const bridge = new OrToolsPlanningOrchestratorShadowBridge({
      solve,
    } as unknown as OrToolsSolverClient);

    const out = await bridge.runForOptimizeRoute({
      tripId: 't1',
      dayIndex: 1,
      contextVersion: 7,
      planVersionId: '2',
      legacyChanges: [
        {
          operation: 'MOVE',
          itemId: 'a1',
          dayIndex: 1,
          startTime: '12:00',
          endTime: '13:00',
        },
      ],
      items,
    });

    expect(out).not.toBeNull();
    expect(out!.shadowAuthority).toBe(false);
    expect(out!.report.writeAttempted).toBe(false);
    expect(out!.shadowChangeCount).toBeGreaterThan(0);
    expect(out!.contextVersion).toBe(7);
    expect(out!.evidenceVersionId).toBe('ctx:7');
    expect(out!.labCompare).toBeDefined();
    expect(out!.labCompare!.authoritativePromotion).toBe(false);
    expect(out!.labCompare!.shadowOrder).toEqual(['a2', 'a1']);
    expect(out!.planningIntent).toBe('OPTIMIZE_ROUTE');
    expect(solve).toHaveBeenCalled();
    expect(solve.mock.calls[0][0].operation).toBe('SWAP');
  });

  it('AUTO_ARRANGE uses legacy-auto-arrange authority id', async () => {
    process.env.OR_TOOLS_SOLVER_URL = 'http://127.0.0.1:8091';
    process.env.OR_TOOLS_REPAIR_SHADOW = '1';
    const solve = jest.fn().mockResolvedValue({
      schemaId: 'tripnara.solver_response@v1',
      requestId: 'r2',
      status: 'SOLVED',
      candidates: [
        {
          candidateId: 'ortools:0',
          operation: 'SWAP',
          label: 'swap-0',
          dayPlans: [
            {
              dayId: 'day-1',
              nodeIds: ['depot', 'a1', 'a2'],
              startMin: [480, 500, 600],
            },
          ],
          objectiveValue: 30,
        },
      ],
      solverMeta: {
        engine: 'OR_TOOLS_ROUTING',
        version: 'test',
        strategy: 'GUIDED_LOCAL_SEARCH',
        nativeCpSat: false,
        seed: 42,
        elapsedMs: 4,
      },
    });
    const bridge = new OrToolsPlanningOrchestratorShadowBridge({
      solve,
    } as unknown as OrToolsSolverClient);
    const out = await bridge.runForAutoArrange({
      tripId: 't1',
      dayIndex: 1,
      contextVersion: 1,
      planVersionId: '1',
      legacyChanges: [
        { operation: 'ADD', candidateId: 'a1', dayIndex: 1, startTime: '09:00' },
        { operation: 'ADD', candidateId: 'a2', dayIndex: 1, startTime: '11:00' },
      ],
      items,
    });
    expect(out!.planningIntent).toBe('AUTO_ARRANGE');
    expect(out!.report.authorityProviderId).toBe('legacy-auto-arrange');
    expect(out!.shadowAuthority).toBe(false);
  });
});
