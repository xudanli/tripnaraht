import {
  assertContextIdInvariant,
  explorationContextId,
  readTravelContextIdFromTripMetadata,
  resolveCanonicalContextId,
} from './travel-context-identity.util';

describe('travel-context-identity.util', () => {
  it('explorationContextId returns scenario id unchanged (V1)', () => {
    expect(explorationContextId('abc-123')).toBe('abc-123');
  });

  it('resolveCanonicalContextId prefers explicit contextId', () => {
    expect(resolveCanonicalContextId({ id: 'a', contextId: 'ctx-a' })).toBe('ctx-a');
    expect(resolveCanonicalContextId({ id: 'a' })).toBe('a');
  });

  it('readTravelContextIdFromTripMetadata reads travelContextId and fallbacks', () => {
    expect(readTravelContextIdFromTripMetadata({ travelContextId: 'ctx-1' })).toBe('ctx-1');
    expect(
      readTravelContextIdFromTripMetadata({
        travelContext: { contextId: 'ctx-2' },
      }),
    ).toBe('ctx-2');
    expect(readTravelContextIdFromTripMetadata({ explorationScenarioId: 'sc-1' })).toBe('sc-1');
  });

  it('assertContextIdInvariant accepts V1 id === scenarioId', () => {
    expect(assertContextIdInvariant({ contextId: 'same', scenarioId: 'same' })).toBe(true);
  });
});
