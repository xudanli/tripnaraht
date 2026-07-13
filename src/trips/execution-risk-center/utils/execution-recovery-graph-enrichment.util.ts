/**
 * Phase D — attach RecoveryGraph options to adjustment-queue interventions.
 */

import type { ExecutionInterventionDto } from '../../../mobile/dto/mobile-execution.types';
import type { RecoveryGraph, RecoveryOption } from '../../tep/contracts/tep-self-drive.types';

export function attachRecoveryGraphToInterventions(
  items: ExecutionInterventionDto[],
  recoveryGraph: RecoveryGraph,
  basePlanVersionId?: string,
): ExecutionInterventionDto[] {
  if (!recoveryGraph.fallbackOptions?.length) return items;
  return items.map((item) =>
    attachRecoveryToIntervention(item, recoveryGraph.fallbackOptions, basePlanVersionId),
  );
}

export function attachRecoveryToIntervention(
  item: ExecutionInterventionDto,
  fallbacks: RecoveryOption[],
  basePlanVersionId?: string,
): ExecutionInterventionDto {
  const linked = fallbacks.filter((opt) => matchesRecoveryOption(item, opt));
  if (linked.length === 0) return item;

  const option = linked[0]!;
  const alternativeActions = [
    ...(item.alternativeActions ?? []),
    ...linked.map((opt) => opt.description),
  ];

  return {
    ...item,
    alternativeActions: [...new Set(alternativeActions)],
    requiresRevalidation: true,
    modifiesEffectivePlan: option.action === 'REMOVE',
    recommendation: {
      ...(item.recommendation ?? {
        title: option.description,
        summary: option.description,
        recommendedActionId: option.optionId,
        keeps: ['保留核心行程目标'],
        costs: option.action === 'REMOVE' ? ['移除部分可选停靠'] : ['调整活动安排'],
      }),
      title: option.description,
      summary: option.description,
      recommendedActionId: option.optionId,
      basePlanVersionId,
    },
    actions: {
      ...item.actions,
      primary: {
        ...item.actions.primary,
        label: option.description,
        actionId: option.optionId,
      },
    },
    causalChain: item.causalChain
      ? {
          ...item.causalChain,
          recommendedOption: {
            optionId: option.optionId,
            summary: option.description,
            expectedImprovement: item.causalChain.recommendedOption?.expectedImprovement,
          },
        }
      : item.causalChain,
  };
}

function matchesRecoveryOption(
  item: ExecutionInterventionDto,
  opt: RecoveryOption,
): boolean {
  if (opt.triggerRuleId === 'SDR-302' && opt.action === 'REPLACE') {
    return (
      item.type === 'SAFETY_INTERVENTION' ||
      item.type === 'DYNAMIC_REPLAN' ||
      /infeasible|stg_attn/i.test(`${item.id} ${item.decisionProblemId ?? ''}`)
    );
  }
  if (item.type === 'DYNAMIC_REPLAN' && opt.triggerRuleId === 'SDR-101') {
    return true;
  }
  return false;
}
