import { recordItineraryAdjustFunnel } from './itinerary-adjust-metrics.util';

describe('itinerary-adjust-metrics', () => {
  it('records funnel counter on prometheus service', () => {
    const inc = jest.fn();
    const prometheus = {
      recordItineraryAdjustFunnel: inc,
    } as unknown as import('../../monitoring/prometheus-metrics.service').PrometheusMetricsService;

    recordItineraryAdjustFunnel(prometheus, {
      stage: 'draft_created',
      outcome: 'success',
      sub_intent: 'poi_slot_fill',
      execution_mode: 'SEMI_AUTO',
    });

    expect(inc).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'draft_created',
        outcome: 'success',
        sub_intent: 'poi_slot_fill',
        execution_mode: 'SEMI_AUTO',
      }),
    );
  });
});
