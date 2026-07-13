import type { DecisionAction } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import type { ConsumerRepairOptionViewModel } from '../types/exploration.types';

export function mapDecisionActionsToConsumerRepairOptions(
  actions: DecisionAction[],
): ConsumerRepairOptionViewModel[] {
  return actions.map(mapSingleAction);
}

function mapSingleAction(action: DecisionAction): ConsumerRepairOptionViewModel {
  const impact = action.expectedImpact;
  const preview = action.executionSlipPreview;
  const tradeoff = preview?.preserves?.length || preview?.sacrifices?.length
    ? { preserves: preview.preserves ?? [], sacrifices: preview.sacrifices ?? [] }
    : inferTradeoffCopy(action);

  return {
    optionId: action.actionId,
    title: action.title,
    summary: action.summary,
    preserves: tradeoff.preserves,
    sacrifices: tradeoff.sacrifices,
    impact: {
      costDelta: impact?.budgetDelta,
      drivingDeltaMinutes: impact?.durationDelta,
      experienceDelta: impact?.feasibilityDelta,
      riskDelta: undefined,
    },
    canApply: action.allowed && !action.blockedReason,
    ...(preview?.changePreview ? { changePreview: preview.changePreview } : {}),
    ...(preview?.scheduleContext ? { scheduleContext: preview.scheduleContext } : {}),
  };
}

function inferTradeoffCopy(action: DecisionAction): { preserves: string[]; sacrifices: string[] } {
  const type = String(action.type ?? '').toUpperCase();
  if (type.includes('VEHICLE') || type.includes('RENTAL')) {
    return {
      preserves: ['保留原路线结构', '保留核心体验安排'],
      sacrifices: ['可能增加租车或升级成本'],
    };
  }
  if (type.includes('ROUTE') || type.includes('REROUTE')) {
    return {
      preserves: ['保留大部分已选体验', '降低道路/车辆限制风险'],
      sacrifices: ['放弃部分小众或高风险路段', '可能增加驾驶时间或改变住宿区'],
    };
  }
  return {
    preserves: ['尽量保留当前行程目标'],
    sacrifices: ['可能需要调整部分安排以消除阻断'],
  };
}
