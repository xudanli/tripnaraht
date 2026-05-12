import { weatherExecutionDayStress } from './weather-execution-semantic-adapter';

describe('weatherExecutionDayStress', () => {
  it('flags HIGH_RISK executionState without legacy condition', () => {
    const r = weatherExecutionDayStress({
      signal: { executionState: 'HIGH_RISK', violation: 'NONE', hazards: [] },
      hasCriticalAlerts: false,
    });
    expect(r.adverse).toBe(true);
    expect(r.reasons.some(x => x.includes('executionState'))).toBe(true);
  });

  it('flags HARD violation', () => {
    const r = weatherExecutionDayStress({
      signal: { violation: 'HARD', executionState: 'BLOCKED' },
      hasCriticalAlerts: false,
    });
    expect(r.adverse).toBe(true);
    expect(r.reasons[0]).toContain('violation');
  });

  it('flags MEDIUM+ structured hazards when executionState still EXECUTABLE', () => {
    const r = weatherExecutionDayStress({
      signal: {
        executionState: 'EXECUTABLE',
        violation: 'NONE',
        hazards: [
          {
            id: 'x',
            kind: 'LOW_VISIBILITY',
            severity: 'HIGH',
            confidence: 0.8,
            evidence: [],
          },
        ],
      },
      hasCriticalAlerts: false,
    });
    expect(r.adverse).toBe(true);
    expect(r.reasons.some(x => x.startsWith('hazards>='))).toBe(true);
  });

  it('keeps legacy rain/storm condition', () => {
    expect(
      weatherExecutionDayStress(
        { signal: { condition: 'rain' }, hasCriticalAlerts: false },
      ).adverse,
    ).toBe(true);
  });

  it('respects critical alerts', () => {
    expect(
      weatherExecutionDayStress({ signal: {}, hasCriticalAlerts: true }).adverse,
    ).toBe(true);
  });

  it('returns calm for EXECUTABLE + NONE + no hazards', () => {
    expect(
      weatherExecutionDayStress({
        signal: { executionState: 'EXECUTABLE', violation: 'NONE' },
        hasCriticalAlerts: false,
      }).adverse,
    ).toBe(false);
  });
});
