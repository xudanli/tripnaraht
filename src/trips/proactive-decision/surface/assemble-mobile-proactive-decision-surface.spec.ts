import {
  assembleMobileProactiveDecisionSurface,
} from './assemble-mobile-proactive-decision-surface.util';
import {
  buildProactiveDecisionSurfaceSnapshot,
  mergeProactiveDecisionSurfaceIntoMetadata,
  readProactiveDecisionSurfaceSnapshot,
} from './proactive-decision-surface-snapshot.util';
import { buildProactiveImpactFromWeather } from '../adapters/build-proactive-impact.util';
import { planLensesForProactiveCase } from '../lenses/evaluate-lens-activation.util';
import { synthesizeProactiveRecommendation } from '../synthesis/synthesize-proactive-recommendation.util';
import { evaluateProactiveIntervention } from '../intervention/evaluate-proactive-intervention.util';
import { projectProactiveChangeDraft } from '../execution/project-proactive-change-draft.util';
import { projectProactiveToErcItem } from '../erc/project-proactive-to-erc.util';
import { buildProactiveDecisionTrace } from '../trace/build-proactive-decision-trace.util';

describe('Mobile Proactive Decision surface assemble', () => {
  function snapshotMeta(tripId: string) {
    const impact = buildProactiveImpactFromWeather({
      tripId,
      signalEventId: 'evt_mobile',
      signalKind: 'WEATHER_WIND',
      weatherImpact: {
        affectedPlanItemIds: ['item_a'],
        affectedEntityRefs: [{ kind: 'PLAN_ITEM', id: 'item_a', label: '黑沙滩' }],
      },
      affectedItemLabels: ['黑沙滩'],
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
    if (!syn.ok) throw new Error('syn');
    const intervention = evaluateProactiveIntervention({
      impact,
      synthesis: syn.synthesis,
      decisionProblemId: 'problem_m',
      attentionCost: 0.05,
      threshold: 0.05,
    });
    const changeDraft =
      intervention.card != null
        ? projectProactiveChangeDraft({
            impact,
            synthesis: syn.synthesis,
            card: intervention.card,
            intervention,
            decisionProblemId: 'problem_m',
          })
        : null;
    const erc = projectProactiveToErcItem({
      impact,
      synthesis: syn.synthesis,
      intervention,
      changeDraft,
      decisionProblemId: 'problem_m',
    });
    const decisionTrace = buildProactiveDecisionTrace({
      impact,
      lens,
      synthesis: syn.synthesis,
      intervention,
      decisionProblemId: 'problem_m',
    });
    const snap = buildProactiveDecisionSurfaceSnapshot({
      tripId,
      impact,
      synthesis: syn.synthesis,
      intervention,
      changeDraft,
      ercProjection: erc,
      decisionProblemId: 'problem_m',
      decisionTrace,
      lensActivation: lens,
    });
    return mergeProactiveDecisionSurfaceIntoMetadata({}, snap);
  }

  it('hides card in SHADOW even when NOTIFY_CARD', () => {
    const meta = snapshotMeta('trip_shadow');
    const surface = assembleMobileProactiveDecisionSurface({
      tripId: 'trip_shadow',
      metadata: meta,
      env: {
        PROACTIVE_DECISION_V1_ENABLED: '1',
        PROACTIVE_CANARY_STAGE: 'SHADOW',
        PROACTIVE_CANARY_TRAFFIC_PERCENT: '100',
      },
    });
    expect(surface.shouldRenderCard).toBe(false);
    expect(surface.shouldRenderL1Passive).toBe(false);
    expect(surface.l1PassiveBanner).toBeNull();
    expect(surface.reminderCard).toBeNull();
    expect(surface.canaryStage).toBe('SHADOW');
    expect(surface.flags.pushEnabled).toBe(false);
    // Trace still available for observability / WHY explain
    expect(surface.decisionTrace?.signal.label).toBe('WIND_CHANGE');
    expect(surface.decisionTrace?.whyExplainZh.length).toBeGreaterThan(0);
  });

  it('L1 Passive shows banner only (no interrupt card)', () => {
    const meta = snapshotMeta('trip_l1');
    const surface = assembleMobileProactiveDecisionSurface({
      tripId: 'trip_l1',
      metadata: meta,
      env: {
        PROACTIVE_DECISION_V1_ENABLED: '1',
        PROACTIVE_CANARY_STAGE: 'L1_PASSIVE',
        PROACTIVE_CANARY_TRAFFIC_PERCENT: '100',
      },
    });
    expect(surface.shouldRenderL1Passive).toBe(true);
    expect(surface.shouldRenderCard).toBe(false);
    expect(surface.reminderCard).toBeNull();
    expect(surface.l1PassiveBanner?.titleZh).toContain('Nara 发现');
    expect(surface.l1PassiveBanner?.cta.id).toBe('VIEW_OPTIONS');
    expect(surface.l1PassiveBanner?.cta.labelZh).toBe('查看方案');
    expect(surface.changeDraft?.changeDraftCard.kind).toBe('change_draft');
    const blob = [
      surface.l1PassiveBanner?.titleZh,
      surface.l1PassiveBanner?.summaryZh,
      surface.l1PassiveBanner?.impactHintZh,
    ].join(' ');
    expect(blob).not.toMatch(/Abu|Neptune/i);
  });

  it('L2 without High-Value degrades to L1 banner (no interrupt)', () => {
    const meta = snapshotMeta('trip_dogfood');
    const surface = assembleMobileProactiveDecisionSurface({
      tripId: 'trip_dogfood',
      metadata: meta,
      env: {
        PROACTIVE_DECISION_V1_ENABLED: '1',
        PROACTIVE_CANARY_STAGE: 'L2_IN_APP_INTERRUPT',
        PROACTIVE_CANARY_TRIP_ALLOWLIST: 'trip_dogfood',
      },
    });
    // Default deterministic synthesis rarely clears IV>0.2 ∧ conf>0.9
    expect(surface.l2HighValue?.ok).toBe(false);
    expect(surface.shouldRenderCard).toBe(false);
    expect(surface.shouldRenderL1Passive).toBe(true);
    expect(surface.l1PassiveBanner?.titleZh).toContain('Nara 发现');
    expect(surface.reminderCard).toBeNull();
  });

  it('L2 High-Value renders interrupt card', () => {
    const meta = snapshotMeta('trip_hv');
    const snap = readProactiveDecisionSurfaceSnapshot(meta)!;
    // Force High-Value scores into persisted snapshot shape
    const boosted = {
      ...meta,
      proactiveDecisionV1Surface: {
        ...snap,
        synthesis: {
          ...snap.synthesis!,
          confidence: 0.95,
          actionability: 0.9,
          improvement: 0.9,
        },
        intervention: {
          ...snap.intervention!,
          value: {
            ...snap.intervention!.value,
            confidence: 0.95,
            actionability: 0.9,
            improvement: 0.9,
            attentionCost: 0.05,
            interventionValue: 0.95 * 0.9 * 0.9 - 0.05,
            passesThreshold: true,
          },
        },
      },
    };

    const surface = assembleMobileProactiveDecisionSurface({
      tripId: 'trip_hv',
      metadata: boosted,
      env: {
        PROACTIVE_DECISION_V1_ENABLED: '1',
        PROACTIVE_CANARY_STAGE: 'L2_IN_APP_INTERRUPT',
        PROACTIVE_CANARY_TRIP_ALLOWLIST: 'trip_hv',
      },
    });
    expect(surface.l2HighValue?.ok).toBe(true);
    expect(surface.shouldRenderCard).toBe(true);
    expect(surface.shouldRenderL1Passive).toBe(false);
    expect(surface.reminderCard?.layer1WhatHappenedZh).toBeTruthy();
    expect(surface.changeDraft?.changeDraftCard.kind).toBe('change_draft');
  });
});
