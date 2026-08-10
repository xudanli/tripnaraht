import {
  applyConfirmedAdjustmentViaBoundTrip,
  createBoundTripAdjustmentApplyFn,
} from './adapt-adjustment-bound-trip-apply.util';
import {
  confirmAdjustmentDraft,
  runAdjustmentDraftPipeline,
} from './adjustment-runtime.util';
import { compileAgentTaskContract } from './compile-agent-task-contract.util';

describe('adapt-adjustment-bound-trip-apply', () => {
  it('delegates Confirm→Apply to tryApplyBoundTripItineraryAdjustDraft and stamps receipt', async () => {
    const contract = compileAgentTaskContract({
      message: '把第3天行程轻松一点',
      turnId: 'apply-bridge',
      tripId: 'trip_adj',
    });
    const pipe = runAdjustmentDraftPipeline({
      contract,
      message: '把第3天行程轻松一点',
      beforeSummaryZh: '满',
      afterSummaryZh: '轻松',
      pendingRef: 'run_abc',
    });
    const confirmed = confirmAdjustmentDraft(pipe.draft);

    const host = {
      tryApplyBoundTripItineraryAdjustDraft: jest.fn().mockResolvedValue({
        applied: true,
        deletedCount: 1,
        addedCount: 2,
        targetDateIso: '2026-06-12',
        answerText: '已更新',
        skillsHit: ['trip.applyEdit'],
        reason: 'user_confirmed_draft_apply',
      }),
    };

    const { draft, boundTripResult } = await applyConfirmedAdjustmentViaBoundTrip({
      draft: confirmed,
      host,
      tripId: 'trip_adj',
      userId: 'u1',
      request: {
        trip_id: 'trip_adj',
        message: '应用到行程',
        options: { apply_itinerary_adjust_draft: true },
      },
    });

    expect(host.tryApplyBoundTripItineraryAdjustDraft).toHaveBeenCalledTimes(1);
    expect(boundTripResult.applied).toBe(true);
    expect(draft.status).toBe('APPLIED');
    expect(draft.receipt?.appliedToItinerary).toBe(true);
    expect(draft.receipt?.actionId).toContain('ITINERARY_ADJUST_DRAFT_APPLIED');
    expect(draft.receipt?.previousVersion).toBe('run_abc');
  });

  it('applyFn reports failure without marking APPLIED', async () => {
    const contract = compileAgentTaskContract({
      message: '把第2天行程轻松一点',
      turnId: 'fail',
      tripId: 'trip_adj',
    });
    const confirmed = confirmAdjustmentDraft(
      runAdjustmentDraftPipeline({
        contract,
        message: '把第2天行程轻松一点',
        beforeSummaryZh: 'a',
        afterSummaryZh: 'b',
      }).draft,
    );
    const applyFn = createBoundTripAdjustmentApplyFn({
      host: {
        tryApplyBoundTripItineraryAdjustDraft: async () => ({
          applied: false,
          reason: 'no_pending_draft',
          answerText: '未找到草案',
        }),
      },
      tripId: 'trip_adj',
      request: { trip_id: 'trip_adj', message: '应用到行程', options: {} },
    });
    await expect(applyFn(confirmed)).resolves.toMatchObject({ ok: false });
  });
});
