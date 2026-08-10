/**
 * V1.1 入口条件 — 现在不立项。
 * Repeated Evidence + Repeated User Need + Existing V1 Cannot Solve + Material Product Value
 * → Capability Proposal → Human Review
 */

export const V11_ENTRY_GATE_SCHEMA = 'nara.v1_1_entry_gate@v1' as const;

export type V11EntryGateResultV1 = {
  schemaId: typeof V11_ENTRY_GATE_SCHEMA;
  version: 1;
  mayOpenV11Discussion: boolean;
  v11NotStarted: true;
  reasonsZh: string[];
  singleUserRequestInsufficient: true;
};

export function evaluateV11EntryGate(input: {
  /** 出现同类任务的真实 Trip 数 */
  repeatedTripCount: number;
  /** 其中遇到该任务的 Trip 数 */
  tripsWithSameNeed: number;
  existingV1CannotSolve: boolean;
  materialProductValue: boolean;
  /** 单次用户口头需求 */
  singleUserRequestOnly?: boolean;
  minRepeatedTrips?: number;
  minNeedRate?: number;
}): V11EntryGateResultV1 {
  const minTrips = input.minRepeatedTrips ?? 17;
  const minNeed = input.minNeedRate ?? 9 / 17;
  const reasonsZh: string[] = [];

  if (input.singleUserRequestOnly) {
    reasonsZh.push('单个用户说一次「能不能加 XXX」不足进入路线图');
  }
  if (input.repeatedTripCount < minTrips) {
    reasonsZh.push(
      `重复证据不足：Trip ${input.repeatedTripCount} < ${minTrips}`,
    );
  }
  const needRate =
    input.repeatedTripCount === 0
      ? 0
      : input.tripsWithSameNeed / input.repeatedTripCount;
  if (needRate < minNeed) {
    reasonsZh.push(
      `重复用户需求不足：${input.tripsWithSameNeed}/${input.repeatedTripCount}`,
    );
  }
  if (!input.existingV1CannotSolve) {
    reasonsZh.push('现有 V1 仍可解决 → 不开放 V1.1');
  }
  if (!input.materialProductValue) {
    reasonsZh.push('缺少实质产品价值证明');
  }

  const mayOpen =
    !input.singleUserRequestOnly &&
    input.repeatedTripCount >= minTrips &&
    needRate >= minNeed &&
    input.existingV1CannotSolve &&
    input.materialProductValue;

  if (mayOpen) {
    reasonsZh.push(
      '可提交 Capability Proposal → Human Review（V1.1 仍未自动立项）',
    );
  } else {
    reasonsZh.push('V1.1 现在不立项；继续运营验证');
  }

  return {
    schemaId: V11_ENTRY_GATE_SCHEMA,
    version: 1,
    mayOpenV11Discussion: mayOpen,
    v11NotStarted: true,
    reasonsZh,
    singleUserRequestInsufficient: true,
  };
}
