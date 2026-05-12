import { buildExecutionOverlay } from '../execution-overlay/build-execution-overlay';
import { buildExecutionTruthDAG } from '../execution-truth-dag/build-execution-truth-dag';
import type { TripPlan } from '../decision/plan-model';
import {
  buildExecutionProgram,
  executeExecutionProgram,
  EXECUTION_PROGRAM_VERSION,
  NeptuneInterpreter,
} from './index';

describe('Execution Kernel Compiler (P7)', () => {
  it('buildExecutionProgram emits EXEC_CHECK, STATE_PROJECT, EDGE_TRAVERSE in deterministic order', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-07-01',
          timeSlots: [
            {
              id: 'p1',
              time: '09:00',
              title: 'P1',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64, lng: -22 },
                to: { lat: 64.1, lng: -21.9 },
                durationMin: 20,
              },
            },
            {
              id: 'p2',
              time: '14:00',
              title: 'P2',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64.1, lng: -21.9 },
                to: { lat: 64.2, lng: -21.8 },
                durationMin: 20,
              },
            },
          ],
        },
      ],
    };

    const frames = buildExecutionOverlay({ plan, weatherByDate: {} });
    const dag = buildExecutionTruthDAG({ plan, overlayFrames: frames });

    const prog = buildExecutionProgram(dag);
    expect(prog.version).toBe(EXECUTION_PROGRAM_VERSION);
    expect(prog.metadata.deterministic).toBe(true);
    expect(prog.entrypoint).toBe(dag.nodes[0]?.id ?? '');
    expect(prog.instructions.some(i => i.type === 'EXEC_CHECK')).toBe(true);
    expect(prog.instructions.some(i => i.type === 'EDGE_TRAVERSE')).toBe(true);
    expect(prog.instructions.filter(i => i.type === 'STATE_PROJECT').length).toBe(
      dag.nodes.length * 3,
    );
  });

  it('executeExecutionProgram aggregates pathCost and projections', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-07-02',
          timeSlots: [
            {
              id: 'q',
              time: '10:00',
              title: 'Q',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64, lng: -22 },
                to: { lat: 64.1, lng: -21.9 },
                durationMin: 15,
              },
            },
          ],
        },
      ],
    };

    const frames = buildExecutionOverlay({ plan, weatherByDate: {} });
    const dag = buildExecutionTruthDAG({ plan, overlayFrames: frames });
    const prog = buildExecutionProgram(dag);

    const r1 = executeExecutionProgram(prog, dag);
    const r2 = NeptuneInterpreter.execute(prog, dag);
    expect(r1.pathCost).toBe(r2.pathCost);
    expect(r1.execCheckFailures.length).toBe(0);
    expect(r1.ok).toBe(true);
    expect(r1.projections.some(p => p.derive === 'delay')).toBe(true);
  });

  it('appends EDGE_MUTATE from patches', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-07-03',
          timeSlots: [
            {
              id: 'r1',
              time: '11:00',
              title: 'R1',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64, lng: -22 },
                to: { lat: 64.1, lng: -21.9 },
                durationMin: 10,
              },
            },
            {
              id: 'r2',
              time: '15:00',
              title: 'R2',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64.1, lng: -21.9 },
                to: { lat: 64.2, lng: -21.8 },
                durationMin: 10,
              },
            },
          ],
        },
      ],
    };

    const frames = buildExecutionOverlay({ plan, weatherByDate: {} });
    const dag = buildExecutionTruthDAG({ plan, overlayFrames: frames });
    const edgeId = dag.edges.find(e => e.type === 'TEMPORAL_SEQUENCE')?.id;
    expect(edgeId).toBeDefined();

    const prog = buildExecutionProgram(dag, {
      patches: [{ target: edgeId!, op: 'DECREASE_WEIGHT', reason: 't' }],
    });

    const mut = prog.instructions.filter(i => i.type === 'EDGE_MUTATE');
    expect(mut.length).toBe(1);

    const out = executeExecutionProgram(prog, dag);
    expect(out.mutations.length).toBe(1);
  });
});
