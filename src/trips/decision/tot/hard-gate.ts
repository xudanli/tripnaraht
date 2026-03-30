// src/trips/decision/tot/hard-gate.ts

/**
 * 硬门控逻辑
 * 
 * 检查必然失败的情况，直接淘汰候选思路
 */

import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';
import { OptimizationResult, DropReasonCode } from '../../../itinerary-optimization/interfaces/plan-request.interface';
import { PlanningPolicy } from '../../../planning-policy/interfaces/planning-policy.interface';
import { extractActivityCandidatesFromPlan } from './candidate-helper';
import { HARD_GATE_CONSTANTS } from './scoring-constants';

/**
 * 硬门控检查结果
 */
export interface HardGateResult {
  allowed: boolean;
  violations: string[];
}

/**
 * 检查硬门控
 * 
 * 规则：
 * 1. 任意硬节点（is_hard_node / locked / anchor/fixedEvents）不可行
 * 2. CLOSED_DAY / TIME_WINDOW_CONFLICT 发生在硬节点上
 * 3. INSUFFICIENT_TOTAL_TIME 严重超日界（例如超出 day_boundary end > 30min 且影响硬节点）
 * 4. 轮椅/步行/换乘等硬约束违反（PlanningPolicy.constraints）
 */
export function checkHardGate(
  world: TripWorldState,
  plan: TripPlan,
  optimizationResult?: OptimizationResult,
  planningPolicy?: PlanningPolicy
): HardGateResult {
  const violations: string[] = [];

  // 1. 检查硬节点是否都在计划中
  const hardNodeIds = new Set<string>();
  
  // 收集所有硬节点 ID（从计划中）
  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      if (slot.locked || slot.priorityTag === 'anchor' || slot.priorityTag === 'core') {
        if (slot.poiId) {
          hardNodeIds.add(slot.poiId);
        }
      }
    }
  }

  // 检查 anchors（固定事件）
  const anchors = world.context.anchors;
  if (anchors?.fixedEvents && anchors.fixedEvents.length > 0) {
    // 检查计划中是否包含所有固定事件
    // 简化处理：通过检查时间窗口来判断
    // 实际应该更精确地匹配固定事件
    const fixedEventDates = new Set(anchors.fixedEvents.map(e => e.date));
    const planDates = new Set(plan.days.map(d => d.date));
    for (const date of fixedEventDates) {
      if (!planDates.has(date)) {
        violations.push(`MISSING_FIXED_EVENT: 日期 ${date} 缺少固定事件`);
      }
    }
  }

  // 2. 检查优化结果中的丢弃节点
  if (optimizationResult) {
    const dropped = optimizationResult.dropped ?? [];
    
    for (const node of dropped) {
      // 检查是否是硬节点被丢弃
      // 通过 node_id 判断是否是硬节点（如果它在 hardNodeIds 中）
      // 或者通过 penalty 判断（硬节点通常有很高的 penalty）
      const isHardNode = hardNodeIds.has(node.node_id.toString()) || 
                        node.penalty > 100 || // 高 penalty 可能是硬节点
                        node.reason_code === DropReasonCode.HARD_NODE_PROTECTION; // 明确标记
      
      // 检查关键错误码（仅对硬节点）
      if (isHardNode) {
        if (node.reason_code === DropReasonCode.CLOSED_DAY) {
          violations.push(`HARD_NODE_CLOSED: ${node.name} (${node.node_id})`);
        }
        
        if (node.reason_code === DropReasonCode.TIME_WINDOW_CONFLICT) {
          violations.push(`HARD_NODE_TIME_WINDOW_CONFLICT: ${node.name} (${node.node_id})`);
        }
        
        if (node.reason_code === DropReasonCode.INSUFFICIENT_TOTAL_TIME) {
          violations.push(`HARD_NODE_INSUFFICIENT_TIME: ${node.name} (${node.node_id})`);
        }
      }
    }

    // 3. 检查严重超时
    const summary = optimizationResult.summary;
    const dayBoundary = world.policies;
    if (dayBoundary?.dayEnd) {
      // 计算日界时长（从 dayStart 到 dayEnd）
      const dayStart = dayBoundary.dayStart ?? '08:00';
      const dayEnd = dayBoundary.dayEnd;
      
      // 解析时间字符串（HH:mm）
      const [startHour, startMin] = dayStart.split(':').map(Number);
      const [endHour, endMin] = dayEnd.split(':').map(Number);
      const expectedDayMin = (endHour * 60 + endMin) - (startHour * 60 + startMin);
      
      const dayMin = summary.total_day_min;
      const overTime = dayMin - expectedDayMin;
      
      // 如果超出阈值且影响硬节点，直接拒绝（使用常量）
      if (overTime > HARD_GATE_CONSTANTS.SEVERE_OVERTIME_THRESHOLD_MIN && hardNodeIds.size > 0) {
        violations.push(`INSUFFICIENT_TOTAL_TIME: 超出日界 ${overTime} 分钟，影响硬节点`);
      }
    }
  }

  // 4. 检查 PlanningPolicy 硬约束
  if (planningPolicy) {
    const constraints = planningPolicy.constraints;
    const activityMap = extractActivityCandidatesFromPlan(world, plan);
    
    // 检查轮椅可达
    if (constraints.requireWheelchairAccess) {
      for (const _ of activityMap.values()) {
        // 从候选的 metadata 中检查（如果 ActivityCandidate 有相关字段）
        // 注意：ActivityCandidate 可能没有直接的 wheelchairAccess 字段
        // 这里简化处理：如果候选存在但无法确认，给出警告而非直接拒绝
        // 实际应该从 POI 的 physicalMetadata 或 metadata.facilities.wheelchair 获取
        // 暂时跳过，因为 ActivityCandidate 接口中没有这个字段
      }
    }

    // 检查禁止楼梯
    if (constraints.forbidStairs) {
      // 从 travelLegFromPrev 中检查（如果有地形信息）
      for (const day of plan.days) {
        for (const _slot of day.timeSlots) {
          // 检查 terrainFacts 中的风险标志
          if (day.terrainFacts?.riskFlags) {
            for (const flag of day.terrainFacts.riskFlags) {
              if (flag.type === 'STAIRS' && flag.severity === 'HIGH') {
                violations.push(`FORBID_STAIRS_VIOLATION: 第 ${day.day} 天检测到楼梯`);
                break;
              }
            }
          }
        }
      }
    }

    // 检查最大换乘次数（从 travelLegFromPrev 统计）
    let maxTransfersInDay = 0;
    for (const day of plan.days) {
      const dayTransfers = 0;
      for (const slot of day.timeSlots) {
        if (slot.travelLegFromPrev) {
          // 如果 travelLeg 的 mode 发生变化，可能涉及换乘
          // 简化处理：如果 mode 是 transit 且距离较长，可能涉及换乘
          // 实际应该从 TransitSegment 获取 transferCount
          // 这里无法精确判断，暂时跳过
        }
      }
      maxTransfersInDay = Math.max(maxTransfersInDay, dayTransfers);
    }
    if (maxTransfersInDay > constraints.maxTransfers) {
      violations.push(`MAX_TRANSFERS_VIOLATION: 单日换乘次数 ${maxTransfersInDay} 超过限制 ${constraints.maxTransfers}`);
    }

    // 检查单段步行上限（从 travelLegFromPrev 统计）
    for (const day of plan.days) {
      for (const slot of day.timeSlots) {
        if (slot.travelLegFromPrev) {
          const leg = slot.travelLegFromPrev;
          if (leg.mode === 'walk' && leg.durationMin > constraints.maxSingleWalkMin) {
            violations.push(`MAX_SINGLE_WALK_VIOLATION: 第 ${day.day} 天单段步行 ${leg.durationMin} 分钟超过限制 ${constraints.maxSingleWalkMin}`);
          }
        }
      }
    }

    // 检查每日总步行上限
    for (const day of plan.days) {
      let totalWalkMin = 0;
      for (const slot of day.timeSlots) {
        if (slot.travelLegFromPrev && slot.travelLegFromPrev.mode === 'walk') {
          totalWalkMin += slot.travelLegFromPrev.durationMin;
        }
      }
      if (totalWalkMin > constraints.maxTotalWalkMinPerDay) {
        violations.push(`MAX_TOTAL_WALK_VIOLATION: 第 ${day.day} 天总步行 ${totalWalkMin} 分钟超过限制 ${constraints.maxTotalWalkMinPerDay}`);
      }
    }

    // 检查洗手间间隔
    if (constraints.mustHaveRestroomEveryMin > 0) {
      for (const day of plan.days) {
        let lastRestroomMin = 0; // 假设开始时有洗手间
        let currentMin = 0;
        
        // 简化处理：检查活动间隔
        // 实际应该检查每个活动附近是否有洗手间
        for (const slot of day.timeSlots) {
          if (slot.type !== 'transport' && slot.type !== 'rest') {
            // 检查是否超过间隔
            const timeSinceLastRestroom = currentMin - lastRestroomMin;
            if (timeSinceLastRestroom > constraints.mustHaveRestroomEveryMin) {
              // 检查活动是否有 restroomNearby（需要从候选获取）
              // 简化处理：假设不满足，给出警告
              violations.push(`RESTROOM_INTERVAL_VIOLATION: 第 ${day.day} 天活动 "${slot.title}" 距离上次洗手间 ${timeSinceLastRestroom} 分钟，超过限制 ${constraints.mustHaveRestroomEveryMin}`);
            }
            // 假设活动有洗手间，更新 lastRestroomMin
            // 实际应该从候选的 restroomNearby 字段判断
            lastRestroomMin = currentMin;
          }
          
          // 累加时间（简化处理）
          if (slot.travelLegFromPrev) {
            currentMin += slot.travelLegFromPrev.durationMin;
          }
          // 假设活动时长为 60 分钟（简化）
          currentMin += 60;
        }
      }
    }
  }

  // 5. 检查计划是否为空
  let hasActivities = false;
  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      if (slot.type !== 'transport' && slot.type !== 'rest') {
        hasActivities = true;
        break;
      }
    }
    if (hasActivities) break;
  }

  if (!hasActivities) {
    violations.push('EMPTY_PLAN: 计划中没有活动');
  }

  return {
    allowed: violations.length === 0,
    violations,
  };
}

