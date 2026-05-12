import { Test } from '@nestjs/testing';
import { IcelandGasEvChargePlannerSkill } from './iceland-gas-ev-planner.skill';

describe('IcelandGasEvChargePlannerSkill', () => {
  it('returns planner output for ICE', async () => {
    const m = await Test.createTestingModule({
      providers: [IcelandGasEvChargePlannerSkill],
    }).compile();
    const skill = m.get(IcelandGasEvChargePlannerSkill);
    const out = await skill.execute({
      request_id: 't1',
      vehicle: { type: '4x4' },
      energyDemandEstimate: {
        totalKm: 200,
        estimatedFuelLitersGasolineEquiv: 17,
        estimatedEvKwh: 50,
        fuelBurnModelId: 'x',
      },
      segments: [{ from_region: 'reykjavik', to_region: 'vik' }],
    });
    expect(out.metrics.energy_mode).toBe('ice');
    expect(out.recommended_stops.length).toBeGreaterThan(0);
  });
});
