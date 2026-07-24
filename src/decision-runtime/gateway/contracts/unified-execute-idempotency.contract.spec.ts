import { buildPlanVersionIdempotencyKey } from '../../../trips/guardian-decision-core/plan-version/plan-version.service';

/**
 * Unified Execute corridor — independent idempotency contract (facts only).
 * Anchors: UnifiedDecisionController.execute passes Idempotency-Key or
 * buildPlanVersionIdempotencyKey(tripId, decisionId).
 */
describe('Unified Execute idempotency contract', () => {
  it('buildPlanVersionIdempotencyKey is stable for same trip+decision', () => {
    const a = buildPlanVersionIdempotencyKey('trip-1', 'dec-9');
    const b = buildPlanVersionIdempotencyKey('trip-1', 'dec-9');
    expect(a).toBe(b);
    expect(a).toBe('trip:trip-1:decision:dec-9:apply-plan-version');
  });

  it('buildPlanVersionIdempotencyKey differs across decisions', () => {
    const a = buildPlanVersionIdempotencyKey('trip-1', 'dec-a');
    const b = buildPlanVersionIdempotencyKey('trip-1', 'dec-b');
    expect(a).not.toBe(b);
  });

  it('controller source wires Idempotency-Key header into gateway.execute', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../controllers/unified-decision.controller.ts'),
      'utf8',
    );
    expect(src).toMatch(/@Headers\('idempotency-key'\)/);
    expect(src).toMatch(/buildPlanVersionIdempotencyKey\(tripId,\s*decisionId\)/);
    expect(src).toMatch(/this\.gateway\.execute\(/);
  });
});
