import { runPlanningStateMachinePath } from './planning-state-machine.runner';
import type { PlanningStateMachineHost } from './planning-state-machine.host';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentContext } from '../interfaces/claude-orchestration.interface';

jest.mock('../../llm/token-context.storage', () => ({
  setLlmTraceRoutePath: jest.fn(),
}));

function makeHost(overrides: Partial<PlanningStateMachineHost> = {}): PlanningStateMachineHost {
  return {
    logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
    getLlmProvider: jest.fn(() => 'openai' as any),
    isKernelEnabledForRequest: jest.fn(() => false),
    kernelCreateInitialOpts: jest.fn(() => ({})),
    mergeGovernanceRuntimeBranchDirective: jest.fn((_r, d) => d),
    computeResumeHarnessEntryFromLast: jest.fn(),
    asPrePlanGraphHost: jest.fn(() => ({})),
    asPlanVerifyLoopHost: jest.fn(() => ({})),
    asPostPlanGraphHost: jest.fn(() => ({})),
    runPlanGenWithEmptyDraftGuard: jest.fn(),
    runTravelCompilePhaseIfEnabled: jest.fn(),
    maybeAutoApplyItineraryAdjustCorridor: jest.fn(),
    maybeSnapshot: jest.fn(),
    enrichOrchestrationResultWithFullTripReplanHotel: jest.fn(async (r) => r),
    buildSuccessResult: jest.fn(),
    buildErrorResult: jest.fn(),
    orchestrateWorkbenchAssistantPlaceholder: jest.fn(async () => ({
      success: true,
      answerText: 'workbench',
      result: { workbench_assistant_placeholder: true },
      stepsExecuted: [],
      totalDuration: 1,
      decisionLog: [],
    })),
    ...overrides,
  };
}

describe('runPlanningStateMachinePath early exits', () => {
  it('short-circuits silent vote create CTA', async () => {
    const host = makeHost();
    const out = await runPlanningStateMachinePath(
      host,
      {
        request_id: 'r1',
        user_id: 'u1',
        trip_id: '11111111-1111-1111-1111-111111111111',
        message: '发起投票',
        options: {},
      } as RouteAndRunRequestDto,
      { tripId: '11111111-1111-1111-1111-111111111111' } as AgentContext,
    );
    expect(out.success).toBe(true);
    expect(out.answerText).toContain('发起投票');
    expect(out.result.suggested_operations?.length).toBeGreaterThan(0);
    expect(host.getLlmProvider).not.toHaveBeenCalled();
  });

  it('short-circuits team fitness submission status lookup', async () => {
    const host = makeHost({
      prisma: {
        trip: {
          findUnique: jest.fn().mockResolvedValue({ name: 'Trip', metadata: {} }),
        },
        tripCollaborator: {
          findMany: jest.fn().mockResolvedValue([{ userId: 'u2', role: 'VIEWER' }]),
        },
        user: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'u2', displayName: 'Missing', email: null },
          ]),
        },
        $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      } as never,
    });
    const out = await runPlanningStateMachinePath(
      host,
      {
        request_id: 'r-fit',
        user_id: 'u1',
        trip_id: '11111111-1111-1111-1111-111111111111',
        message: '谁还没有提交体能信息？',
        options: {},
      } as RouteAndRunRequestDto,
      { tripId: '11111111-1111-1111-1111-111111111111' } as AgentContext,
    );
    expect(out.success).toBe(true);
    expect(out.answerText).toContain('Missing');
    expect(out.answerText).toContain('未提交');
    expect(host.getLlmProvider).not.toHaveBeenCalled();
  });

  it('delegates workbench placeholder to host', async () => {
    const host = makeHost();
    const placeholderMsg = [
      '行程助手 Nara：已关联当前行程。',
      '你可以在这一页提问，或使用下方可选快捷语句。',
      '可选快捷语句：查看第 1 天；调整行程；询问天气。',
      '本消息为工作台 UI 占位欢迎语，用于短路状态机入口，避免误跑完整规划主链。',
      '请直接输入你的问题，无需重复说明行程上下文。',
    ].join('');
    const out = await runPlanningStateMachinePath(
      host,
      {
        request_id: 'r2',
        user_id: 'u1',
        trip_id: '11111111-1111-1111-1111-111111111111',
        message: placeholderMsg,
        options: {},
      } as RouteAndRunRequestDto,
      { tripId: '11111111-1111-1111-1111-111111111111' } as AgentContext,
    );
    expect(host.orchestrateWorkbenchAssistantPlaceholder).toHaveBeenCalled();
    expect(out.answerText).toBe('workbench');
  });
});

