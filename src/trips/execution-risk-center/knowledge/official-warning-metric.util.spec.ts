import { buildOfficialWarningMetrics } from './official-warning-metric.util';

describe('buildOfficialWarningMetrics', () => {
  it('maps environment severity red to RED warning level', () => {
    const metrics = buildOfficialWarningMetrics({
      severity: 'red',
      description: 'Strong wind warning',
      type: 'weather',
    });
    expect(metrics.OFFICIAL_WARNING_LEVEL).toBe('RED');
  });

  it('maps environment severity yellow to YELLOW warning level', () => {
    const metrics = buildOfficialWarningMetrics({
      severity: 'yellow',
      description: 'Wind advisory for south coast',
      type: 'weather',
    });
    expect(metrics.OFFICIAL_WARNING_LEVEL).toBe('YELLOW');
  });
});
