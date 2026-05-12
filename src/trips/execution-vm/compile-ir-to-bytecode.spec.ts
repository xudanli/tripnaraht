import { buildExecutionTruthDAG } from '../execution-truth-dag/build-execution-truth-dag';
import { buildExecutionOverlay } from '../execution-overlay/build-execution-overlay';
import type { TripPlan } from '../decision/plan-model';
import { compileDAGToIR } from '../execution-ir/compile-dag-to-ir';
import { compileIRToBytecode } from './compile-ir-to-bytecode';

describe('compileIRToBytecode (P9)', () => {
  it('lowers IR steps + HALT with deterministic traceIds', () => {
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
    const ir = compileDAGToIR(dag);
    const bc = compileIRToBytecode(ir);

    expect(bc.version).toBe('1');
    expect(bc.dagId).toBe(ir.meta.dagId);
    expect(bc.instructions.length).toBe(ir.steps.length + 1);
    expect(bc.instructions[bc.instructions.length - 1].op).toBe('HALT');
    expect(bc.instructions[bc.instructions.length - 1].traceId).toBe('halt');

    const bc2 = compileIRToBytecode(ir);
    expect(JSON.stringify(bc2.instructions)).toBe(JSON.stringify(bc.instructions));
  });
});
