/**
 * RB-1 — Unified Decision rollback HTTP contract (facts only).
 * Chain: UnifiedDecisionController → DecisionEngineGateway → Canonical adapter → plan-version-apply.executor
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  UNIFIED_ROLLBACK_CONTROLLER_ROUTE,
  UNIFIED_ROLLBACK_HTTP_ENTRY,
} from '../../../agent/contracts/rollback-corridor.product.constants';

const ROOT = path.resolve(__dirname, '../../../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('Unified rollback HTTP contract (RB-1)', () => {
  it('documents canonical HTTP entry under /api', () => {
    expect(UNIFIED_ROLLBACK_HTTP_ENTRY).toBe(
      'POST /api/trips/:tripId/decisions/:decisionId/rollback',
    );
    expect(UNIFIED_ROLLBACK_CONTROLLER_ROUTE).toContain('decisions/:decisionId/rollback');
  });

  it('controller exposes POST decisions/:decisionId/rollback → gateway.rollback', () => {
    const src = read(
      'src/decision-runtime/gateway/controllers/unified-decision.controller.ts',
    );
    expect(src).toContain("@Controller('trips/:tripId')");
    expect(src).toContain("@Post('decisions/:decisionId/rollback')");
    expect(src).toMatch(/async rollback\(/);
    expect(src).toContain('this.gateway.rollback(tripId, decisionId)');
  });

  it('gateway routes Canonical Runtime only to canonical.rollback', () => {
    const src = read(
      'src/decision-runtime/gateway/services/decision-engine-gateway.service.ts',
    );
    expect(src).toMatch(/async rollback\(tripId:\s*string,\s*decisionId:\s*string\)/);
    expect(src).toContain('CANONICAL_DECISION_RUNTIME');
    expect(src).toContain('this.canonical.rollback(tripId, decisionId)');
    expect(src).toMatch(
      /Unified rollback is only supported for Canonical Runtime decisions/,
    );
  });

  it('canonical adapter delegates to plan-version-apply.executor.rollback', () => {
    const adapter = read(
      'src/decision-runtime/gateway/engines/canonical-decision-engine.adapter.ts',
    );
    expect(adapter).toContain('this.executor.rollback({ tripId, decisionId })');
    const exec = read(
      'src/trips/guardian-decision-core/execution/plan-version-apply.executor.ts',
    );
    expect(exec).toMatch(/async rollback\(/);
    expect(exec).toContain('rollbackMaterialization');
  });
});
