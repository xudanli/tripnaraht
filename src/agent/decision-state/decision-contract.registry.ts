/**
 * Decision Contract 总注册表 — Decision State Layer 冻结清单。
 *
 * 阶段：接管验证与遗留退役。禁止主动扩类。
 * 解冻：`DECISION_STATE_REGISTRY_UNFREEZE=1` + 真实 Trip 证据。
 */

import { listActivityDecisionContracts } from './activity-decision.contracts';
import { listLodgingDecisionContracts } from './lodging-decision.contracts';
import {
  getTransportRouteDecisionContract,
  TRANSPORT_RENTAL_GUIDANCE_V1,
  TRANSPORT_VEHICLE_FIT_V1,
  ROUTE_DAY_ORDER_OPTIMIZE_V1,
} from './transport-route-decision.contracts';
import {
  getDiningRiskDecisionContract,
  DINING_RECOMMENDATION_V1,
  DINING_NEAR_POI_V1,
  RISK_WEATHER_IMPACT_V1,
  RISK_PACE_ASSESS_V1,
} from './dining-risk-decision.contracts';
import { PLAN_DAY_REPLAN_V1 } from './plan-decision.contracts';
import type { DecisionStateContract } from './decision-state.types';

/** 冻结时的权威类数量（攻击测 / 回归锚定） */
export const FROZEN_DECISION_CLASS_COUNT = 16;

export const DECISION_STATE_REGISTRY_FROZEN = true;

export function isDecisionStateRegistryFrozen(): boolean {
  const unfreeze = String(process.env.DECISION_STATE_REGISTRY_UNFREEZE ?? '')
    .trim()
    .toLowerCase();
  if (unfreeze === '1' || unfreeze === 'true') return false;
  return DECISION_STATE_REGISTRY_FROZEN;
}

export function listAllDecisionContracts(): DecisionStateContract[] {
  return [
    ...listActivityDecisionContracts(),
    ...listLodgingDecisionContracts(),
    TRANSPORT_RENTAL_GUIDANCE_V1,
    TRANSPORT_VEHICLE_FIT_V1,
    ROUTE_DAY_ORDER_OPTIMIZE_V1,
    DINING_RECOMMENDATION_V1,
    DINING_NEAR_POI_V1,
    RISK_WEATHER_IMPACT_V1,
    RISK_PACE_ASSESS_V1,
    PLAN_DAY_REPLAN_V1,
  ];
}

export function getDecisionContractByClass(
  decisionClass: string,
): DecisionStateContract | null {
  return (
    listAllDecisionContracts().find((c) => c.decisionClass === decisionClass) ??
    getTransportRouteDecisionContract(decisionClass) ??
    getDiningRiskDecisionContract(decisionClass) ??
    null
  );
}

/** 每个合同必须：version、keys≥1、ignoredWorldKeys 声明、无重复 key */
export function validateDecisionContractRegistry(
  contracts: DecisionStateContract[] = listAllDecisionContracts(),
): Array<{ decisionClass: string; ok: boolean; detail?: string }> {
  return contracts.map((c) => {
    if (!c.version?.trim()) {
      return { decisionClass: c.decisionClass, ok: false, detail: 'missing_version' };
    }
    if (!c.keys?.length) {
      return { decisionClass: c.decisionClass, ok: false, detail: 'empty_keys' };
    }
    const keySet = new Set(c.keys.map((k) => k.key));
    if (keySet.size !== c.keys.length) {
      return { decisionClass: c.decisionClass, ok: false, detail: 'duplicate_keys' };
    }
    if (!Array.isArray(c.ignoredWorldKeys)) {
      return { decisionClass: c.decisionClass, ok: false, detail: 'missing_ignored' };
    }
    return { decisionClass: c.decisionClass, ok: true };
  });
}

/** 冻结断言：类数量与结构；扩类未解冻则 fail */
export function assertDecisionStateRegistryFrozen(
  contracts: DecisionStateContract[] = listAllDecisionContracts(),
): { ok: boolean; detail?: string } {
  if (contracts.length !== FROZEN_DECISION_CLASS_COUNT) {
    if (isDecisionStateRegistryFrozen()) {
      return {
        ok: false,
        detail: `frozen_count_mismatch expected=${FROZEN_DECISION_CLASS_COUNT} actual=${contracts.length}`,
      };
    }
  }
  const bad = validateDecisionContractRegistry(contracts).filter((r) => !r.ok);
  if (bad.length) {
    return { ok: false, detail: bad.map((b) => `${b.decisionClass}:${b.detail}`).join('|') };
  }
  return { ok: true };
}
