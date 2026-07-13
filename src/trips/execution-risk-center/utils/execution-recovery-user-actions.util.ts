/**
 * Phase D — map TEP RecoveryOption / intervention recommendation → userActions labels.
 */

import type {
  ExecutionInterventionDto,
  ExecutionUserActionDto,
} from '../../../mobile/dto/mobile-execution.types';
import type { RecoveryOption } from '../../tep/contracts/tep-self-drive.types';

export function resolveRecoveryOptionLabel(
  item: Pick<
    ExecutionInterventionDto,
    'recommendation' | 'causalChain' | 'alternativeActions' | 'recommendedAction' | 'actions'
  >,
): string | undefined {
  const fromRecommendation = item.recommendation?.title?.trim();
  if (fromRecommendation && !isGenericRecoveryLabel(fromRecommendation)) {
    return fromRecommendation;
  }

  const fromCausal = item.causalChain?.recommendedOption?.summary?.trim();
  if (fromCausal && !isGenericRecoveryLabel(fromCausal)) {
    return fromCausal;
  }

  const fromAlt = item.alternativeActions?.find(
    (label) => label?.trim() && !isGenericRecoveryLabel(label),
  );
  if (fromAlt) return fromAlt.trim();

  if (item.actions.primary.enabled && !isGenericRecoveryLabel(item.actions.primary.label)) {
    return item.actions.primary.label.trim();
  }

  const fromRecommended = item.recommendedAction?.trim();
  if (fromRecommended && !isGenericRecoveryLabel(fromRecommended)) {
    return fromRecommended;
  }

  return undefined;
}

export function projectUserActionsFromRecoveryOption(
  option: RecoveryOption,
  item: Pick<ExecutionInterventionDto, 'actions'>,
): ExecutionUserActionDto[] {
  const primaryLabel = option.description.trim();
  const out: ExecutionUserActionDto[] = [
    {
      label: primaryLabel,
      action: item.actions.primary.action,
      actionId: option.optionId,
      enabled: item.actions.primary.enabled,
      role: 'primary',
    },
  ];

  if (item.actions.secondary) {
    out.push({
      label: item.actions.secondary.label,
      action: item.actions.secondary.action,
      actionId: item.actions.secondary.actionId,
      enabled: item.actions.secondary.enabled,
      role: 'secondary',
    });
  }
  return out;
}

export function mergeRecoveryIntoUserActions(
  item: ExecutionInterventionDto,
  narrativeRecommendation?: string,
): ExecutionUserActionDto[] {
  const recoveryLabel = resolveRecoveryOptionLabel(item);
  const rec = narrativeRecommendation ?? recoveryLabel;
  const primaryLabel =
    (rec && !isKeepOriginalPhrase(rec) ? rec : undefined) ??
    recoveryLabel ??
    (item.actions.primary.enabled ? item.actions.primary.label : undefined) ??
    '查看替代方案';

  const out: ExecutionUserActionDto[] = [
    {
      label: primaryLabel,
      action: item.actions.primary.action,
      actionId: item.actions.primary.actionId ?? item.recommendation?.recommendedActionId,
      enabled: item.actions.primary.enabled,
      role: 'primary',
    },
  ];

  if (item.actions.secondary) {
    out.push({
      label: item.actions.secondary.label,
      action: item.actions.secondary.action,
      actionId: item.actions.secondary.actionId,
      enabled: item.actions.secondary.enabled,
      role: 'secondary',
    });
  }
  return out;
}

function isGenericRecoveryLabel(label: string): boolean {
  return /^(查看方案|应用修复|查看替代方案|重新规划|采用调整方案)$/i.test(label.trim());
}

function isKeepOriginalPhrase(text: string): boolean {
  return /保持原计划|keep\s*original/i.test(text);
}
