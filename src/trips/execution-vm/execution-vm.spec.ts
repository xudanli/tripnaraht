import { buildExecutionTruthDAG } from '../execution-truth-dag/build-execution-truth-dag';
import { buildExecutionOverlay } from '../execution-overlay/build-execution-overlay';
import type { TripPlan } from '../decision/plan-model';
import { compileDAGToIR } from '../execution-ir/compile-dag-to-ir';
import { executeExecutionIR } from '../execution-ir/execute-execution-ir';
import { compileIRToBytecode } from './compile-ir-to-bytecode';
import { executeBytecode, runExecutionIRAsVm } from './execution-vm';

describe('executeBytecode / runExecutionIRAsVm (P9)', () => {
  it('matches executeExecutionIR pathCost and failures', () => {
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

    const legacy = executeExecutionIR(ir, dag);
    const bundle = runExecutionIRAsVm(ir, { witnessDag: dag });

    expect(bundle.irRun.pathCost).toBe(legacy.pathCost);
    expect(bundle.irRun.ok).toBe(legacy.ok);
    expect(bundle.irRun.failures).toEqual(legacy.failures);

    expect(bundle.outcome.trace.length).toBeGreaterThan(0);
    expect(bundle.outcome.trace.every((e, i) => e.timestamp === i)).toBe(true);
  });

  it('executeBytecode is deterministic for same program', () => {
    const _plan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [] as TripPlan['days'],
    } as TripPlan;
    const ir = compileDAGToIR({ nodes: [], edges: [] });
    const p = compileIRToBytecode(ir);
    const a = executeBytecode(p, {});
    const b = executeBytecode(p, {});
    expect(JSON.stringify(a.trace)).toBe(JSON.stringify(b.trace));
  });
});
