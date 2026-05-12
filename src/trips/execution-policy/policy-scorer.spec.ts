import { buildExecutionTruthDAG } from '../execution-truth-dag/build-execution-truth-dag';
import { buildExecutionOverlay } from '../execution-overlay/build-execution-overlay';
import type { TripPlan } from '../decision/plan-model';
import { compileDAGToIR } from '../execution-ir/compile-dag-to-ir';
import { executeSimulation } from '../execution-simulation';
import { DEFAULT_EXECUTION_POLICY_V1 } from './default-policy';
import { extractPolicyFeatures } from './policy-features';
import { scoreSimulationResult } from './policy-scorer';
import { buildSimulationPolicySelection, selectBestSimulation } from './policy-selector';

describe('P11 policy scorer', () => {
  function sample(): {
    ir: ReturnType<typeof compileDAGToIR>;
    dag: ReturnType<typeof buildExecutionTruthDAG>;
  } {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-09-01',
          timeSlots: [
            {
              id: 'n1',
              time: '09:00',
              title: 'A',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64, lng: -22 },
                to: { lat: 64.1, lng: -21.9 },
                durationMin: 30,
              },
            },
          ],
        },
      ],
    };
    const frames = buildExecutionOverlay({ plan, weatherByDate: {} });
    const dag = buildExecutionTruthDAG({ plan, overlayFrames: frames });
    return { ir: compileDAGToIR(dag), dag };
  }

  it('scoreSimulationResult is deterministic for same inputs', () => {
    const { ir, dag } = sample();
    const runs = executeSimulation(
      {
        baseIR: ir,
        variants: [
          { id: 'a', perturbation: { delayBias: 0 } },
          { id: 'b', perturbation: { delayBias: 0.5 } },
        ],
      },
      { witnessDag: dag },
    );
    const p = DEFAULT_EXECUTION_POLICY_V1;
    expect(scoreSimulationResult(runs[0], p, dag)).toBe(scoreSimulationResult(runs[0], p, dag));
  });

  it('selectBestSimulation picks higher policy score', () => {
    const { ir, dag } = sample();
    const runs = executeSimulation(
      {
        baseIR: ir,
        variants: [
          { id: 'cheap', perturbation: { delayBias: -0.2 } },
          { id: 'dear', perturbation: { delayBias: 0.8 } },
        ],
      },
      { witnessDag: dag },
    );
    const picked = selectBestSimulation(runs, DEFAULT_EXECUTION_POLICY_V1, dag);
    const cheapScore = scoreSimulationResult(
      runs.find(r => r.variantId === 'cheap')!,
      DEFAULT_EXECUTION_POLICY_V1,
      dag,
    );
    const dearScore = scoreSimulationResult(
      runs.find(r => r.variantId === 'dear')!,
      DEFAULT_EXECUTION_POLICY_V1,
      dag,
    );
    expect(picked.score).toBe(Math.max(cheapScore, dearScore));
  });

  it('buildSimulationPolicySelection ranks all variants', () => {
    const { ir, dag } = sample();
    const runs = executeSimulation(
      { baseIR: ir, variants: [{ id: 'only', perturbation: {} }] },
      { witnessDag: dag },
    );
    const sel = buildSimulationPolicySelection(runs, DEFAULT_EXECUTION_POLICY_V1, dag);
    expect(sel.policyId).toBe('default-v1');
    expect(sel.selectedVariantId).toBe('only');
    expect(sel.ranked).toHaveLength(1);
  });

  it('extractPolicyFeatures penalizes failures', () => {
    const { ir, dag } = sample();
    const badIr = JSON.parse(JSON.stringify(ir)) as typeof ir;
    badIr.steps.unshift({ type: 'CHECK', nodeId: '__ghost__' });
    const run = executeSimulation(
      { baseIR: badIr, variants: [{ id: 'x', perturbation: {} }] },
      { witnessDag: dag },
    )[0];
    const f = extractPolicyFeatures(run, dag);
    expect(f.reliabilityProxy).toBeLessThan(1);
  });
});
