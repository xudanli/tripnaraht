import { mapMcpPayloadToRouteFeasibilityInput, CHECK_TRIP_SAFETY_TOOL_NAME } from './iceland-safety-check.handler';

describe('iceland-safety-check.handler', () => {
  it('maps MCP payload to route feasibility input', () => {
    const input = mapMcpPayloadToRouteFeasibilityInput({
      itinerary_segments: [
        { from_region: 'reykjavik', to_region: 'vik', distance_km: 190, road_id: 'F208' },
      ],
      vehicle_type: '4x4',
      travel_date: '2026-07-10',
      request_id: 't1',
    });
    expect(input.request_id).toBe('t1');
    expect(input.travelDate).toBe('2026-07-10');
    expect(input.segments[0].distanceKm).toBe(190);
    expect(input.segments[0].roadId).toBe('F208');
    expect(input.vehicle.type).toBe('4x4');
  });

  it('exposes stable tool name', () => {
    expect(CHECK_TRIP_SAFETY_TOOL_NAME).toBe('check_trip_safety');
  });

  it('maps segment surface from MCP', () => {
    const input = mapMcpPayloadToRouteFeasibilityInput({
      itinerary_segments: [{ from_region: 'westfjords', to_region: 'reykjavik', distance_km: 100, surface: 'gravel' }],
      vehicle_type: '4x4',
    });
    expect(input.segments[0].surface).toBe('gravel');
  });
});
