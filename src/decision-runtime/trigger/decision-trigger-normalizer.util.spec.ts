import {
  normalizeDecisionTriggerInput,
  buildDecisionRunId,
} from './decision-trigger-normalizer.util';
import { resolveDecisionRunRoute } from './decision-trigger-router.util';
import type { DecisionTriggerInput } from '../contracts/decision-run-request';

describe('decision-trigger-normalizer', () => {
  it('builds stable run id from requestId', () => {
    const id = buildDecisionRunId({
      kind: 'CANONICAL_PROBLEM_EVALUATE',
      tripId: 'trip-abc',
      source: 'UNIFIED_DECISION_API',
      requestId: 'req-123',
    });
    expect(id).toBe('req-123');
  });

  it('normalizes canonical evaluate trigger', () => {
    const request = normalizeDecisionTriggerInput({
      kind: 'CANONICAL_PROBLEM_EVALUATE',
      tripId: 'trip-abc',
      source: 'UNIFIED_DECISION_API',
      problemId: 'problem_road_1',
      requestId: 'run_test_1',
    });

    expect(request.schemaId).toBe('tripnara.decision_run_request@v1');
    expect(request.runId).toBe('run_test_1');
    expect(request.routeTarget).toBe('CANONICAL_L2_EVALUATE');
    expect(request.triggerKind).toBe('CANONICAL_PROBLEM_EVALUATE');
  });

  it('routes full plan selection', () => {
    const request = normalizeDecisionTriggerInput({
      kind: 'FULL_PLAN_SELECTION',
      tripId: 'trip-abc',
      source: 'DECISION_ENGINE_API',
    });
    expect(request.routeTarget).toBe('FULL_PLAN_SELECTION');
  });

  it('routes user intent with metadata override', () => {
    const target = resolveDecisionRunRoute({
      triggerKind: 'USER_INTENT',
      metadata: { intent: 'full_plan_selection' },
    });
    expect(target).toBe('FULL_PLAN_SELECTION');
  });

  it('marks canonical evaluate without problemId unsupported', () => {
    const input: DecisionTriggerInput = {
      kind: 'CANONICAL_PROBLEM_EVALUATE',
      tripId: 'trip-abc',
      source: 'INTERNAL',
    };
    const request = normalizeDecisionTriggerInput(input);
    expect(request.routeTarget).toBe('UNSUPPORTED');
  });
});
