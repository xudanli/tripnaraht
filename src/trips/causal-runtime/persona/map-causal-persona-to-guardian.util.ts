/**
 * Map causal persona projection → Trip Planner guardian eval (no LLM).
 */

import type {
  GuardianEvaluation,
  PersonaInsight,
  GuardianPersona,
} from '../../../agent/assistants/trip-planner/interfaces/trip-planner.interface';
import { GUARDIAN_PERSONAS } from '../../../agent/assistants/trip-planner/interfaces/trip-planner.interface';
import type { CausalPersonaProjection, CausalPersonaSlice } from './causal-persona-projection.types';

const PERSONA_KEY: Record<CausalPersonaSlice['persona'], GuardianPersona> = {
  ABU: 'Abu',
  DR_DRE: 'DrDre',
  NEPTUNE: 'Neptune',
};

function severityFromVerdict(
  verdict: CausalPersonaSlice['verdict'],
): PersonaInsight['severity'] {
  if (verdict === 'REJECT') return 'error';
  if (verdict === 'NEED_CONFIRM' || verdict === 'ADJUST' || verdict === 'REPLACE') return 'warning';
  return 'success';
}

function sliceToInsight(slice: CausalPersonaSlice): PersonaInsight {
  const key = PERSONA_KEY[slice.persona];
  const persona = GUARDIAN_PERSONAS[key];
  return {
    persona: key,
    emoji: persona.emoji,
    name: persona.nameCN,
    role: persona.roleCN,
    severity: severityFromVerdict(slice.verdict),
    message: slice.explanation,
    suggestion: slice.recommendations?.[0]?.action,
    details: slice.causalChain,
  };
}

export function mapCausalProjectionToGuardianEvaluation(
  projection: CausalPersonaProjection,
): {
  insights: PersonaInsight[];
  evaluation: GuardianEvaluation;
  guardiansInvoked: GuardianPersona[];
} {
  const insights: PersonaInsight[] = [];
  const evaluation: GuardianEvaluation = {};
  const guardiansInvoked: GuardianPersona[] = [];

  if (projection.abu) {
    guardiansInvoked.push('Abu');
    insights.push(sliceToInsight(projection.abu));
    evaluation.abu = {
      passed: projection.abu.verdict === 'ALLOW',
      issues: projection.abu.verdict === 'ALLOW' ? [] : [projection.abu.explanation],
      risks: projection.abu.evidence.map((e) => ({
        type: e.relevance,
        severity:
          projection.abu!.verdict === 'REJECT'
            ? 'high'
            : projection.abu!.verdict === 'NEED_CONFIRM'
              ? 'medium'
              : 'low',
        description: e.excerpt,
      })),
    };
  }

  if (projection.drdre) {
    guardiansInvoked.push('DrDre');
    insights.push(sliceToInsight(projection.drdre));
    evaluation.drDre = {
      sustainable: projection.drdre.verdict === 'ALLOW',
      fatigueLevel: projection.drdre.verdict === 'ADJUST' ? 82 : 55,
      issues: projection.drdre.verdict === 'ALLOW' ? [] : [projection.drdre.explanation],
      paceRecommendation:
        projection.drdre.verdict === 'ADJUST' ? 'slow_down' : 'ok',
    };
  }

  if (projection.neptune) {
    guardiansInvoked.push('Neptune');
    insights.push(sliceToInsight(projection.neptune));
    evaluation.neptune = {
      hasAlternatives: true,
      alternatives: (projection.neptune.recommendations ?? []).map((r) => ({
        original: '当前计划',
        replacement: r.action,
        reason: r.reason,
        impact: r.impact,
      })),
    };
  }

  return { insights, evaluation, guardiansInvoked };
}
