/**
 * Gate-only deterministic repair recipes (V1.6 P1).
 * Rule engine output — not LLM-generated options.
 */

import type {
  ConstraintAssertion,
  DecisionOption,
  DecisionProblemDetail,
  TradeoffDimension,
} from '../types/decision-semantics.types';

export type GateRepairType =
  | 'REACHABILITY'
  | 'SAFETY'
  | 'DATA_MISSING'
  | 'DEM'
  | 'UNKNOWN';

export function inferGateRepairType(
  detail: Pick<DecisionProblemDetail, 'semanticKey' | 'description'>,
  assertion: ConstraintAssertion,
): GateRepairType {
  const fromKey = detail.semanticKey?.match(/^gate:([^:]+)/i)?.[1]?.toUpperCase();
  const fromRef = assertion.sourceRefId.split(':')[0]?.toUpperCase();
  const raw = fromKey ?? fromRef ?? '';
  const blob = `${raw} ${assertion.condition} ${detail.description}`.toUpperCase();

  if (raw === 'DEM' || blob.includes('DEM')) return 'DEM';
  if (raw.includes('REACH') || blob.includes('REACHABILITY') || blob.includes('不可达')) {
    return 'REACHABILITY';
  }
  if (raw.includes('SAFETY') || blob.includes('SAFETY') || blob.includes('安全')) return 'SAFETY';
  if (raw.includes('DATA') || blob.includes('DATA_MISSING') || blob.includes('证据')) {
    return 'DATA_MISSING';
  }
  return 'UNKNOWN';
}

function option(
  id: string,
  problemId: string,
  type: DecisionOption['type'],
  title: string,
  description: string,
  tradeoffs: TradeoffDimension[],
  resolves: string[],
  requiresConfirmation: boolean,
  assertion: ConstraintAssertion,
): DecisionOption {
  return {
    id,
    problemId,
    type,
    title,
    description,
    source: 'RULE_ENGINE',
    resolves,
    tradeoffs,
    executable: assertion.overridable && assertion.enforcement !== 'BLOCK',
    requiresConfirmation,
    sourceRefId: id,
  };
}

export function buildGateRepairOptions(
  detail: DecisionProblemDetail,
  assertion: ConstraintAssertion,
): DecisionOption[] {
  const gateType = inferGateRepairType(detail, assertion);
  const resolves = detail.assertionIds;
  const requiresConfirmation =
    assertion.enforcement === 'REQUIRE_CONFIRMATION' || assertion.enforcement === 'BLOCK';

  switch (gateType) {
    case 'REACHABILITY':
      return [
        option(
          'gate_reach_alt_route',
          detail.id,
          'REPAIR',
          '更换可达路线',
          '改用当前条件下可通行的路线或绕行方案。',
          [{ dimension: 'TIME', direction: 'WORSEN', explanation: '绕行可能增加行程时间' }],
          resolves,
          requiresConfirmation,
          assertion,
        ),
        option(
          'gate_reach_split_leg',
          detail.id,
          'REPAIR',
          '拆分路段',
          '将超长或不可达路段拆成多日或多次短段移动。',
          [
            { dimension: 'FLEXIBILITY', direction: 'IMPROVE', explanation: '降低单段可达性压力' },
            { dimension: 'TIME', direction: 'WORSEN', explanation: '可能增加总天数或等待' },
          ],
          resolves,
          requiresConfirmation,
          assertion,
        ),
        option(
          'gate_reach_change_mode',
          detail.id,
          'ALTERNATIVE',
          '更换交通方式',
          '例如改为徒步接驳、巴士或调整出发/到达方式以满足可达性。',
          [
            { dimension: 'COST', direction: 'WORSEN', explanation: '新交通方式可能有额外成本' },
            { dimension: 'COMFORT', direction: 'UNCHANGED', explanation: '舒适度因方式而异' },
          ],
          resolves,
          requiresConfirmation,
          assertion,
        ),
      ];

    case 'SAFETY':
      return [
        option(
          'gate_safety_shift_date',
          detail.id,
          'REPAIR',
          '调整出行日期',
          '改到风险更低或条件更稳定的日期执行该活动/路段。',
          [
            { dimension: 'FLEXIBILITY', direction: 'WORSEN', explanation: '日期调整可能连锁影响预订' },
            { dimension: 'SAFETY', direction: 'IMPROVE', explanation: '避开当前安全窗口外的风险' },
          ],
          resolves,
          requiresConfirmation,
          assertion,
        ),
        option(
          'gate_safety_alt_activity',
          detail.id,
          'ALTERNATIVE',
          '替换为更安全的活动',
          '保留当日结构，用风险更低的 POI 或活动替代。',
          [
            { dimension: 'POI_COVERAGE', direction: 'WORSEN', explanation: '原活动可能被替换' },
            { dimension: 'SAFETY', direction: 'IMPROVE', explanation: '降低暴露风险' },
          ],
          resolves,
          requiresConfirmation,
          assertion,
        ),
        option(
          'gate_safety_cancel',
          detail.id,
          'CANCEL',
          '取消该段行程',
          '直接移除或跳过当前触发安全门控的路段/活动。',
          [
            { dimension: 'POI_COVERAGE', direction: 'WORSEN', explanation: '减少覆盖点位' },
            { dimension: 'SAFETY', direction: 'IMPROVE', explanation: '消除当前安全冲突' },
          ],
          resolves,
          true,
          assertion,
        ),
      ];

    case 'DATA_MISSING':
      return [
        option(
          'gate_data_attach_evidence',
          detail.id,
          'REPAIR',
          '补充证据材料',
          '上传或关联官方/现场证据（路况、开放状态、预订凭证等）。',
          [{ dimension: 'CERTAINTY', direction: 'IMPROVE', explanation: '提高判定置信度' }],
          resolves,
          false,
          assertion,
        ),
        option(
          'gate_data_revalidate',
          detail.id,
          'REPAIR',
          '重新验证可行性',
          '触发 feasibility validate，用最新世界状态刷新 Gate 判定。',
          [{ dimension: 'CERTAINTY', direction: 'IMPROVE', explanation: '以最新数据重算' }],
          resolves,
          false,
          assertion,
        ),
        option(
          'gate_data_downgrade_unconfirmed',
          detail.id,
          'ACCEPT_RISK',
          '降级为未确认继续',
          '在证据不足时标记为未确认并继续规划，需明确承担不确定性。',
          [
            { dimension: 'CERTAINTY', direction: 'WORSEN', explanation: '接受信息缺口' },
            { dimension: 'SAFETY', direction: 'WORSEN', explanation: '未确认状态可能隐藏风险' },
          ],
          resolves,
          true,
          assertion,
        ),
      ];

    case 'DEM':
      return [
        option(
          'gate_dem_alt_route',
          detail.id,
          'REPAIR',
          '更换路线避开 DEM 风险区',
          '调整路线走向或高度剖面，避开当前 DEM/地形判定问题区域。',
          [
            { dimension: 'SCENERY', direction: 'WORSEN', explanation: '替代路线景观可能不同' },
            { dimension: 'SAFETY', direction: 'IMPROVE', explanation: '降低地形相关风险' },
          ],
          resolves,
          requiresConfirmation,
          assertion,
        ),
        option(
          'gate_dem_vehicle_adjust',
          detail.id,
          'REPAIR',
          '调整车型或通行能力',
          '例如改为 4WD、降低载重或缩短需 DEM 评估的路段。',
          [
            { dimension: 'COST', direction: 'WORSEN', explanation: '车型升级可能增加成本' },
            { dimension: 'SAFETY', direction: 'IMPROVE', explanation: '匹配路况通行要求' },
          ],
          resolves,
          requiresConfirmation,
          assertion,
        ),
        option(
          'gate_dem_cancel_segment',
          detail.id,
          'CANCEL',
          '取消问题路段',
          '跳过当前 DEM 门控失败的路段，保留其余行程结构。',
          [
            { dimension: 'POI_COVERAGE', direction: 'WORSEN', explanation: '减少沿途覆盖' },
            { dimension: 'SAFETY', direction: 'IMPROVE', explanation: '避免高风险地形段' },
          ],
          resolves,
          true,
          assertion,
        ),
      ];

    default:
      return [];
  }
}
