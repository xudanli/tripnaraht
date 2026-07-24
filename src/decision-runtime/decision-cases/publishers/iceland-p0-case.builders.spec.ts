import {
  buildInsuranceShellCase,
  buildVehicleShellCase,
  enrichInsuranceCase,
  enrichVehicleCase,
} from './iceland-p0-case.builders';
import { INSURANCE_FORDING_EXCLUSION_NOTE } from '../contracts/decision-case.types';

describe('iceland-p0-case.builders', () => {
  const tripId = '3e4a1058-9218-467f-988a-c18008a14385';

  it('builds blocking vehicle shell with SELECT options', () => {
    const c = buildVehicleShellCase(tripId);
    expect(c.published).toBe(true);
    expect(c.requiredness).toBe('BLOCKING');
    expect(c.enrichmentStage).toBe('SHELL');
    expect(c.options.length).toBeGreaterThanOrEqual(3);
    expect(c.writebackTargets).toContain('VEHICLE');
  });

  it('enriches vehicle after route flags', () => {
    const shell = buildVehicleShellCase(tripId);
    const enriched = enrichVehicleCase(shell, {
      hasFRoad: true,
      windExposure: true,
      gravelShareHint: '碎石占比偏高',
    });
    expect(enriched.enrichmentStage).toBe('ENRICHED');
    expect(enriched.workflowStatus).toBe('WAITING_DECISION');
    expect(enriched.summary).toMatch(/F-road/);
  });

  it('keeps fording exclusion on every insurance tier', () => {
    expect(INSURANCE_FORDING_EXCLUSION_NOTE).toContain('涉水');
    const insurance = enrichInsuranceCase(buildInsuranceShellCase(tripId), {
      gravelRisk: true,
      highWind: true,
      highlands: true,
      vehicleConfirmed: true,
    });
    for (const opt of insurance.options) {
      expect(opt.description).toContain('涉水');
    }
    expect(insurance.summary).toContain(INSURANCE_FORDING_EXCLUSION_NOTE);
  });
});
