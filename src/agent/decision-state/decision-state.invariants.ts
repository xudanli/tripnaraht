/**
 * Decision State Contract — 系统级 Invariant（建议写进回归）。
 *
 * INV-01 ASK_USER 必须引用当前 Contract declared required/conditional key
 * INV-02 Sensor failure 不得直接映射为业务 SOLD_OUT
 * INV-03 未声明世界态缺失不得阻断当前决策
 */

import type {
  DecisionReadinessResult,
  DecisionStateContract,
  DecisionStateProjection,
} from './decision-state.types';
import { normalizeBookingChannelFromSensor } from './normalize-booking-channel.util';

export type InvariantCheck = { id: string; ok: boolean; detail?: string };

/** INV-01 */
export function checkInv01AskUserCitesContractKey(
  contract: DecisionStateContract | null,
  readiness: DecisionReadinessResult | null,
): InvariantCheck {
  const id = 'INV.DECISION_ASK_USER_CITES_CONTRACT_KEY';
  if (!readiness || readiness.nextAction !== 'ASK_USER') {
    return { id, ok: true, detail: 'not_asking' };
  }
  if (!contract) {
    return { id, ok: false, detail: 'ask_without_contract' };
  }
  const declared = new Set(contract.keys.map((k) => k.key));
  const cited = readiness.askUserKeys;
  if (!cited.length) {
    return { id, ok: false, detail: 'ask_without_cited_key' };
  }
  const bad = cited.filter((k) => !declared.has(k));
  return bad.length
    ? { id, ok: false, detail: `undeclared_ask_keys=${bad.join(',')}` }
    : { id, ok: true };
}

/** INV-02 */
export function checkInv02SensorFailureNotSoldOut(): InvariantCheck {
  const id = 'INV.SENSOR_FAILURE_NOT_BUSINESS_SOLD_OUT';
  const cases = [
    normalizeBookingChannelFromSensor({
      ok: false,
      httpStatus: 404,
      errorMessage: 'Initialization failed with status 404',
      catalogHit: true,
    }),
    normalizeBookingChannelFromSensor({
      ok: false,
      errorMessage: 'Server not found',
      catalogHit: false,
    }),
  ];
  const leaked = cases.filter((c) => c.businessAvailability === 'SOLD_OUT');
  return leaked.length
    ? { id, ok: false, detail: 'tech_fail_mapped_sold_out' }
    : { id, ok: true };
}

/** INV-03 */
export function checkInv03UndeclaredStateCannotBlock(
  contract: DecisionStateContract | null,
  projection: DecisionStateProjection | null,
  readiness: DecisionReadinessResult | null,
  attemptedBlockKeys: string[] = [],
): InvariantCheck {
  const id = 'INV.UNDECLARED_STATE_CANNOT_BLOCK';
  if (!contract || !readiness) {
    return { id, ok: true, detail: 'no_contract' };
  }
  const declared = new Set(contract.keys.map((k) => k.key));
  const ignored = new Set(contract.ignoredWorldKeys);
  const offenders = attemptedBlockKeys.filter(
    (k) => !declared.has(k as never) || ignored.has(k),
  );
  // readiness.blockingKeys 也不得含 ignored
  const blockedIgnored = readiness.blockingKeys.filter((k) => ignored.has(k));
  if (offenders.length || blockedIgnored.length) {
    return {
      id,
      ok: false,
      detail: `offenders=${[...offenders, ...blockedIgnored].join(',')}`,
    };
  }
  // projection.ignored 必须全部 IGNORED
  if (projection) {
    const bad = projection.ignored.filter((i) => i.presence !== 'IGNORED');
    if (bad.length) {
      return { id, ok: false, detail: `ignored_not_marked=${bad.map((b) => b.key).join(',')}` };
    }
  }
  return { id, ok: true };
}

export function runDecisionStateInvariants(input: {
  contract: DecisionStateContract | null;
  projection: DecisionStateProjection | null;
  readiness: DecisionReadinessResult | null;
  /** 现链若因 day_pace 等追问，记入此处做对照 */
  legacyBlockKeys?: string[];
}): InvariantCheck[] {
  return [
    checkInv01AskUserCitesContractKey(input.contract, input.readiness),
    checkInv02SensorFailureNotSoldOut(),
    checkInv03UndeclaredStateCannotBlock(
      input.contract,
      input.projection,
      input.readiness,
      input.legacyBlockKeys ?? [],
    ),
  ];
}
