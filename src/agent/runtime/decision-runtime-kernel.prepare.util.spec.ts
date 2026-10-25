import { prepareDecisionRuntimeTick } from './decision-runtime-kernel.prepare.util';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentMemoryContext } from '../memory/interfaces/agent-memory-context.interface';

function minimalMemory(): AgentMemoryContext {
  return {
    snapshotId: 'snap-k',
    snapshotVersion: 1,
    requestId: 'req-k',
    userId: 'user-1',
    tripId: 'trip-1',
    userProfile: null,
    userBasics: null,
    travelPreference: null,
    routePartyProfile: null,
    recentDecisions: [],
    decisionLedger: null,
    ledgerRecomputePlan: null,
    recentWorldDecisions: [],
    activeTripState: null,
    recoveryHistory: [],
    failurePatterns: [],
    recentTripFeedbacks: [],
    loadedAt: new Date().toISOString(),
    observability: { layers: [] },
  };
}

describe('prepareDecisionRuntimeTick', () => {
  it('records MEMORY_HYDRATE and MVCC_FREEZE phases', async () => {
    const memory = minimalMemory();
    const result = await prepareDecisionRuntimeTick(
      {
        memoryContextAssembler: {
          loadForRouteAndRun: async () => memory,
          buildObservability: () => ({ revision: 'v1', loaded: true }),
        },
        hydrateRequestFitnessIfNeeded: async () => undefined,
        agentExecutionContextFactory: {
          createFromFrozenMemory: (m) => ({
            requestId: m.requestId,
            snapshotId: m.snapshotId,
            snapshotVersion: m.snapshotVersion,
            executionBinding: {
              snapshot_id: m.snapshotId,
              snapshot_version: m.snapshotVersion,
              request_id: m.requestId,
            },
          }),
        },
        getEntryResponses: () => ({
          createReplayMemoryPersistenceUnavailableResponse: () => ({}) as any,
          createReplayMemorySnapshotNotFoundResponse: () => ({}) as any,
        }),
      },
      {
        request_id: 'req-k',
        user_id: 'user-1',
        message: 'hello',
        trip_id: 'trip-1',
      } as RouteAndRunRequestDto,
      Date.now(),
    );

    expect(result.earlyResponse).toBeUndefined();
    expect(result.bundle.memory.snapshotId).toBe('snap-k');
    const phases = result.bundle.tickObs.phases.map((p) => p.phase);
    expect(phases).toContain('MEMORY_HYDRATE');
    expect(phases).toContain('LEDGER_RECONCILE');
    expect(phases).toContain('MVCC_FREEZE');
    expect(Object.isFrozen(result.bundle.memory)).toBe(true);
  });

  it('records decision_trigger_hint before freezing memory when trip_id is present', async () => {
    const memory = minimalMemory();
    const result = await prepareDecisionRuntimeTick(
      {
        memoryContextAssembler: {
          loadForRouteAndRun: async () => memory,
          buildObservability: () => ({ revision: 'v1', loaded: true }),
        },
        hydrateRequestFitnessIfNeeded: async () => undefined,
        agentExecutionContextFactory: {
          createFromFrozenMemory: (m) => ({
            requestId: m.requestId,
            snapshotId: m.snapshotId,
            snapshotVersion: m.snapshotVersion,
            executionBinding: {
              snapshot_id: m.snapshotId,
              snapshot_version: m.snapshotVersion,
              request_id: m.requestId,
            },
          }),
        },
        getEntryResponses: () => ({
          createReplayMemoryPersistenceUnavailableResponse: () => ({}) as any,
          createReplayMemorySnapshotNotFoundResponse: () => ({}) as any,
        }),
      },
      {
        request_id: 'req-trigger',
        user_id: 'user-1',
        message: '帮我分析行程',
        trip_id: 'trip-1',
      } as RouteAndRunRequestDto,
      Date.now(),
    );

    expect(result.earlyResponse).toBeUndefined();
    expect(result.bundle.tickObs.decision_trigger?.trigger_input.tripId).toBe('trip-1');
    expect(result.bundle.memory.observability.layers).toContain('decision_trigger_hint');
    expect(Object.isFrozen(result.bundle.memory)).toBe(true);
  });

  it('shadow-assembles Travel Context without replacing old Memory OS', async () => {
    const memory = minimalMemory();
    const assemble = jest.fn().mockReturnValue({
      schemaId: 'tripnara.assembled_decision_context@v1',
      version: 1,
      task: 'Iceland self-drive',
      assembledAt: new Date().toISOString(),
      slices: [],
      memoryDecisionSafe: true,
      contract: {
        schemaId: 'tripnara.context_assembly_contract@v1',
        version: 1,
        task: 'Iceland self-drive',
        providers: ['MEMORY'],
        deny: [],
      },
      memory: null,
      decisionContract: null,
      selfDriveWorld: null,
      booking: null,
      team: null,
      shadowBaseline: { memoryOmitted: true, providersWithoutMemory: [] },
      mode: 'SHADOW',
    });
    const toObservability = jest.fn().mockReturnValue({
      mode: 'SHADOW',
      providersIncluded: ['MEMORY', 'SELF_DRIVE_WORLD'],
    });

    const result = await prepareDecisionRuntimeTick(
      {
        memoryContextAssembler: {
          loadForRouteAndRun: async () => memory,
          buildObservability: () => ({ revision: 'v1', loaded: true }),
        },
        hydrateRequestFitnessIfNeeded: async () => undefined,
        agentExecutionContextFactory: {
          createFromFrozenMemory: (m) => ({
            requestId: m.requestId,
            snapshotId: m.snapshotId,
            snapshotVersion: m.snapshotVersion,
            executionBinding: {
              snapshot_id: m.snapshotId,
              snapshot_version: m.snapshotVersion,
              request_id: m.requestId,
            },
          }),
        },
        getEntryResponses: () => ({
          createReplayMemoryPersistenceUnavailableResponse: () => ({}) as any,
          createReplayMemorySnapshotNotFoundResponse: () => ({}) as any,
        }),
        travelContextAssembler: {
          isEnabled: () => true,
          assemble,
          toObservability,
        },
      },
      {
        request_id: 'req-tmr-shadow',
        user_id: 'user-1',
        message: 'Iceland self-drive glacier hike?',
        trip_id: 'trip-1',
      } as RouteAndRunRequestDto,
      Date.now(),
    );

    expect(assemble).toHaveBeenCalled();
    expect(result.bundle.tickObs.travel_context_assembly).toEqual(
      expect.objectContaining({ mode: 'SHADOW' }),
    );
    expect(result.bundle.assembledTravelContext?.mode).toBe('SHADOW');
    expect(result.bundle.memory.observability.layers).toContain(
      'travel_context_assembly_shadow',
    );
    expect(result.bundle.memory.snapshotId).toBe('snap-k');
  });

  it('selectively consumes TMR hints when mode=CONSUME and gate passes', async () => {
    const memory = minimalMemory();
    const assemble = jest.fn().mockReturnValue({
      schemaId: 'tripnara.assembled_decision_context@v1',
      version: 1,
      task: 'SHOULD_WE_DO_GLACIER_HIKE Iceland',
      assembledAt: new Date().toISOString(),
      slices: [],
      memoryDecisionSafe: true,
      contract: {
        schemaId: 'tripnara.context_assembly_contract@v1',
        version: 1,
        task: 'SHOULD_WE_DO_GLACIER_HIKE Iceland',
        providers: ['MEMORY', 'DECISION_CONTRACT', 'SELF_DRIVE_WORLD'],
        deny: ['SELF_DRIVE_AS_MEMORY', 'CONTRACT_AS_MEMORY'],
      },
      memory: {
        schemaId: 'tripnara.memory_context_package@v1',
        task: 'SHOULD_WE_DO_GLACIER_HIKE Iceland',
        builtAt: new Date().toISOString(),
        structured: {
          pace: {
            key: 'travel.pace',
            value: 'RELAXED',
            confidence: 0.9,
            scope: 'GLOBAL_USER',
            status: 'ACTIVE',
            sourceType: 'USER_EXPLICIT',
            evidenceEventIds: ['M-PACE-1'],
            validFrom: new Date().toISOString(),
            validTo: null,
            lastConfirmedAt: null,
          },
        },
        tripMemory: null,
        relevantEpisodes: [],
        semanticEvidence: [],
        conflicts: [],
        missingMemory: [],
        contract: {
          schemaId: 'tripnara.memory_contract@v1',
          version: 1,
          task: 'SHOULD_WE_DO_GLACIER_HIKE',
          allow: ['PACE_PREFERENCE'],
          deny: [],
          includeUserProfileFields: ['pace'],
          includeTripMemory: false,
          includeWorking: false,
          maxEpisodes: 0,
          includeSemantic: false,
          needs: [],
          reason: 'test',
        },
        memoryContext: {
          facts: [],
          preferences: [],
          episodes: [],
          confidence: [],
          evidence: [],
          conflicts: [],
        },
        decisionSafe: true,
        designPrinciple: 'test',
      },
      decisionContract: {
        schemaId: 'tripnara.decision_contract_slice@v1',
        constraints: ['avoid_night_drive'],
        riskGates: [],
        source: 'REQUEST_HINTS',
      },
      selfDriveWorld: {
        schemaId: 'tripnara.self_drive_world_slice@v1',
        keys: ['road_status'],
        hasFullContext: false,
      },
      booking: null,
      team: null,
      shadowBaseline: { memoryOmitted: true, providersWithoutMemory: [] },
      mode: 'CONSUME',
    });

    const result = await prepareDecisionRuntimeTick(
      {
        memoryContextAssembler: {
          loadForRouteAndRun: async () => memory,
          buildObservability: () => ({ revision: 'v1', loaded: true }),
        },
        hydrateRequestFitnessIfNeeded: async () => undefined,
        agentExecutionContextFactory: {
          createFromFrozenMemory: (m) => ({
            requestId: m.requestId,
            snapshotId: m.snapshotId,
            snapshotVersion: m.snapshotVersion,
            executionBinding: {
              snapshot_id: m.snapshotId,
              snapshot_version: m.snapshotVersion,
              request_id: m.requestId,
            },
          }),
        },
        getEntryResponses: () => ({
          createReplayMemoryPersistenceUnavailableResponse: () => ({}) as any,
          createReplayMemorySnapshotNotFoundResponse: () => ({}) as any,
        }),
        travelContextAssembler: {
          isEnabled: () => true,
          assemble,
          toObservability: () => ({ mode: 'CONSUME' }),
        },
      },
      {
        request_id: 'req-tmr-consume',
        user_id: 'user-1',
        message: 'SHOULD_WE_DO_GLACIER_HIKE Iceland',
        trip_id: 'trip-1',
      } as RouteAndRunRequestDto,
      Date.now(),
    );

    expect(result.bundle.travelMemoryConsume?.gate.allowed).toBe(true);
    expect(result.bundle.travelMemoryConsume?.contributionPreview.used).toBe(
      false,
    );
    expect(result.bundle.tickObs.travel_memory_consume).toEqual(
      expect.objectContaining({ gateAllowed: true, contributionUsed: false }),
    );
    expect(result.bundle.memory.observability.layers).toContain(
      'travel_context_assembly_consume',
    );
    expect(result.bundle.memory.snapshotId).toBe('snap-k');
  });

  it('always shadow-resolves EffectiveTravelerContext without changing DecisionHints path', async () => {
    const memory = minimalMemory();
    memory.userProfile = {
      userId: 'user-1',
      pacePreference: 'MODERATE',
      riskTolerance: 'MEDIUM',
      confidence: 0.7,
      source: 'explicit',
      updatedAt: new Date(),
    };
    memory.userBasics = {
      dietaryRestrictions: ['vegetarian'],
    };

    const result = await prepareDecisionRuntimeTick(
      {
        memoryContextAssembler: {
          loadForRouteAndRun: async () => memory,
          buildObservability: () => ({ revision: 'v1', loaded: true }),
        },
        hydrateRequestFitnessIfNeeded: async () => undefined,
        agentExecutionContextFactory: {
          createFromFrozenMemory: (m) => ({
            requestId: m.requestId,
            snapshotId: m.snapshotId,
            snapshotVersion: m.snapshotVersion,
            executionBinding: {
              snapshot_id: m.snapshotId,
              snapshot_version: m.snapshotVersion,
              request_id: m.requestId,
            },
          }),
        },
        getEntryResponses: () => ({
          createReplayMemoryPersistenceUnavailableResponse: () => ({}) as any,
          createReplayMemorySnapshotNotFoundResponse: () => ({}) as any,
        }),
      },
      {
        request_id: 'req-etc-shadow',
        user_id: 'user-1',
        message: 'hello',
        trip_id: 'trip-1',
      } as RouteAndRunRequestDto,
      Date.now(),
    );

    expect(result.bundle.effectiveTravelerContext?.consumptionMode).toBe(
      'SHADOW',
    );
    expect(result.bundle.effectiveTravelerContext?.effective.pace?.value).toBe(
      'MODERATE',
    );
    expect(
      result.bundle.effectiveTravelerContext?.effective.dietaryConstraints
        ?.value,
    ).toEqual(['vegetarian']);
    expect(result.bundle.tickObs.effective_traveler_context).toEqual(
      expect.objectContaining({
        consumptionMode: 'SHADOW',
        itemCount: expect.any(Number),
      }),
    );
    expect(result.bundle.memory.observability.layers).toContain(
      'effective_traveler_context_shadow',
    );
    expect(result.bundle.execCtx.effectiveTravelerContext?.consumptionMode).toBe(
      'SHADOW',
    );
    // M1：未接 TMR consume 时不应注入 decision hints
    expect(result.bundle.execCtx.travelMemoryDecisionHints).toBeUndefined();
  });

  it('marks ETC ACTIVE when EFFECTIVE_TRAVELER_CONTEXT_CONSUME=active', async () => {
    const prev = process.env.EFFECTIVE_TRAVELER_CONTEXT_CONSUME;
    process.env.EFFECTIVE_TRAVELER_CONTEXT_CONSUME = 'active';
    const memory = minimalMemory();
    memory.userProfile = {
      userId: 'user-1',
      pacePreference: 'MODERATE',
      confidence: 0.7,
      source: 'explicit',
      updatedAt: new Date(),
    };

    try {
      const result = await prepareDecisionRuntimeTick(
        {
          memoryContextAssembler: {
            loadForRouteAndRun: async () => memory,
            buildObservability: () => ({ revision: 'v1', loaded: true }),
          },
          hydrateRequestFitnessIfNeeded: async () => undefined,
          agentExecutionContextFactory: {
            createFromFrozenMemory: (m) => ({
              requestId: m.requestId,
              snapshotId: m.snapshotId,
              snapshotVersion: m.snapshotVersion,
              executionBinding: {
                snapshot_id: m.snapshotId,
                snapshot_version: m.snapshotVersion,
                request_id: m.requestId,
              },
            }),
          },
          getEntryResponses: () => ({
            createReplayMemoryPersistenceUnavailableResponse: () => ({}) as any,
            createReplayMemorySnapshotNotFoundResponse: () => ({}) as any,
          }),
        },
        {
          request_id: 'req-etc-active',
          user_id: 'user-1',
          message: 'hello',
          trip_id: 'trip-1',
        } as RouteAndRunRequestDto,
        Date.now(),
      );

      expect(result.bundle.effectiveTravelerContext?.consumptionMode).toBe(
        'ACTIVE',
      );
      expect(result.bundle.tickObs.effective_traveler_context?.consumeMode).toBe(
        'active',
      );
      expect(result.bundle.memory.observability.layers).toContain(
        'effective_traveler_context_active',
      );
      // M3：active 时即使无 TMR CONSUME，也从 ETC 注入 soft hints
      expect(result.bundle.execCtx.travelMemoryDecisionHints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'travel.pace',
            value: 'MODERATE',
            advisoryOnly: true,
          }),
        ]),
      );
      expect(
        result.bundle.tickObs.effective_traveler_context?.softHintsAudit,
      ).toEqual(
        expect.objectContaining({
          softSource: 'etc',
          applied: true,
        }),
      );
      expect(result.bundle.memory.observability.layers).toContain(
        'effective_traveler_context_soft_active',
      );
    } finally {
      if (prev === undefined) delete process.env.EFFECTIVE_TRAVELER_CONTEXT_CONSUME;
      else process.env.EFFECTIVE_TRAVELER_CONTEXT_CONSUME = prev;
    }
  });

  it('shadow soft: keeps TMR hints injection and records etc vs tmr audit', async () => {
    const prev = process.env.EFFECTIVE_TRAVELER_CONTEXT_CONSUME;
    process.env.EFFECTIVE_TRAVELER_CONTEXT_CONSUME = 'shadow';
    const memory = minimalMemory();

    try {
      const result = await prepareDecisionRuntimeTick(
        {
          memoryContextAssembler: {
            loadForRouteAndRun: async () => memory,
            buildObservability: () => ({ revision: 'v1', loaded: true }),
          },
          hydrateRequestFitnessIfNeeded: async () => undefined,
          agentExecutionContextFactory: {
            createFromFrozenMemory: (m) => ({
              requestId: m.requestId,
              snapshotId: m.snapshotId,
              snapshotVersion: m.snapshotVersion,
              executionBinding: {
                snapshot_id: m.snapshotId,
                snapshot_version: m.snapshotVersion,
                request_id: m.requestId,
              },
            }),
          },
          getEntryResponses: () => ({
            createReplayMemoryPersistenceUnavailableResponse: () => ({}) as any,
            createReplayMemorySnapshotNotFoundResponse: () => ({}) as any,
          }),
          travelContextAssembler: {
            isEnabled: () => true,
            assemble: () =>
              ({
                schemaId: 'tripnara.assembled_decision_context@v1',
                version: 1,
                task: 'SHOULD_WE_DO_GLACIER_HIKE Iceland',
                assembledAt: new Date().toISOString(),
                slices: [],
                memoryDecisionSafe: true,
                contract: {
                  schemaId: 'tripnara.context_assembly_contract@v1',
                  version: 1,
                  task: 'SHOULD_WE_DO_GLACIER_HIKE Iceland',
                  providers: ['MEMORY'],
                  deny: [],
                },
                memory: {
                  schemaId: 'tripnara.memory_context_package@v1',
                  task: 'SHOULD_WE_DO_GLACIER_HIKE Iceland',
                  builtAt: new Date().toISOString(),
                  structured: {
                    pace: {
                      key: 'travel.pace',
                      value: 'RELAXED',
                      confidence: 0.9,
                      scope: 'GLOBAL_USER',
                      status: 'ACTIVE',
                      sourceType: 'USER_EXPLICIT',
                      evidenceEventIds: ['M-PACE-1'],
                      validFrom: new Date().toISOString(),
                      validTo: null,
                      lastConfirmedAt: null,
                    },
                  },
                  tripMemory: null,
                  relevantEpisodes: [],
                  semanticEvidence: [],
                  conflicts: [],
                  missingMemory: [],
                  contract: {
                    schemaId: 'tripnara.memory_contract@v1',
                    version: 1,
                    task: 'x',
                    allow: ['PACE_PREFERENCE'],
                    deny: [],
                    includeUserProfileFields: ['pace'],
                    includeTripMemory: false,
                    includeWorking: false,
                    maxEpisodes: 0,
                    includeSemantic: false,
                    needs: [],
                    reason: 'test',
                  },
                  memoryContext: {
                    facts: [],
                    preferences: [],
                    episodes: [],
                    confidence: [],
                    evidence: [],
                    conflicts: [],
                  },
                  decisionSafe: true,
                  designPrinciple: 'test',
                },
                decisionContract: null,
                selfDriveWorld: null,
                booking: null,
                team: null,
                shadowBaseline: { memoryOmitted: true, providersWithoutMemory: [] },
                mode: 'CONSUME',
              }) as any,
            toObservability: () => ({ mode: 'CONSUME' }),
          },
        },
        {
          request_id: 'req-etc-soft-shadow',
          user_id: 'user-1',
          message: 'SHOULD_WE_DO_GLACIER_HIKE Iceland',
          trip_id: 'trip-1',
        } as RouteAndRunRequestDto,
        Date.now(),
      );

      expect(result.bundle.travelMemoryConsume?.gate.allowed).toBe(true);
      expect(result.bundle.execCtx.travelMemoryDecisionHints?.[0]?.key).toBe(
        'travel.pace',
      );
      expect(
        result.bundle.tickObs.effective_traveler_context?.softHintsAudit,
      ).toEqual(
        expect.objectContaining({
          mode: 'shadow',
          softSource: 'tmr',
          applied: false,
        }),
      );
      expect(result.bundle.memory.observability.layers).toContain(
        'effective_traveler_context_soft_shadow',
      );
    } finally {
      if (prev === undefined) delete process.env.EFFECTIVE_TRAVELER_CONTEXT_CONSUME;
      else process.env.EFFECTIVE_TRAVELER_CONTEXT_CONSUME = prev;
    }
  });
});
