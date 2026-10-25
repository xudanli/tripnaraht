/**
 * PD-9 — End-to-end pure pipeline runner for Proactive Decision V1 harness.
 * Does not require Nest; uses in-memory problem store port.
 */

import { buildProactiveImpactFromRoad } from '../adapters/build-proactive-impact.util';
import { buildProactiveImpactFromWeather } from '../adapters/build-proactive-impact.util';
import type { ProactiveImpactV1 } from '../contracts/proactive-impact.types';
import { planLensesForProactiveCase } from '../lenses/evaluate-lens-activation.util';
import { assertHardGateNotOverridden } from '../lenses/assert-hard-gate-invariant.util';
import { synthesizeProactiveRecommendation } from '../synthesis/synthesize-proactive-recommendation.util';
import { evaluateProactiveIntervention } from '../intervention/evaluate-proactive-intervention.util';
import { projectProactiveChangeDraft } from '../execution/project-proactive-change-draft.util';
import {
  applyProactiveChangeDraft,
  confirmProactiveChangeDraft,
  openProactiveDraftPreview,
} from '../execution/proactive-draft-lifecycle.util';
import {
  openProactiveDecisionProblem,
  type ProactiveProblemStorePort,
} from '../writers/open-proactive-decision-problem.util';
import { projectProactiveToErcItem } from '../erc/project-proactive-to-erc.util';
import {
  buildProactiveTelemetryEvent,
  type ProactiveTelemetryEventV1,
} from '../telemetry/proactive-telemetry.util';
import type { Rfc001DecisionProblem } from '../../guardian-decision-core/contracts/decision-problem.types';
import type { ProactiveWorldSignalKind } from '../contracts/proactive-impact.types';
import type { ProactiveDecisionCaseId } from '../contracts/proactive-decision-case.types';
import { buildProactiveDecisionTrace } from '../trace/build-proactive-decision-trace.util';
import type { ProactiveDecisionTraceV1 } from '../trace/proactive-decision-trace.types';
import type { ProactiveLensId } from '../lenses/lens-activation.types';
import type { ProactiveReminderCardV1 } from '../surface/proactive-reminder-card.types';
import type { ProactiveSynthesisV1 } from '../synthesis/proactive-synthesis.types';

export type ProactiveHarnessFixture = {
  id: string;
  labelZh: string;
  signalKind: ProactiveWorldSignalKind;
  expectedCaseId: ProactiveDecisionCaseId;
  tripId: string;
  signalEventId: string;
  affectedItemId: string;
  affectedLabel: string;
  activityWindowClosed?: boolean;
  hardBlocked?: boolean;
  needAlternative?: boolean;
  mustRepair?: boolean;
  roadId?: string;
  /** Phase 4 golden Case A — Reynisfjara wind ramp */
  windFromMps?: number;
  windToMps?: number;
  localTimeHint?: string;
};

export const PROACTIVE_V1_HARNESS_FIXTURES: ProactiveHarnessFixture[] = [
  {
    id: 'F_REYNISFJARA_WIND',
    labelZh: 'Reynisfjara 风力增强（14→25 m/s @16:00）',
    signalKind: 'WEATHER_WIND',
    expectedCaseId: 'CASE_CONTINUE_ACTIVITY',
    tripId: 'trip_harness_reynisfjara',
    signalEventId: 'evt_harness_wind',
    affectedItemId: 'item_reynisfjara',
    affectedLabel: 'Reynisfjara',
    needAlternative: true,
    windFromMps: 14,
    windToMps: 25,
    localTimeHint: '16:00',
  },
  {
    id: 'F_FROAD_DIFFICULT',
    labelZh: 'F-road 通行难度上升',
    signalKind: 'ROAD_DIFFICULTY_CHANGE',
    expectedCaseId: 'CASE_REROUTE',
    tripId: 'trip_harness_froad',
    signalEventId: 'evt_harness_f208',
    affectedItemId: 'item_froad_leg',
    affectedLabel: 'F208 高地段',
    roadId: 'F208',
    mustRepair: true,
    needAlternative: true,
    hardBlocked: true,
  },
  {
    id: 'F_GLACIER_WINDOW_CLOSED',
    labelZh: '冰川活动天气窗口关闭',
    signalKind: 'WEATHER_BLIZZARD',
    expectedCaseId: 'CASE_POSTPONE_ACTIVITY',
    tripId: 'trip_harness_glacier',
    signalEventId: 'evt_harness_window',
    affectedItemId: 'item_glacier_hike',
    affectedLabel: '冰川徒步',
    activityWindowClosed: true,
    needAlternative: true,
  },
];

function memoryStore(): ProactiveProblemStorePort & {
  items: Rfc001DecisionProblem[];
} {
  const items: Rfc001DecisionProblem[] = [];
  return {
    items,
    async findOpenByTriggerEvent(tripId, triggerEventId) {
      return items.find(
        (p) =>
          p.tripId === tripId &&
          p.triggerEventId === triggerEventId &&
          !['RESOLVED', 'FAILED'].includes(p.status),
      );
    },
    async upsert(_tripId, problem) {
      const idx = items.findIndex((p) => p.problemId === problem.problemId);
      if (idx >= 0) items[idx] = problem;
      else items.push(problem);
      return problem;
    },
  };
}

export type ProactiveHarnessRunResult = {
  fixtureId: string;
  impact: ProactiveImpactV1;
  problemId: string;
  lensOrder: string[];
  neptuneTriggered: boolean;
  recommendedOptionId: string;
  interventionGate: 'NOTIFY_CARD' | 'SILENT_LEARNING';
  changeDraftId: string | null;
  applied: boolean;
  ercDedupKey: string | null;
  telemetry: ProactiveTelemetryEventV1[];
  decisionTrace: ProactiveDecisionTraceV1;
  synthesis: ProactiveSynthesisV1;
  reminderCard: ProactiveReminderCardV1 | null;
  /** F1–F10 checklist */
  acceptance: Record<`F${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`, boolean>;
};

export async function runProactiveDecisionHarnessFixture(
  fixture: ProactiveHarnessFixture,
): Promise<ProactiveHarnessRunResult> {
  const telemetry: ProactiveTelemetryEventV1[] = [];
  const store = memoryStore();

  telemetry.push(
    buildProactiveTelemetryEvent({
      kind: 'OBSERVED',
      tripId: fixture.tripId,
      caseId: null,
      decisionProblemId: null,
      interventionCandidateId: null,
      surfaceLevel: null,
      lensActivated: [] as ProactiveLensId[],
      signalEventId: fixture.signalEventId,
    }),
  );

  const impact =
    fixture.signalKind.startsWith('WEATHER_')
      ? buildProactiveImpactFromWeather({
          tripId: fixture.tripId,
          signalEventId: fixture.signalEventId,
          signalKind: fixture.signalKind as
            | 'WEATHER_WIND'
            | 'WEATHER_BLIZZARD'
            | 'WEATHER_HEAVY_RAIN',
          weatherImpact: {
            affectedPlanItemIds: [fixture.affectedItemId],
            affectedEntityRefs: [
              {
                kind: 'PLAN_ITEM',
                id: fixture.affectedItemId,
                label: fixture.affectedLabel,
              },
            ],
          },
          affectedItemLabels: [fixture.affectedLabel],
          activityWindowClosed: fixture.activityWindowClosed,
          createdAt: '2026-08-11T16:00:00.000Z',
        })
      : buildProactiveImpactFromRoad({
          tripId: fixture.tripId,
          signalEventId: fixture.signalEventId,
          signalKind: fixture.signalKind as
            | 'ROAD_CLOSURE'
            | 'ROAD_DIFFICULTY_CHANGE'
            | 'ROUTE_AVAILABILITY_CHANGE',
          roadImpact: {
            roadId: fixture.roadId ?? 'F208',
            affectedPlanItemIds: [fixture.affectedItemId],
          },
          affectedItemLabels: [fixture.affectedLabel],
          createdAt: '2026-08-11T16:00:00.000Z',
        });

  telemetry.push(
    buildProactiveTelemetryEvent({
      kind: 'IMPACT_DETECTED',
      tripId: fixture.tripId,
      caseId: impact.caseId,
      decisionProblemId: null,
      interventionCandidateId: null,
      surfaceLevel: null,
      lensActivated: [] as ProactiveLensId[],
      signalEventId: fixture.signalEventId,
    }),
  );

  const opened = await openProactiveDecisionProblem(store, {
    impact,
    planVersionId: 'plan_harness_1',
    worldStateSnapshotId: 'snap_harness_1',
    idempotencyKey: `pd_v1:${fixture.tripId}:${fixture.signalEventId}:${impact.caseId}`,
  });
  if (!opened.opened) {
    throw new Error(`Harness ${fixture.id}: expected decision problem`);
  }

  telemetry.push(
    buildProactiveTelemetryEvent({
      kind: 'DECISION_OPENED',
      tripId: fixture.tripId,
      caseId: impact.caseId,
      decisionProblemId: opened.problem.problemId,
      interventionCandidateId: null,
      surfaceLevel: null,
      lensActivated: [] as ProactiveLensId[],
      signalEventId: fixture.signalEventId,
    }),
  );

  const lens = planLensesForProactiveCase({
    caseId: impact.caseId!,
    signalKind: impact.signalKind,
    needAlternative: fixture.needAlternative,
    mustRepair: fixture.mustRepair,
    hardBlocked: fixture.hardBlocked,
  });

  telemetry.push(
    buildProactiveTelemetryEvent({
      kind: lens.activateNeptune ? 'NEPTUNE_TRIGGERED' : 'NEPTUNE_SKIPPED',
      tripId: fixture.tripId,
      caseId: impact.caseId,
      decisionProblemId: opened.problem.problemId,
      interventionCandidateId: null,
      surfaceLevel: null,
      lensActivated: lens.lensOrder,
      neptuneTriggered: lens.activateNeptune,
    }),
  );

  const syn = synthesizeProactiveRecommendation({
    caseId: impact.caseId!,
    lens,
    hardBlocked: fixture.hardBlocked,
    impactZh: impact.rationaleZh,
  });
  if (syn.ok === false) {
    throw new Error(`Harness ${fixture.id}: synthesis failed ${syn.reason}`);
  }

  // F9 — hard gate cannot be overridden by KEEP
  if (fixture.hardBlocked) {
    assertHardGateNotOverridden({
      abuVerdict: 'HARD_BLOCK',
      recommendationOverridesHardBlock:
        syn.synthesis.recommended.optionId === 'OPT_KEEP_ORIGINAL',
    });
  }

  telemetry.push(
    buildProactiveTelemetryEvent({
      kind: 'SYNTHESIZED',
      tripId: fixture.tripId,
      caseId: impact.caseId,
      decisionProblemId: opened.problem.problemId,
      interventionCandidateId: null,
      surfaceLevel: null,
      lensActivated: lens.lensOrder,
    }),
  );

  const intervention = evaluateProactiveIntervention({
    impact,
    synthesis: syn.synthesis,
    decisionProblemId: opened.problem.problemId,
    attentionCost: 0.05,
    threshold: 0.05,
  });

  telemetry.push(
    buildProactiveTelemetryEvent({
      kind: 'INTERVENTION_GATED',
      tripId: fixture.tripId,
      caseId: impact.caseId,
      decisionProblemId: opened.problem.problemId,
      interventionCandidateId: intervention.candidate.candidateId,
      surfaceLevel: intervention.candidate.surfaceLevel,
      lensActivated: lens.lensOrder,
      interventionValue: intervention.value.interventionValue,
    }),
  );

  let changeDraftId: string | null = null;
  let applied = false;

  if (intervention.gate === 'NOTIFY_CARD' && intervention.card) {
    telemetry.push(
      buildProactiveTelemetryEvent({
        kind: 'CARD_SHOWN',
        tripId: fixture.tripId,
        caseId: impact.caseId,
        decisionProblemId: opened.problem.problemId,
        interventionCandidateId: intervention.candidate.candidateId,
        surfaceLevel: intervention.candidate.surfaceLevel,
        lensActivated: lens.lensOrder,
      }),
    );

    let draft = projectProactiveChangeDraft({
      impact,
      synthesis: syn.synthesis,
      card: intervention.card,
      intervention,
      decisionProblemId: opened.problem.problemId,
    });
    changeDraftId = draft.draftId;
    telemetry.push(
      buildProactiveTelemetryEvent({
        kind: 'DRAFT_OPENED',
        tripId: fixture.tripId,
        caseId: impact.caseId,
        decisionProblemId: opened.problem.problemId,
        interventionCandidateId: intervention.candidate.candidateId,
        surfaceLevel: intervention.candidate.surfaceLevel,
        lensActivated: lens.lensOrder,
      }),
    );

    draft = openProactiveDraftPreview(draft);
    draft = confirmProactiveChangeDraft(draft);
    telemetry.push(
      buildProactiveTelemetryEvent({
        kind: 'DRAFT_CONFIRMED',
        tripId: fixture.tripId,
        caseId: impact.caseId,
        decisionProblemId: opened.problem.problemId,
        interventionCandidateId: intervention.candidate.candidateId,
        surfaceLevel: intervention.candidate.surfaceLevel,
        lensActivated: lens.lensOrder,
      }),
    );

    draft = await applyProactiveChangeDraft(draft, async () => ({
      ok: true,
      actionId: `harness_finalize_${draft.draftId}`,
      planVersionId: 'plan_harness_applied',
    }));
    applied = draft.status === 'APPLIED';
    telemetry.push(
      buildProactiveTelemetryEvent({
        kind: 'DRAFT_APPLIED',
        tripId: fixture.tripId,
        caseId: impact.caseId,
        decisionProblemId: opened.problem.problemId,
        interventionCandidateId: intervention.candidate.candidateId,
        surfaceLevel: intervention.candidate.surfaceLevel,
        lensActivated: lens.lensOrder,
      }),
    );
  } else {
    telemetry.push(
      buildProactiveTelemetryEvent({
        kind: 'SILENT_SUPPRESSED',
        tripId: fixture.tripId,
        caseId: impact.caseId,
        decisionProblemId: opened.problem.problemId,
        interventionCandidateId: intervention.candidate.candidateId,
        surfaceLevel: intervention.candidate.surfaceLevel,
        lensActivated: lens.lensOrder,
        interventionValue: intervention.value.interventionValue,
      }),
    );
  }

  const erc = projectProactiveToErcItem({
    impact,
    synthesis: syn.synthesis,
    intervention,
    changeDraft: null,
    decisionProblemId: opened.problem.problemId,
  });

  const decisionTrace = buildProactiveDecisionTrace({
    impact,
    lens,
    synthesis: syn.synthesis,
    intervention,
    decisionProblemId: opened.problem.problemId,
    windFromMps: fixture.windFromMps,
    windToMps: fixture.windToMps,
    localTimeHint: fixture.localTimeHint,
    at: '2026-08-11T16:00:00.000Z',
  });

  const acceptance = {
    F1: true, // observed signal → impact path entered
    F2: impact.decisionRequired && impact.affectedItems.length > 0,
    F3: impact.caseId === fixture.expectedCaseId && opened.opened,
    F4: lens.activateAbu && lens.activateDrDre,
    F5:
      fixture.needAlternative === false
        ? lens.activateNeptune === false
        : lens.activateNeptune === true || fixture.mustRepair === true,
    F6: syn.ok && !!syn.synthesis.recommended.optionId,
    F7: intervention.gate === 'NOTIFY_CARD' ? changeDraftId != null : true,
    F8: intervention.gate === 'NOTIFY_CARD' ? applied : true,
    F9:
      !fixture.hardBlocked ||
      syn.synthesis.recommended.optionId !== 'OPT_KEEP_ORIGINAL',
    F10:
      intervention.gate === 'SILENT_LEARNING'
        ? intervention.silentLearning != null
        : intervention.notifyUser === false,
  } as const;

  // Fix F5 for fixtures that always need alternative
  const f5 =
    fixture.id === 'F_REYNISFJARA_WIND' ||
    fixture.id === 'F_FROAD_DIFFICULT' ||
    fixture.id === 'F_GLACIER_WINDOW_CLOSED'
      ? lens.activateNeptune
      : acceptance.F5;

  return {
    fixtureId: fixture.id,
    impact,
    problemId: opened.problem.problemId,
    lensOrder: lens.lensOrder,
    neptuneTriggered: lens.activateNeptune,
    recommendedOptionId: syn.synthesis.recommended.optionId,
    interventionGate: intervention.gate,
    changeDraftId,
    applied,
    ercDedupKey: erc?.dedupKey ?? null,
    telemetry,
    decisionTrace,
    synthesis: syn.synthesis,
    reminderCard: intervention.card,
    acceptance: { ...acceptance, F5: f5 },
  };
}
