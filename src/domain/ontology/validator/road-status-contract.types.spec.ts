import { parseRoadSurfaceCondition, roadSurfaceConditionIsBlocking } from './road-status-contract.types';

describe('road-status-contract.types', () => {
  it('parseRoadSurfaceCondition normalizes strings', () => {
    expect(parseRoadSurfaceCondition('closed')).toBe('CLOSED');
    expect(parseRoadSurfaceCondition('HEAVY SNOW')).toBe('HEAVY_SNOW');
  });

  it('roadSurfaceConditionIsBlocking', () => {
    expect(roadSurfaceConditionIsBlocking('CLOSED')).toBe(true);
    expect(roadSurfaceConditionIsBlocking('HEAVY_SNOW')).toBe(true);
    expect(roadSurfaceConditionIsBlocking('SLIPPERY')).toBe(false);
  });
});
