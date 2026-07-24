import {
  buildLunchBreakSpec,
  buildLunchStrategyClarificationQuestion,
  buildLunchWindowConflictCopy,
  buildTripLunchMetadataFromParams,
  extractLunchStrategySignalsFromParams,
  extractLunchStrategySignalsFromTrip,
  getMinLunchGapMinutes,
  normalizeLunchStrategy,
  resolveLunchStrategy,
  resolveLunchStrategyFromTrip,
  shouldPromptLunchStrategyQuestion,
} from './lunch-strategy.util';

describe('lunch-strategy.util', () => {
  it('normalizes Chinese and English strategy aliases', () => {
    expect(normalizeLunchStrategy('主动错峰')).toBe('staggered');
    expect(normalizeLunchStrategy('route_driven')).toBe('route_driven');
    expect(normalizeLunchStrategy('unknown')).toBeNull();
  });

  it('prefers explicit strategy over inferred signals', () => {
    expect(
      resolveLunchStrategy({
        lunch_strategy: 'balanced',
        hasElderly: true,
        travelMode: 'DRIVING',
      }),
    ).toBe('balanced');
  });

  it('infers rigid for elderly or timed meals', () => {
    expect(resolveLunchStrategy({ hasElderly: true })).toBe('rigid');
    expect(resolveLunchStrategy({ needsTimedMeals: true })).toBe('rigid');
  });

  it('infers route_driven for driving or remote routes', () => {
    expect(resolveLunchStrategy({ travelMode: 'DRIVING' })).toBe('route_driven');
    expect(resolveLunchStrategy({ destination: '冰岛环岛', isRemoteRoute: true })).toBe('route_driven');
  });

  it('infers staggered for urban hotspots', () => {
    expect(resolveLunchStrategy({ destination: '京都', isUrbanHotspot: true })).toBe('staggered');
  });

  it('builds strategy-specific lunch break windows', () => {
    expect(buildLunchBreakSpec('rigid').window).toEqual(['12:00', '13:00']);
    expect(buildLunchBreakSpec('route_driven').meal_anchor).toBe('MEAL_FLOATING');
    expect(getMinLunchGapMinutes('rigid')).toBe(60);
  });

  it('extracts signals from trip metadata', () => {
    const strategy = resolveLunchStrategyFromTrip({
      destination: 'IS',
      metadata: {
        tripParams: { hasElderly: true, hasChildren: true },
        routeDirectionId: 'iceland-ring-road',
      },
      pacingConfig: { travelMode: 'DRIVING' },
    });
    expect(strategy).toBe('rigid');
    const signals = extractLunchStrategySignalsFromTrip({
      destination: 'IS',
      metadata: { lunch_strategy: 'staggered' },
    });
    expect(resolveLunchStrategy(signals)).toBe('staggered');
  });

  it('builds conflict copy with strategy-specific suggestions', () => {
    const copy = buildLunchWindowConflictCopy({
      strategy: 'route_driven',
      durationMinutes: 30,
      minRequired: 45,
    });
    expect(copy.description).toContain('路性驱动');
    expect(copy.suggestions[0]?.action).toBe('沿路补给');
  });

  it('prompts lunch strategy when elderly and persists on create params', () => {
    const signals = extractLunchStrategySignalsFromParams({ hasElderly: true }, 'IS');
    expect(shouldPromptLunchStrategyQuestion(signals)).toBe(true);
    expect(buildLunchStrategyClarificationQuestion().metadata.fieldName).toBe('lunch_strategy');

    const meta = buildTripLunchMetadataFromParams({ hasElderly: true, travelMode: 'DRIVING' }, 'IS');
    expect(meta.lunch_strategy).toBe('rigid');
    expect(meta.tripParams.lunch_strategy).toBe('rigid');
  });

  it('does not prompt when lunch_strategy already set', () => {
    const signals = extractLunchStrategySignalsFromParams({ lunch_strategy: 'staggered', hasElderly: true });
    expect(shouldPromptLunchStrategyQuestion(signals)).toBe(false);
  });
});
