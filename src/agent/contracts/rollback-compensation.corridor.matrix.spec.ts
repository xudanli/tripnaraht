/**
 * EWP-03 — Per-corridor rollback / compensation fact anchors (not target architecture).
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('rollback-compensation.corridor.matrix (EWP-03)', () => {
  it('Unified exposes HTTP rollback and executor implements rollback', () => {
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
    const src = read('src/agent/services/action-execution.service.ts');
    expect(src).toContain("Rollback accepted (stub, no side effects).");
    expect(src).toMatch(/async rollback\(/);
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
