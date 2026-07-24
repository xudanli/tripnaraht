import {
  buildWorkbenchDisplayAlignment,
  fingerprintItineraryDays,
  resolveWorkbenchDisplaySource,
} from './workbench-display-alignment.util';

describe('workbench-display-alignment', () => {
  const orch = [
    {
      date: '2026-06-06',
      items: [{ id: 'a', type: 'POI', start_window: '09:00', location_ref: { name: '众神瀑布' } }],
    },
  ];
  const trip = [
    {
      date: '2026-06-06',
      items: [{ id: 'a', type: 'POI', start_window: '09:00', location_ref: { name: '众神瀑布' } }],
    },
  ];
  const tripOther = [
    {
      date: '2026-06-06',
      items: [{ id: 'b', type: 'POI', start_window: '09:00', location_ref: { name: '钻石沙滩' } }],
    },
  ];

  it('aligned when fingerprints match', () => {
    expect(fingerprintItineraryDays(orch)).toBe(fingerprintItineraryDays(trip));
    const a = buildWorkbenchDisplayAlignment({
      tripId: 't1',
      orchestratorDays: orch,
      tripDays: trip,
      entryPoint: 'planning_workbench',
    });
    expect(a.aligned).toBe(true);
    expect(a.timeline_source).toBe('orchestration');
  });

  it('prefers trip_persisted on workbench drift', () => {
    expect(
      resolveWorkbenchDisplaySource({
        tripId: 't1',
        orchestratorDays: orch,
        tripDays: tripOther,
        entryPoint: 'planning_workbench',
      }),
    ).toBe('trip_persisted');
  });

  it('prefers orchestration for itinerary adjust draft pending', () => {
    expect(
      resolveWorkbenchDisplaySource({
        tripId: 't1',
        orchestratorDays: orch,
        tripDays: tripOther,
        entryPoint: 'planning_workbench',
        itineraryAdjustDraftPending: true,
      }),
    ).toBe('orchestration');
  });

  it('prefers orchestration for full trip replan draft pending on workbench', () => {
    expect(
      resolveWorkbenchDisplaySource({
        tripId: 't1',
        orchestratorDays: orch,
        tripDays: tripOther,
        entryPoint: 'planning_workbench',
        fullTripReplanDraftPending: true,
      }),
    ).toBe('orchestration');
  });
});
