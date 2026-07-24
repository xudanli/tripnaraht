import { UnifiedDecisionResolutionService } from './unified-decision-resolution.service';

describe('UnifiedDecisionResolutionService', () => {
  const resolutionStore = {
    buildIdempotencyKey: jest.fn().mockReturnValue('resolution:trip1:p1:opt_a'),
    buildResolutionId: jest.fn().mockReturnValue('res_p1_abc'),
    findByIdempotencyKey: jest.fn(),
    getForProblem: jest.fn(),
    upsert: jest.fn(),
  };

  const readModel = {
    getProblemDetail: jest.fn(),
    collectRows: jest.fn().mockResolvedValue([]),
    invalidateCache: jest.fn(),
    resolveWorldStateVersionForTrip: jest.fn().mockResolvedValue('ws_v1'),
  };

  const causalTrace = {
    bindSelected: jest.fn(),
    bindExecuted: jest.fn(),
    bindExecuting: jest.fn(),
    assertExecuteAllowed: jest.fn(),
    getActiveRef: jest.fn(),
    resolveWorldStateVersion: jest.fn().mockResolvedValue('ws_v1'),
    toRef: jest.fn(),
  };

  let service: UnifiedDecisionResolutionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UnifiedDecisionResolutionService(
      readModel as never,
      { createDecision: jest.fn() } as never,
      { evaluate: jest.fn(), authorize: jest.fn(), execute: jest.fn() } as never,
      resolutionStore as never,
      { validateDecision: jest.fn() } as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      causalTrace as never,
    );
  });

  it('legacy submit binds causalTraceRef when present on detail', async () => {
    const traceRef = {
      traceId: 'ct_abc',
      worldStateVersion: 'ws_v1',
      protocolVersion: 'causal-trace-v1' as const,
    };
    readModel.getProblemDetail.mockResolvedValue({
      problem: {
        semanticKey: 'travel',
        enforcement: 'INFORM',
        type: 'RISK',
        problemId: 'p1',
      },
      actions: [{ actionId: 'opt_a', allowed: true, requiresConfirmation: false }],
      actionability: { writeChain: 'APPLY_AND_POLL' },
      causalTraceRef: traceRef,
    });
    resolutionStore.findByIdempotencyKey.mockResolvedValue(undefined);
    resolutionStore.upsert.mockImplementation(async (_tripId, resolution) => resolution);

    const result = await service.submitResolution('trip1', 'p1', 'user1', {
      selectedActionId: 'opt_a',
    });

    expect(causalTrace.bindSelected).toHaveBeenCalledWith({
      traceId: 'ct_abc',
      optionId: 'opt_a',
      executionRef: 'res_p1_abc',
    });
    expect(result.causalTraceRef).toEqual(traceRef);
  });

  it('legacy submit stores metadata only without createDecision', async () => {
    readModel.getProblemDetail.mockResolvedValue({
      problem: { semanticKey: 'ROAD_SEGMENT_UNAVAILABLE' },
      actions: [{ actionId: 'opt_a', allowed: true }],
      actionability: { writeChain: 'APPLY_AND_POLL' },
    });
    resolutionStore.findByIdempotencyKey.mockResolvedValue(undefined);
    resolutionStore.upsert.mockImplementation(async (_tripId, resolution) => resolution);

    const result = await service.submitResolution('trip1', 'p1', 'user1', {
      selectedActionId: 'opt_a',
    });

    expect(resolutionStore.upsert).toHaveBeenCalledWith(
      'trip1',
      expect.objectContaining({
        writeChain: 'APPLY_AND_POLL',
        status: 'AUTHORIZED',
        selectedActionId: 'opt_a',
      }),
    );
    expect(resolutionStore.upsert.mock.calls[0][1].decisionId).toBeUndefined();
    expect(result.problem.workflowStatus).toBe('DECIDED');
    expect(result.collaborativeTask?.resolutionId).toBe('res_p1_abc');
  });

  it('replays idempotent legacy submit from resolution store', async () => {
    resolutionStore.findByIdempotencyKey.mockResolvedValue({
      resolutionId: 'res_existing',
      problemId: 'p1',
      selectedActionId: 'opt_a',
      writeChain: 'APPLY_AND_POLL',
      status: 'AUTHORIZED',
      decidedAt: '2026-07-03T00:00:00Z',
      decidedByUserId: 'user1',
      idempotencyKey: 'resolution:trip1:p1:opt_a',
    });

    const result = await service.submitResolution('trip1', 'p1', 'user1', {
      selectedActionId: 'opt_a',
    });

    expect(readModel.getProblemDetail).not.toHaveBeenCalled();
    expect(result.resolution.resolutionId).toBe('res_existing');
  });

  it('accepts actionId alias as selectedActionId', async () => {
    readModel.getProblemDetail.mockResolvedValue({
      problem: { semanticKey: 'ROAD_SEGMENT_UNAVAILABLE' },
      actions: [{ actionId: 'opt_alias', allowed: true }],
      actionability: { writeChain: 'APPLY_AND_POLL' },
    });
    resolutionStore.findByIdempotencyKey.mockResolvedValue(undefined);
    resolutionStore.upsert.mockImplementation(async (_tripId, resolution) => resolution);

    await service.submitResolution('trip1', 'p1', 'user1', {
      actionId: 'opt_alias',
    } as never);

    expect(resolutionStore.upsert).toHaveBeenCalledWith(
      'trip1',
      expect.objectContaining({ selectedActionId: 'opt_alias' }),
    );
  });

  it('legacy submit includes suggestedFollowUps preview', async () => {
    readModel.getProblemDetail.mockResolvedValue({
      problem: { semanticKey: 'ROAD_SEGMENT_UNAVAILABLE' },
      actions: [{ actionId: 'opt_a', allowed: true }],
      actionability: { writeChain: 'APPLY_AND_POLL' },
    });
    resolutionStore.findByIdempotencyKey.mockResolvedValue(undefined);
    resolutionStore.upsert.mockImplementation(async (_tripId, resolution) => resolution);

    const result = await service.submitResolution('trip1', 'p1', 'user1', {
      selectedActionId: 'opt_a',
    });

    expect(result.suggestedFollowUps?.length).toBeGreaterThan(0);
    expect(result.suggestedFollowUps?.map((s) => s.kind)).toContain('TEAM_CONFIRM');
  });

  it('startApplyResolutionAsync returns 202 payload with pollUrl', async () => {
    resolutionStore.getForProblem.mockResolvedValue({
      resolutionId: 'res_p1',
      problemId: 'p1',
      selectedActionId: 'opt_a',
      writeChain: 'APPLY_AND_POLL',
      status: 'AUTHORIZED',
      semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
      decidedAt: '2026-07-03T00:00:00Z',
      decidedByUserId: 'user1',
    });
    resolutionStore.upsert.mockImplementation(async (_tripId, resolution) => resolution);
    readModel.collectRows.mockResolvedValue([]);

    const semantics = {
      createDecision: jest.fn().mockResolvedValue({
        decision: { id: 'dec1', status: 'EXECUTED' },
        executionStatus: 'APPLIED',
      }),
      invalidateOptionsCache: jest.fn(),
      getProblem: jest.fn(),
    };

    service = new UnifiedDecisionResolutionService(
      readModel as never,
      semantics as never,
      { evaluate: jest.fn(), authorize: jest.fn(), execute: jest.fn() } as never,
      resolutionStore as never,
      { validateDecision: jest.fn() } as never,
    );

    const accepted = await service.startApplyResolutionAsync('trip1', 'p1', 'user1');
    expect(accepted.schemaId).toBe('tripnara.decision_problem_apply_accepted@v1');
    expect(accepted.taskId).toMatch(/^dp_apply_/);
    expect(accepted.pollUrl).toContain(accepted.taskId);

    const entry = (service as unknown as { applyDeferredStore: { get: (id: string) => { promise: Promise<unknown> } } })
      .applyDeferredStore.get(accepted.taskId);
    await entry?.promise;

    const settled = service.getApplyTask('trip1', 'p1', accepted.taskId);
    expect(settled.status).toBe('READY');
    expect(settled.result?.schemaId).toBe('tripnara.decision_problem_apply@v1');
  });
});
