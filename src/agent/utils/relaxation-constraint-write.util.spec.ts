import {
  buildRelaxationSuggestionsFromViolations,
  applyRelaxationPatchToTripPlanRequest,
} from './relaxation-constraint-write.util';

describe('relaxation-constraint-write.util', () => {
  it('builds gate suggestions from violations', () => {
    const out = buildRelaxationSuggestionsFromViolations({
      questionId: 'gate_eval_relax_constraints',
      violations: [{ type: 'REACHABILITY', severity: 'HARD' }],
      headlineZh: '门控拦截',
      conflictType: 'REACHABILITY',
    });
    expect(out.suggestions.length).toBeGreaterThan(0);
    expect(out.context.questionId).toBe('gate_eval_relax_constraints');
    expect(out.suggestions.some((s) => s.metadata?.constraint_id)).toBe(true);
  });

  it('applies vehicle upgrade patch idempotently', () => {
    const base = { request_id: 'r1', origin: 'a', destination: 'b', constraints: { vehicle_type: '2WD' } };
    const { next } = applyRelaxationPatchToTripPlanRequest(base as any, 'upgrade_vehicle_to_4wd');
    expect(next.constraints?.vehicle_type).toBe('4WD');
  });
});
