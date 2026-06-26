import { ValidationGatewayService } from './validation-gateway.service';
import { DecisionOsSloService } from '../slo/decision-os-slo.service';

describe('ValidationGatewayService', () => {
  it('runs stages in order and records SLO', async () => {
    const slo = new DecisionOsSloService();
    const gateway = new ValidationGatewayService(slo);
    const order: string[] = [];

    const result = await gateway.runStages(
      { dso: {} as any, ctx: { requestId: 'bench-1' } as any },
      [
        {
          stageId: 'DATA_RELIABILITY',
          run: async ({ issues, confidenceDelta }) => {
            order.push('DATA_RELIABILITY');
            return { issues, confidenceDelta };
          },
        },
        {
          stageId: 'RISK_EVENTS',
          run: async ({ issues, confidenceDelta }) => {
            order.push('RISK_EVENTS');
            return {
              issues: [
                ...issues,
                {
                  code: 'WEATHER_RISK',
                  class: 'ADVISORY',
                  message: 'wind',
                  source: 'ENVIRONMENTAL_CONSTRAINTS',
                  at: new Date().toISOString(),
                },
              ],
              confidenceDelta: confidenceDelta - 0.05,
            };
          },
        },
      ],
    );

    expect(order).toEqual(['DATA_RELIABILITY', 'RISK_EVENTS']);
    expect(result.issues).toHaveLength(1);
    expect(result.passed).toBe(true);
    expect(slo.getSnapshot().validation.totalRuns).toBe(1);
  });
});
