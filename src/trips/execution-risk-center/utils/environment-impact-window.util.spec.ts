import { projectEnvironmentEventToRisk } from '../adapters/environment-event-risk.adapter';
import { parseImpactWindowFromDescription } from './environment-impact-window.util';
import { harnessWindEnvironmentEvent } from '../harness/execution-risk-p0.harness.util';

describe('environment-impact-window.util', () => {
  it('parses Chinese time range from wind description', () => {
    const parsed = parseImpactWindowFromDescription(
      '预计 11:00 后阵风达到 16—18m/s，并将在 11:00—18:00 持续',
      '2026-07-08',
    );
    expect(parsed.impactStartAt).toBe('2026-07-08T11:00:00.000Z');
    expect(parsed.impactEndAt).toBe('2026-07-08T18:00:00.000Z');
  });

  it('feeds impact window into environment risk projection', () => {
    const risk = projectEnvironmentEventToRisk(
      harnessWindEnvironmentEvent({
        description: '预计 11:00 后阵风达到 16—18m/s，并将在 11:00—18:00 持续',
      }),
      { referenceDate: '2026-07-08' },
    );
    expect(risk.impactStartAt).toBe('2026-07-08T11:00:00.000Z');
    expect(risk.impactEndAt).toBe('2026-07-08T18:00:00.000Z');
    expect(risk.code).toBe('WEATHER_STRONG_WIND');
  });
});
