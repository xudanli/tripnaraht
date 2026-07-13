import { computeSeverityHysteresisOutcome } from './severity-hysteresis.logic';

describe('severity-hysteresis.logic', () => {
  const prior = {
    level: 'CRITICAL' as const,
    executionGate: 'STOP' as const,
    confirmedImprovementReadings: 0,
    updatedAt: '2026-07-09T00:00:00.000Z',
  };

  it('blocks weather downgrade until two confirming readings', () => {
    const first = computeSeverityHysteresisOutcome({
      prior,
      proposed: { level: 'HIGH', executionGate: 'REPLAN_REQUIRED' },
      isWeather: true,
    });
    expect(first.level).toBe('CRITICAL');
    expect(first.hysteresis?.canDowngrade).toBe(false);
    expect(first.hysteresis?.readingsConfirmed).toBe(1);

    const second = computeSeverityHysteresisOutcome({
      prior: first.entry,
      proposed: { level: 'HIGH', executionGate: 'REPLAN_REQUIRED' },
      isWeather: true,
    });
    expect(second.level).toBe('HIGH');
    expect(second.hysteresis?.canDowngrade).toBe(true);
  });

  it('escalates immediately without waiting for readings', () => {
    const result = computeSeverityHysteresisOutcome({
      prior: {
        ...prior,
        level: 'MEDIUM',
        executionGate: 'AT_RISK',
      },
      proposed: { level: 'CRITICAL', executionGate: 'STOP' },
      isWeather: true,
    });
    expect(result.level).toBe('CRITICAL');
    expect(result.executionGate).toBe('STOP');
  });
});
