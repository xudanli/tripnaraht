import { evaluateRiskEvents, riskEventsToVerificationIssues } from './risk-event-gate';

describe('risk-event-gate', () => {
  it('maps explicit risk events into verification issues and audit', () => {
    const result = evaluateRiskEvents(
      {} as any,
      {
        requestId: 'r1',
        researchData: {
          __risk_events: [
            {
              id: 'storm-1',
              category: 'WEATHER_NATURAL',
              urgency: 5,
              entityRef: { type: 'DAY', id: '2026-06-14' },
              message: '暴风天气影响户外行程。',
              source: { provider: 'official-weather', sourceType: 'OFFICIAL' },
              observedAt: '2026-06-14T08:00:00.000Z',
              confidence: 0.92,
              suggestedAction: 'DELAY',
            },
          ],
        },
      },
    );

    expect(result.events).toHaveLength(1);
    expect(result.audit.criticalRisks).toEqual(['storm-1']);
    expect(result.confidenceDelta).toBeLessThan(0);

    const issues = riskEventsToVerificationIssues(result.events, '2026-06-14T10:00:00.000Z');
    expect(issues[0]).toMatchObject({
      code: 'WEATHER_RISK',
      class: 'CONFLICT',
      entityRef: { type: 'DAY', id: '2026-06-14' },
    });
    expect(issues[0].message).toContain('[风险事件|WEATHER_NATURAL|U5]');
  });

  it('derives transport disruption from environment flights', () => {
    const result = evaluateRiskEvents(
      {
        environmentState: {
          flights: [
            {
              flight: 'CA123',
              status: 'cancelled',
              observedAt: '2026-06-14T08:00:00.000Z',
            },
          ],
        },
      } as any,
      {
        requestId: 'r1',
        itinerary: {
          request_id: 'r1',
          days: [
            {
              date: '2026-06-14',
              items: [
                { id: 'arrival', type: 'FLIGHT', metadata: { duration_minutes: 120 } },
                { id: 'transfer', type: 'DRIVE', metadata: { duration_minutes: 45 } },
              ],
            },
          ],
        },
      },
    );

    expect(result.events.some((e) => e.category === 'TRANSPORT_DISRUPTION')).toBe(true);
    expect(result.events[0]).toMatchObject({
      category: 'TRANSPORT_DISRUPTION',
      urgency: 5,
      entityRef: { type: 'FLIGHT', id: 'CA123' },
    });
    expect(riskEventsToVerificationIssues(result.events)[0].code).toBe('ROUTE_INFEASIBLE');
    expect(result.audit.impactAssessments?.[0]?.affectedItems.length).toBeGreaterThan(0);
  });

  it('converts travel signals into risk events', () => {
    const result = evaluateRiskEvents(
      {} as any,
      {
        requestId: 'r1',
        researchData: {
          __travel_signals: [
            {
              id: 'safety-1',
              type: 'SAFETY_ALERT',
              entityRef: { type: 'DESTINATION', id: 'x' },
              observedAt: '2026-06-14T08:00:00.000Z',
              source: 'gdelt',
              severity: 'HIGH',
            },
          ],
        },
      },
    );

    expect(result.events[0]).toMatchObject({
      id: 'risk_from_safety-1',
      category: 'SAFETY_SECURITY',
      urgency: 5,
    });
  });

  it('derives high weather risk from environment state', () => {
    const result = evaluateRiskEvents(
      { environmentState: { weatherRisk: 0.82 } } as any,
      { requestId: 'r1', tripPlanRequest: { destination: 'Iceland' } },
    );

    expect(result.events[0]).toMatchObject({
      category: 'WEATHER_NATURAL',
      urgency: 4,
    });
  });
});
