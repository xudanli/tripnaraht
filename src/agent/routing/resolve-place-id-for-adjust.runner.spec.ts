import { resolvePlaceIdForItineraryAdjustApply } from './resolve-place-id-for-adjust.runner';

describe('resolve-place-id-for-adjust.runner', () => {
  it('resolves numeric place_id directly', () => {
    const id = resolvePlaceIdForItineraryAdjustApply(
      { location_ref: { place_id: '42' } } as any,
      { research_data: {} },
    );
    expect(id).toBe(42);
  });

  it('matches by name in research pool', () => {
    const id = resolvePlaceIdForItineraryAdjustApply(
      { location_ref: { name: '蓝湖' } } as any,
      {
        research_data: {
          pois: [{ name: '蓝湖温泉', id: 7 }],
        },
      },
    );
    expect(id).toBe(7);
  });
});
