/**
 * EWP-02 — Split WRITEBACK `persistence: mixed` into concrete writers (source anchors).
 * WB-1 — matrix constants must list the same symbols.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  ACTIONS_COMMIT_MIXED_TARGETS,
  UNIFIED_EXECUTE_MIXED_TARGETS,
  WRITEBACK_CORRIDOR_AUDIT_MATRIX,
} from './writeback-corridor-audit.matrix';

const ROOT = path.resolve(__dirname, '../../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('mixed-write-target.decomposition.contract (EWP-02 / WB-1)', () => {
  it('marks unified_execute and actions_commit as mixed with mixedTargets', () => {
    const unified = WRITEBACK_CORRIDOR_AUDIT_MATRIX.find((r) => r.id === 'unified_execute');
    const actions = WRITEBACK_CORRIDOR_AUDIT_MATRIX.find((r) => r.id === 'actions_commit');
    expect(unified?.persistence).toBe('mixed');
    expect(actions?.persistence).toBe('mixed');
    expect(unified?.mixedTargets?.length).toBe(UNIFIED_EXECUTE_MIXED_TARGETS.length);
    expect(actions?.mixedTargets?.length).toBe(ACTIONS_COMMIT_MIXED_TARGETS.length);
    expect(unified?.entry).toContain('/execute');
    expect(actions?.entry).toContain('/agent/actions/commit');
  });

  it('Unified Execute path writes PlanVersion / ledger / problem / materializer / trip revision', () => {
    const src = read(
      'src/trips/guardian-decision-core/execution/plan-version-apply.executor.ts',
    );
    expect(src).toContain('itineraryMaterializer.applyPlanOperations');
    expect(src).toContain('planVersionStore.setEffective');
    expect(src).toContain('ledgerStore.upsertDecision');
    expect(src).toContain('problemStore.upsert');
    expect(src).toContain('bumpTripRevisionAndAppliedMarkers');
    expect(src).toContain('planVersionStore.recordExecution');
    expect(
      UNIFIED_EXECUTE_MIXED_TARGETS.every((t) =>
        src.includes(t.symbol.includes('.') ? t.symbol.split('.').pop()! : t.symbol),
      ),
    ).toBe(true);
  });

  it('Actions Commit path uses action registry, agentActionLog, sideEffectRegistry, dedup', () => {
    const src = read('src/agent/services/action-execution.service.ts');
    expect(src).toContain('agentActionLog');
    expect(src).toContain('sideEffectRegistry');
    expect(src).toContain('RequestDeduplicationService');
    expect(src).toContain('this.actionRegistry');
    expect(src).toMatch(/actionRegistry\.get\(|actionRegistry\.has\(/);
    expect(
      ACTIONS_COMMIT_MIXED_TARGETS.some((t) => t.durability === 'in_memory'),
    ).toBe(true);
  });
});
