import {
  AUTO_CORRIDOR_PRODUCT_RULES,
  buildAutoCorridorUiFlagsV1,
  isAutoCorridorEligible,
} from './auto-corridor-product.contract';

describe('auto-corridor-product.contract', () => {
  it('freezes LLM cannot write DB and flawed blocks AUTO', () => {
    expect(AUTO_CORRIDOR_PRODUCT_RULES.llmCannotWriteDb).toBe(true);
    expect(AUTO_CORRIDOR_PRODUCT_RULES.flawedDraftBlocksAuto).toBe(true);
    expect(AUTO_CORRIDOR_PRODUCT_RULES.persistenceTarget).toBe('trip_itinerary_item');
  });

  it('builds UI flags that hide auto control for flawed draft', () => {
    const flags = buildAutoCorridorUiFlagsV1({
      metadata: { flawed_draft_narrate: true, itinerary_adjust_execution_mode: 'AUTO' },
      executionMode: 'AUTO',
    });
    expect(flags.auto_blocked).toBe(true);
    expect(flags.show_auto_apply_control).toBe(false);
    expect(flags.auto_block_reason).toBe('flawed_draft_forbidden');
    expect(flags.requires_preauth).toBe(true);
    expect(flags.audit_required).toBe(true);
  });

  it('rejects eligibility without trip or with flawed draft', () => {
    expect(
      isAutoCorridorEligible({
        primaryIntent: 'ITINERARY_ADJUST',
        boundTripId: null,
      }).eligible,
    ).toBe(false);
    expect(
      isAutoCorridorEligible({
        primaryIntent: 'ITINERARY_ADJUST',
        boundTripId: 'trip_1',
        metadata: { flawed_draft_narrate: true },
        requestExecutionMode: 'AUTO',
      }).reasons,
    ).toContain('flawed_draft_forbidden');
  });
});
