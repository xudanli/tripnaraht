import { GuideCanonicalSelectionService } from './guide-canonical-selection.service';
import { FullPlanSelectionService } from '../../decision-runtime/core/full-plan-selection.service';
import type { GuideItineraryDraft } from './guide-plan-builder.service';

function minimalDraft(variant: string): GuideItineraryDraft {
  return {
    totalDays: 1,
    variant,
    sourceConfidence: 0.8,
    warnings: [],
    days: [
      {
        day: 1,
        date: '2026-08-01',
        items: [
          {
            name: '蓝湖',
            type: 'poi',
            source: 'guide',
            startTime: '10:00',
            endTime: '12:00',
            travelMinutesFromPrev: 30,
          },
        ],
        activityCount: 1,
      },
    ],
  };
}

describe('GuideCanonicalSelectionService', () => {
  const originalFlag = process.env.GUIDE_CANONICAL_PLAN_SELECTION;

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.GUIDE_CANONICAL_PLAN_SELECTION;
    else process.env.GUIDE_CANONICAL_PLAN_SELECTION = originalFlag;
  });

  it('returns null when disabled', async () => {
    process.env.GUIDE_CANONICAL_PLAN_SELECTION = '0';
    const fullPlanSelection = { selectFromPrebuiltCandidates: jest.fn() };
    const service = new GuideCanonicalSelectionService(fullPlanSelection as any);

    const result = await service.finalizeGuideVariants({
      sessionId: 'sess_1',
      countryCode: 'IS',
      variants: [{ variant: 'balanced', itineraryDraft: minimalDraft('balanced') }],
    });

    expect(result).toBeNull();
    expect(fullPlanSelection.selectFromPrebuiltCandidates).not.toHaveBeenCalled();
  });

  it('delegates variants to FullPlanSelectionService when enabled', async () => {
    process.env.GUIDE_CANONICAL_PLAN_SELECTION = '1';
    const fullPlanSelection = {
      selectFromPrebuiltCandidates: jest.fn().mockResolvedValue({
        schemaId: 'tripnara.full_plan_selection@v1',
        problemId: 'guide_plan_sess_1_1',
        candidates: [],
        constraintReports: {
          balanced: {
            schemaId: 'tripnara.canonical_constraint_report@v1',
            tripId: 'sess_1',
            evaluatedAt: new Date().toISOString(),
            assertions: [{ status: 'BLOCK', message: 'F-road closed', source: 'test' }],
            completeness: {
              roads: 'MISSING',
              weather: 'MISSING',
              hazards: 'MISSING',
              ferries: 'MISSING',
              openingHours: 'MISSING',
            },
            overallStatus: 'INFEASIBLE',
            degraded: false,
            degradedReasons: [],
          },
        },
        record: {
          decisionId: 'dec_1',
          selectedCandidateId: 'balanced',
          finalAction: 'ALLOW',
        },
        humanDecisionRequired: false,
      }),
    };
    const service = new GuideCanonicalSelectionService(fullPlanSelection as any);

    const result = await service.finalizeGuideVariants({
      sessionId: 'sess_1',
      countryCode: 'IS',
      travelContext: { transportMode: 'self_drive', countryCode: 'IS' },
      variants: [
        { variant: 'balanced', itineraryDraft: minimalDraft('balanced') },
        { variant: 'faithful', itineraryDraft: minimalDraft('faithful') },
      ],
    });

    expect(result).not.toBeNull();
    expect(fullPlanSelection.selectFromPrebuiltCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ tripId: 'sess_1' }),
        candidates: expect.arrayContaining([
          expect.objectContaining({ candidateId: 'balanced' }),
          expect.objectContaining({ candidateId: 'faithful' }),
        ]),
      }),
    );
    expect(result!.recommendedVariant).toBe('balanced');
    expect(result!.warningsByVariant.balanced.join('\n')).toContain('F-road closed');
    expect(result!.selection.record.decisionId).toBe('dec_1');
  });
});
