import { resolveRfc001ProblemSemanticKey } from './problem-semantic';

describe('problem-semantic', () => {
  it('resolves road FEASIBILITY_FAILURE', () => {
    expect(
      resolveRfc001ProblemSemanticKey({
        type: 'FEASIBILITY_FAILURE',
        triggerEventId: 'evt_r1',
      }),
    ).toBe('ROAD_SEGMENT_UNAVAILABLE:evt_r1');
  });

  it('resolves weather capability', () => {
    expect(
      resolveRfc001ProblemSemanticKey({
        type: 'FEASIBILITY_FAILURE',
        triggerEventId: 'evt_w1',
        semanticCapability: 'WEATHER_ACTIVITY_PROHIBITED',
      }),
    ).toBe('WEATHER_ACTIVITY_PROHIBITED:evt_w1');
  });

  it('resolves excessive daily load capability', () => {
    expect(
      resolveRfc001ProblemSemanticKey({
        type: 'EXCESSIVE_LOAD',
        triggerEventId: 'evt_l1',
        semanticCapability: 'EXCESSIVE_DAILY_LOAD',
      }),
    ).toBe('EXCESSIVE_DAILY_LOAD:evt_l1');
  });
});
