import {
  hasValue,
  injectWebBrowseUrlIfMissing,
  runValidatePlanInputs,
  runValidateSkillsInputs,
  validateSkillInputWithRule,
} from './dag-validate-inputs.runner';
import type { DagValidateInputsHost } from './dag-validate-inputs.host';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  AgentContext,
  ExecutionPlan,
  SkillsPlan,
} from '../interfaces/claude-orchestration.interface';

describe('dag-validate-inputs.runner', () => {
  describe('hasValue', () => {
    it('rejects empty-ish values', () => {
      expect(hasValue(undefined)).toBe(false);
      expect(hasValue(null)).toBe(false);
      expect(hasValue('')).toBe(false);
      expect(hasValue('x')).toBe(true);
      expect(hasValue(0)).toBe(true);
    });
  });

  describe('injectWebBrowseUrlIfMissing', () => {
    it('injects duckduckgo url when missing', () => {
      const plan = {
        selectedSkills: [
          { skillName: 'web.browse', reason: 'r', priority: 1, input: {} },
        ],
        executionOrder: ['web.browse'],
        dependencies: {},
      } as SkillsPlan;
      const request = { message: '冰岛穿搭清单' } as RouteAndRunRequestDto;
      injectWebBrowseUrlIfMissing(plan, request);
      expect((plan.selectedSkills[0].input as { url: string }).url).toContain(
        'duckduckgo.com',
      );
    });
  });

  function makeHost(overrides: Partial<DagValidateInputsHost> = {}): DagValidateInputsHost {
    return {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      buildSkillInputIntentSnapshot: jest.fn(() => undefined),
      prepareSkillInput: jest.fn(() => ({})),
      buildMissingParamClarificationMessage: jest.fn(
        ({ message }) => message,
      ),
      extractSolutionsFromError: jest.fn(() => ['补全参数']),
      extractCountryCodeFromMessage: jest.fn(() => undefined),
      ...overrides,
    };
  }

  const context = { userId: 'u1' } as AgentContext;
  const request = { message: 'hello', trip_id: 't1' } as RouteAndRunRequestDto;

  it('runValidateSkillsInputs uses skillInputValidator when present', async () => {
    const host = makeHost({
      skillInputValidator: {
        validate: jest.fn(() => ({
          valid: false,
          missingParams: ['url'],
        })),
      },
      skillsRegistry: {
        getSkill: jest.fn(() => ({ metadata: {} })),
      },
    });
    const skillsPlan = {
      selectedSkills: [
        { skillName: 'web.browse', reason: 'r', priority: 1, input: {} },
      ],
      executionOrder: ['web.browse'],
      dependencies: {},
    } as SkillsPlan;
    const out = await runValidateSkillsInputs(host, skillsPlan, context, request);
    expect(out.valid).toBe(false);
    expect(out.missingParams).toEqual(['url']);
    expect(out.clarificationMessage).toContain('url');
  });

  it('runValidatePlanInputs returns valid when no rules and no validator', async () => {
    const host = makeHost();
    const plan = {
      steps: [{ id: 's1', type: 'skill', skillName: 'unknown.skill', dependencies: [], parallel: false }],
      parallelGroups: [],
      fallbackStrategy: { onError: 'continue', retryCount: 1 },
    } as ExecutionPlan;
    const out = await runValidatePlanInputs(host, plan, context, request);
    expect(out.valid).toBe(true);
  });

  it('validateSkillInputWithRule reports missing dependency', () => {
    const host = makeHost();
    const out = validateSkillInputWithRule(
      host,
      'intent.recognize',
      {},
      { dependencies: [{ param: 'message' }] },
      context,
      request,
    );
    expect(out.missingParams).toContain('message');
  });
});
