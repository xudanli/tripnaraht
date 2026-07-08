import { LlmRouteNarrativeProvider } from './llm-route-narrative.provider';
import type { RouteGenerationContext } from '../types/exploration-route-generation.types';

describe('LlmRouteNarrativeProvider', () => {
  const provider = new LlmRouteNarrativeProvider();
  let prev: string | undefined;

  beforeEach(() => {
    prev = process.env.EXPLORATION_LLM_ROUTE_NARRATIVE;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.EXPLORATION_LLM_ROUTE_NARRATIVE;
    else process.env.EXPLORATION_LLM_ROUTE_NARRATIVE = prev;
  });

  const ctx: RouteGenerationContext = {
    scenarioId: 'scn-1',
    tripId: 'trip-1',
    destinationCode: 'IS',
    protocolId: null,
    generationVersion: 1,
    rankedPrinciples: ['REMOTE_EXPLORATION'],
    initialInput: {
      destinationCodes: ['IS'],
      dateRange: { startDate: '2026-07-01', endDate: '2026-07-09' },
      travelers: [{ type: 'ADULT' }],
      mobilityContext: { vehicleType: '4WD_SUV' },
      source: 'USER_CREATED',
    },
  };

  it('passes through when LLM flag is off', async () => {
    delete process.env.EXPLORATION_LLM_ROUTE_NARRATIVE;
    const base = [{ routeId: 'r1', strategyId: 's1', narrative: 'base', generationSource: 'PERSONALIZED' as const, variantBranchKey: 'v1', title: '南岸', metrics: {}, gains: [], sacrifices: [] }];
    const out = await provider.enrich(base, ctx);
    expect(out[0]?.narrative).toBe('base');
    expect(out[0]?.generationSource).toBe('PERSONALIZED');
  });

  it('rewrites narrative and marks LLM when flag is on (template path)', async () => {
    process.env.EXPLORATION_LLM_ROUTE_NARRATIVE = '1';
    delete process.env.EXPLORATION_LLM_ROUTE_NARRATIVE_LIVE;
    const base = [{
      routeId: 'r1',
      strategyId: 's1',
      narrative: 'base narrative',
      generationSource: 'PERSONALIZED' as const,
      variantBranchKey: 'v1',
      title: '南岸深度',
      metrics: {},
      gains: [],
      sacrifices: [],
      tagline: '轻松',
    }];
    const out = await provider.enrich(base, ctx);
    expect(out[0]?.generationSource).toBe('LLM');
    expect(out[0]?.narrative).toContain('AI 建议');
    expect(out[0]?.narrative).toContain('偏远探索');
  });

  it('uses LLM response when live flag is on', async () => {
    process.env.EXPLORATION_LLM_ROUTE_NARRATIVE = '1';
    process.env.EXPLORATION_LLM_ROUTE_NARRATIVE_LIVE = '1';
    const llm = {
      callLlmWithSchema: jest.fn().mockResolvedValue(
        JSON.stringify({
          routes: [{
            routeId: 'r1',
            narrative: 'LLM 生成的解读',
            tagline: 'AI tag',
            poiMentions: ['Reynisfjara', 'Jökulsárlón'],
          }],
        }),
      ),
    };
    const liveProvider = new LlmRouteNarrativeProvider(llm as never);
    const base = [{
      routeId: 'r1',
      strategyId: 's1',
      narrative: 'base',
      generationSource: 'PERSONALIZED' as const,
      variantBranchKey: 'v1',
      title: '南岸',
      metrics: {},
      gains: [],
      sacrifices: [],
    }];
    const out = await liveProvider.enrich(base, ctx);
    expect(llm.callLlmWithSchema).toHaveBeenCalled();
    expect(out[0]?.narrative).toContain('途经：');
    expect(out[0]?.narrative).toContain('Reynisfjara');
    expect(out[0]?.generationSource).toBe('LLM');
  });
});
