import { ConfigService } from '@nestjs/config';
import { ContextSlidingWindowAdapter } from '../context/services/context-sliding-window-adapter.service';
import { LlmIntentCompilerService } from './llm-intent-compiler.service';

const contextSlidingWindow = new ContextSlidingWindowAdapter();
import { DecisionOsExecutionContext } from './decision-os-execution-context';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentMemoryContext } from '../memory/interfaces/agent-memory-context.interface';

function minimalMemory(): AgentMemoryContext {
  return {
    snapshotId: 'snap-1',
    snapshotVersion: 1,
    requestId: 'req-1',
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
    loadedAt: new Date().toISOString(),
    observability: { layers: [] },
  };
}

function dosContext(request: RouteAndRunRequestDto): DecisionOsExecutionContext {
  return new DecisionOsExecutionContext({
    request,
    memory: minimalMemory(),
    worldState: {
      revision: 'v1',
      tripId: 'trip-1',
      days: [{ date: '2026-06-01', items: [] }],
    },
  });
}

describe('LlmIntentCompilerService', () => {
  it('returns experimental_plan_delta when provided', async () => {
    const svc = new LlmIntentCompilerService(contextSlidingWindow, undefined, new ConfigService());
    const request = {
      request_id: 'req-1',
      user_id: 'user-1',
      message: '换景点',
      trip_id: 'trip-1',
      options: {
        experimental_plan_delta: [
          {
            op: 'REPLACE',
            target: { type: 'POI', dayIndex: 1 },
            payload: { query: '涩谷' },
          },
        ],
      },
    } as RouteAndRunRequestDto;

    const result = await svc.compileToDelta(request, dosContext(request));
    expect(result.source).toBe('experimental');
    expect(result.deltas).toHaveLength(1);
    expect(result.deltas[0].target.type).toBe('POI');
  });

  it('uses legacy path when LLM compiler disabled', async () => {
    const svc = new LlmIntentCompilerService(
      contextSlidingWindow,
      undefined,
      new ConfigService({ INTENT_COMPILER_LLM_ENABLED: 'false' }),
    );
    const request = {
      request_id: 'req-1',
      user_id: 'user-1',
      message: '换第二天酒店',
      trip_id: 'trip-1',
      options: {
        itinerary_context: { is_replan: true },
        intent_flags: { modification_targets: ['hotel'] },
        refinement_signal: { type: 'REPLACEMENT' },
      },
    } as RouteAndRunRequestDto;

    const result = await svc.compileToDelta(request, dosContext(request));
    expect(result.source).toBe('legacy');
    expect(result.deltas[0]?.target.type).toBe('HOTEL');
  });

  it('returns none for chit-chat when LLM disabled', async () => {
    const svc = new LlmIntentCompilerService(contextSlidingWindow, undefined, new ConfigService());
    const request = {
      request_id: 'req-1',
      user_id: 'user-1',
      message: '你好',
      trip_id: 'trip-1',
    } as RouteAndRunRequestDto;

    const result = await svc.compileToDelta(request, dosContext(request));
    expect(result.source).toBe('none');
    expect(result.deltas).toEqual([]);
  });

  it('falls back to legacy when LLM call throws', async () => {
    const llm = {
      callChatWithTools: async () => {
        throw new Error('timeout');
      },
    } as any;
    const config = new ConfigService({ INTENT_COMPILER_LLM_ENABLED: 'true' });
    const svc = new LlmIntentCompilerService(contextSlidingWindow, llm, config);
    const request = {
      request_id: 'req-1',
      user_id: 'user-1',
      message: '换酒店',
      trip_id: 'trip-1',
      options: {
        enable_llm_intent_compiler: true,
        itinerary_context: { is_replan: true },
        intent_flags: { modification_targets: ['hotel'] },
        refinement_signal: { type: 'REPLACEMENT' },
      },
    } as RouteAndRunRequestDto;

    const result = await svc.compileToDelta(request, dosContext(request));
    expect(result.source).toBe('legacy');
    expect(result.deltas[0]?.target.type).toBe('HOTEL');
  });
});
