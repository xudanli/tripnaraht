/**
 * EWP-02 — Split WRITEBACK `persistence: mixed` into concrete writers (source anchors).
 */
import * as fs from 'fs';
import * as path from 'path';
import { WRITEBACK_CORRIDOR_AUDIT_MATRIX } from './writeback-corridor-audit.matrix';

const ROOT = path.resolve(__dirname, '../../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('mixed-write-target.decomposition.contract (EWP-02)', () => {
  it('marks unified_execute and actions_commit as mixed in the audit matrix', () => {
    const unified = WRITEBACK_CORRIDOR_AUDIT_MATRIX.find((r) => r.id === 'unified_execute');
    const actions = WRITEBACK_CORRIDOR_AUDIT_MATRIX.find((r) => r.id === 'actions_commit');
    expect(unified?.persistence).toBe('mixed');
    expect(actions?.persistence).toBe('mixed');
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
  });

  it('Actions Commit path uses action registry, agentActionLog, sideEffectRegistry, dedup', () => {
    const src = read('src/agent/services/action-execution.service.ts');
    expect(src).toContain('agentActionLog');
    expect(src).toContain('sideEffectRegistry');
    expect(src).toContain('RequestDeduplicationService');
    expect(src).toContain('this.actionRegistry');
    expect(src).toMatch(/actionRegistry\.get\(|actionRegistry\.has\(/);
  });
});
