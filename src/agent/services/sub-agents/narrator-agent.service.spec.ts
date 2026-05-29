import { ConfigService } from '@nestjs/config';
import { ClaudeNarratorAgentService } from './narrator-agent.service';
import type { DecisionOsExecutionContext } from '../../runtime/decision-os-execution-context';
import { DecisionOsExecutionContextStore } from '../../runtime/decision-os-execution-context.store';
import type { PlanDeltaIR } from '../../contracts/plan-delta-ir.types';
import type { GateResult, Itinerary, OrchestratorState } from '../../interfaces/trip-plan.interface';
import { PrometheusMetricsService } from '../../../monitoring/prometheus-metrics.service';
import { isNarratorIncrementalLlmEnabled } from './incremental-narrator.util';

function buildFiveDayItinerary(): Itinerary {
  return {
    request_id: 'req-narrator-e2e',
    trip_id: 'trip_perfect_999',
    days: Array.from({ length: 5 }, (_, i) => ({
      date: `2026-06-0${i + 1}`,
      items: [
        {
          type: 'POI',
          location_ref: { name: `POI-Day-${i + 1}` },
        },
      ],
    })),
  } as Itinerary;
}

function allowGate(): GateResult {
  return {
    gate_result: 'ALLOW',
    violations: [],
    required_adjustments: [],
    confidence: 0.95,
  } as GateResult;
}

describe('Decision OS Sub-Agent: Narrator Incremental End-to-End Guard', () => {
  const prevLlmFlag = process.env.NARRATOR_INCREMENTAL_LLM_ENABLED;
  const prevIncrementalFlag = process.env.NARRATOR_INCREMENTAL_ENABLED;

  afterEach(() => {
    process.env.NARRATOR_INCREMENTAL_LLM_ENABLED = prevLlmFlag;
    process.env.NARRATOR_INCREMENTAL_ENABLED = prevIncrementalFlag;
  });

  it('应当通过 ALS 只读宪法识别 D3 变动，复用 D1/D2/D4/D5 缓存并仅对 D3 触发 Context Engine + LLM', async () => {
    process.env.NARRATOR_INCREMENTAL_ENABLED = 'true';
    process.env.NARRATOR_INCREMENTAL_LLM_ENABLED = 'true';

    const mockD3Delta: PlanDeltaIR = {
      op: 'REPLACE',
      target: { type: 'HOTEL', dayIndex: 2, id: 'hotel_334' },
      payload: { query: '新高轮格兰王子大饭店' },
    };

    const mockDosContext = {
      tripId: 'trip_perfect_999',
      planDelta: [mockD3Delta],
      activeTripSummary: 'D1: POI-A | D2: POI-B | D3: HOTEL-C | D4: POI-D | D5: POI-E',
    } as unknown as DecisionOsExecutionContext;

    const mockStore = {
      get: jest.fn(() => mockDosContext),
    } as unknown as DecisionOsExecutionContextStore;

    const mockLlmService = {
      callLlmWithSchema: jest.fn().mockResolvedValue('Mocked D3 New Text'),
    };

    const mockContextEngineer = {
      build: jest.fn().mockResolvedValue({
        id: 'pkg-1',
        phase: 'NARRATE',
        agent: 'NarratorAgent',
        userQuery: '把第3天的酒店换了',
        blocks: [
          {
            key: 'plan_day_3',
            type: 'PLAN_DAY',
            text: '第3天：新高轮格兰王子大饭店',
            priority: 90,
            visibility: 'public',
            provenance: { source: 'db', identifier: 'trip', timestamp: new Date().toISOString() },
          },
        ],
        totalTokens: 120,
        tokenBudget: 2000,
        compressed: false,
        createdAt: new Date().toISOString(),
      }),
    };

    const mockProm = {
      recordNarratorIncrementalAudit: jest.fn(),
    } as unknown as PrometheusMetricsService;

    const service = new ClaudeNarratorAgentService(
      undefined,
      undefined,
      mockLlmService as any,
      mockStore,
      mockContextEngineer as any,
      new ConfigService(),
      mockProm,
    );

    const orchestratorState = {
      request_id: 'req-narrator-e2e',
      current_step: 'NARRATE',
      evidence_registry: new Map(),
      decision_log: [],
      errors: [],
      trip_plan_request: {
        message: '把第3天的酒店换了',
        trip_id: 'trip_perfect_999',
      },
      narration: {
        user_friendly_summary: '',
        day_by_day_narrative: [
          { day: 1, date: '2026-06-01', narrative: 'D1 Keep Intact' },
          { day: 2, date: '2026-06-02', narrative: 'D2 Keep Intact' },
          { day: 3, date: '2026-06-03', narrative: 'D3 Old Text' },
          { day: 4, date: '2026-06-04', narrative: 'D4 Keep Intact' },
          { day: 5, date: '2026-06-05', narrative: 'D5 Keep Intact' },
        ],
        highlights: [],
        tips: [],
      },
      metadata: {
        started_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
      },
    } as unknown as OrchestratorState;

    const result = await service.narrate(buildFiveDayItinerary(), allowGate(), [], orchestratorState);

    expect(mockStore.get).toHaveBeenCalled();
    expect(result.day_by_day_narrative[0]?.narrative).toBe('D1 Keep Intact');
    expect(result.day_by_day_narrative[1]?.narrative).toBe('D2 Keep Intact');
    expect(result.day_by_day_narrative[2]?.narrative).toBe('Mocked D3 New Text');
    expect(result.day_by_day_narrative[3]?.narrative).toBe('D4 Keep Intact');
    expect(result.day_by_day_narrative[4]?.narrative).toBe('D5 Keep Intact');
    expect(result.day_by_day_text_zh).toContain('D1 Keep Intact');
    expect(result.day_by_day_text_zh).toContain('Mocked D3 New Text');
    expect(result.day_by_day_text_zh).not.toContain('D3 Old Text');

    expect(mockContextEngineer.build).toHaveBeenCalledTimes(1);
    expect(mockContextEngineer.build).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: 'trip_perfect_999',
        phase: 'NARRATE',
        agent: 'NarratorAgent',
        targetDayIndex: 3,
        tokenBudget: 2000,
      }),
      true,
    );
    expect(mockLlmService.callLlmWithSchema).toHaveBeenCalledTimes(1);

    const audit = orchestratorState.metadata.narrative_incremental_audit as {
      is_incremental: boolean;
      updated_days_0based: number[];
      cache_hits: number;
      cache_misses: number;
    };
    expect(audit.is_incremental).toBe(true);
    expect(audit.updated_days_0based).toEqual([2]);
    expect(audit.cache_hits).toBe(4);
    expect(audit.cache_misses).toBe(1);

    expect(mockProm.recordNarratorIncrementalAudit).toHaveBeenCalledWith(
      audit,
      isNarratorIncrementalLlmEnabled() ? 'llm' : 'rule',
    );
  });

  it('metadata.dos_plan_delta 可在无 ALS 时作为降级宪法源', async () => {
    process.env.NARRATOR_INCREMENTAL_ENABLED = 'true';
    process.env.NARRATOR_INCREMENTAL_LLM_ENABLED = 'false';

    const service = new ClaudeNarratorAgentService();

    const orchestratorState = {
      request_id: 'req-fallback',
      current_step: 'NARRATE',
      evidence_registry: new Map(),
      decision_log: [],
      errors: [],
      metadata: {
        started_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
        dos_plan_delta: [
          {
            op: 'REPLACE',
            target: { type: 'POI', dayIndex: 0 },
            payload: { query: '新景点' },
          },
        ] satisfies PlanDeltaIR[],
        narrative_day_cache: {
          '1': 'D2 cached intact',
        },
      },
      narration: {
        user_friendly_summary: '',
        day_by_day_narrative: [
          { day: 2, date: '2026-06-02', narrative: 'D2 cached intact' },
        ],
        highlights: [],
        tips: [],
      },
    } as unknown as OrchestratorState;

    const itinerary = {
      request_id: 'req-fallback',
      trip_id: 'trip-1',
      days: [
        { date: '2026-06-01', items: [{ type: 'POI', location_ref: { name: '新景点A' } }] },
        { date: '2026-06-02', items: [{ type: 'POI', location_ref: { name: '景点B' } }] },
      ],
    } as Itinerary;

    const result = await service.narrate(itinerary, allowGate(), [], orchestratorState);

    expect(result.day_by_day_narrative[1]?.narrative).toBe('D2 cached intact');
    expect(result.day_by_day_narrative[0]?.narrative).toMatch(/第 1 天/);
    expect(orchestratorState.metadata.narrative_incremental_audit).toMatchObject({
      is_incremental: true,
      updated_days_0based: [0],
      cache_hits: 1,
      cache_misses: 1,
    });
  });
});
