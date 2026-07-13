import { SeverityHysteresisService } from './severity-hysteresis.service';

describe('SeverityHysteresisService', () => {
  const service = new SeverityHysteresisService();
  const risk = {
    tripId: 'trip-1',
    riskKey: 'rk-wind',
    knowledgeCode: 'ENV-WIND-01',
    type: 'ENVIRONMENT' as const,
    level: 'CRITICAL' as const,
    executionGate: 'STOP' as const,
  };

  it('blocks weather downgrade until two confirming readings', async () => {
    const first = await service.apply(risk, { level: 'HIGH', executionGate: 'REPLAN_REQUIRED' });
    expect(first.level).toBe('CRITICAL');
    expect(first.hysteresis?.canDowngrade).toBe(false);
    expect(first.hysteresis?.readingsConfirmed).toBe(1);

    const second = await service.apply(
      { ...risk, level: first.level, executionGate: first.executionGate },
      { level: 'HIGH', executionGate: 'REPLAN_REQUIRED' },
    );
    expect(second.level).toBe('HIGH');
    expect(second.hysteresis?.canDowngrade).toBe(true);
  });

  it('escalates immediately without waiting for readings', async () => {
    await service.reset(risk.tripId, risk.riskKey);
    const result = await service.apply(
      { ...risk, level: 'MEDIUM', executionGate: 'AT_RISK' },
      { level: 'CRITICAL', executionGate: 'STOP' },
    );
    expect(result.level).toBe('CRITICAL');
    expect(result.executionGate).toBe('STOP');
  });
});
