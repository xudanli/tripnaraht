import {
  buildInsuranceAdvisorFromContext,
  isIrresponsibleInsuranceAdvice,
  type InsuranceDecisionContext,
} from '../contracts/insurance-decision-context.types';

function baseCtx(
  overrides?: Partial<InsuranceDecisionContext['fields']>,
): InsuranceDecisionContext {
  return {
    schema: 'tripnara.insurance_decision_context@v1',
    tripId: 't',
    gate: { ok: true, missing: [] },
    fields: {
      selfDriveSeason: { status: 'CONFIRMED', factLine: '夏季' },
      routeSummary: {
        status: 'CONFIRMED',
        value: { dayCount: 7, routeReady: true },
        factLine: '7天',
      },
      roadExposure: {
        status: 'CONFIRMED',
        value: { hasGravel: false, hasFRoad: false, hasMountainHint: false },
        factLine: '无碎石',
      },
      driveLoad: { status: 'UNKNOWN' },
      weatherRisk: { status: 'UNKNOWN' },
      vehicleBooking: {
        status: 'CONFIRMED',
        value: { vehicleType: '2WD' },
        factLine: '2WD',
      },
      memberDriverProfile: { status: 'UNKNOWN' },
      teamRiskTolerance: { status: 'UNKNOWN' },
      budget: { status: 'UNKNOWN' },
      existingInsurance: { status: 'UNKNOWN' },
      ...overrides,
    },
    confirmedFacts: ['7天', '2WD'],
    missingFields: [],
  };
}

describe('responsible insurance advisor', () => {
  it('never recommends basic CDW just because fording is excluded', () => {
    const copy = buildInsuranceAdvisorFromContext(baseCtx());
    expect(copy.advice).not.toMatch(/基础/);
    expect(copy.recommendedTier).toBe('COMPARE');
    expect(copy.body).toContain('勿因涉水选基础险');
  });

  it('gravel → standard GP', () => {
    const copy = buildInsuranceAdvisorFromContext(
      baseCtx({
        roadExposure: {
          status: 'CONFIRMED',
          value: { hasGravel: true, hasFRoad: false, hasMountainHint: false },
          factLine: '含碎石路',
        },
      }),
    );
    expect(copy.recommendedTier).toBe('STANDARD_GP');
    expect(copy.advice).toContain('碎石');
  });

  it('detects irresponsible ford→basic LLM copy', () => {
    expect(
      isIrresponsibleInsuranceAdvice(
        '涉水过河损坏不在保险覆盖范围，全险也不保。选择基础 CDW，避免过河。',
      ),
    ).toBe(true);
    expect(
      isIrresponsibleInsuranceAdvice('本次路线碎石暴露偏高，优先选含碎石险的方案'),
    ).toBe(false);
  });
});
