import {
  ACTIONS_COMMIT_MIXED_TARGETS,
  MIXED_WRITE_UNIFICATION_FORBIDDEN,
  UNIFIED_EXECUTE_MIXED_TARGETS,
  WRITEBACK_CORRIDOR_AUDIT_MATRIX,
  WRITEBACK_CORRIDOR_AUDIT_MATRIX_VERSION,
} from './writeback-corridor-audit.matrix';

describe('writeback-corridor-audit.matrix', () => {
  it('includes ITINERARY_ADJUST with trip_itinerary_item persistence and narrow AUTO', () => {
    const row = WRITEBACK_CORRIDOR_AUDIT_MATRIX.find((r) => r.id === 'itinerary_adjust_apply');
    expect(row?.persistence).toBe('trip_itinerary_item');
    expect(row?.auto).toBe('narrow_corridor');
  });

  it('marks Iceland apply as plan_version without AUTO', () => {
    const row = WRITEBACK_CORRIDOR_AUDIT_MATRIX.find((r) => r.id === 'iceland_apply');
    expect(row?.persistence).toBe('plan_version');
    expect(row?.auto).toBe('never');
  });

  it('WB-1: version 1.1.0 and mixed Unified/Actions carry mixedTargets (C022b/c)', () => {
    expect(WRITEBACK_CORRIDOR_AUDIT_MATRIX_VERSION).toBe('1.1.0');
    const unified = WRITEBACK_CORRIDOR_AUDIT_MATRIX.find((r) => r.id === 'unified_execute');
    const actions = WRITEBACK_CORRIDOR_AUDIT_MATRIX.find((r) => r.id === 'actions_commit');
    expect(unified?.persistence).toBe('mixed');
    expect(actions?.persistence).toBe('mixed');
    expect(unified?.mixedTargets).toEqual(UNIFIED_EXECUTE_MIXED_TARGETS);
    expect(actions?.mixedTargets).toEqual(ACTIONS_COMMIT_MIXED_TARGETS);
    expect(unified?.notes).toContain('C022b');
    expect(actions?.notes).toContain('C022c');
    expect(unified?.notes).toContain(MIXED_WRITE_UNIFICATION_FORBIDDEN);
    expect(UNIFIED_EXECUTE_MIXED_TARGETS.length).toBeGreaterThanOrEqual(5);
    expect(ACTIONS_COMMIT_MIXED_TARGETS.length).toBeGreaterThanOrEqual(5);
    expect(
      UNIFIED_EXECUTE_MIXED_TARGETS.some((t) => t.symbol.includes('setEffective')),
    ).toBe(true);
    expect(
      ACTIONS_COMMIT_MIXED_TARGETS.some((t) => t.id === 'agent_action_log'),
    ).toBe(true);
  });

  it('WB-1: mobile mixed remains undecomposed (no invented targets)', () => {
    const mobile = WRITEBACK_CORRIDOR_AUDIT_MATRIX.find((r) => r.id === 'mobile_verified_apply');
    expect(mobile?.persistence).toBe('mixed');
    expect(mobile?.mixedTargets).toBeUndefined();
  });
});
