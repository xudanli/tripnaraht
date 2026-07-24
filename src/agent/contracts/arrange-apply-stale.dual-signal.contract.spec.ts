/**
 * CC-1 — constants + handoff/API docs must not conflate phase with HTTP code.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  ARRANGE_APPLY_STALE_CLIENT_NOTE,
  ARRANGE_APPLY_STALE_DUAL_SIGNAL,
  ARRANGE_APPLY_STALE_HTTP_ERROR_CODE,
  ARRANGE_APPLY_STALE_ORCHESTRATION_PHASE,
} from '../../trips/arrange-itinerary/contracts/arrange-apply-stale.dual-signal.constants';

const ROOT = path.resolve(__dirname, '../../..');

describe('arrange-apply-stale.dual-signal.contract (CC-1)', () => {
  it('exports dual-signal SSOT', () => {
    expect(ARRANGE_APPLY_STALE_ORCHESTRATION_PHASE).toBe('CONTEXT_STALE');
    expect(ARRANGE_APPLY_STALE_HTTP_ERROR_CODE).toBe('CONTEXT_VERSION_CONFLICT');
    expect(ARRANGE_APPLY_STALE_DUAL_SIGNAL).toBe(
      'phase=CONTEXT_STALE; http.code=CONTEXT_VERSION_CONFLICT',
    );
    expect(ARRANGE_APPLY_STALE_CLIENT_NOTE).toMatch(/CONTEXT_VERSION_CONFLICT/);
  });

  it('facade source uses both phase and HTTP error code', () => {
    const src = fs.readFileSync(
      path.join(
        ROOT,
        'src/trips/arrange-itinerary/services/planning-orchestrator-facade.service.ts',
      ),
      'utf8',
    );
    expect(src).toContain(`'${ARRANGE_APPLY_STALE_ORCHESTRATION_PHASE}'`);
    expect(src).toContain(`'${ARRANGE_APPLY_STALE_HTTP_ERROR_CODE}'`);
  });

  it('API + iOS handoff document dual-signal (not CONTEXT_STALE as HTTP code)', () => {
    const api = fs.readFileSync(
      path.join(ROOT, 'src/trips/arrange-itinerary/ARRANGE_ITINERARY_API.md'),
      'utf8',
    );
    const ios = fs.readFileSync(
      path.join(ROOT, 'src/trips/arrange-itinerary/ARRANGE_ITINERARY_IOS_HANDOFF.md'),
      'utf8',
    );
    expect(api).toContain('CONTEXT_VERSION_CONFLICT');
    expect(api).toContain('CONTEXT_STALE');
    expect(api).toMatch(/phase.*CONTEXT_STALE|orchestration.*CONTEXT_STALE/i);
    expect(ios).toContain('CONTEXT_VERSION_CONFLICT');
    expect(ios).toMatch(/phase.*CONTEXT_STALE|orchestration-state\.phase/i);
    // Must not claim HTTP body code is CONTEXT_STALE alone without the dual-signal note
    expect(api).not.toMatch(/→\s*`409 CONTEXT_STALE`/);
    expect(ios).not.toMatch(/\*\*409\*\*\s*`CONTEXT_STALE`/);
  });
});
