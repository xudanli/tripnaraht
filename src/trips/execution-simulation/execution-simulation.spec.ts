import { buildExecutionTruthDAG } from '../execution-truth-dag/build-execution-truth-dag';
import { buildExecutionOverlay } from '../execution-overlay/build-execution-overlay';
import type { TripPlan } from '../decision/plan-model';
import { compileDAGToIR } from '../execution-ir/compile-dag-to-ir';
import { executeSimulation } from './execute-simulation';
import { applyPerturbation } from './apply-perturbation';
import {
  diffSimulationResults,
  executionDivergenceIndex,
  scoreSimulationRun,
} from './simulation-diff';

describe('P10 execution simulation', () => {
  function sample(): { ir: ReturnType<typeof compileDAGToIR>; dag: ReturnType<typeof buildExecutionTruthDAG> } {
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
            {
              id: 'n2',
              time: '13:00',
              title: 'B',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64.1, lng: -21.9 },
                to: { lat: 64.2, lng: -21.8 },
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

  it('executeSimulation runs deterministic counterfactuals with scored diff', () => {
    const { ir, dag } = sample();
    const runs = executeSimulation(
      {
        baseIR: ir,
        variants: [
          { id: 'low', perturbation: { delayBias: -0.05 } },
          { id: 'high', perturbation: { delayBias: 0.2 } },
        ],
      },
      { witnessDag: dag, mode: 'SIMULATION' },
    );

    expect(runs).toHaveLength(2);
    expect(runs[0].irRun.pathCost).not.toBe(runs[1].irRun.pathCost);

    const diff = diffSimulationResults(runs);
    expect(diff.bestVariantId).toBeDefined();
    expect(diff.regretByVariantId[diff.bestVariantId]).toBe(0);
    expect(Object.keys(diff.scoresByVariantId)).toEqual(['low', 'high']);
  });

  it('applyPerturbation scales TRAVERSE costs only', () => {
    const { ir } = sample();
    const v = applyPerturbation(ir, {
      id: 'x',
      perturbation: { delayBias: 1 },
    });
    const origT = ir.steps.filter(s => s.type === 'TRAVERSE');
    const nextT = v.steps.filter(s => s.type === 'TRAVERSE');
    expect(origT.length).toBe(nextT.length);
    expect((nextT[0] as { cost: number }).cost).toBeGreaterThan((origT[0] as { cost: number }).cost);
  });

  it('executionDivergenceIndex is null when traces identical', () => {
    const { ir, dag } = sample();
    const r1 = executeSimulation(
      { baseIR: ir, variants: [{ id: 'a', perturbation: {} }] },
      { witnessDag: dag },
    )[0];
    const r2 = executeSimulation(
      { baseIR: ir, variants: [{ id: 'b', perturbation: {} }] },
      { witnessDag: dag },
    )[0];
    expect(executionDivergenceIndex(r1, r2)).toBeNull();
  });

  it('scoreSimulationRun penalizes failures', () => {
    const { ir, dag } = sample();
    const mutated = JSON.parse(JSON.stringify(ir)) as typeof ir;
    mutated.steps.unshift({ type: 'CHECK', nodeId: 'ghost-node-xyz' });
    const run = executeSimulation(
      { baseIR: mutated, variants: [{ id: 'bad', perturbation: {} }] },
      { witnessDag: dag },
    )[0];
    expect(run.irRun.failures.length).toBeGreaterThan(0);
    expect(scoreSimulationRun(run)).toBeGreaterThan(run.irRun.pathCost);
  });
});
