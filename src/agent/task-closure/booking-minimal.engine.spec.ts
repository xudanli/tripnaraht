import {
  applyBookingCallPolicy,
  bookingExecutionContextsEqual,
  buildBookingToolLoopSummary,
  classifyBookingNoProgressReason,
  cloneBookingExecutionContext,
  deriveBookingCompletion,
  deriveBookingSuggestedActions,
  detectBookingFailurePattern,
  isBookingCompletionSatisfied,
  isBookingProgressForward,
  suggestBookingStage,
} from './booking-minimal.engine';
import type { BookingExecutionContext } from './booking-minimal.types';

describe('booking-minimal task closure', () => {
  it('deriveBookingCompletion + satisfaction', () => {
    const empty: BookingExecutionContext = { route: [], inventory_checked: false, failures: [] };
    expect(isBookingCompletionSatisfied(deriveBookingCompletion(empty))).toBe(false);

    const done: BookingExecutionContext = {
      route: [{}],
      inventory_checked: true,
      failures: [],
    };
    expect(isBookingCompletionSatisfied(deriveBookingCompletion(done))).toBe(true);
  });

  it('isBookingProgressForward is strict completion diff', () => {
    const empty = deriveBookingCompletion({ route: [], inventory_checked: false, failures: [] });
    const withRoute = deriveBookingCompletion({ route: [{}], inventory_checked: false, failures: [] });
    const withInv = deriveBookingCompletion({ route: [{}], inventory_checked: true, failures: [] });
    expect(isBookingProgressForward(empty, withRoute)).toBe(true);
    expect(isBookingProgressForward(withRoute, withInv)).toBe(true);
    expect(isBookingProgressForward(empty, empty)).toBe(false);
    expect(isBookingProgressForward(withRoute, withRoute)).toBe(false);
  });

  it('suggestBookingStage follows route → inventory heuristic', () => {
    expect(suggestBookingStage({ route: [], inventory_checked: false, failures: [] })).toBe('search');
    expect(suggestBookingStage({ route: [{}], inventory_checked: false, failures: [] })).toBe('validate');
    expect(suggestBookingStage({ route: [{}], inventory_checked: true, failures: [] })).toBe('book');
  });

  it('applyBookingCallPolicy blocks wrong stage actions', () => {
    const r = applyBookingCallPolicy('search', [
      { type: 'PROPOSED_ACTION', name: 'search_poi', intent: 'booking' },
      { type: 'PROPOSED_ACTION', name: 'check_inventory', intent: 'booking' },
    ]);
    expect(r.allowed).toHaveLength(1);
    expect(r.allowed[0].name).toBe('search_poi');
    expect(r.discouraged).toHaveLength(0);
    expect(r.blocked).toHaveLength(1);
    expect(r.blocked[0].reason).toContain('search');
    expect(r.suggested).toEqual([]);
  });

  it('applyBookingCallPolicy: bad_params history → discouraged same semantic', () => {
    const p = { type: 'PROPOSED_ACTION' as const, name: 'check_weather', intent: 'booking' as const };
    const r = applyBookingCallPolicy('validate', [p], {
      recentNoProgressReasons: ['bad_params'],
      lastNoProgressSemantics: ['check_weather'],
      externalBlockAttempts: new Map(),
    });
    expect(r.allowed).toHaveLength(0);
    expect(r.discouraged).toHaveLength(1);
    expect(r.discouraged[0].name).toBe('check_weather');
    expect(r.blocked).toHaveLength(0);
    expect(r.suggested).toEqual([]);
  });

  it('applyBookingCallPolicy: no_effect history → block repeat semantic', () => {
    const p = { type: 'PROPOSED_ACTION' as const, name: 'check_weather', intent: 'booking' as const };
    const r = applyBookingCallPolicy('validate', [p], {
      recentNoProgressReasons: ['no_effect'],
      lastNoProgressSemantics: ['check_weather'],
      externalBlockAttempts: new Map(),
    });
    expect(r.blocked).toHaveLength(1);
    expect(r.blocked[0].reason).toContain('repeat_no_effect');
    expect(r.suggested).toEqual([]);
  });

  it('applyBookingCallPolicy: external strikes ≥2 blocks semantic', () => {
    const p = { type: 'PROPOSED_ACTION' as const, name: 'check_weather', intent: 'booking' as const };
    const r = applyBookingCallPolicy('validate', [p], {
      recentNoProgressReasons: [],
      lastNoProgressSemantics: [],
      externalBlockAttempts: new Map([['check_weather', 2]]),
    });
    expect(r.blocked).toHaveLength(1);
    expect(r.blocked[0].reason).toContain('external_block_exhausted');
    expect(r.suggested).toEqual([]);
  });

  it('buildBookingToolLoopSummary aggregates booking fields', () => {
    const summary = buildBookingToolLoopSummary([
      {
        booking_progress_made: true,
        booking_failure_pattern: 'ineffective_loop',
        booking_pattern_stability: 3,
        tool_results: [{ envelope: { orchestrator_robustness: { failure_code: 'X' } } }],
      },
      {
        booking_no_progress_step: true,
        booking_no_progress_reason: 'no_effect',
        booking_failure_pattern: 'none',
        tool_results: [{ envelope: { orchestrator_robustness: { failure_code: 'POLICY_BLOCKED' } } }],
      },
    ]);
    expect(summary.steps).toBe(2);
    expect(summary.progress_steps).toBe(1);
    expect(summary.no_progress_steps).toBe(1);
    expect(summary.no_progress_by_reason.no_effect).toBe(1);
    expect(summary.total_executed_steps).toBe(1);
    expect(summary.loop_efficiency).toBe(1);
    expect(summary.step_efficiency).toBe(0.5);
    expect(summary.failure_pattern_last).toBe('ineffective_loop');
    expect(summary.pattern_stability_last).toBe(3);
    expect(summary.dominant_pattern).toBe('ineffective_loop');
    expect(summary.suggested_override_count).toBe(0);
    expect(summary.suggested_usage_rate).toBe(0);
  });

  it('detectBookingFailurePattern: ineffective alternating bad_params/no_effect (len 4)', () => {
    expect(
      detectBookingFailurePattern(['bad_params', 'no_effect', 'bad_params', 'no_effect']),
    ).toBe('ineffective_loop');
  });

  it('detectBookingFailurePattern: external_blocked when ≥2 external_block', () => {
    expect(detectBookingFailurePattern(['external_block', 'no_effect', 'external_block'])).toBe(
      'external_blocked',
    );
  });

  it('detectBookingFailurePattern: stage_misaligned consecutive invalid_stage', () => {
    expect(detectBookingFailurePattern(['invalid_stage', 'invalid_stage'])).toBe('stage_misaligned');
  });

  it('applyBookingCallPolicy: ineffective_loop pattern blocks last round semantics', () => {
    const p = { type: 'PROPOSED_ACTION' as const, name: 'check_weather', intent: 'booking' as const };
    const r = applyBookingCallPolicy('validate', [p], {
      lastNoProgressSemantics: ['check_weather'],
      externalBlockAttempts: new Map(),
      failurePattern: 'ineffective_loop',
    });
    expect(r.blocked).toHaveLength(1);
    expect(r.blocked[0].reason).toContain('ineffective_loop');
    expect(r.suggested.map((s) => s.name)).toEqual(['check_time']);
  });

  it('deriveBookingSuggestedActions: ineffective_loop prefers untried semantics', () => {
    const s = deriveBookingSuggestedActions({
      stage: 'validate',
      pattern: 'ineffective_loop',
      lastNoProgressSemantics: ['check_weather'],
      externalBlockAttempts: new Map(),
    });
    expect(s.map((x) => x.name)).toEqual(['check_time']);
  });

  it('clone + bookingExecutionContextsEqual round-trip', () => {
    const ctx: BookingExecutionContext = {
      route: [{ x: 1 }],
      inventory_checked: false,
      failures: [{ at: 't', detail: 'd' }],
    };
    const c = cloneBookingExecutionContext(ctx);
    expect(c).not.toBe(ctx);
    expect(bookingExecutionContextsEqual(ctx, c)).toBe(true);
  });

  it('classifyBookingNoProgressReason: invalid_stage when policy stage ≠ ground stage', () => {
    const ctxBefore: BookingExecutionContext = { route: [], inventory_checked: false, failures: [] };
    expect(
      classifyBookingNoProgressReason({
        policyStage: 'validate',
        ctxBefore,
        ctxAfter: ctxBefore,
        executedEnvelopes: [{ success: true }],
        executedSemanticActions: ['check_weather'],
      }),
    ).toBe('invalid_stage');
  });

  it('classifyBookingNoProgressReason: no_effect when ctx unchanged and MCP ok', () => {
    const ctx: BookingExecutionContext = { route: [{ k: 1 }], inventory_checked: false, failures: [] };
    expect(
      classifyBookingNoProgressReason({
        policyStage: 'validate',
        ctxBefore: ctx,
        ctxAfter: cloneBookingExecutionContext(ctx),
        executedEnvelopes: [{ success: true }],
        executedSemanticActions: ['check_weather'],
      }),
    ).toBe('no_effect');
  });

  it('classifyBookingNoProgressReason: external_block on MCP failure', () => {
    const before: BookingExecutionContext = { route: [{}], inventory_checked: false, failures: [] };
    const after: BookingExecutionContext = {
      ...before,
      failures: [...before.failures, { at: 'check_weather', detail: 'x' }],
    };
    expect(
      classifyBookingNoProgressReason({
        policyStage: 'validate',
        ctxBefore: before,
        ctxAfter: after,
        executedEnvelopes: [{ success: false }],
        executedSemanticActions: ['check_weather'],
      }),
    ).toBe('external_block');
  });

  it('classifyBookingNoProgressReason: bad_params when state moved but completion-neutral path', () => {
    const before: BookingExecutionContext = { route: [{}], inventory_checked: false, failures: [] };
    const after: BookingExecutionContext = {
      route: [{}, { kind: 'weather', data: {} }],
      inventory_checked: false,
      failures: [],
    };
    expect(
      classifyBookingNoProgressReason({
        policyStage: 'validate',
        ctxBefore: before,
        ctxAfter: after,
        executedEnvelopes: [{ success: true }],
        executedSemanticActions: ['check_weather'],
      }),
    ).toBe('bad_params');
  });
});
