import { buildExecutionOverlay } from '../execution-overlay/build-execution-overlay';
import { buildExecutionTruthDAG } from './build-execution-truth-dag';
import type { TripPlan } from '../decision/plan-model';

describe('buildExecutionTruthDAG', () => {
  it('builds nodes from overlay frames and TEMPORAL_SEQUENCE edges for same-day ordered legs', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 'leg-a',
              time: '09:00',
              title: 'Drive A',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64, lng: -22 },
                to: { lat: 64.2, lng: -21.8 },
                durationMin: 60,
              },
            },
            {
              id: 'leg-b',
              time: '14:00',
              title: 'Drive B',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64.2, lng: -21.8 },
                to: { lat: 64.4, lng: -21.6 },
                durationMin: 45,
              },
            },
          ],
        },
      ],
    };

    const frames = buildExecutionOverlay({ plan, weatherByDate: {} });
    const dag = buildExecutionTruthDAG({ plan, overlayFrames: frames });

    expect(dag.nodes).toHaveLength(2);
    expect(dag.nodes.map(n => n.slotId).sort()).toEqual(['leg-a', 'leg-b']);

    const seq = dag.edges.filter(
      e => e.type === 'TEMPORAL_SEQUENCE' && e.from === 'exec:leg-a' && e.to === 'exec:leg-b',
    );
    expect(seq).toHaveLength(1);
    expect(seq[0]!.id).toMatch(/^TEMPORAL_SEQUENCE#/);
    expect(seq[0]!.weight).toBeGreaterThanOrEqual(0);
  });

  it('adds CROSS_DAY_SPILL between last leg of day N and first leg of day N+1', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 'day1-leg',
              time: '18:00',
              title: 'Drive',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64, lng: -22 },
                to: { lat: 64.1, lng: -21.9 },
                durationMin: 40,
              },
            },
          ],
        },
        {
          day: 2,
          date: '2026-06-02',
          timeSlots: [
            {
              id: 'day2-leg',
              time: '09:00',
              title: 'Drive',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64.1, lng: -21.9 },
                to: { lat: 64.3, lng: -21.7 },
                durationMin: 50,
              },
            },
          ],
        },
      ],
    };

    const frames = buildExecutionOverlay({ plan, weatherByDate: {} });
    const dag = buildExecutionTruthDAG({ plan, overlayFrames: frames });

    const spill = dag.edges.filter(
      e => e.type === 'CROSS_DAY_SPILL' && e.from === 'exec:day1-leg' && e.to === 'exec:day2-leg',
    );
    expect(spill).toHaveLength(1);
  });

  it('reduces TEMPORAL_SEQUENCE weight when a compress repair touches an endpoint', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-03',
          timeSlots: [
            {
              id: 'x1',
              time: '10:00',
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
              id: 'x2',
              time: '15:00',
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
    const base = buildExecutionTruthDAG({ plan, overlayFrames: frames });
    const withRepair = buildExecutionTruthDAG({
      plan,
      overlayFrames: frames,
      repairs: [
        {
          id: 'r1',
          action: 'COMPRESS_STOP',
          targetSlotIds: ['x2'],
          date: '2026-06-03',
          narrative: 'test',
          priority: 1,
          confidence: 0.5,
          suggestedDeltaMinutes: 20,
        },
      ],
    });

    const w0 = base.edges.find(
      e => e.type === 'TEMPORAL_SEQUENCE' && e.from === 'exec:x1' && e.to === 'exec:x2',
    )!.weight;
    const w1 = withRepair.edges.find(
      e => e.type === 'TEMPORAL_SEQUENCE' && e.from === 'exec:x1' && e.to === 'exec:x2',
    )!.weight;
    expect(w1).toBeLessThanOrEqual(w0);
    expect(
      withRepair.edges.find(
        e => e.type === 'TEMPORAL_SEQUENCE' && e.from === 'exec:x1' && e.to === 'exec:x2',
      )?.repairProposalIds,
    ).toContain('r1');
  });
});
