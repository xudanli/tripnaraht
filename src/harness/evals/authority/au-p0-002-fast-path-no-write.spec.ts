import { getAuthorityCase } from '../authority/authority-cases.registry';
import {
  authorityAssert,
  expectAuthorityPass,
} from '../assertions/canonical-authority.assertions';
import { runAuthorityCaseWithContext } from './run-authority-case-with-context.util';
import { assertAuthorityResultHasAnchor } from './authority-context-anchor.util';
import { shouldAcquireTripOrchestrationLock } from '../../../agent/utils/trip-orchestration-lock.util';
import { signalsFromRequest } from '../../../agent/utils/orchestration-signals.util';
import type { RouteAndRunRequestDto } from '../../../agent/dto/route-and-run.dto';
import {
  EffectivePlanWriteGuardService,
  EffectivePlanWriteBypassError,
} from '../../../decision-runtime/execution/effective-plan-write-guard.service';
import {
  evaluateAgenticToolMutationGate,
  scanAgenticTraceForMutationTools,
} from '../../../decision-runtime/execution/agentic-mutation-commit.adapter';
import { applyAgenticRouteAndRunMutationGuard } from '../../../decision-runtime/execution/agentic-route-and-run-mutation.adapter';
import type { RouteAndRunResponseDto } from '../../../agent/dto/route-and-run.dto';

/**
 * AU-P0-002 — Fast Path must not write itinerary without authority chain.
 */
describe('AU-P0-002 — Fast Path write protection', () => {
  const caseDef = getAuthorityCase('AU-P0-002')!;
  const prevGuard = process.env.AGENTIC_MUTATION_WRITE_GUARD;

  beforeEach(() => {
    process.env.AGENTIC_MUTATION_WRITE_GUARD = 'ENFORCE';
  });

  afterEach(() => {
    if (prevGuard === undefined) delete process.env.AGENTIC_MUTATION_WRITE_GUARD;
    else process.env.AGENTIC_MUTATION_WRITE_GUARD = prevGuard;
  });

  it('DATA_LOOKUP with trip_id does not acquire trip write lock', async () => {
    const request = {
      request_id: 'au-p0-002-read',
      user_id: 'u1',
      trip_id: 'trip_1',
      message: '维克附近有什么好吃的',
    } as RouteAndRunRequestDto;
    const signals = signalsFromRequest(request);
    expect(signals.taskType).toBe('DATA_LOOKUP');
    expect(shouldAcquireTripOrchestrationLock(request, signals)).toBe(false);
  });

  it('TRIP_PLANNING acquires trip write lock when enabled', () => {
    const prev = process.env.TRIP_ORCHESTRATION_LOCK_ENABLED;
    process.env.TRIP_ORCHESTRATION_LOCK_ENABLED = '1';
    try {
      const request = {
        request_id: 'au-p0-002-write',
        user_id: 'u1',
        trip_id: 'trip_1',
        message: '把第三天行程改轻松一点',
      } as RouteAndRunRequestDto;
      const signals = signalsFromRequest(request);
      expect(shouldAcquireTripOrchestrationLock(request, signals)).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.TRIP_ORCHESTRATION_LOCK_ENABLED;
      else process.env.TRIP_ORCHESTRATION_LOCK_ENABLED = prev;
    }
  });

  it('EffectivePlanWriteGuard blocks setEffective outside execute context', () => {
    const prev = process.env.EFFECTIVE_PLAN_WRITE_GUARD;
    process.env.EFFECTIVE_PLAN_WRITE_GUARD = 'ENFORCE';
    try {
      const guard = new EffectivePlanWriteGuardService();
      expect(() => guard.assertSetEffectiveAllowed('test')).toThrow(EffectivePlanWriteBypassError);
    } finally {
      if (prev === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_GUARD;
      else process.env.EFFECTIVE_PLAN_WRITE_GUARD = prev;
    }
  });

  it(caseDef.description, async () => {
    const dispatchGate = evaluateAgenticToolMutationGate({
      mcpToolName: 'itinerary.apply_repair',
      tripId: 'trip_1',
    });

    const scan = scanAgenticTraceForMutationTools({
      steps: [
        {
          tool_results: [
            {
              envelope: {
                success: false,
                data: { mcpToolName: 'itinerary.apply_repair' },
                error: 'MUTATION_AUTHORITY_DENIED',
                sideEffects: {},
                confidence: 0,
              },
            },
          ],
        },
      ],
    });

    const request = {
      request_id: 'au-p0-002',
      user_id: 'u1',
      trip_id: 'trip_1',
      message: '移动第三天 POI',
    } as RouteAndRunRequestDto;

    const guarded = applyAgenticRouteAndRunMutationGuard({
      request,
      response: {
        request_id: 'au-p0-002',
        route: { route: 'SYSTEM2', confidence: 0.5, reasons: [] },
        result: { status: 'OK', answer_text: 'ok', payload: {} as any },
        explain: { decision_log: [] },
        observability: {},
      } as RouteAndRunResponseDto,
      agenticTrace: {
        steps: [
          {
            tool_results: [
              {
                envelope: {
                  success: false,
                  data: { mcpToolName: 'itinerary.apply_repair' },
                  error: 'MUTATION_AUTHORITY_DENIED',
                  sideEffects: {},
                  confidence: 0,
                },
              },
            ],
          },
        ],
      },
    });

    const guardPayload = (guarded.result.payload as any)?.canonical_mutation_guard;

    const result = await runAuthorityCaseWithContext({
      caseId: caseDef.caseId,
      tripId: 'trip_1',
      runtimeAuthority: 'CANONICAL',
      run: async () => [
        authorityAssert({
          layer: 'routing',
          name: 'agentic_dispatch_blocks_trip_mutation_without_envelope',
          pass: dispatchGate.allowed === false && !scan.hasSuccessfulMutation,
          expected: false,
          actual: dispatchGate.allowed,
        }),
        authorityAssert({
          layer: 'write_guard',
          name: 'agentic_response_marks_blocked_commit',
          pass: guardPayload?.canCommit === false,
          expected: false,
          actual: guardPayload?.canCommit,
        }),
      ],
    });

    expectAuthorityPass(result);
    assertAuthorityResultHasAnchor(result, { runtimeAuthority: 'CANONICAL' });
  });
});
