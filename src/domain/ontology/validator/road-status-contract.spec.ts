import {
  inferRoadAccessFromSurfaceCondition,
  liveLatestStatusBlocksSegment,
} from './road-status-contract.types';

describe('road access inference / segment block', () => {
  it('maps SLIPPERY to RESTRICTED_4WD', () => {
    expect(inferRoadAccessFromSurfaceCondition('SLIPPERY')).toBe('RESTRICTED_4WD');
  });

  it('SLIPPERY blocks sedan but not 4x4', () => {
    expect(
      liveLatestStatusBlocksSegment(
        { condition: 'SLIPPERY', provider: 'road.is' },
        'SEDAN',
      ),
    ).toBe(true);
    expect(
      liveLatestStatusBlocksSegment(
        { condition: 'SLIPPERY', provider: 'road.is' },
        'FOUR_BY_FOUR',
      ),
    ).toBe(false);
  });
});
