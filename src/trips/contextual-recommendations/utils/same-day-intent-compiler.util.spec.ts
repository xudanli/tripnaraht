import {
  compileSameDayIntent,
  mergeCompiledIntentWithDelta,
} from './same-day-intent-compiler.util';

describe('same-day-intent-compiler.util', () => {
  it('compiles arrival + low energy + family preferences from NL', () => {
    const compiled = compileSameDayIntent(
      '我们刚落地，一家人都比较累，今晚适合做什么？想吃个饭，九点前回酒店',
    );
    expect(compiled.contextDelta.tripPhase).toBe('ARRIVAL_DAY');
    expect(compiled.contextDelta.teamState?.energy).toBe('LOW');
    expect(compiled.contextDelta.desiredIntensity).toBe('LIGHT');
    expect(compiled.contextDelta.preference).toEqual(
      expect.arrayContaining(['吃饭', '早点回酒店', '全家友好']),
    );
    expect(compiled.contextDelta.desiredReturnTime).toBe('21:00');
    expect(compiled.matchedPhrases.length).toBeGreaterThanOrEqual(2);
  });

  it('lets explicit contextDelta override compiled fields', () => {
    const compiled = compileSameDayIntent('很累，想轻松一点');
    const merged = mergeCompiledIntentWithDelta(compiled.contextDelta, {
      teamState: { energy: 'HIGH' },
      desiredIntensity: 'FULL',
    });
    expect(merged.teamState?.energy).toBe('HIGH');
    expect(merged.desiredIntensity).toBe('FULL');
  });
});
