/**
 * ClaudeOrchestratorService — 编排返回前对 Harness trace 的收口（finalizeHarnessTraceFromOrchestration）
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ClaudeOrchestratorService } from './claude-orchestrator.service';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { SKILLS_REGISTRY_TOKEN } from '../../skills/services/skills-registry.token';
import { DecisionKernelService } from '../../decision/kernel/decision-kernel.service';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

describe('ClaudeOrchestratorService — finalize harness trace on build* returns', () => {
  const rid = 'orch-harness-finalize-1';

  const minimalOrchestratorState = (over: Partial<OrchestratorState> = {}): OrchestratorState =>
    ({
      request_id: rid,
      current_step: 'DONE',
      trip_plan_request: {} as any,
      decision_log: [],
      errors: [],
      evidence_registry: new Map(),
      metadata: { started_at: new Date().toISOString(), last_updated_at: new Date().toISOString() },
      ...over,
    }) as OrchestratorState;

  const minimalDso = (): DecisionState =>
    ({
      requestId: rid,
      userIntent: {},
      tripState: {},
      environmentState: {},
      systemState: {
        requestId: rid,
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        version: 0,
      },
    }) as DecisionState;

  async function createOrchestrator(decisionKernel?: { finalizeHarnessTraceIfRecorded: jest.Mock }) {
    const providers: any[] = [
      ClaudeOrchestratorService,
      {
        provide: LlmService,
        useValue: {
          getDefaultProvider: jest.fn().mockReturnValue(LlmProvider.ANTHROPIC),
          callLlmWithSchema: jest.fn(),
        },
      },
      {
        provide: SKILLS_REGISTRY_TOKEN,
        useValue: {
          getAllSkills: jest.fn().mockReturnValue([]),
          getSkill: jest.fn().mockReturnValue(null),
        },
      },
    ];
    if (decisionKernel) {
      providers.push({ provide: DecisionKernelService, useValue: decisionKernel });
    }
    const module: TestingModule = await Test.createTestingModule({ providers }).compile();
    return module.get<ClaudeOrchestratorService>(ClaudeOrchestratorService);
  }

  it('buildSuccessResult invokes finalizeHarnessTraceIfRecorded with DONE when no clarification', async () => {
    const finalizeHarnessTraceIfRecorded = jest.fn();
    const orch = await createOrchestrator({ finalizeHarnessTraceIfRecorded });
    const dso = minimalDso();
    const state = minimalOrchestratorState({
      itinerary: { request_id: rid, days: [{ date: '2026-07-01', items: [] }] } as any,
    });

    (orch as any).buildSuccessResult(state, Date.now(), dso);

    expect(finalizeHarnessTraceIfRecorded).toHaveBeenCalledTimes(1);
    expect(finalizeHarnessTraceIfRecorded).toHaveBeenCalledWith(dso, 'DONE');
  });

  it('buildSuccessResult uses NEED_USER_CONFIRM when clarification_questions present', async () => {
    const finalizeHarnessTraceIfRecorded = jest.fn();
    const orch = await createOrchestrator({ finalizeHarnessTraceIfRecorded });
    const dso = minimalDso();
    const state = minimalOrchestratorState({
      clarification_questions: [{ question: 'Where?', hint: 'Pick' } as any],
    });

    (orch as any).buildSuccessResult(state, Date.now(), dso);

    expect(finalizeHarnessTraceIfRecorded).toHaveBeenCalledWith(dso, 'NEED_USER_CONFIRM');
  });

  it('buildBlockedResult invokes finalizeHarnessTraceIfRecorded with BLOCKED', async () => {
    const finalizeHarnessTraceIfRecorded = jest.fn();
    const orch = await createOrchestrator({ finalizeHarnessTraceIfRecorded });
    const dso = minimalDso();
    const state = minimalOrchestratorState({
      gate_result: {
        gate_result: 'BLOCK',
        violations: [{ type: 'SAFETY', severity: 'HARD', detail: 'no' }],
        required_adjustments: [],
        confidence: 0.5,
        evidence_refs: [],
      } as any,
    });

    (orch as any).buildBlockedResult(state, Date.now(), dso);

    expect(finalizeHarnessTraceIfRecorded).toHaveBeenCalledWith(dso, 'BLOCKED');
  });

  it('buildClarificationResult invokes finalizeHarnessTraceIfRecorded with NEED_USER_CONFIRM', async () => {
    const finalizeHarnessTraceIfRecorded = jest.fn();
    const orch = await createOrchestrator({ finalizeHarnessTraceIfRecorded });
    const dso = minimalDso();
    const state = minimalOrchestratorState({
      clarification_questions: [],
      gaps: [],
    });

    (orch as any).buildClarificationResult(state, Date.now(), dso);

    expect(finalizeHarnessTraceIfRecorded).toHaveBeenCalledWith(dso, 'NEED_USER_CONFIRM');
  });

  it('buildErrorResult invokes finalizeHarnessTraceIfRecorded with FAILED', async () => {
    const finalizeHarnessTraceIfRecorded = jest.fn();
    const orch = await createOrchestrator({ finalizeHarnessTraceIfRecorded });
    const dso = minimalDso();
    const state = minimalOrchestratorState();

    (orch as any).buildErrorResult(state, new Error('boom'), Date.now(), dso);

    expect(finalizeHarnessTraceIfRecorded).toHaveBeenCalledWith(dso, 'FAILED');
  });

  it('does not call kernel when decisionKernel is not injected', async () => {
    const orch = await createOrchestrator(undefined);
    const dso = minimalDso();
    const state = minimalOrchestratorState({
      itinerary: { request_id: rid, days: [{ date: '2026-07-01', items: [] }] } as any,
    });

    expect(() => (orch as any).buildSuccessResult(state, Date.now(), dso)).not.toThrow();
  });

  it('does not call finalize when decisionState is omitted', async () => {
    const finalizeHarnessTraceIfRecorded = jest.fn();
    const orch = await createOrchestrator({ finalizeHarnessTraceIfRecorded });
    const state = minimalOrchestratorState({
      itinerary: { request_id: rid, days: [{ date: '2026-07-01', items: [] }] } as any,
    });

    (orch as any).buildSuccessResult(state, Date.now());

    expect(finalizeHarnessTraceIfRecorded).not.toHaveBeenCalled();
  });
});
