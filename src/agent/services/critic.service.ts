// src/agent/services/critic.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { AgentState } from '../interfaces/agent-state.interface';
import { EventTelemetryService } from './event-telemetry.service';

/**
 * Critic Service
 * 
 * 可行性检查：时间窗、日界、午餐、鲁棒交通时间、等待显性化
 */
@Injectable()
export class CriticService {
  private readonly logger = new Logger(CriticService.name);

  constructor(private eventTelemetry?: EventTelemetryService) {}

  /**
   * 验证可行性
   */
  async validateFeasibility(state: AgentState): Promise<{
    pass: boolean;
    violations: Array<{
      type: string;
      message: string;
      node_id?: number;
      details?: any;
    }>;
    min_slack?: number;
    total_wait?: number;
  }> {
    const violations: Array<{
      type: string;
      message: string;
      node_id?: number;
      details?: any;
    }> = [];

    // 1. 检查时间窗
    const timeWindowViolations = this.checkTimeWindows(state);
    violations.push(...timeWindowViolations);

    // 2. 检查日界
    const dayBoundaryViolations = this.checkDayBoundaries(state);
    violations.push(...dayBoundaryViolations);

    // 3. 检查午餐锚点（只有在已有 schedule/timeline 时才检查）
    // 如果还没生成 schedule，不报 LUNCH_MISSING（避免过早触发 repair 循环）
    const hasSchedule = state.result.timeline && state.result.timeline.length > 0;
    if (hasSchedule) {
      const lunchViolations = this.checkLunchAnchors(state);
      violations.push(...lunchViolations);
    } else {
      this.logger.debug('Critic: 尚未生成 schedule，跳过 LUNCH_MISSING 检查');
    }

    // 4. 检查鲁棒交通时间
    const robustTimeViolations = this.checkRobustTravelTime(state);
    violations.push(...robustTimeViolations);

    // 5. 检查等待显性化
    const waitViolations = this.checkWaitVisibility(state);
    violations.push(...waitViolations);

    // 6. 硬规则：如果优化已完成但 schedule 为空，必须失败
    // 这可以避免"优化失败但 Critic 还通过"的问题
    const hasOptimizationResults = state.compute?.optimization_results?.length > 0;
    // 重用上面已声明的 hasSchedule 变量
    if (hasOptimizationResults && !hasSchedule) {
      violations.push({
        type: 'SCHEDULE_MISSING',
        message: '优化已完成但未生成 schedule，可能是优化失败',
        details: {
          optimization_results_count: state.compute?.optimization_results?.length || 0,
          timeline_length: state.result?.timeline?.length || 0,
        },
      });
      this.logger.warn('Critic: 检测到优化结果但 schedule 为空，标记为失败');
    }

    // 计算指标
    const min_slack = this.calculateMinSlack(state);
    const total_wait = this.calculateTotalWait(state);

    const result = {
      pass: violations.length === 0,
      violations,
      min_slack,
      total_wait,
    };

    // 记录 critic_result 事件
    if (this.eventTelemetry) {
      this.eventTelemetry.recordCriticResult(
        state.request_id,
        violations.map(v => `${v.type}: ${v.message}`),
        result.pass,
        result.pass ? [] : violations.map(v => v.type),
        {
          min_slack,
          total_wait,
          violation_count: violations.length,
        }
      );
    }

    return result;
  }

  /**
   * 检查时间窗
   */
  private checkTimeWindows(state: AgentState): Array<{
    type: string;
    message: string;
    node_id?: number;
    details?: any;
  }> {
    const violations: Array<{
      type: string;
      message: string;
      node_id?: number;
      details?: any;
    }> = [];

    // 检查 timeline 中的节点是否在时间窗内
    const timeline = state.result.timeline || [];
    
    for (const event of timeline) {
      if (event.type === 'NODE' && event.node_id) {
        // 这里应该检查节点的时间窗约束
        // 简化实现
      }
    }

    return violations;
  }

  /**
   * 检查日界
   */
  private checkDayBoundaries(state: AgentState): Array<{
    type: string;
    message: string;
    node_id?: number;
    details?: any;
  }> {
    const violations: Array<{
      type: string;
      message: string;
      node_id?: number;
      details?: any;
    }> = [];

    const timeline = state.result.timeline || [];
    const dayBoundary = state.trip.day_boundaries?.[0];

    if (!dayBoundary) {
      return violations;
    }

    if (timeline.length > 0) {
      const lastEvent = timeline[timeline.length - 1];
      const eventTime = lastEvent.end || lastEvent.start;
      
      if (!eventTime) {
        return violations;
      }

      const endTime = this.parseTime(eventTime);
      const dayEnd = this.parseTime(dayBoundary.end);

      if (endTime > dayEnd) {
        violations.push({
          type: 'DAY_BOUNDARY_VIOLATION',
          message: `行程结束时间 ${eventTime} 超过了日界 ${dayBoundary.end}`,
          details: { endTime: eventTime, dayEnd: dayBoundary.end },
        });
      }
    }

    return violations;
  }

  /**
   * 检查午餐锚点
   */
  private checkLunchAnchors(state: AgentState): Array<{
    type: string;
    message: string;
    node_id?: number;
    details?: any;
  }> {
    const violations: Array<{
      type: string;
      message: string;
      node_id?: number;
      details?: any;
    }> = [];

    if (!state.trip.lunch_break?.enabled) {
      return violations;
    }

    const timeline = state.result.timeline || [];
    const lunchEvents = timeline.filter(e => e.type === 'LUNCH');

    // 检查每天是否有且仅有一个午餐
    if (lunchEvents.length === 0) {
      violations.push({
        type: 'LUNCH_MISSING',
        message: '缺少午餐休息时间',
      });
    } else if (lunchEvents.length > 1) {
      violations.push({
        type: 'LUNCH_MULTIPLE',
        message: `午餐休息时间过多：${lunchEvents.length} 个`,
      });
    } else {
      // 检查午餐是否在窗口内
      const lunch = lunchEvents[0];
      if (!lunch.start || !state.trip.lunch_break.window || state.trip.lunch_break.window.length < 2) {
        return violations;
      }

      const lunchStart = this.parseTime(lunch.start);
      const windowStart = this.parseTime(state.trip.lunch_break.window[0]);
      const windowEnd = this.parseTime(state.trip.lunch_break.window[1]);

      if (lunchStart < windowStart || lunchStart > windowEnd) {
        violations.push({
          type: 'LUNCH_WINDOW_VIOLATION',
          message: `午餐时间 ${lunch.start} 不在窗口 [${state.trip.lunch_break.window[0]}, ${state.trip.lunch_break.window[1]}] 内`,
          details: { lunchTime: lunch.start, window: state.trip.lunch_break.window },
        });
      }
    }

    return violations;
  }

  /**
   * 检查鲁棒交通时间
   */
  private checkRobustTravelTime(state: AgentState): Array<{
    type: string;
    message: string;
    node_id?: number;
    details?: any;
  }> {
    const violations: Array<{
      type: string;
      message: string;
      node_id?: number;
      details?: any;
    }> = [];

    // 确保使用鲁棒时间矩阵而不是原始 API 时间
    if (state.compute.time_matrix_robust === null) {
      violations.push({
        type: 'ROBUST_TIME_MISSING',
        message: '缺少鲁棒时间矩阵',
      });
    }

    return violations;
  }

  /**
   * 检查等待显性化
   */
  private checkWaitVisibility(state: AgentState): Array<{
    type: string;
    message: string;
    node_id?: number;
    details?: any;
  }> {
    const violations: Array<{
      type: string;
      message: string;
      node_id?: number;
      details?: any;
    }> = [];

    const timeline = state.result.timeline || [];
    
    // 检查是否有超过 15 分钟的等待但没有显式显示
    for (const event of timeline) {
      if (event.type === 'NODE' && event.wait_min && event.wait_min > 15) {
        // 检查是否有对应的 WAIT 事件
        const hasWaitEvent = timeline.some(
          e => e.type === 'WAIT' && e.node_id === event.node_id
        );
        
        if (!hasWaitEvent) {
          violations.push({
            type: 'WAIT_NOT_VISIBLE',
            message: `节点 ${event.node_id} 有 ${event.wait_min} 分钟等待但未显式显示`,
            node_id: event.node_id,
            details: { wait_min: event.wait_min },
          });
        }
      }
    }

    return violations;
  }

  /**
   * 计算最小松弛时间
   */
  private calculateMinSlack(state: AgentState): number | undefined {
    // 简化实现
    return undefined;
  }

  /**
   * 计算总等待时间
   */
  private calculateTotalWait(state: AgentState): number | undefined {
    const timeline = state.result.timeline || [];
    let totalWait = 0;

    for (const event of timeline) {
      if (event.type === 'WAIT' || (event.type === 'NODE' && event.wait_min)) {
        totalWait += event.wait_min || 0;
      }
    }

    return totalWait;
  }

  /**
   * 解析时间字符串（HH:mm）为分钟数
   */
  private parseTime(timeStr: string | undefined): number {
    if (!timeStr) {
      return 0;
    }
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }
}

