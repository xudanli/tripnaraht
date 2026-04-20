import { HarnessItineraryDateContinuityValidator } from './itinerary-date-continuity.validator';
import { HarnessStepName } from '../../contracts/harness-step.types';
import type { HarnessExecutionContext } from '../../runtime/execution-context.types';

function ctx(visible: Record<string, unknown>): HarnessExecutionContext {
  return {
    traceId: 't',
    requestId: 'r',
    step: HarnessStepName.VERIFY,
    visibleState: visible,
    visibleEvidence: [],
    allowedTools: [],
    writableStatePaths: [],
    metadata: { startedAt: new Date().toISOString(), actor: 'test' },
  };
}

describe('HarnessItineraryDateContinuityValidator', () => {
  const v = new HarnessItineraryDateContinuityValidator();

  it('skips when no dated days', async () => {
    const r = v.validate(
      {},
      ctx({ tripState: { planDraft: { days: [{ items: [] }] } } }),
    );
    expect(r.passed).toBe(true);
    expect(r.code).toBe('DATE_CONTINUITY_SKIPPED');
  });

  it('fails on duplicate dates', async () => {
    const r = v.validate(
      {},
      ctx({
        tripState: {
          planDraft: {
            days: [{ date: '2026-01-01' }, { date: '2026-01-01' }],
          },
        },
      }),
    );
    expect(r.passed).toBe(false);
    expect(r.code).toBe('DAY_DATE_DUPLICATE');
  });

  it('fails when only some days have dates', async () => {
    const r = v.validate(
      {},
      ctx({
        tripState: {
          planDraft: {
            days: [{ date: '2026-01-01' }, { items: [] }],
          },
        },
      }),
    );
    expect(r.passed).toBe(false);
    expect(r.code).toBe('DAY_DATE_INCOMPLETE');
  });

  it('fails on out-of-order dates', async () => {
    const r = v.validate(
      {},
      ctx({
        tripState: {
          planDraft: {
            days: [{ date: '2026-01-02' }, { date: '2026-01-01' }],
          },
        },
      }),
    );
    expect(r.passed).toBe(false);
    expect(r.code).toBe('DAY_ORDER_NOT_CHRONOLOGICAL');
  });
});
