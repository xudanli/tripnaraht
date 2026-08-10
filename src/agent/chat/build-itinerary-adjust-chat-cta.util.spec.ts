import {
  APPLY_ITINERARY_ADJUST_ACTION,
  buildItineraryAdjustDraftId,
  enrichItineraryAdjustResultForChat,
} from './build-itinerary-adjust-chat-cta.util';
import { isItineraryAdjustApplyAllowed } from './agent-chat-authz.util';

describe('enrichItineraryAdjustResultForChat', () => {
  const baseAdjust = {
    target_date_iso: '2026-08-20',
    target_day_number: 6,
    execution_mode: 'ADVICE_ONLY',
    applied: false,
    draft_schedule_zh: ['09:00 冰川健行'],
    status_label_zh: '草案待确认',
  };

  it('attaches CTA when draft is eligible on TRIP_SHARED', () => {
    const enriched = enrichItineraryAdjustResultForChat({
      adjust: { ...baseAdjust },
      payload: {
        timeline: [
          {
            date: '2026-08-20',
            items: [{ name: '冰川健行', start_window: '09:00' }],
          },
        ],
      },
      response: {
        request_id: 'req-1',
        observability: { durable_trip_run_id: 'run-abc' },
      },
      conversationId: 'conv-1',
      deliveryVerdict: 'VERIFIED',
      chatScope: 'TRIP_SHARED',
    });

    expect(enriched.apply_gate).toMatchObject({ can_apply: true });
    expect(enriched.cta_zh).toBe('确认写入');
    expect(enriched.primary_action).toMatchObject({
      action: APPLY_ITINERARY_ADJUST_ACTION,
      labelCN: '确认写入',
    });
    expect(enriched.draft_id).toBe(
      buildItineraryAdjustDraftId({
        requestId: 'req-1',
        targetDateIso: '2026-08-20',
        durableTripRunId: 'run-abc',
      }),
    );
    expect(enriched.apply_snapshot).toMatchObject({
      target_date_iso: '2026-08-20',
      apply_mode: 'replace_day',
    });
    expect((enriched.apply_snapshot as { items: unknown[] }).items).toHaveLength(1);
  });

  it('hides CTA for PERSONAL / FLAWED / already applied', () => {
    const personal = enrichItineraryAdjustResultForChat({
      adjust: { ...baseAdjust },
      payload: { timeline: [{ date: '2026-08-20', items: [{ name: 'A' }] }] },
      response: { request_id: 'r' },
      conversationId: 'c',
      chatScope: 'PERSONAL',
    });
    expect(personal.apply_gate).toMatchObject({
      can_apply: false,
      deny_reason: 'personal_scope_forbidden',
    });
    expect(personal.primary_action).toBeUndefined();

    const flawed = enrichItineraryAdjustResultForChat({
      adjust: { ...baseAdjust },
      payload: { timeline: [{ date: '2026-08-20', items: [{ name: 'A' }] }] },
      response: { request_id: 'r' },
      conversationId: 'c',
      deliveryVerdict: 'FLAWED_DRAFT',
      chatScope: 'TRIP_SHARED',
    });
    expect(flawed.apply_gate).toMatchObject({
      can_apply: false,
      deny_reason: 'flawed_draft',
    });

    const applied = enrichItineraryAdjustResultForChat({
      adjust: { ...baseAdjust, applied: true },
      payload: { timeline: [{ date: '2026-08-20', items: [{ name: 'A' }] }] },
      response: { request_id: 'r' },
      conversationId: 'c',
      chatScope: 'TRIP_SHARED',
    });
    expect(applied.apply_gate).toMatchObject({
      can_apply: false,
      deny_reason: 'already_applied',
    });
  });

  it('denies when no draft items and empty schedule lines', () => {
    const enriched = enrichItineraryAdjustResultForChat({
      adjust: { ...baseAdjust, draft_schedule_zh: [] },
      payload: { timeline: [] },
      response: { request_id: 'r' },
      conversationId: 'c',
      chatScope: 'TRIP_SHARED',
    });
    expect(enriched.apply_gate).toMatchObject({
      can_apply: false,
      deny_reason: 'no_draft_items',
    });
  });
});

describe('isItineraryAdjustApplyAllowed', () => {
  it('allows OWNER on TRIP_SHARED', () => {
    expect(
      isItineraryAdjustApplyAllowed({
        scope: 'TRIP_SHARED',
        role: 'OWNER',
      }),
    ).toEqual({ ok: true });
  });

  it('blocks PERSONAL / MEMBER / FLAWED', () => {
    expect(
      isItineraryAdjustApplyAllowed({
        scope: 'PERSONAL',
        role: 'OWNER',
      }).ok,
    ).toBe(false);
    expect(
      isItineraryAdjustApplyAllowed({
        scope: 'TRIP_SHARED',
        role: 'MEMBER',
      }).ok,
    ).toBe(false);
    expect(
      isItineraryAdjustApplyAllowed({
        scope: 'TRIP_SHARED',
        role: 'OWNER',
        deliveryVerdict: 'FLAWED_DRAFT',
      }).ok,
    ).toBe(false);
  });
});
