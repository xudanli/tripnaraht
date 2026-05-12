import { buildUnifiedExecutionSemanticView } from './unified-execution-semantic-view';

describe('buildUnifiedExecutionSemanticView', () => {
  it('builds per-day stress without merging critical alerts into outdoor stress', () => {
    const v = buildUnifiedExecutionSemanticView({
      weatherByDate: {
        '2026-06-01': {
          executionState: 'HIGH_RISK',
          violation: 'NONE',
          explanation: 'wind',
        },
      },
      alerts: [
        { code: 'X', severity: 'critical', message: 'system' },
      ],
    });
    expect(v.byDate['2026-06-01']?.outdoorWeatherStress.adverse).toBe(true);
    expect(v.byDate['2026-06-01']?.outdoorWeatherStress.reasons[0]).toContain(
      'executionState',
    );
    expect(v.globalCriticalAlerts).toHaveLength(1);
  });

  it('infers Neptune HARD tier from violation', () => {
    const v = buildUnifiedExecutionSemanticView({
      weatherByDate: {
        '2026-06-02': {
          violation: 'HARD',
          executionState: 'BLOCKED',
        },
      },
    });
    expect(v.byDate['2026-06-02']?.neptuneWeatherTier).toBe('HARD');
  });

  it('fills neutral shells for planDates missing from weatherByDate', () => {
    const v = buildUnifiedExecutionSemanticView({
      weatherByDate: {
        '2026-06-01': { executionState: 'HIGH_RISK', violation: 'NONE' },
      },
      planDates: ['2026-06-01', '2026-06-02'],
    });
    expect(v.byDate['2026-06-02']?.neptuneWeatherTier).toBe('NONE');
    expect(v.byDate['2026-06-02']?.outdoorWeatherStress.adverse).toBe(false);
  });
});
