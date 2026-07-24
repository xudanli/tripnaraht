/**
 * executeOptimize 落盘：freezeRouteSelection 时 segmentId 拓扑不得位移
 */

import { DecisionKernelService } from './decision-kernel.service';
import type { DecisionState, OptimizationHints } from './decision-state.types';
import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';
import { extractSegmentIdsFromItinerary } from './route-topology-lock.util';

describe('DecisionKernelService.executeOptimize — route topology lock persist', () => {
  const anchorItinerary: Itinerary = {
    request_id: 'req-topo',
    days: [
      {
        date: '2026-07-01',
        items: [
          {
            id: 'seg-a',
            type: 'POI',
            start_window: '09:00',
            end_window: '10:00',
            location_ref: { place_id: 'p1', name: 'A', coordinates: { lat: 64, lng: -19 } },
          },
          {
            id: 'seg-b',
            type: 'POI',
            start_window: '11:00',
            end_window: '12:00',
            location_ref: { place_id: 'p2', name: 'B', coordinates: { lat: 64.1, lng: -19.1 } },
          },
        ],
      },
    ],
    action_plan: [],
  } as Itinerary;

  const makeState = (): DecisionState =>
    ({
      requestId: 'req-topo',
      userIntent: {},
      tripState: { planDraft: anchorItinerary },
      environmentState: { routeDirectionId: 'rd-1', countryCode: 'IS' },
      systemState: {
        requestId: 'req-topo',
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        version: 0,
      },
    }) as DecisionState;

  const mergeMock = jest.fn((current: DecisionState, patch: Partial<DecisionState>) => ({
    ...current,
    ...patch,
    tripState: { ...(current.tripState ?? {}), ...(patch.tripState ?? {}) },
    environmentState: { ...(current.environmentState ?? {}), ...(patch.environmentState ?? {}) },
    research_data: patch.research_data ?? current.research_data,
    optimizationHints: patch.optimizationHints ?? current.optimizationHints,
    history: patch.history ?? current.history,
  }));

  const appendHistoryDeltaMock = jest.fn((current: DecisionState, delta: any) => ({
    ...current,
    history: [...(current.history ?? []), delta],
  }));

  it('persists locked segmentIds and rejects divergent recommended topology', async () => {
    const divergentRecommended: Itinerary = {
      request_id: 'req-topo',
      days: [
        {
          date: '2026-07-01',
          items: [
            {
              id: 'only-one',
              type: 'POI',
              start_window: '14:00',
              end_window: '15:00',
              location_ref: { place_id: 'x', name: 'X', coordinates: { lat: 65, lng: -20 } },
            },
          ],
        },
      ],
      action_plan: [],
    } as Itinerary;

    const hints: OptimizationHints = {
      method: 'CGUS',
      recommendedAlternativeId: 'plan-time-slack-intra',
      optimizationFlags: {
        freezeRouteSelection: true,
        useMonteCarlo: false,
        physicalRealityIncomplete: true,
      },
      alternatives: [
        {
          id: 'plan-time-slack-intra',
          score: 0.8,
          itinerary: divergentRecommended,
        },
      ],
    };

    const kernel = new DecisionKernelService(
      { merge: mergeMock, commit: jest.fn(), appendHistoryDelta: appendHistoryDeltaMock, commitWithLock: jest.fn() } as any,
      { getReport: jest.fn(), getReportAsync: jest.fn() } as any,
      { getHints: jest.fn().mockReturnValue(hints), getHintsAsync: jest.fn().mockResolvedValue(hints) } as any,
      { buildContextPackage: jest.fn() } as any,
      { recordDecisionLog: jest.fn(), recordUserFeedback: jest.fn() } as any,
    );

    const { newState } = await kernel.executeOptimize(makeState());

    const anchorIds = extractSegmentIdsFromItinerary(anchorItinerary, 'req-topo', 'rd-1');
    const persistedIds =
      newState.tripState?.routeTopologyLock?.lockedSegmentIds ??
      (newState.research_data as any)?.worldModelMeta?.lockedSegmentIds;

    expect(persistedIds).toEqual(anchorIds);
    expect(newState.environmentState?.isRouteTopologyLocked).toBe(true);
    expect((newState.research_data as any)?.worldModelMeta?.route_skeleton_locked).toBe(true);
    expect(newState.tripState?.routeTopologyLock?.topologyMatch).toBe(false);
    expect(newState.tripState?.routeTopologyLock?.recommendedPlanRejected).toBe(true);

    const afterIds = extractSegmentIdsFromItinerary(
      newState.tripState?.planDraft as Itinerary,
      'req-topo',
      'rd-1',
    );
    expect(afterIds).toEqual(anchorIds);
    expect(appendHistoryDeltaMock.mock.calls[0][1]).toMatchObject({ type: 'route_topology_lock' });
  });

  it('applies slot timing merge when recommended topology matches anchor segmentIds', async () => {
    const matchedRecommended: Itinerary = {
      ...anchorItinerary,
      days: [
        {
          date: '2026-07-01',
          items: [
            {
              ...anchorItinerary.days![0].items![0],
              start_window: '08:30',
              end_window: '09:30',
            },
            {
              ...anchorItinerary.days![0].items![1],
              start_window: '10:30',
              end_window: '11:30',
            },
          ],
        },
      ],
    } as Itinerary;

    const hints: OptimizationHints = {
      method: 'CGUS',
      recommendedAlternativeId: 'plan-base',
      optimizationFlags: { freezeRouteSelection: true, useMonteCarlo: false },
      alternatives: [{ id: 'plan-base', score: 0.9, itinerary: matchedRecommended }],
    };

    const kernel = new DecisionKernelService(
      { merge: mergeMock, commit: jest.fn(), appendHistoryDelta: appendHistoryDeltaMock, commitWithLock: jest.fn() } as any,
      { getReport: jest.fn(), getReportAsync: jest.fn() } as any,
      { getHints: jest.fn().mockReturnValue(hints), getHintsAsync: jest.fn().mockResolvedValue(hints) } as any,
      { buildContextPackage: jest.fn() } as any,
      { recordDecisionLog: jest.fn(), recordUserFeedback: jest.fn() } as any,
    );

    const { newState } = await kernel.executeOptimize(makeState());
    const draft = newState.tripState?.planDraft as Itinerary;
    const ids = extractSegmentIdsFromItinerary(draft, 'req-topo', 'rd-1');

    expect(ids).toEqual(['seg-a', 'seg-b']);
    expect(draft.days?.[0]?.items?.[0]?.start_window).toBe('08:30');
    expect(newState.tripState?.routeTopologyLock?.topologyMatch).toBe(true);
    expect(newState.tripState?.routeTopologyLock?.recommendedPlanRejected).toBeFalsy();
  });
});
