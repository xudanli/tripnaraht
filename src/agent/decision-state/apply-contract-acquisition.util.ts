/**
 * Phase 3：slimLoad / fetchKeys 由当前 Decision Contract 驱动。
 * slimLoad = 合同不要求 live/team/重切片；需要时强制 slimLoad=false。
 */

import type { ContextRequirementPlan } from '../context-requirement/context-requirement.types';
import type { DecisionStateContract } from './decision-state.types';

const ACQUISITION_TO_FETCH: Record<string, string[]> = {
  DERIVE_FROM_MESSAGE: [],
  DERIVE_FROM_TRIP_DAY: ['trip.day', 'page.focusDay'],
  AGGREGATE_MEMBERS: ['participants', 'participants.fitnessProfile', 'team.memberCapability'],
  LIVE_THEN_CATALOG: ['booking.availability', 'experience.product'],
  CATALOG_ONLY: ['experience.product', 'rental.policy'],
  USER_PROMPT: [],
  PROVIDER_LIVE: ['booking.availability', 'weather.forecast'],
  LOAD_TRIP_LODGING_SLICE: ['trip.day', 'lodging.coverage', 'booking.fixedCommitments'],
};

const HEAVY_ACQUISITION = new Set([
  'LIVE_THEN_CATALOG',
  'PROVIDER_LIVE',
  'AGGREGATE_MEMBERS',
  'LOAD_TRIP_LODGING_SLICE',
]);

/**
 * 合同驱动的 acquisition 覆盖。
 * - fetchKeys：与合同 acquisition 并集
 * - slimLoad：合同含重获取策略时强制 false；否则保持 CRE 原值（可轻量）
 */
export function applyContractAcquisitionToCrePlan(
  plan: ContextRequirementPlan,
  contract: DecisionStateContract | null | undefined,
): ContextRequirementPlan {
  if (!contract) return plan;
  const extra: string[] = [];
  let needsHeavy = false;
  for (const k of contract.keys) {
    if (k.necessity === 'OPTIONAL' && k.missingPolicy === 'ALLOW_WITH_UNKNOWN') {
      // 可选键不强制拉重上下文
      const mapped = ACQUISITION_TO_FETCH[k.acquisition] ?? [];
      extra.push(...mapped);
      continue;
    }
    const mapped = ACQUISITION_TO_FETCH[k.acquisition] ?? [];
    extra.push(...mapped);
    if (HEAVY_ACQUISITION.has(k.acquisition)) {
      needsHeavy = true;
    }
  }
  const fetchKeys = [...new Set([...(plan.acquisition.fetchKeys ?? []), ...extra])];
  return {
    ...plan,
    acquisition: {
      ...plan.acquisition,
      slimLoad: needsHeavy ? false : plan.acquisition.slimLoad,
      fetchKeys,
      ...(needsHeavy
        ? {
            // 合同要求 live/team 时允许对应检索
            skipRisksRag: plan.acquisition.skipRisksRag,
          }
        : {}),
    },
    reason: `${plan.reason}|contract_acquisition:${contract.version}${
      needsHeavy ? '|slimLoad=0' : ''
    }`,
  };
}
