import { buildUnifiedConstraintGraph, driftNodeId, slotNodeId } from './build-unified-constraint-graph';
import { applyWeatherDriveDelayAndEmitDrifts } from '../temporal/apply-weather-drive-delay';
import { buildCrossDayHandoffEdges } from '../temporal/build-cross-day-edges';
import { emitCrossDayHandoffDrifts } from '../temporal/emit-cross-day-handoff-drifts';
import { propagateSequenceDriftsToDownstreamSlots } from '../temporal/propagate-sequence-drifts';
import type { TripPlan } from '../plan-model';

describe('buildUnifiedConstraintGraph', () => {
  it('includes slot nodes, drift nodes, topology and drift-source edges', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          weatherExecution: {
            executionState: 'DEGRADED',
            executionQuality: {
              safeScore: 0.7,
              delayFactor: 1.2,
              visibilityPenalty: 0.1,
              fatigueCost: 0.05,
              riskBudget: 0.65,
            },
          },
          timeSlots: [
            {
              id: 'd1',
              time: '09:00',
              endTime: '10:00',
              title: 'Drive',
              type: 'transport',
            },
            {
              id: 's2',
              time: '10:30',
              endTime: '12:00',
              title: 'Sight',
              type: 'sightseeing',
            },
          ],
        },
        {
          day: 2,
          date: '2026-06-02',
          timeSlots: [
            {
              id: 'bf',
              time: '08:00',
              endTime: '09:00',
              title: 'Breakfast',
              type: 'food',
            },
          ],
        },
      ],
    };

    const wx = applyWeatherDriveDelayAndEmitDrifts(plan);
    plan.temporal = {
      timeDrifts: wx.drifts,
      constraintEdges: wx.constraintEdges,
      emittedAt: new Date().toISOString(),
    };
    propagateSequenceDriftsToDownstreamSlots(plan);
    const crossDrifts = emitCrossDayHandoffDrifts(plan);
    plan.temporal.timeDrifts = [...plan.temporal.timeDrifts, ...crossDrifts];
    plan.temporal.constraintEdges = [
      ...plan.temporal.constraintEdges,
      ...buildCrossDayHandoffEdges(plan),
    ];

    const graph = buildUnifiedConstraintGraph(plan);

    expect(graph.stats.domainNodeCounts.SCHEDULE_TOPOLOGY).toBe(3);
    expect(graph.stats.domainEdgeCounts.SCHEDULE_TOPOLOGY).toBeGreaterThanOrEqual(1);
    expect(
      (graph.stats.domainNodeCounts.WEATHER ?? 0) +
        (graph.stats.domainNodeCounts.CROSS_DAY_SPILLOVER ?? 0),
    ).toBeGreaterThanOrEqual(1);

    expect(graph.stats.slotNodeCount).toBe(3);
    expect(graph.stats.driftNodeCount).toBeGreaterThanOrEqual(1);
    expect(graph.edges.some(e => e.topologyKind === 'TIMELINE_FOLLOW')).toBe(true);
    expect(graph.edges.some(e => e.topologyKind === 'CROSS_DAY_HANDOFF')).toBe(true);
    expect(graph.edges.some(e => e.topologyKind === 'DRIFT_SOURCE_LINK')).toBe(true);
    expect(graph.nodes.some(n => n.id === slotNodeId('2026-06-01', 'd1'))).toBe(true);
    expect(graph.nodes.some(n => n.id.startsWith('drift:'))).toBe(true);
    const cross = crossDrifts[0];
    expect(
      graph.nodes.find(n => n.id === driftNodeId(cross.id)),
    ).toBeDefined();
    expect(graph.stats.bookingDeadlineNodeCount).toBe(0);
  });

  it('adds BOOKING_DEADLINE_ANCHOR and BOOKING_CHECKIN_PRESSURE when hotel arrives after hotelCheckinLatest', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 'h1',
              time: '23:00',
              endTime: '23:59',
              title: 'Hotel',
              type: 'hotel',
            },
          ],
        },
      ],
    };
    plan.temporal = {
      timeDrifts: [],
      constraintEdges: [],
      emittedAt: new Date().toISOString(),
    };

    const graph = buildUnifiedConstraintGraph(plan, {
      hotelCheckinLatest: '22:00',
    });

    expect(graph.stats.bookingDeadlineNodeCount).toBe(1);
    expect(graph.stats.domainNodeCounts.BOOKING).toBe(1);
    expect(graph.stats.domainEdgeCounts.BOOKING).toBe(1);
    const anchor = graph.nodes.find(n => n.kind === 'BOOKING_DEADLINE_ANCHOR');
    expect(anchor?.booking?.gapMinutes).toBe(60);
    expect(
      graph.edges.some(
        e =>
          e.topologyKind === 'BOOKING_CHECKIN_PRESSURE' &&
          e.fromNodeId === anchor?.id &&
          e.toNodeId === slotNodeId('2026-06-01', 'h1'),
      ),
    ).toBe(true);
  });
});
