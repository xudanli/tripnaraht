/**
 * EWP-03 / RB-1 — Per-corridor rollback / compensation fact anchors (not target architecture).
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  ACTIONS_ROLLBACK_PRODUCT_STATUS,
  ACTIONS_ROLLBACK_STUB_MESSAGE,
  UNIFIED_ROLLBACK_HTTP_ENTRY,
} from './rollback-corridor.product.constants';

const ROOT = path.resolve(__dirname, '../../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('rollback-compensation.corridor.matrix (EWP-03 / RB-1)', () => {
  it('Unified exposes HTTP rollback and executor implements rollback', () => {
    expect(UNIFIED_ROLLBACK_HTTP_ENTRY).toContain('/decisions/:decisionId/rollback');
    const ctrl = read(
      'src/decision-runtime/gateway/controllers/unified-decision.controller.ts',
    );
    expect(ctrl).toContain("@Post('decisions/:decisionId/rollback')");
    const exec = read(
      'src/trips/guardian-decision-core/execution/plan-version-apply.executor.ts',
    );
    expect(exec).toMatch(/async rollback\(|rollbackMaterialization/);
  });

  it('Actions rollback is an explicit stub with no side effects', () => {
    expect(ACTIONS_ROLLBACK_PRODUCT_STATUS).toBe('STUB_NO_SIDE_EFFECTS');
    const src = read('src/agent/services/action-execution.service.ts');
    expect(src).toContain('ACTIONS_ROLLBACK_STUB_MESSAGE');
    expect(src).toMatch(/async rollback\(/);
    expect(ACTIONS_ROLLBACK_STUB_MESSAGE).toContain('stub, no side effects');
  });

  it('route_and_run itinerary revision rollback is wired on AgentController', () => {
    const ctrl = read('src/agent/agent.controller.ts');
    expect(ctrl).toContain("@Post('rollback_to_revision')");
    expect(ctrl).toMatch(/rollbackToRevision|rollbackItinerary/);
    expect(ctrl).toContain('ItineraryRollbackRequestDto');
  });

  it('TEP repair apply has failure-path materialization compensation', () => {
    const src = read('src/trips/tep/services/tep-local-repair-apply.service.ts');
    expect(src).toMatch(/rollback|REJECTED|materializ/i);
  });

  it('Arrange discard exists as pre-apply compensation only (source mention)', () => {
    const ctrl = read(
      'src/trips/arrange-itinerary/arrange-itinerary.controller.ts',
    );
    expect(ctrl.toLowerCase()).toMatch(/discard/);
  });
});
