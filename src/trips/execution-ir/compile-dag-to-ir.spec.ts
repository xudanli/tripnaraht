import { buildExecutionOverlay } from '../execution-overlay/build-execution-overlay';
import { buildExecutionTruthDAG } from '../execution-truth-dag/build-execution-truth-dag';
import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { TripPlan } from '../decision/plan-model';
import { ExecutionIRSources } from './execution-ir.types';
import { compileDAGToIR } from './compile-dag-to-ir';

describe('compileDAGToIR (P8-2-B)', () => {
  function samplePlan(): TripPlan {
    return {
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
  }

  it('emits CHECK + 3 PROJECT per node and TRAVERSE per edge with deterministic sort', () => {
    const plan = samplePlan();
    const frames = buildExecutionOverlay({ plan, weatherByDate: {} });
    const dag = buildExecutionTruthDAG({ plan, overlayFrames: frames });

    const ir = compileDAGToIR(dag);

    expect(ir.version).toBe('1');
    expect(ir.meta.deterministic).toBe(true);
    expect(ir.meta.source).toBe(ExecutionIRSources.DAG_COMPILER);
    expect(typeof ir.meta.compiledAt).toBe('number');
    expect(ir.meta.dagId.length).toBeGreaterThan(0);

    const checks = ir.steps.filter(s => s.type === 'CHECK');
    const projects = ir.steps.filter(s => s.type === 'PROJECT');
    const traverses = ir.steps.filter(s => s.type === 'TRAVERSE');

    expect(checks.length).toBe(dag.nodes.length);
    expect(projects.length).toBe(dag.nodes.length * 3);
    expect(traverses.length).toBe(dag.edges.length);

    const ir2 = compileDAGToIR(dag);
    expect(ir2.meta.dagId).toBe(ir.meta.dagId);
    expect(JSON.stringify(ir2.steps)).toBe(JSON.stringify(ir.steps));
  });

  it('rejects non-DAG input at compile time', () => {
    expect(() => compileDAGToIR(null as unknown as ExecutionTruthDAG)).toThrow('[COMPILER] invalid DAG input');
  });
});
