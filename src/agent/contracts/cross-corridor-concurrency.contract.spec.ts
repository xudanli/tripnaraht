/**
 * EWP-04 — Corridor-local concurrency / freshness signals.
 * Does NOT claim a unified multi-corridor concurrent write suite exists.
 */
import * as fs from 'fs';
import * as path from 'path';
import { AGENT_NO_GLOBAL_CONTEXT_HASH } from './agent-conceptual-vs-actual.constants';

const ROOT = path.resolve(__dirname, '../../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('cross-corridor-concurrency.contract (EWP-04)', () => {
  it('documents no global contextHash on main chain', () => {
    expect(AGENT_NO_GLOBAL_CONTEXT_HASH).toMatch(/No unified contextHash/);
  });

  it('TEP stale signal is STALE_REPAIR_OPTION', () => {
    const src = read('src/trips/tep/utils/tep-repair-stale-guard.util.ts');
    expect(src).toContain("code: 'STALE_REPAIR_OPTION'");
  });

  it('Arrange apply sets CONTEXT_STALE phase and throws CONTEXT_VERSION_CONFLICT', () => {
    const src = read(
      'src/trips/arrange-itinerary/services/planning-orchestrator-facade.service.ts',
    );
    expect(src).toContain("setPhase(proposal.tripId, 'CONTEXT_STALE'");
    expect(src).toContain("code: 'CONTEXT_VERSION_CONFLICT'");
    const constants = read(
      'src/trips/arrange-itinerary/contracts/arrange-apply-stale.dual-signal.constants.ts',
    );
    expect(constants).toContain("ARRANGE_APPLY_STALE_ORCHESTRATION_PHASE = 'CONTEXT_STALE'");
    expect(constants).toContain(
      "ARRANGE_APPLY_STALE_HTTP_ERROR_CODE =\n  'CONTEXT_VERSION_CONFLICT'",
    );
  });

  it('Phase2 route_and_run stale concurrency e2e file exists', () => {
    const rel =
      'src/agent/agent.route-and-run.phase2-stale-concurrency.e2e.spec.ts';
    expect(fs.existsSync(path.join(ROOT, rel))).toBe(true);
    const src = read(rel);
    expect(src).toMatch(/STALE_PLAN_VERSION|stale/i);
  });

  it('Mobile spatial/planning conflict codes appear in service sources', () => {
    const spatial = read('src/mobile/services/mobile-spatial-route.service.ts');
    const planning = read('src/mobile/services/mobile-planning.service.ts');
    const combined = spatial + planning;
    expect(combined).toMatch(/CONTEXT_VERSION_CONFLICT|ifMatch|If-Match/i);
  });

  it('does not invent a cross-corridor concurrent write suite path', () => {
    const invented =
      'src/agent/contracts/cross-corridor-concurrent-write.e2e.spec.ts';
    expect(fs.existsSync(path.join(ROOT, invented))).toBe(false);
  });
});
