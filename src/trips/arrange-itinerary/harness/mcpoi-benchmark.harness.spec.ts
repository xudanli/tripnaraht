import {
  expectMcpoiBenchmarkHarnessPass,
  runMcpoiBenchmarkHarnessGate,
  runMcpoiHarnessCase,
} from './mcpoi-benchmark-harness.util';
import { evaluateMcpoiPlanVariant } from './mcpoi-benchmark-evaluator.util';
import {
  MCPOI_BENCHMARK_HARNESS_CASES,
  MCPOI_BENCHMARK_PLAN_VARIANTS,
  MCPOI_BENCHMARK_SAMPLE_DECISION,
} from '../fixtures/multi-constraint-poi-arrangement-benchmark.fixture';

describe('Multi-Constraint POI Arrangement Benchmark v1', () => {
  it('evaluates plan variants A/B/C/D with expected status', () => {
    const a = evaluateMcpoiPlanVariant(MCPOI_BENCHMARK_PLAN_VARIANTS[0]);
    const b = evaluateMcpoiPlanVariant(MCPOI_BENCHMARK_PLAN_VARIANTS[1]);
    const c = evaluateMcpoiPlanVariant(MCPOI_BENCHMARK_PLAN_VARIANTS[2]);
    const d = evaluateMcpoiPlanVariant(MCPOI_BENCHMARK_PLAN_VARIANTS[3]);

    expect(a.status).toBe('INFEASIBLE');
    expect(a.hardViolations).toContain('H-07');
    expect(a.hardViolations).toContain('H-03');

    expect(b.status).toBe('FEASIBLE_WITH_TRADEOFF');
    expect(b.hardViolations).toHaveLength(0);
    expect(b.metrics.childLunchOnTime).toBe(true);

    expect(c.status).toBe('INFEASIBLE');
    expect(c.hardViolations).toContain('H-05');

    expect(d.status).toBe('FEASIBLE_WITH_SPLIT');
    expect(d.metrics.hasSplit).toBe(true);
    expect(d.hardViolations).toHaveLength(0);
  });

  it('POI-ORDER-001 propagates constraint impacts A→B', () => {
    const result = runMcpoiHarnessCase(
      MCPOI_BENCHMARK_HARNESS_CASES.find((c) => c.caseId === 'POI-ORDER-001')!,
    );
    expect(result.pass).toBe(true);
    expect(result.decision.planStatusBefore).toBe('INFEASIBLE');
    expect(result.decision.planStatusAfter).toBe('FEASIBLE_WITH_TRADEOFF');
    expect(result.decision.directImpacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ constraintId: 'H-07', before: 'VIOLATED', after: 'SATISFIED' }),
      ]),
    );
    expect(result.decision.downstreamImpacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'MEAL_WINDOW', memberId: 'M5' }),
      ]),
    );
    expect(result.decision.recommendation).toBe('ACCEPT_CHANGE');
  });

  it('sample decision structure matches POI-ORDER-001 reference', () => {
    const orderCase = runMcpoiHarnessCase(
      MCPOI_BENCHMARK_HARNESS_CASES.find((c) => c.caseId === 'POI-ORDER-001')!,
    );
    const sample = MCPOI_BENCHMARK_SAMPLE_DECISION;
    expect(orderCase.decision.planStatusBefore).toBe(sample.planStatusBefore);
    expect(orderCase.decision.planStatusAfter).toBe(sample.planStatusAfter);
    expect(orderCase.decision.directImpacts).toEqual(
      expect.arrayContaining(sample.directImpacts),
    );
  });

  it('hard constraints dominate soft photography preference', () => {
    const a = evaluateMcpoiPlanVariant(MCPOI_BENCHMARK_PLAN_VARIANTS[0]);
    const photo = a.assessments.find((x) => x.constraintId === 'S-01');
    expect(a.status).toBe('INFEASIBLE');
    expect(a.hardViolations.length).toBeGreaterThan(0);
    expect(photo?.state).not.toBe('SATISFIED');
  });

  it('runs full harness gate (8 cases + 4 variants)', () => {
    const gate = runMcpoiBenchmarkHarnessGate();
    expectMcpoiBenchmarkHarnessPass(gate);
    expect(gate.caseCount).toBe(8);
    expect(gate.passedCount).toBe(8);
    expect(gate.variantGatePass).toBe(true);
  });
});
