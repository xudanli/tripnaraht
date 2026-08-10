import {
  assessInsuranceCoverageGaps,
  assessRouteExposure,
  parseInsuranceCoverageTier,
  recommendInsuranceTier,
} from './assess-insurance-coverage-gap';

describe('assessInsuranceCoverageGaps', () => {
  it('maps gravel + highland exposures to structured codes', () => {
    const exposure = assessRouteExposure({
      gravelRoad: true,
      gravelParking: true,
      fRoadOrHighland: true,
      fordCrossing: true,
    });
    expect(exposure.codes).toEqual(
      expect.arrayContaining([
        'GRAVEL_ROAD',
        'GRAVEL_PARKING',
        'F_ROAD_HIGHLAND',
        'FORD_CROSSING',
      ]),
    );
  });

  it('flags BASIC gravel chip as hard gap and always excludes fording', () => {
    const assessment = assessInsuranceCoverageGaps({
      exposure: {
        gravelRoad: true,
        fRoadOrHighland: true,
        fordCrossing: true,
      },
      tier: 'BASIC',
    });
    expect(assessment.fordingExcluded).toBe(true);
    expect(assessment.hasHardGap).toBe(true);
    expect(assessment.gate).toBe('NEED_CONFIRM');
    expect(assessment.gaps.some((g) => g.dimension === 'GRAVEL_CHIP')).toBe(
      true,
    );
    expect(
      assessment.gaps.find((g) => g.dimension === 'WATER_FORDING')?.status,
    ).toBe('EXCLUDED');
    expect(assessment.recommendedActions).toEqual(
      expect.arrayContaining([
        'CONFIRM_INSURANCE_COVERAGE_GAPS',
        'ACK_FORDING_EXCLUSION',
        'CONSIDER_GP_OR_HIGHER_TIER',
      ]),
    );
  });

  it('recommends STANDARD when gravel needs GP but fording remains excluded', () => {
    expect(
      recommendInsuranceTier({
        gravelRoad: true,
        gravelParking: true,
      }),
    ).toBe('STANDARD');
    const full = assessInsuranceCoverageGaps({
      exposure: { gravelRoad: true, fRoadOrHighland: true },
      tier: 'FULL',
    });
    expect(full.gaps.every((g) => g.dimension === 'WATER_FORDING')).toBe(true);
    expect(full.coverageByDimension.WATER_FORDING).toBe('EXCLUDED');
  });

  it('parses coverage tier without inventing unknown values', () => {
    expect(parseInsuranceCoverageTier('standard')).toBe('STANDARD');
    expect(parseInsuranceCoverageTier('SAAP')).toBeUndefined();
  });
});
