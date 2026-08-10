import { runExecutePlanPath } from './execute-plan.runner';
import type { ExecutePlanHost } from './execute-plan.host';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  AgentContext,
  ExecutionPlan,
} from '../interfaces/claude-orchestration.interface';

describe('runExecutePlanPath', () => {
  const request = {
    request_id: 'r1',
    user_id: 'u1',
    message: 'hello',
  } as RouteAndRunRequestDto;
  const context = {} as AgentContext;

  function makeHost(overrides: Partial<ExecutePlanHost> = {}): ExecutePlanHost {
    const skillExecute = jest.fn(async () => ({ ok: true, summary: 'done' }));
    return {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      skillsRegistry: {
        getSkill: jest.fn(() => ({
          execute: skillExecute,
          metadata: { name: 'trip.query' },
        })),
        getAllSkills: jest.fn(() => [{ metadata: { name: 'trip.query' } }]),
      },
      actionRegistry: { get: jest.fn() } as any,
      prepareSkillInput: jest.fn(() => ({})),
      prepareActionInput: jest.fn(() => ({})),
      mergeSkillOutputWithPlanStateInput: jest.fn((_input, out) => out),
      sanitizeOrchestrationHandoff: jest.fn((_req, x) => x),
      generateAnswerText: jest.fn(() => 'answer'),
      buildClarificationMessage: jest.fn(() => 'clarify'),
      buildMissingParamClarificationMessage: jest.fn(() => 'missing'),
      extractSolutionsFromError: jest.fn(() => []),
      ...overrides,
    };
  }

  it('executes skill steps and returns success', async () => {
    const host = makeHost();
    const plan = {
      steps: [{ id: 's1', type: 'skill', skillName: 'trip.query' }],
      fallbackStrategy: { onError: 'continue' },
    } as ExecutionPlan;
    const out = await runExecutePlanPath(host, plan, context, request);
    expect(out.success).toBe(true);
    expect(out.answerText).toBe('answer');
    expect(out.stepsExecuted.some((s) => s.success)).toBe(true);
    expect(host.prepareSkillInput).toHaveBeenCalled();
  });

  it('returns failure when skill missing', async () => {
    const host = makeHost({
      skillsRegistry: {
        getSkill: jest.fn(() => undefined),
        getAllSkills: jest.fn(() => []),
      },
    });
    const plan = {
      steps: [{ id: 's1', type: 'skill', skillName: 'missing.skill' }],
      fallbackStrategy: { onError: 'stop' },
    } as ExecutionPlan;
    const out = await runExecutePlanPath(host, plan, context, request);
    expect(out.success).toBe(false);
    expect(typeof out.answerText).toBe('string');
    expect(out.answerText.length).toBeGreaterThan(0);
  });
});
