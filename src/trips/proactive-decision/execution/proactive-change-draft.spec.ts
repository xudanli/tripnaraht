import { planLensesForProactiveCase } from '../lenses/evaluate-lens-activation.util';
import { synthesizeProactiveRecommendation } from '../synthesis/synthesize-proactive-recommendation.util';
import { buildProactiveImpactFromWeather } from '../adapters/build-proactive-impact.util';
import { evaluateProactiveIntervention } from '../intervention/evaluate-proactive-intervention.util';
import { projectProactiveChangeDraft } from './project-proactive-change-draft.util';
import {
  applyProactiveChangeDraft,
  assertProactiveDraftConfirmApplyInvariants,
  confirmProactiveChangeDraft,
  handleProactiveReminderCta,
  openProactiveDraftPreview,
  ProactiveDraftLifecycleError,
} from './proactive-draft-lifecycle.util';

describe('PD-7 Change Draft → Confirm → Apply', () => {
  function buildDraft() {
    const impact = buildProactiveImpactFromWeather({
      tripId: 'trip_pd7',
      signalEventId: 'evt_pd7',
      signalKind: 'WEATHER_WIND',
      weatherImpact: {
        affectedPlanItemIds: ['item_beach'],
        affectedEntityRefs: [
          { kind: 'PLAN_ITEM', id: 'item_beach', label: '黑沙滩' },
        ],
      },
      affectedItemLabels: ['黑沙滩'],
      createdAt: '2026-08-11T14:00:00.000Z',
    });
    const lens = planLensesForProactiveCase({
      caseId: 'CASE_CONTINUE_ACTIVITY',
      signalKind: 'WEATHER_WIND',
      needAlternative: true,
    });
    const syn = synthesizeProactiveRecommendation({
      caseId: 'CASE_CONTINUE_ACTIVITY',
      lens,
    });
    expect(syn.ok).toBe(true);
    if (!syn.ok) throw new Error('syn');
    const intervention = evaluateProactiveIntervention({
      impact,
      synthesis: syn.synthesis,
      decisionProblemId: 'problem_pd7',
      attentionCost: 0.05,
      threshold: 0.05,
    });
    expect(intervention.gate).toBe('NOTIFY_CARD');
    expect(intervention.card).not.toBeNull();
    const draft = projectProactiveChangeDraft({
      impact,
      synthesis: syn.synthesis,
      card: intervention.card!,
      intervention,
      decisionProblemId: 'problem_pd7',
    });
    return draft;
  }

  it('projects change_draft card with apply_gate locked until confirm', () => {
    const draft = buildDraft();
    expect(draft.schemaId).toBe('nara.proactive_change_draft@v1');
    expect(draft.status).toBe('OPEN');
    expect(draft.previewOnly).toBe(true);
    expect(draft.applyAllowed).toBe(false);
    expect(draft.applyAuthority).toBe('RFC001_FINALIZE');
    expect(draft.changeDraftCard.kind).toBe('change_draft');
    expect(draft.changeDraftCard.apply_gate?.can_apply).toBe(false);
    expect(draft.changeDraftCard.before_summary_zh?.[0]).toContain('黑沙滩');
    assertProactiveDraftConfirmApplyInvariants(draft);
  });

  it('VIEW_OPTIONS → preview; WHY explains; DEFER cools down', () => {
    const draft = buildDraft();
    const viewed = handleProactiveReminderCta({
      cta: 'VIEW_OPTIONS',
      draft,
    });
    expect(viewed.action).toBe('VIEW_OPTIONS');
    if (viewed.action !== 'VIEW_OPTIONS') return;
    expect(viewed.draft.status).toBe('WAIT_CONFIRM');
    expect(viewed.preview.apply_gate?.can_apply).toBe(false);

    const why = handleProactiveReminderCta({
      cta: 'WHY',
      draft: viewed.draft,
    });
    expect(why.action).toBe('WHY');
    if (why.action !== 'WHY') return;
    expect(why.whyZh.length).toBeGreaterThan(0);

    const deferred = handleProactiveReminderCta({
      cta: 'DEFER',
      draft: viewed.draft,
    });
    expect(deferred.action).toBe('DEFER');
    if (deferred.action !== 'DEFER') return;
    expect(deferred.draft.status).toBe('DEFERRED');
    expect(deferred.cooldownHours).toBe(6);
  });

  it('forbids Apply before Confirm (F8)', async () => {
    const draft = buildDraft();
    const previewed = openProactiveDraftPreview(draft);
    await expect(
      applyProactiveChangeDraft(previewed, async () => ({ ok: true })),
    ).rejects.toBeInstanceOf(ProactiveDraftLifecycleError);

    const confirmed = confirmProactiveChangeDraft(previewed);
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.applyAllowed).toBe(true);
    assertProactiveDraftConfirmApplyInvariants(confirmed);

    const applied = await applyProactiveChangeDraft(confirmed, async (d) => ({
      ok: true,
      actionId: `finalize_${d.draftId}`,
      planVersionId: 'plan_v2',
    }));
    expect(applied.status).toBe('APPLIED');
    expect(applied.receipt?.authority).toBe('RFC001_FINALIZE');
    expect(applied.receipt?.appliedToItinerary).toBe(true);
    expect(applied.changeDraftCard.applied).toBe(true);

    const replay = await applyProactiveChangeDraft(applied, async () => ({
      ok: false,
      errorZh: 'should not call port',
    }));
    expect(replay.status).toBe('APPLIED');
    expect(replay.receipt?.actionId).toBe(applied.receipt?.actionId);
  });

  it('shadow Apply marks receipt without itinerary write', async () => {
    const draft = buildDraft();
    const confirmed = confirmProactiveChangeDraft(openProactiveDraftPreview(draft));
    const applied = await applyProactiveChangeDraft(confirmed, async () => ({
      ok: true,
      actionId: 'dec_shadow',
      appliedToItinerary: false,
      shadowMode: true,
    }));
    expect(applied.receipt?.appliedToItinerary).toBe(false);
  });

  it('forbids Confirm before preview', () => {
    const draft = buildDraft();
    expect(() => confirmProactiveChangeDraft(draft)).toThrow(
      ProactiveDraftLifecycleError,
    );
  });
});
