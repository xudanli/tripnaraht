import { dispatchOrchestrateEntry } from './orchestrate-entry.dispatcher';
import { buildNeedDestinationCountryResult } from './need-destination-country-result.util';
import type { OrchestrateEntryHost } from './orchestrate-entry.host';
import type { OrchestrateEntryDecision } from './request-router.types';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentContext, OrchestrationResult } from '../interfaces/claude-orchestration.interface';

jest.mock('../../llm/token-context.storage', () => ({
  setLlmTraceRoutePath: jest.fn(),
}));

jest.mock('../services/orchestration-stability.util', () => ({
  createDeadline: jest.fn(() => ({
    remainingMs: () => 60_000,
    clamp: (ms: number) => ms,
  })),
}));

function stubResult(tag: string): OrchestrationResult {
  return {
    success: true,
    status: 'DONE',
    technicalSuccess: true,
    userTaskCompleted: true,
    result: { tag },
    answerText: tag,
    stepsExecuted: [],
    totalDuration: 1,
    decisionLog: [],
  };
}

function makeHost(overrides: Partial<OrchestrateEntryHost> = {}): OrchestrateEntryHost & {
  calls: string[];
} {
  const calls: string[] = [];
  const host: OrchestrateEntryHost & { calls: string[] } = {
    calls,
    logger: {
      log: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    },
    runItineraryDayView: jest.fn(async () => {
      calls.push('day_view');
      return stubResult('day_view');
    }),
    runWorkbenchPlaceholder: jest.fn(async () => {
      calls.push('workbench');
      return stubResult('workbench');
    }),
    runLightweightKnowledgeQuery: jest.fn(async () => {
      calls.push('knowledge');
      return stubResult('knowledge');
    }),
    runTeamStructuredDiscussion: jest.fn(async () => {
      calls.push('team');
      return stubResult('team');
    }),
    runPlanningStateMachine: jest.fn(async () => {
      calls.push('sm');
      return stubResult('sm');
    }),
    ...overrides,
  };
  return host;
}

const baseRequest = {
  request_id: 'r1',
  user_id: 'u1',
  message: 'hello',
  options: {},
} as RouteAndRunRequestDto;

const baseContext = { routingTaskType: 'GENERIC_QA' } as AgentContext;

describe('dispatchOrchestrateEntry', () => {
  const startTime = Date.now() - 10;

  it('LIGHTWEIGHT itinerary_day_view', async () => {
    const host = makeHost();
    const entryDecision: OrchestrateEntryDecision = {
      mode: 'LIGHTWEIGHT',
      handler: 'itinerary_day_view',
      reason: 'bound_trip_day_view',
      tracePath: 'LIGHTWEIGHT',
      decisionDepth: 'REALITY_ONLY',
    };
    const out = await dispatchOrchestrateEntry({
      entryDecision,
      request: { ...baseRequest },
      context: baseContext,
      deadline: undefined,
      llmProvider: 'openai' as any,
      startTime,
      host,
    });
    expect(out.kind).toBe('terminal');
    if (out.kind === 'terminal') expect(out.result.result.tag).toBe('day_view');
    expect(host.calls).toEqual(['day_view']);
  });

  it('LIGHTWEIGHT workbench_placeholder', async () => {
    const host = makeHost();
    const out = await dispatchOrchestrateEntry({
      entryDecision: {
        mode: 'LIGHTWEIGHT',
        handler: 'workbench_placeholder',
        reason: 'workbench',
        tracePath: 'LIGHTWEIGHT',
        decisionDepth: 'REALITY_ONLY',
      },
      request: { ...baseRequest },
      context: baseContext,
      deadline: undefined,
      llmProvider: 'openai' as any,
      startTime,
      host,
    });
    expect(out.kind).toBe('terminal');
    expect(host.calls).toEqual(['workbench']);
  });

  it('LIGHTWEIGHT knowledge_query applies patchOptions', async () => {
    const host = makeHost();
    const request = { ...baseRequest, options: {} } as RouteAndRunRequestDto;
    const out = await dispatchOrchestrateEntry({
      entryDecision: {
        mode: 'LIGHTWEIGHT',
        handler: 'knowledge_query',
        reason: 'data_lookup',
        tracePath: 'LIGHTWEIGHT',
        decisionDepth: 'REALITY_ONLY',
        patchOptions: {
          intent_mode: 'DATA_LOOKUP',
          use_state_machine_orchestration: false,
        },
      },
      request,
      context: baseContext,
      deadline: undefined,
      llmProvider: 'openai' as any,
      startTime,
      host,
    });
    expect(out.kind).toBe('terminal');
    expect(host.calls).toEqual(['knowledge']);
    expect(request.options?.intent_mode).toBe('DATA_LOOKUP');
    expect(request.options?.use_state_machine_orchestration).toBe(false);
  });

  it('TEAM_STRUCTURED_DISCUSSION', async () => {
    const host = makeHost();
    const out = await dispatchOrchestrateEntry({
      entryDecision: {
        mode: 'TEAM_STRUCTURED_DISCUSSION',
        reason: 'team',
        tracePath: 'TEAM_BYPASS',
        userMessage: '我们投票吧',
        decisionDepth: 'FOCUSED_DECISION',
      },
      request: { ...baseRequest },
      context: baseContext,
      deadline: undefined,
      llmProvider: 'openai' as any,
      startTime,
      host,
    });
    expect(out.kind).toBe('terminal');
    expect(host.calls).toEqual(['team']);
    expect(host.runTeamStructuredDiscussion).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      '我们投票吧',
      startTime,
    );
  });

  it('PLANNING_STATE_MACHINE', async () => {
    const host = makeHost();
    const out = await dispatchOrchestrateEntry({
      entryDecision: {
        mode: 'PLANNING_STATE_MACHINE',
        reason: 'trip_planning',
        entry: 'new_trip_with_country',
        tracePath: 'STATE_MACHINE',
        suggestedDeadlineMs: 90_000,
        decisionDepth: 'FULL_SIMULATION',
      },
      request: { ...baseRequest },
      context: baseContext,
      deadline: undefined,
      llmProvider: 'openai' as any,
      startTime,
      host,
    });
    expect(out.kind).toBe('terminal');
    expect(host.calls).toEqual(['sm']);
    if (out.kind === 'terminal') {
      expect(out.result.totalDuration).toBeGreaterThanOrEqual(0);
    }
  });

  it('NEED_DESTINATION_COUNTRY builds clarification without host handlers', async () => {
    const host = makeHost();
    const entryDecision: OrchestrateEntryDecision = {
      mode: 'NEED_DESTINATION_COUNTRY',
      reason: 'missing_country',
      tracePath: 'CLAUDE_DYNAMIC',
      decisionDepth: 'REALITY_AND_RELATIONS',
    };
    const out = await dispatchOrchestrateEntry({
      entryDecision,
      request: { ...baseRequest, message: '帮我规划行程' },
      context: baseContext,
      deadline: undefined,
      llmProvider: 'openai' as any,
      startTime,
      host,
    });
    expect(out.kind).toBe('terminal');
    expect(host.calls).toEqual([]);
    if (out.kind === 'terminal') {
      expect(out.result.status).toBe('NEED_USER_INPUT');
      expect(out.result.result.missingParams).toContain('countryCode');
      expect(out.result.result.requestRouterDecision).toEqual(entryDecision);
    }
  });

  it('DYNAMIC_DAG returns continue_dynamic', async () => {
    const host = makeHost();
    const out = await dispatchOrchestrateEntry({
      entryDecision: {
        mode: 'DYNAMIC_DAG',
        reason: 'default',
        tracePath: 'CLAUDE_DYNAMIC',
        decisionDepth: 'FOCUSED_DECISION',
      },
      request: { ...baseRequest },
      context: baseContext,
      deadline: undefined,
      llmProvider: 'openai' as any,
      startTime,
      host,
    });
    expect(out).toEqual({ kind: 'continue_dynamic' });
    expect(host.calls).toEqual([]);
  });
});

describe('buildNeedDestinationCountryResult', () => {
  it('marks NEED_USER_INPUT with countryCode missing', () => {
    const result = buildNeedDestinationCountryResult({
      request: baseRequest,
      entryDecision: {
        mode: 'NEED_DESTINATION_COUNTRY',
        reason: 'x',
        tracePath: 'CLAUDE_DYNAMIC',
        decisionDepth: 'REALITY_AND_RELATIONS',
      },
      startTime: Date.now(),
    });
    expect(result.success).toBe(false);
    expect(result.status).toBe('NEED_USER_INPUT');
    expect(result.answerText).toContain('目的地国家或地区');
    expect(result.answerText).not.toContain('无法完成行程规划');
    expect(result.result.clarification_slots?.[0]?.slot).toBe('destination_country');
  });

  it('Alps region soft-clarifies main landing country', () => {
    const result = buildNeedDestinationCountryResult({
      request: { ...baseRequest, message: '阿尔卑斯自驾一周' },
      entryDecision: {
        mode: 'NEED_DESTINATION_COUNTRY',
        reason: 'new_trip_region_needs_country',
        tracePath: 'CLAUDE_DYNAMIC',
        decisionDepth: 'REALITY_AND_RELATIONS',
        regionCode: 'ALPS',
      },
      startTime: Date.now(),
    });
    expect(result.answerText).toContain('阿尔卑斯');
    expect(result.answerText).toContain('主落地国家');
  });
});
