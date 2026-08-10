import {
  extractJSONFromResponse,
  generateFallbackPlan,
  getDefaultRoutingDecision,
  normalizeRoutingDecision,
  runAnalyzeIntent,
  runDecideRouting,
  runPlanExecution,
  runSelectSkills,
} from './dag-intent-pipeline.runner';
import type { DagIntentPipelineHost } from './dag-intent-pipeline.host';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  AgentContext,
  IntentAnalysis,
  RoutingDecision,
  SkillsPlan,
} from '../interfaces/claude-orchestration.interface';

describe('dag-intent-pipeline.runner', () => {
  describe('extractJSONFromResponse', () => {
    it('parses fenced json', () => {
      const out = extractJSONFromResponse('```json\n{"a":1}\n```');
      expect(out).toEqual({ a: 1 });
    });
  });

  describe('normalizeRoutingDecision', () => {
    it('returns null for empty object', () => {
      expect(normalizeRoutingDecision({})).toBeNull();
    });

    it('normalizes valid route', () => {
      const out = normalizeRoutingDecision({
        route: 'SYSTEM2_REASONING',
        confidence: 0.9,
        reasoning: 'ok',
        budget: { max_seconds: 30, max_steps: 4, max_browser_steps: 1 },
      });
      expect(out?.route).toBe('SYSTEM2_REASONING');
      expect(out?.budget.max_seconds).toBe(30);
    });
  });

  describe('generateFallbackPlan', () => {
    it('builds sequential skill steps', () => {
      const plan = generateFallbackPlan({
        selectedSkills: [
          {
            skillName: 'trip.query',
            reason: 'r',
            priority: 1,
            input: { x: 1 },
          },
        ],
        executionOrder: ['trip.query'],
        dependencies: {},
      });
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].type).toBe('skill');
      expect(plan.steps[0].skillName).toBe('trip.query');
    });
  });

  function makeHost(overrides: Partial<DagIntentPipelineHost> = {}): DagIntentPipelineHost {
    return {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      callLlmWithFallback: jest.fn(),
      buildIntentAnalysisPrompt: jest.fn(() => 'intent-prompt'),
      buildRoutingPrompt: jest.fn(() => 'route-prompt'),
      buildSkillsSelectionPrompt: jest.fn(() => 'skills-prompt'),
      buildExecutionPlanningPrompt: jest.fn(() => 'plan-prompt'),
      getAvailableSkills: jest.fn(() => [{ name: 'trip.query', description: 'q' }]),
      ...overrides,
    };
  }

  const request = { request_id: 'r1', message: 'hi' } as RouteAndRunRequestDto;
  const context = { userId: 'u1' } as AgentContext;

  it('runAnalyzeIntent falls back on LLM failure', async () => {
    const host = makeHost({
      callLlmWithFallback: jest.fn().mockRejectedValue(new Error('llm down')),
    });
    const out = await runAnalyzeIntent(host, request, context, 'openai' as any);
    expect(out.intentType).toBe('simple_query');
    expect(out.reasoning).toContain('默认值');
  });

  it('runDecideRouting uses default when JSON invalid', async () => {
    const host = makeHost({
      callLlmWithFallback: jest.fn().mockResolvedValue('{}'),
    });
    const intent = {
      intentType: 'simple_query',
      complexity: 'simple',
      requiredCapabilities: [],
      confidence: 1,
      reasoning: 'x',
    } as IntentAnalysis;
    const out = await runDecideRouting(host, intent, 'openai' as any, 'r1');
    expect(out.route).toBe(getDefaultRoutingDecision('x').route);
  });

  it('runSelectSkills returns empty when no skills', async () => {
    const host = makeHost({
      getAvailableSkills: jest.fn(() => []),
    });
    const intent = {
      intentType: 'simple_query',
      complexity: 'simple',
      requiredCapabilities: [],
      confidence: 1,
      reasoning: 'x',
    } as IntentAnalysis;
    const routing = getDefaultRoutingDecision('x');
    const out = await runSelectSkills(
      host,
      intent,
      routing,
      context,
      'openai' as any,
    );
    expect(out.selectedSkills).toEqual([]);
    expect(host.callLlmWithFallback).not.toHaveBeenCalled();
  });

  it('runPlanExecution returns empty plan when no selected skills', async () => {
    const host = makeHost();
    const skillsPlan = {
      selectedSkills: [],
      executionOrder: [],
      dependencies: {},
    } as SkillsPlan;
    const routing = {} as RoutingDecision;
    const out = await runPlanExecution(host, skillsPlan, routing, 'openai' as any);
    expect(out.steps).toEqual([]);
    expect(host.callLlmWithFallback).not.toHaveBeenCalled();
  });
});
