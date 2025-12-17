// src/itinerary-optimization/services/explanation.service.ts
import { Injectable } from '@nestjs/common';
import { PlanNode, DropReasonCode, DroppedNode } from '../interfaces/plan-request.interface';

/**
 * 解释服务
 * 
 * 将机器原因码转换为自然语言解释
 */
@Injectable()
export class ExplanationService {
  /**
   * 生成丢弃节点的解释
   */
  generateDropExplanation(
    node: PlanNode,
    reasonCode: DropReasonCode,
    context: {
      arrivalTime?: number; // 分钟偏移
      closeTime?: number; // 分钟偏移
      waitMinutes?: number;
      requiredDeparture?: number; // 分钟偏移
      slackMinutes?: number;
      dayEnd?: number; // 分钟偏移
      hardNodeCount?: number;
      robustTimeInfeasible?: boolean;
    } = {}
  ): DroppedNode['explanation'] {
    const facts: Record<string, any> = {};

    switch (reasonCode) {
      case DropReasonCode.TIME_WINDOW_CONFLICT:
        if (context.closeTime !== undefined) {
          facts.close_time = this.minutesToTimeString(context.closeTime);
        }
        if (context.arrivalTime !== undefined) {
          facts.arrival_time = this.minutesToTimeString(context.arrivalTime);
        }
        return {
          text: this.explainTimeWindowConflict(node, context),
          facts,
          suggestions: [
            '提前出发',
            '调整其他节点顺序',
            '移除该节点或改为"想去"',
          ],
        };

      case DropReasonCode.INSUFFICIENT_TOTAL_TIME:
        if (context.dayEnd !== undefined) {
          facts.day_end = this.minutesToTimeString(context.dayEnd);
        }
        return {
          text: `行程总时长超出可用时间（日界 ${this.minutesToTimeString(context.dayEnd || 0)}），无法安排 ${node.name}。`,
          facts,
          suggestions: [
            '延长日界（晚点结束）',
            '减少其他节点的停留时间',
            '移除部分低优先级节点',
          ],
        };

      case DropReasonCode.HIGH_WAIT_TIME:
        if (context.waitMinutes !== undefined) {
          facts.wait_minutes = context.waitMinutes;
        }
        return {
          text: `到达 ${node.name} 需要等待 ${context.waitMinutes || 0} 分钟，等待时间过长导致性价比低。`,
          facts,
          suggestions: [
            '调整节点顺序，将该节点后置',
            '移除该节点',
          ],
        };

      case DropReasonCode.LOW_PRIORITY_NOT_WORTH:
        return {
          text: `${node.name} 优先级较低，且绕路成本过高，在时间紧张时被自动舍弃。`,
          facts,
          suggestions: [
            '提高该节点优先级',
            '延长可用时间',
            '移除其他低优先级节点',
          ],
        };

      case DropReasonCode.HARD_NODE_PROTECTION:
        if (context.hardNodeCount !== undefined) {
          facts.hard_node_count = context.hardNodeCount;
        }
        return {
          text: `为保证 ${context.hardNodeCount || 0} 个必去点可行，系统自动舍弃了 ${node.name}。`,
          facts,
          suggestions: [
            '将部分必去点改为"想去"',
            '延长可用时间',
            '分多天安排',
          ],
        };

      case DropReasonCode.ROBUST_TIME_INFEASIBLE:
        return {
          text: `虽然理想时间可以到达 ${node.name}，但考虑交通缓冲（堵车、找路）后不可行，系统已按保守时间重新规划。`,
          facts: {
            ...facts,
            buffer_factor: '1.2',
            fixed_buffer: '15分钟',
          },
          suggestions: [
            '提前出发',
            '减少交通缓冲（不推荐）',
            '移除该节点',
          ],
        };

      case DropReasonCode.EARLY_DEPARTURE_CONFLICT:
        if (context.requiredDeparture !== undefined) {
          facts.required_departure = this.minutesToTimeString(context.requiredDeparture);
        }
        return {
          text: `${node.name} 要求 ${this.minutesToTimeString(context.requiredDeparture || 0)} 前入场，但用户设置的最早出发时间为 ${this.minutesToTimeString(context.arrivalTime || 0)}，无法满足。`,
          facts,
          suggestions: [
            '提前出发时间',
            '调整节点顺序',
            '移除该节点或改为"想去"',
            '改天安排',
          ],
        };

      case DropReasonCode.CLOSED_DAY:
        return {
          text: `${node.name} 在行程日期闭馆/停业，无法访问。`,
          facts,
          suggestions: [
            '更改行程日期',
            '移除该节点',
          ],
        };

      default:
        return {
          text: `由于时间或约束冲突，${node.name} 无法被安排。`,
          facts,
        };
    }
  }

  /**
   * 解释时间窗冲突
   */
  private explainTimeWindowConflict(
    node: PlanNode,
    context: {
      arrivalTime?: number;
      closeTime?: number;
      slackMinutes?: number;
    }
  ): string {
    if (context.closeTime !== undefined && context.arrivalTime !== undefined) {
      const closeTimeStr = this.minutesToTimeString(context.closeTime);
      const arrivalTimeStr = this.minutesToTimeString(context.arrivalTime);
      
      if (context.arrivalTime > context.closeTime) {
        return `到达 ${node.name} 的时间（${arrivalTimeStr}）晚于关门时间（${closeTimeStr}），无法访问。`;
      }
    }

    if (node.time_windows && node.time_windows.length > 0) {
      const windows = node.time_windows.map((w) => `${w[0]}-${w[1]}`).join('、');
      return `到达 ${node.name} 的时间无法落在任何营业时段内（${windows}）。`;
    }

    return `到达 ${node.name} 的时间超出可用时间窗。`;
  }

  /**
   * 生成反直觉路径解释
   */
  generatePathExplanation(
    fromNode: PlanNode,
    toNode: PlanNode,
    skippedNode: PlanNode,
    reason: string
  ): string {
    return `虽然 ${skippedNode.name} 更近，但为了${reason}，建议先去 ${toNode.name} 再回头去 ${skippedNode.name}。`;
  }

  /**
   * 将分钟数转换为时间字符串 (HH:mm)
   */
  private minutesToTimeString(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }
}

