import { coerceExplorePlaceId } from './attraction-explore.dto';

describe('coerceExplorePlaceId', () => {
  it('keeps numeric placeId', () => {
    const obj: Record<string, unknown> = {};
    expect(coerceExplorePlaceId(123, obj)).toBe(123);
    expect(obj.attractionId).toBeUndefined();
  });

  it('parses numeric string placeId', () => {
    const obj: Record<string, unknown> = {};
    expect(coerceExplorePlaceId('456', obj)).toBe(456);
  });

  it('remaps UUID placeId to attractionId', () => {
    const obj: Record<string, unknown> = {};
    const uuid = 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1';
    expect(coerceExplorePlaceId(uuid, obj)).toBeUndefined();
    expect(obj.attractionId).toBe(uuid);
  });

  it('remaps Google placeId string to attractionId', () => {
    const obj: Record<string, unknown> = {};
    expect(coerceExplorePlaceId('ChIJxxxx', obj)).toBeUndefined();
    expect(obj.attractionId).toBe('ChIJxxxx');
  });

  it('remaps Iceland canonical slug placeId to attractionId', () => {
    const obj: Record<string, unknown> = {};
    expect(coerceExplorePlaceId('is.reynisfjara', obj)).toBeUndefined();
    expect(obj.attractionId).toBe('is.reynisfjara');
  });

  it('does not overwrite existing attractionId', () => {
    const obj: Record<string, unknown> = { attractionId: 'existing' };
    expect(coerceExplorePlaceId('ChIJxxxx', obj)).toBeUndefined();
    expect(obj.attractionId).toBe('existing');
  });
});
