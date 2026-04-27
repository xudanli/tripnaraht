/**
 * Locks `result.payload.ui_display.evidence_cards_ui` parallel to `decision_metadata.evidence_cards`.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { RouteAndRunResponseAssemblerService } from './route-and-run-response-assembler.service';
import { JepaProjectorService } from './jepa-projector.service';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestrationResult } from '../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

describe('RouteAndRunResponseAssemblerService — ui_display.evidence_cards_ui', () => {
  async function createAssembler() {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RouteAndRunResponseAssemblerService, JepaProjectorService],
    }).compile();
    return module.get(RouteAndRunResponseAssemblerService);
  }

  it('injects Tier-3 wind UI props with impact, social proof, and policy anchor (state machine path)', async () => {
    const assembler = await createAssembler();
    const state: OrchestratorState = {
      request_id: 'ui-display-1',
      current_step: 'DONE',
      verdict: 'ALLOW',
      plan_version: 0,
      decision_log: [
        {
          request_id: 'ui-display-1',
          step: 'VERIFY',
          actor: 'CoreDecision',
          inputs_summary: '',
          outputs_summary: '',
          evidence_refs: [],
          timestamp: new Date().toISOString(),
        },
      ],
      evidence_registry: new Map(),
      errors: [],
      metadata: {
        started_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
        wall_hit_distance_ms: 9_000_000,
        precedent_n: 8,
        precedent_accept_pct: 91,
      },
      narration: {
        user_friendly_summary: 's',
        day_by_day_narrative: [],
        highlights: [],
        tips: [],
        warnings: [
          {
            kind: 'iron_shield_evidence',
            message: 'Wind message',
            severity: 'HARD',
            rule_id: 'temp_wind_speed_drive_limit_v1',
            rule_name: 'High wind warning for driving segments',
            persuasion_tier: 3,
            narrator_hint_rendered: 'Tier 3 wind hint with physical anchor 25.0 m/s',
            evidence: {
              type: 'weather_physics',
              source: 'segment_prediction',
              value_mps: 25,
              threshold_mps: 15,
            },
          },
        ],
      },
    } as OrchestratorState;

    const orchestrationResult: OrchestrationResult = {
      success: true,
      answerText: 'ok',
      stepsExecuted: [{ stepId: 'VERIFY', success: true, duration: 1 }],
      totalDuration: 1,
      totalCost: 0,
      result: {
        state,
        itinerary: { request_id: 'ui-display-1', days: [] },
        gate_result: {
          gate_result: 'ALLOW',
          violations: [],
          required_adjustments: [],
          confidence: 1,
          evidence_refs: [],
        },
      },
    };

    const request = {
      request_id: 'ui-display-1',
      message: 'plan',
    } as RouteAndRunRequestDto;

    const resp = assembler.assembleClaudeStateMachineResponse({
      request,
      startTime: Date.now(),
      orchestrationResult,
    });

    const payload = resp.result.payload as Record<string, unknown>;
    const ui = payload.ui_display as { evidence_cards_ui?: unknown[] } | undefined;
    const logical = payload.decision_metadata as { evidence_cards?: unknown[] } | undefined;

    expect(logical?.evidence_cards).toHaveLength(1);
    expect(ui?.evidence_cards_ui).toHaveLength(1);

    const card = ui!.evidence_cards_ui![0] as Record<string, unknown>;
    expect(card.tier).toBe(3);
    expect(card.layout).toBe('authoritative');
    expect(card.theme).toBe('weather');
    expect(card.valueDisplay).toBe('25.0 m/s');
    expect(card.benchmark).toBe('Threshold: 15.0 m/s');
    expect(card.sourceLabel).toBe('segment_prediction');

    const impact = card.impact as { hours: number; label: string };
    expect(impact.hours).toBe(2.5);
    expect(impact.label).toBe('Estimated delay');

    expect(card.socialProof).toEqual({ count: 8, percentage: 91 });
    expect(card.policyReference).toMatchObject({
      ruleId: 'temp_wind_speed_drive_limit_v1',
      ruleName: 'High wind warning for driving segments',
    });
  });

  it('injects ui_display on System1 fast path when state has narration warnings', async () => {
    const assembler = await createAssembler();
    const state: OrchestratorState = {
      request_id: 's1-ui',
      current_step: 'DONE',
      decision_log: [],
      evidence_registry: new Map(),
      errors: [],
      metadata: { started_at: new Date().toISOString(), last_updated_at: new Date().toISOString() },
      narration: {
        user_friendly_summary: 's',
        day_by_day_narrative: [],
        highlights: [],
        tips: [],
        warnings: [
          {
            kind: 'iron_shield_evidence',
            message: 'm',
            severity: 'SOFT',
            rule_id: 'temp_aurora_visibility_v2',
            persuasion_tier: 1,
            evidence: { type: 'solar_physics', source: 'sunset', baseline: '16:30', offset_min: 60, twilight_buffer_min: 30 },
          },
        ],
      },
    } as OrchestratorState;

    const orchestrationResult: OrchestrationResult = {
      success: true,
      answerText: 'fast',
      stepsExecuted: [],
      totalDuration: 1,
      result: {
        routingDecision: {
          route: 'SYSTEM1_API',
          confidence: 0.9,
          reasoning: 'r',
          budget: { max_seconds: 3, max_steps: 1, max_browser_steps: 0 },
        },
        state,
      },
    };

    const resp = assembler.assembleClaudeDynamicResponse({
      request: { request_id: 's1-ui', message: 'q' } as RouteAndRunRequestDto,
      startTime: Date.now(),
      orchestrationResult,
      system1Result: {
        success: true,
        answerText: 'ok',
        result: { timeline: [], dropped_items: [], candidates: [], evidence: [], robustness: null },
      },
    });

    const payload = resp.result.payload as Record<string, unknown>;
    const uiList = (payload.ui_display as { evidence_cards_ui?: unknown[] })?.evidence_cards_ui;
    expect(Array.isArray(uiList)).toBe(true);
    expect((uiList as unknown[]).length).toBe(1);
    const c = (uiList as Record<string, unknown>[])[0];
    expect(c.tier).toBe(1);
    expect(c.layout).toBe('minimalist');
    expect(c.theme).toBe('solar');
    expect(c.impact).toBeUndefined();
    expect(c.socialProof).toBeUndefined();
  });
});
