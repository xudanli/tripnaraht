import type { NegotiationResult } from '../learning/guardian-persona.interface';
import {
  buildHardConstraintVetoSummary,
  countHardViolations,
} from '../learning/guardian-decision-policy.util';
import type { ObjectiveEvaluationResult } from '../objective-function.interface';
import type { TeamNegotiationResult } from '../collaboration/multi-user-collaboration.interface';
import { buildPersonaPresentation } from '../../../../agent/services/persona-lead-speaker.util';
import type { GuardianPersonaPresentation } from '../../shared/guardian-presentation.types';
import type { StrategyOrchestrationResultV2 } from '../strategy-orchestrator-v2.service';

export interface NegotiationApiSummary {
  decision: string;
  consensusLevel: number;
  keyTradeoffs: string[];
  conditions?: string[];
  humanDecisionPoints?: string[];
  hardConstraintBlocked?: boolean;
  evaluationSummary: {
    abuUtility: number;
    dreUtility: number;
    neptuneUtility: number;
    criticalConcerns: string[];
    suggestionsWithDimension?: Array<{ text: string; dimension: string; dimensionLabel: string }>;
  };
  votingResult: { approve: number; reject: number; abstain: number };
  fatiguePrediction?: NegotiationResult['fatiguePrediction'];
}

const PERSONA_DIMENSION: Record<string, { dimension: string; dimensionLabel: string }> = {
  ABU: { dimension: 'safety', dimensionLabel: '安全' },
  DRE: { dimension: 'rhythm', dimensionLabel: '节奏' },
  NEPTUNE: { dimension: 'philosophy', dimensionLabel: '修复' },
};

export function isNegotiationHardBlocked(
  result: NegotiationResult,
  baseEvaluation?: ObjectiveEvaluationResult,
): boolean {
  if (result.decision === 'REJECT') {
    if (baseEvaluation && countHardViolations(baseEvaluation) > 0) return true;
    const abu = result.evaluations.find((e) => e.persona === 'ABU');
    if (abu?.stance === 'STRONG_OPPOSE') return true;
    if ((result.summary ?? '').includes('硬约束')) return true;
  }
  return false;
}

export function buildCriticalConcernsFromEvaluations(
  evaluations: NegotiationResult['evaluations'],
): { criticalConcerns: string[]; suggestionsWithDimension: NegotiationApiSummary['evaluationSummary']['suggestionsWithDimension'] } {
  const seen = new Set<string>();
  const criticalConcerns: string[] = [];
  const suggestionsWithDimension: NonNullable<
    NegotiationApiSummary['evaluationSummary']['suggestionsWithDimension']
  > = [];

  for (const evaluation of evaluations) {
    const dim = PERSONA_DIMENSION[evaluation.persona] ?? { dimension: 'general', dimensionLabel: '综合' };
    const items = [
      ...(evaluation.primaryConcerns ?? []),
      ...(evaluation.suggestedAdjustments ?? []),
    ];
    for (const text of items) {
      const t = String(text).trim();
      if (t && !seen.has(t)) {
        seen.add(t);
        criticalConcerns.push(t);
        suggestionsWithDimension.push({ text: t, dimension: dim.dimension, dimensionLabel: dim.dimensionLabel });
      }
    }
  }

  return { criticalConcerns, suggestionsWithDimension };
}

export function buildHumanDecisionPointStrings(result: NegotiationResult): string[] {
  if (result.decision !== 'REQUIRES_HUMAN') return [];

  const fromResult = (result.humanDecisionPoints ?? [])
    .map((p) => String(p).trim())
    .filter(Boolean);
  if (fromResult.length > 0) return fromResult;

  const options: string[] = [];
  for (const evaluation of result.evaluations) {
    for (const adj of evaluation.suggestedAdjustments ?? []) {
      const t = String(adj).trim();
      if (t) options.push(t);
    }
  }
  for (const tradeoff of result.keyTradeoffs ?? []) {
    const t = String(tradeoff).trim();
    if (t) options.push(t);
  }
  return [...new Set(options)].slice(0, 8);
}

export function mapNegotiationResultToApiSummary(
  result: NegotiationResult,
  baseEvaluation?: ObjectiveEvaluationResult,
): NegotiationApiSummary {
  const abuEval = result.evaluations.find((e) => e.persona === 'ABU');
  const dreEval = result.evaluations.find((e) => e.persona === 'DRE');
  const neptuneEval = result.evaluations.find((e) => e.persona === 'NEPTUNE');

  const { criticalConcerns, suggestionsWithDimension } = buildCriticalConcernsFromEvaluations(
    result.evaluations,
  );

  const hardConstraintBlocked = isNegotiationHardBlocked(result, baseEvaluation);

  const decision =
    result.decision === 'CONDITIONAL_APPROVE'
      ? 'APPROVE_WITH_CONDITIONS'
      : result.decision === 'REQUIRES_HUMAN'
        ? 'NEEDS_HUMAN'
        : result.decision;

  const humanDecisionPoints =
    decision === 'NEEDS_HUMAN' && !hardConstraintBlocked
      ? buildHumanDecisionPointStrings(result)
      : undefined;

  if (hardConstraintBlocked && baseEvaluation && criticalConcerns.length === 0) {
    criticalConcerns.push(buildHardConstraintVetoSummary(baseEvaluation));
  }

  return {
    decision,
    consensusLevel: result.consensusLevel ?? 0,
    keyTradeoffs: Array.isArray(result.keyTradeoffs) ? result.keyTradeoffs : [],
    conditions: Array.isArray(result.conditions) ? result.conditions : [],
    humanDecisionPoints,
    hardConstraintBlocked: hardConstraintBlocked || undefined,
    evaluationSummary: {
      abuUtility: abuEval?.utility ?? 0,
      dreUtility: dreEval?.utility ?? 0,
      neptuneUtility: neptuneEval?.utility ?? 0,
      criticalConcerns,
      suggestionsWithDimension,
    },
    votingResult: {
      approve: Math.max(0, result.votes.filter((v) => v.vote === 'APPROVE').length),
      reject: Math.max(0, result.votes.filter((v) => v.vote === 'REJECT').length),
      abstain: Math.max(0, result.votes.filter((v) => v.vote === 'ABSTAIN').length),
    },
    fatiguePrediction: result.fatiguePrediction,
  };
}

export interface TeamNegotiationApiResponse extends TeamNegotiationResult {
  teamConstraintsSatisfied: boolean;
  hardConstraintBlocked?: boolean;
  evaluationSummary?: { criticalConcerns: string[] };
  /** 与单人协商对齐：GuardianChooseModal 可读选项 */
  humanDecisionPointsFlat?: string[];
}

export function mapTeamNegotiationToApiResponse(
  result: TeamNegotiationResult,
): TeamNegotiationApiResponse {
  const criticalConflicts = result.conflicts.filter(
    (c) => c.severity === 'CRITICAL' || c.severity === 'HIGH',
  );
  const hardConstraintBlocked =
    result.decision === 'REJECT' ||
    criticalConflicts.some((c) =>
      /硬约束|安全|封路|不可执行|compliance|BLOCK/i.test(c.description),
    );

  const teamConstraintsSatisfied = !hardConstraintBlocked && result.decision !== 'REJECT';

  const criticalConcerns = criticalConflicts.map((c) => c.description);

  const humanDecisionPointsFlat =
    result.decision === 'REQUIRES_DISCUSSION' && !hardConstraintBlocked
      ? result.humanDecisionPoints.flatMap((p) =>
          p.options?.length ? p.options : [p.question],
        )
      : undefined;

  return {
    ...result,
    teamConstraintsSatisfied,
    hardConstraintBlocked: hardConstraintBlocked || undefined,
    evaluationSummary: { criticalConcerns },
    humanDecisionPointsFlat,
  };
}

function negotiationStanceToVerdict(
  stance: string,
  persona: 'ABU' | 'DR_DRE' | 'NEPTUNE',
): 'ALLOW' | 'ADJUST' | 'REPLACE' | 'REJECT' | 'NEED_CONFIRM' {
  if (stance === 'STRONG_OPPOSE') return persona === 'ABU' ? 'REJECT' : 'ADJUST';
  if (stance === 'CONCERN') return 'NEED_CONFIRM';
  return 'ALLOW';
}

/** 协商结果 → Persona Expression（choose 闭环 / 前端直读） */
export function buildPresentationFromNegotiationResult(
  result: NegotiationResult,
  apiSummary?: Pick<NegotiationApiSummary, 'hardConstraintBlocked' | 'humanDecisionPoints'>,
): GuardianPersonaPresentation {
  const evalToSlice = (persona: 'ABU' | 'DR_DRE' | 'NEPTUNE', debatePersona: string) => {
    const evaluation = result.evaluations.find((e) =>
      persona === 'DR_DRE' ? e.persona === 'DRE' : e.persona === debatePersona,
    );
    if (!evaluation) return null;
    const labels = { ABU: '🐻', DR_DRE: '🐕', NEPTUNE: '🦦' };
    const names = { ABU: 'Abu', DR_DRE: 'Dr.Dre', NEPTUNE: 'Neptune' };
    return {
      persona,
      icon: labels[persona],
      name: names[persona],
      verdict: negotiationStanceToVerdict(evaluation.stance, persona),
      explanation:
        evaluation.primaryConcerns?.[0] ??
        evaluation.suggestedAdjustments?.[0] ??
        evaluation.reasoning ??
        result.summary,
    };
  };

  const presentation = buildPersonaPresentation(
    {
      abu: evalToSlice('ABU', 'ABU'),
      drdre: evalToSlice('DR_DRE', 'DRE'),
      neptune: evalToSlice('NEPTUNE', 'NEPTUNE'),
    },
    { expressionPhase: 'planning' },
  );

  if (apiSummary?.hardConstraintBlocked || result.decision === 'REJECT') {
    presentation.hardConstraintBlocked = true;
    delete presentation.actions.user;
  } else if (
    result.decision === 'REQUIRES_HUMAN' &&
    (apiSummary?.humanDecisionPoints?.length ?? result.humanDecisionPoints?.length)
  ) {
    presentation.actions.user = 'CHOOSE';
  }

  return presentation;
}

function optimizeAbuActionToVerdict(
  action: string,
): 'ALLOW' | 'ADJUST' | 'REPLACE' | 'REJECT' | 'NEED_CONFIRM' {
  if (action === 'REJECT') return 'REJECT';
  if (action === 'ALLOW_WITH_CONDITIONS') return 'NEED_CONFIRM';
  return 'ALLOW';
}

/** 一键优化结果 → Persona Expression（optimize CHOOSE 闭环） */
export function buildPresentationFromOptimizeResult(
  result: StrategyOrchestrationResultV2,
): GuardianPersonaPresentation {
  const abu = result.abuResult;
  const dre = result.dreResult;
  const neptune = result.neptuneResult;

  const presentation = buildPersonaPresentation(
    {
      abu: abu
        ? {
            persona: 'ABU',
            icon: '🐻',
            name: 'Abu',
            verdict: optimizeAbuActionToVerdict(abu.action),
            explanation:
              abu.conditions?.[0] ??
              abu.evaluation?.repairSuggestions?.[0]?.suggestion ??
              '约束评估完成',
          }
        : null,
      drdre: dre
        ? {
            persona: 'DR_DRE',
            icon: '🐕',
            name: 'Dr.Dre',
            verdict: dre.needsAdjustment ? 'ADJUST' : 'ALLOW',
            explanation:
              typeof dre.summary?.improvementPct === 'number'
                ? `节奏优化效用变化 ${dre.summary.improvementPct.toFixed(1)}%`
                : '节奏评估完成',
          }
        : null,
      neptune: neptune
        ? {
            persona: 'NEPTUNE',
            icon: '🦦',
            name: 'Neptune',
            verdict: neptune.action === 'REPLACE' ? 'REPLACE' : 'ALLOW',
            explanation: neptune.logs?.[0]?.explanation ?? '空间修复评估',
          }
        : null,
    },
    { expressionPhase: 'planning' },
  );

  if (result.hardConstraintBlocked || result.finalAction === 'REJECT') {
    presentation.hardConstraintBlocked = true;
    delete presentation.actions.user;
  } else if (result.chooseRequired || result.humanDecisionPointsFlat?.length) {
    presentation.actions.user = 'CHOOSE';
  }

  return presentation;
}
