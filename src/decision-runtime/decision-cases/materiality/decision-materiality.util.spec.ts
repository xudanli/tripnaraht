import {
  buildMaterialityScore,
  emptyMaterialityBreakdown,
  evaluateThreeGatePublish,
  inferRequirednessFromMateriality,
  mapRequirednessToUiGroup,
  passesMaterialityPublishGate,
  shouldStayOpportunityOnly,
} from './decision-materiality.util';

describe('decision-materiality', () => {
  it('sums clamped dimensions', () => {
    const score = buildMaterialityScore({
      ...emptyMaterialityBreakdown(),
      budget: 2,
      time: 2,
      safety: 2,
      bookingUrgency: 1,
    });
    expect(score.total).toBe(7);
  });

  it('blocks publish under threshold unless forceBlocking', () => {
    expect(
      passesMaterialityPublishGate({ eligible: true, materialityTotal: 4 }),
    ).toBe(false);
    expect(
      passesMaterialityPublishGate({
        eligible: true,
        materialityTotal: 1,
        forceBlocking: true,
      }),
    ).toBe(true);
    expect(
      passesMaterialityPublishGate({ eligible: false, materialityTotal: 9 }),
    ).toBe(false);
  });

  it('three-gate: detection + eligibility + materiality', () => {
    expect(
      evaluateThreeGatePublish({
        detected: false,
        eligible: true,
        materialityTotal: 9,
      }).drop,
    ).toBe(true);
    expect(
      evaluateThreeGatePublish({
        detected: true,
        eligible: false,
        materialityTotal: 9,
        ineligibilityReason: 'no swimming',
      }),
    ).toMatchObject({
      publish: false,
      stayOpportunity: true,
      reason: 'no swimming',
    });
    expect(
      evaluateThreeGatePublish({
        detected: true,
        eligible: true,
        materialityTotal: 4,
      }).stayOpportunity,
    ).toBe(true);
    expect(
      evaluateThreeGatePublish({
        detected: true,
        eligible: true,
        materialityTotal: 7,
      }).publish,
    ).toBe(true);
  });

  it('maps UI groups from requiredness', () => {
    expect(mapRequirednessToUiGroup('BLOCKING')).toBe('MUST_CONFIRM');
    expect(mapRequirednessToUiGroup('IMPORTANT')).toBe('IMPORTANT_CHOICE');
    expect(mapRequirednessToUiGroup('OPTIONAL', 4)).toBe('WORTH_CONSIDERING');
  });

  it('keeps low scores as opportunity-only', () => {
    expect(shouldStayOpportunityOnly(2)).toBe(true);
    expect(shouldStayOpportunityOnly(6)).toBe(false);
    expect(inferRequirednessFromMateriality(9)).toBe('BLOCKING');
    expect(inferRequirednessFromMateriality(7)).toBe('IMPORTANT');
  });
});
