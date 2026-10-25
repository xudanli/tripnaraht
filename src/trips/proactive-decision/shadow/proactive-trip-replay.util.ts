/**
 * Run real-trip-shaped replay → PD chain → Shadow observation.
 */

import { buildProactiveImpactFromRoad } from '../adapters/build-proactive-impact.util';
import { buildProactiveImpactFromWeather } from '../adapters/build-proactive-impact.util';
import { planLensesForProactiveCase } from '../lenses/evaluate-lens-activation.util';
import { assertHardGateNotOverridden } from '../lenses/assert-hard-gate-invariant.util';
import { synthesizeProactiveRecommendation } from '../synthesis/synthesize-proactive-recommendation.util';
import { evaluateProactiveIntervention } from '../intervention/evaluate-proactive-intervention.util';
import {
  openProactiveDecisionProblem,
  type ProactiveProblemStorePort,
} from '../writers/open-proactive-decision-problem.util';
import { buildProactiveDecisionTrace } from '../trace/build-proactive-decision-trace.util';
import { buildProactiveShadowObservation } from './build-proactive-shadow-observation.util';
import type { ProactiveShadowObservationV1 } from './proactive-shadow-observation.types';
import type { ProactiveTripReplayScenario } from './proactive-trip-replay.scenarios';
import type { Rfc001DecisionProblem } from '../../guardian-decision-core/contracts/decision-problem.types';
import type { ProactiveImpactV1 } from '../contracts/proactive-impact.types';
import type { ProactiveSynthesisV1 } from '../synthesis/proactive-synthesis.types';
import type { ProactiveDecisionTraceV1 } from '../trace/proactive-decision-trace.types';

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

export type ProactiveTripReplayResult = {
  scenarioId: string;
  tripId: string;
  countryCode: 'IS';
  tripMode: 'SELF_DRIVE';
  impact: ProactiveImpactV1;
  problemId: string;
  synthesis: ProactiveSynthesisV1;
  decisionTrace: ProactiveDecisionTraceV1;
  shadow: ProactiveShadowObservationV1;
  userVisible: false;
  expectationsMet: boolean;
  expectationFailures: string[];
};

export async function runProactiveTripReplay(
  scenario: ProactiveTripReplayScenario,
): Promise<ProactiveTripReplayResult> {
  const affected = scenario.planItems.find(
    (p) => p.id === scenario.affectedItemId,
  );
  const label = affected?.label ?? scenario.affectedItemId;

  const impact = scenario.signalKind.startsWith('WEATHER_')
    ? buildProactiveImpactFromWeather({
        tripId: scenario.tripId,
        signalEventId: scenario.signalEventId,
        signalKind: scenario.signalKind as
          | 'WEATHER_WIND'
          | 'WEATHER_BLIZZARD'
          | 'WEATHER_HEAVY_RAIN',
        weatherImpact: {
          affectedPlanItemIds: [scenario.affectedItemId],
          affectedEntityRefs: [
            { kind: 'PLAN_ITEM', id: scenario.affectedItemId, label },
          ],
        },
        affectedItemLabels: [label],
        activityWindowClosed: scenario.activityWindowClosed,
        createdAt: '2026-08-11T16:00:00.000Z',
      })
    : buildProactiveImpactFromRoad({
        tripId: scenario.tripId,
        signalEventId: scenario.signalEventId,
        signalKind: scenario.signalKind as
          | 'ROAD_CLOSURE'
          | 'ROAD_DIFFICULTY_CHANGE'
          | 'ROUTE_AVAILABILITY_CHANGE',
        roadImpact: {
          roadId: scenario.roadId ?? 'F208',
          affectedPlanItemIds: [scenario.affectedItemId],
        },
        affectedItemLabels: [label],
        createdAt: '2026-08-11T09:30:00.000Z',
      });

  const store = memoryStore();
  const opened = await openProactiveDecisionProblem(store, {
    impact,
    planVersionId: scenario.planVersionId,
    worldStateSnapshotId: scenario.worldStateSnapshotId,
    idempotencyKey: `pd_replay:${scenario.tripId}:${scenario.signalEventId}:${impact.caseId}`,
  });
  if (!opened.opened) {
    throw new Error(`Replay ${scenario.id}: expected decision problem`);
  }

  const lens = planLensesForProactiveCase({
    caseId: impact.caseId!,
    signalKind: impact.signalKind,
    needAlternative: scenario.needAlternative,
    mustRepair: scenario.mustRepair,
    hardBlocked: scenario.hardBlocked,
  });

  const syn = synthesizeProactiveRecommendation({
    caseId: impact.caseId!,
    lens,
    hardBlocked: scenario.hardBlocked,
    impactZh: impact.rationaleZh,
  });
  if (syn.ok === false) {
    throw new Error(`Replay ${scenario.id}: synthesis failed ${syn.reason}`);
  }

  if (scenario.hardBlocked) {
    assertHardGateNotOverridden({
      abuVerdict: 'HARD_BLOCK',
      recommendationOverridesHardBlock:
        syn.synthesis.recommended.optionId === 'OPT_KEEP_ORIGINAL',
    });
  }

  const intervention = evaluateProactiveIntervention({
    impact,
    synthesis: syn.synthesis,
    decisionProblemId: opened.problem.problemId,
    attentionCost: 0.05,
    threshold: 0.05,
  });

  const decisionTrace = buildProactiveDecisionTrace({
    impact,
    lens,
    synthesis: syn.synthesis,
    intervention,
    decisionProblemId: opened.problem.problemId,
    windFromMps: scenario.windFromMps,
    windToMps: scenario.windToMps,
    localTimeHint: scenario.localTimeHint,
  });

  const shadow = buildProactiveShadowObservation({
    tripId: scenario.tripId,
    impact,
    synthesis: syn.synthesis,
    intervention,
    decisionTrace,
    decisionProblemId: opened.problem.problemId,
  });

  const expectationFailures: string[] = [];
  const exp = scenario.expected;
  if (impact.caseId !== exp.caseId) {
    expectationFailures.push(
      `caseId ${impact.caseId} !== ${exp.caseId}`,
    );
  }
  if (decisionTrace.lenses.activateAbu !== exp.abuRequired) {
    expectationFailures.push('abu required mismatch');
  }
  if (decisionTrace.lenses.activateDrDre !== exp.dreRequired) {
    expectationFailures.push('dre required mismatch');
  }
  if (decisionTrace.lenses.activateNeptune !== exp.neptuneActivated) {
    expectationFailures.push('neptune activated mismatch');
  }
  if (
    exp.forbidKeepOriginal &&
    syn.synthesis.recommended.optionId === 'OPT_KEEP_ORIGINAL'
  ) {
    expectationFailures.push('KEEP_ORIGINAL forbidden by Hard Gate');
  }
  if (
    exp.optionFamily &&
    !exp.optionFamily.includes(syn.synthesis.recommended.optionId)
  ) {
    expectationFailures.push(
      `option ${syn.synthesis.recommended.optionId} not in family`,
    );
  }
  if (shadow.userVisible !== false) {
    expectationFailures.push('shadow must be userInvisible');
  }
  if (scenario.countryCode !== 'IS' || scenario.tripMode !== 'SELF_DRIVE') {
    expectationFailures.push('V1 audience must be IS SELF_DRIVE');
  }

  return {
    scenarioId: scenario.id,
    tripId: scenario.tripId,
    countryCode: scenario.countryCode,
    tripMode: scenario.tripMode,
    impact,
    problemId: opened.problem.problemId,
    synthesis: syn.synthesis,
    decisionTrace,
    shadow,
    userVisible: false,
    expectationsMet: expectationFailures.length === 0,
    expectationFailures,
  };
}
