import { buildExecutionOverlay } from '../execution-overlay/build-execution-overlay';
import { buildExecutionTruthDAG } from '../execution-truth-dag/build-execution-truth-dag';
import type { TripPlan } from '../decision/plan-model';
import {
  applyGraphPatchesToDag,
  buildExecutionRuntime,
  NeptuneKernel,
  rollbackSnapshot,
} from './index';

describe('Execution Runtime Kernel (P6)', () => {
  it('buildExecutionRuntime grows rollout steps monotonically', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 'a',
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
              id: 'b',
              time: '14:00',
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
    const d = buildExecutionTruthDAG({ plan, overlayFrames: frames });

    const tape = buildExecutionRuntime({ dag: d });
    expect(tape.length).toBe(d.nodes.length + 1);
    expect(tape[0]!.stepIndex).toBe(0);
    expect(tape[0]!.state.derivedState.totalDelay).toBe(0);

    for (let i = 1; i < tape.length; i++) {
      expect(tape[i]!.stepIndex).toBe(i);
      expect(tape[i]!.state.derivedState.totalDelay).toBeGreaterThanOrEqual(
        tape[i - 1]!.state.derivedState.totalDelay,
      );
    }
  });

  it('rollbackSnapshot returns previous step', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-02',
          timeSlots: [
            {
              id: 'x',
              time: '10:00',
              title: 'X',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64, lng: -22 },
                to: { lat: 64.1, lng: -21.9 },
                durationMin: 20,
              },
            },
          ],
        },
      ],
    };
    const frames = buildExecutionOverlay({ plan, weatherByDate: {} });
    const d = buildExecutionTruthDAG({ plan, overlayFrames: frames });
    const tape = buildExecutionRuntime({ dag: d });
    expect(rollbackSnapshot(tape, 1).stepIndex).toBe(0);
  });

  it('NeptuneKernel.projectCounterfactual applies patches then re-simulates', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-03',
          timeSlots: [
            {
              id: 'u',
              time: '08:00',
              title: 'U',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64, lng: -22 },
                to: { lat: 64.1, lng: -21.9 },
                durationMin: 25,
              },
            },
            {
              id: 'v',
              time: '12:00',
              title: 'V',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64.1, lng: -21.9 },
                to: { lat: 64.2, lng: -21.8 },
                durationMin: 25,
              },
            },
          ],
        },
      ],
    };
    const frames = buildExecutionOverlay({ plan, weatherByDate: {} });
    const d = buildExecutionTruthDAG({ plan, overlayFrames: frames });
    const heavy = d.edges.reduce((a, b) => (a.weight >= b.weight ? a : b));
    const edgeId = heavy.id;
    const beforeW = heavy.weight;

    const mutated = applyGraphPatchesToDag(d, [
      { target: edgeId, op: 'DECREASE_WEIGHT', reason: 'cf' },
    ]);
    const afterW = mutated.edges.find(e => e.id === edgeId)?.weight ?? 0;
    expect(afterW).toBe(Math.max(0, beforeW - 2.5));

    const cfTape = NeptuneKernel.projectCounterfactual(d, [
      { target: edgeId, op: 'DECREASE_WEIGHT', reason: 'cf' },
    ]);
    expect(cfTape.length).toBeGreaterThan(0);
    expect(NeptuneKernel.traverse(d).length).toBe(d.nodes.length);
  });
});
