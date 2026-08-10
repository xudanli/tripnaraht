import { runDynamicDagPath } from './dynamic-dag.runner';
import type { DynamicDagHost } from './dynamic-dag.host';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentContext } from '../interfaces/claude-orchestration.interface';

jest.mock('../../llm/token-context.storage', () => ({
  setLlmTraceRoutePath: jest.fn(),
}));

jest.mock('../utils/orchestration-triage.util', () => ({
  isOrchestrationTriageEnabled: () => false,
}));

function makeHost(overrides: Partial<DynamicDagHost> = {}): DynamicDagHost {
  return {
    logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
    skillsRegistry: { getSkill: jest.fn() },
    runOrchestrationTriage: jest.fn(),
    analyzeIntent: jest.fn(async () => ({
      intentType: 'simple_query',
      complexity: 'simple',
      requiredCapabilities: ['qa'],
      confidence: 0.9,
      reasoning: 'test',
    })),
    decideRouting: jest.fn(async () => ({
      route: 'LIGHT',
      reason: 'test',
    })),
    selectSkills: jest.fn(async () => ({
      selectedSkills: [{ skillName: 'trip.query' }],
    })),
    planExecution: jest.fn(async () => ({
      steps: [{ skillName: 'trip.query' }],
    })),
    validateSkillsInputs: jest.fn(async () => ({ valid: true })),
    validatePlanInputs: jest.fn(async () => ({ valid: true })),
    buildMissingParamClarificationMessage: jest.fn(() => 'missing'),
    injectWebBrowseUrlIfMissing: jest.fn(),
    extractCountryCodeFromMessage: jest.fn(() => undefined),
    buildSkillInputIntentSnapshot: jest.fn(() => ({})),
    executePlan: jest.fn(async () => ({
      success: true,
      answerText: 'ok',
      result: {},
      stepsExecuted: [{ stepId: 's1', success: true, duration: 1 }],
      totalDuration: 1,
      decisionLog: [],
    })),
    ...overrides,
  } as DynamicDagHost;
}

describe('runDynamicDagPath', () => {
  const request = {
    request_id: 'r1',
    user_id: 'u1',
    message: '东京有什么好吃的',
    options: {},
  } as RouteAndRunRequestDto;
  const context = {} as AgentContext;

  it('runs Intent→Route→Skills→executePlan when triage off', async () => {
    const host = makeHost();
    const out = await runDynamicDagPath(
      host,
      request,
      context,
      undefined,
      'openai' as any,
      Date.now(),
    );
    expect(host.analyzeIntent).toHaveBeenCalled();
    expect(host.decideRouting).toHaveBeenCalled();
    expect(host.selectSkills).toHaveBeenCalled();
    expect(host.executePlan).toHaveBeenCalled();
    expect(out.success).toBe(true);
    expect(out.answerText).toBe('ok');
  });

  it('returns clarification when skills validation fails', async () => {
    const host = makeHost({
      validateSkillsInputs: jest.fn(async () => ({
        valid: false,
        missingParams: ['trip_id'],
        clarificationMessage: '需要 trip_id',
        solutions: ['绑定行程'],
      })),
    });
    const out = await runDynamicDagPath(
      host,
      request,
      context,
      undefined,
      'openai' as any,
      Date.now(),
    );
    expect(out.success).toBe(false);
    expect(out.result.needsUserConfirmation).toBe(true);
    expect(out.answerText).toContain('trip_id');
    expect(host.executePlan).not.toHaveBeenCalled();
  });
});
