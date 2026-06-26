import { ValidationGatewayExtensionService } from './validation-gateway-extension.service';
import { evaluateTravelOntologyConstraints } from '../kernel/travel-ontology-constraints';

describe('ValidationGatewayExtensionService', () => {
  it('stagePhysicalOntology detects DSO travel ontology violations', async () => {
    const ext = new ValidationGatewayExtensionService();
    const dso = {
      requestId: 't1',
      userIntent: { budget: 1000 },
      tripState: {},
      environmentState: {},
      systemState: { requestId: 't1' },
      travelOntologyState: {
        nouns: {
          hotels: [{ id: 'h1', nightlyPrice: 800, checkIn: '2026-07-05', checkOut: '2026-07-01' }],
        },
      },
    } as any;

    expect(evaluateTravelOntologyConstraints(dso).length).toBeGreaterThan(0);

    const out = await ext.stagePhysicalOntology(dso, { requestId: 't1' } as any, [], 0);
    expect(out.issues.length).toBeGreaterThan(0);
    expect(out.confidenceDelta).toBeLessThan(0);
  });

  it('stageKpuOutputCheck skips without knowledge validation service', async () => {
    const ext = new ValidationGatewayExtensionService();
    const out = await ext.stageKpuOutputCheck(
      {} as any,
      { requestId: 'r1', itinerary: { days: [{ date: 'd', items: [] }] } } as any,
      [],
      0,
    );
    expect(out.skipped).toBe(true);
  });
});
