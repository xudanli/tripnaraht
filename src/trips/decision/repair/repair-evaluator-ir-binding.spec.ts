import { evaluateMinimalRepairs } from './repair-evaluator';
import type { TripPlan } from '../plan-model';
import type { ExecutionOverlayFrame } from '../../execution-overlay/execution-overlay-frame.types';
import { EXECUTION_OVERLAY_SCHEMA_VERSION } from '../../execution-overlay/execution-overlay-frame.types';
import { buildExecutionTruthDAG } from '../../execution-truth-dag';
import { compileDAGToIR } from '../../execution-ir/compile-dag-to-ir';

describe('evaluateMinimalRepairs P8-2-B (repairIROnlyLock)', () => {
  it('projects repairs via IR CHECK × witness (metadata.source=IR_WITNESS)', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 'leg-x',
              time: '22:00',
              title: 'Late drive',
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

    const frames: ExecutionOverlayFrame[] = [
      {
        schemaVersion: EXECUTION_OVERLAY_SCHEMA_VERSION,
        legId: 'leg-x',
        route: {
          legId: 'leg-x',
          terrainDifficulty: 'LOW',
          weatherExposure: {},
          roadAccessibility: { fRoad: false },
          executionReliability: 0.85,
          estimatedDelayFactor: 1,
          executionState: 'EXECUTABLE',
        },
        temporal: {
          driftMinutes: 0,
          crossDayRisk: 0,
          daylightViolation: true,
          unifiedDelayMinutes: 0,
        },
        weather: { severity: 'LOW', delayFactor: 1 },
        road: { blocked: false, fRoadConstraint: false },
        repair: { recommended: false },
        finalExecutionState: 'EXECUTABLE',
        unifiedDelayMinutes: 0,
        reliabilityScore: 0.85,
      },
    ];

    const dag = buildExecutionTruthDAG({ plan, overlayFrames: frames });
    const ir = compileDAGToIR(dag);

    const out = evaluateMinimalRepairs({
      plan,
      timeDrifts: [],
      executionOverlayFrames: frames,
      executionTruthDAG: dag,
      executionIR: ir,
      policies: { repairIROnlyLock: true },
    });

    expect(out.notes?.some(n => n.includes('P8-2-B'))).toBe(true);
    expect(out.repairs.some(r => r.metadata?.source === 'IR_WITNESS')).toBe(true);
  });
});
