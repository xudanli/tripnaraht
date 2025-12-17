// src/itinerary-optimization/services/enhanced-vrptw-optimizer.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  PlanRequest,
  PlanNode,
  OptimizationResult,
  RouteNode,
  DroppedNode,
  RobustTimeMatrix,
  DropReasonCode,
  TimelineEvent,
} from '../interfaces/plan-request.interface';
import { RobustTimeMatrixService } from './robust-time-matrix.service';
import { ExplanationService } from './explanation.service';

/**
 * 增强型 VRPTW 求解器
 * 
 * 支持：
 * - 软硬节点（Hard/Soft Nodes）
 * - 多时间窗（Multi-Interval Windows）
 * - 互斥组（Disjunction Groups）
 * - 午餐/休息时间块（Lunch Break）
 * - 等待成本优化（Wait Time Cost）
 * - 可解释输出（Diagnostics）
 */
@Injectable()
export class EnhancedVRPTWOptimizerService {
  private readonly logger = new Logger(EnhancedVRPTWOptimizerService.name);

  constructor(
    private robustTimeMatrixService: RobustTimeMatrixService,
    private explanationService: ExplanationService
  ) {}

  /**
   * 求解单日规划
   */
  async solve(request: PlanRequest): Promise<OptimizationResult> {
    this.logger.debug(`开始求解单日规划：${request.nodes.length} 个节点`);

    // 0. 应用 pacing 偏好映射
    const adjustedRequest = this.applyPacingPreference(request);

    // 1. 预处理：展开多时间窗为虚拟节点
    const { expandedNodes, virtualNodeMap } = this.expandMultiTimeWindows(adjustedRequest.nodes);

    // 1.1 检查早起限制
    const earlyDepartureCheck = this.checkEarlyDepartureConstraints(
      adjustedRequest,
      expandedNodes
    );
    if (!earlyDepartureCheck.feasible) {
      return this.createInfeasibleResult(
        earlyDepartureCheck.reason || '早起限制冲突',
        adjustedRequest,
        expandedNodes
      );
    }

    // 2. 计算鲁棒时间矩阵
    const transportPolicy = adjustedRequest.transport_policy
      ? {
          ...adjustedRequest.transport_policy,
          switch_cost_min: adjustedRequest.transport_policy.switch_cost_min
            ? Object.fromEntries(
                Object.entries(adjustedRequest.transport_policy.switch_cost_min).filter(
                  ([_, v]) => v !== undefined
                ) as [string, number][]
              ) as Record<string, number>
            : undefined,
        }
      : undefined;
    const timeMatrix = await this.robustTimeMatrixService.computeRobustTimeMatrix(
      expandedNodes,
      transportPolicy
    );

    // 3. 构建互斥组
    const disjunctionGroups = this.buildDisjunctionGroups(expandedNodes);

    // 4. 求解
    const solution = await this.solveWithHeuristic(
      adjustedRequest,
      expandedNodes,
      timeMatrix,
      disjunctionGroups
    );

    // 5. 后处理：合并虚拟节点，生成最终结果
    return this.postProcess(
      adjustedRequest,
      solution,
      expandedNodes,
      virtualNodeMap,
      timeMatrix
    );
  }

  /**
   * 应用 pacing 偏好映射
   */
  private applyPacingPreference(request: PlanRequest): PlanRequest {
    const pacing = request.pacing || 'normal';
    const pacingConfig = this.getPacingConfig(pacing);

    return {
      ...request,
      transport_policy: {
        ...request.transport_policy,
        buffer_factor: request.transport_policy?.buffer_factor ?? pacingConfig.buffer_factor,
        fixed_buffer_min: request.transport_policy?.fixed_buffer_min ?? pacingConfig.fixed_buffer,
      },
      objective_weights: {
        ...request.objective_weights,
        wait: request.objective_weights?.wait ?? pacingConfig.wait_weight,
        travel: request.objective_weights?.travel ?? 1.0,
      },
    };
  }

  /**
   * 获取 pacing 配置
   */
  private getPacingConfig(pacing: 'relaxed' | 'normal' | 'intense'): {
    buffer_factor: number;
    fixed_buffer: number;
    wait_weight: number;
    density_weight: number;
  } {
    switch (pacing) {
      case 'relaxed':
        return {
          buffer_factor: 1.3,
          fixed_buffer: 20,
          wait_weight: 1.8,
          density_weight: 1.5,
        };
      case 'intense':
        return {
          buffer_factor: 1.1,
          fixed_buffer: 10,
          wait_weight: 1.2,
          density_weight: 0.7,
        };
      case 'normal':
      default:
        return {
          buffer_factor: 1.2,
          fixed_buffer: 15,
          wait_weight: 1.5,
          density_weight: 1.0,
        };
    }
  }

  /**
   * 检查早起限制
   */
  private checkEarlyDepartureConstraints(
    request: PlanRequest,
    nodes: PlanNode[]
  ): {
    feasible: boolean;
    reason?: string;
    conflictingNode?: PlanNode;
  } {
    const earliestFirstStop = request.lifestyle_policy?.earliest_first_stop;
    if (!earliestFirstStop) {
      return { feasible: true };
    }

    const earliestDeparture = this.parseTimeToMinutes(earliestFirstStop);

    // 检查硬节点是否有早起限制冲突
    const hardNodes = nodes.filter((n) => n.constraints?.is_hard_node);
    for (const node of hardNodes) {
      if (node.time_windows && node.time_windows.length > 0) {
        // 检查最早时间窗
        const earliestWindow = node.time_windows
          .map((w) => this.parseTimeToMinutes(w[0]))
          .sort((a, b) => a - b)[0];

        // 如果节点要求的时间早于最早出发时间，且是硬节点，则不可行
        if (earliestWindow < earliestDeparture) {
          return {
            feasible: false,
            reason: `硬节点 ${node.name} 要求 ${this.minutesToTimeString(earliestWindow)} 前入场，但最早出发时间为 ${this.minutesToTimeString(earliestDeparture)}`,
            conflictingNode: node,
          };
        }
      }
    }

    return { feasible: true };
  }

  /**
   * 创建不可行结果
   */
  private createInfeasibleResult(
    reason: string,
    request: PlanRequest,
    nodes: PlanNode[]
  ): OptimizationResult {
    const hardNodes = nodes.filter((n) => n.constraints?.is_hard_node);

    return {
      status: 'INFEASIBLE',
      summary: {
        total_travel_min: 0,
        total_wait_min: 0,
        total_service_min: 0,
        total_day_min: 0,
        dropped_count: nodes.length,
        robustness_score: 0,
      },
      route: [],
      dropped: hardNodes.map((node) => ({
        node_id: node.id,
        name: node.name,
        reason_code: DropReasonCode.EARLY_DEPARTURE_CONFLICT,
        penalty: 0,
        explanation: this.explanationService.generateDropExplanation(
          node,
          DropReasonCode.EARLY_DEPARTURE_CONFLICT,
          {
            requiredDeparture: node.time_windows?.[0]
              ? this.parseTimeToMinutes(node.time_windows[0][0])
              : undefined,
            arrivalTime: request.lifestyle_policy?.earliest_first_stop
              ? this.parseTimeToMinutes(request.lifestyle_policy.earliest_first_stop)
              : undefined,
          }
        ),
      })),
      diagnostics: {
        assumptions: {
          buffer_factor: request.transport_policy?.buffer_factor ?? 1.2,
          fixed_buffer_min: request.transport_policy?.fixed_buffer_min ?? 15,
        },
      },
    };
  }

  /**
   * 展开多时间窗为虚拟节点
   */
  private expandMultiTimeWindows(nodes: PlanNode[]): {
    expandedNodes: PlanNode[];
    virtualNodeMap: Map<number, number[]>; // origin_id -> [virtual_node_ids]
  } {
    const expandedNodes: PlanNode[] = [];
    const virtualNodeMap = new Map<number, number[]>();

    for (const node of nodes) {
      if (!node.time_windows || node.time_windows.length === 0) {
        // 没有时间窗，直接添加
        expandedNodes.push(node);
        continue;
      }

      if (node.time_windows.length === 1) {
        // 单个时间窗，直接添加
        expandedNodes.push(node);
        continue;
      }

      // 多个时间窗，创建虚拟节点
      const virtualIds: number[] = [];
      for (let i = 0; i < node.time_windows.length; i++) {
        const virtualNode: PlanNode = {
          ...node,
          id: node.id * 1000 + i, // 虚拟节点 ID
          name: `${node.name} (窗口${i + 1})`,
          time_windows: [node.time_windows[i]], // 只保留一个时间窗
          meta: {
            ...node.meta,
            origin_id: node.id,
            disjunction_group_id: node.id, // 同一原始节点的虚拟节点在同一互斥组
          },
        };
        expandedNodes.push(virtualNode);
        virtualIds.push(virtualNode.id);
      }

      virtualNodeMap.set(node.id, virtualIds);
    }

    return { expandedNodes, virtualNodeMap };
  }

  /**
   * 构建互斥组
   */
  private buildDisjunctionGroups(nodes: PlanNode[]): Map<number, number[]> {
    const groups = new Map<number, number[]>();

    for (const node of nodes) {
      const groupId = node.meta?.disjunction_group_id;
      if (groupId !== undefined) {
        if (!groups.has(groupId)) {
          groups.set(groupId, []);
        }
        groups.get(groupId)!.push(node.id);
      }
    }

    return groups;
  }

  /**
   * 使用启发式算法求解
   */
  private async solveWithHeuristic(
    request: PlanRequest,
    nodes: PlanNode[],
    timeMatrix: RobustTimeMatrix,
    disjunctionGroups: Map<number, number[]>
  ): Promise<{
    route: number[];
    dropped: number[];
    waitTimes: number[];
    arrivalTimes: number[]; // 分钟偏移（从 day_start 开始）
    timeMatrix: RobustTimeMatrix;
  }> {
    // 实现启发式算法（贪心 + 局部搜索）
    const solution = await this.greedyConstructionWithDrops(
      request,
      nodes,
      timeMatrix,
      disjunctionGroups
    );
    return { ...solution, timeMatrix };
  }

  /**
   * 贪心构造（支持丢弃软节点）
   */
  private greedyConstructionWithDrops(
    request: PlanRequest,
    nodes: PlanNode[],
    timeMatrix: RobustTimeMatrix,
    disjunctionGroups: Map<number, number[]>
  ): {
    route: number[];
    dropped: number[];
    waitTimes: number[];
    arrivalTimes: number[];
  } {
    const route: number[] = [];
    const dropped: number[] = [];
    const waitTimes: number[] = [];
    const arrivalTimes: number[] = [];

    // 解析日界
    const dayStart = this.parseTimeToMinutes(request.day_boundary.start);
    const dayEnd = this.parseTimeToMinutes(request.day_boundary.end);

    // 从起点开始
    let currentTime = dayStart;
    const visited = new Set<number>();
    const visitedGroups = new Set<number>(); // 已访问的互斥组

    // 硬节点必须访问
    const hardNodes = nodes.filter((n) => n.constraints?.is_hard_node);
    const softNodes = nodes.filter((n) => !n.constraints?.is_hard_node);

    // 先处理硬节点
    for (const hardNode of hardNodes) {
      if (this.canVisitNode(hardNode, currentTime, dayEnd, timeMatrix, route, nodes)) {
        const result = this.visitNode(
          hardNode,
          currentTime,
          timeMatrix,
          route,
          nodes,
          arrivalTimes,
          waitTimes
        );
        currentTime = result.departureTime;
        visited.add(hardNode.id);
      } else {
        // 硬节点无法访问，返回不可行
        this.logger.warn(`硬节点 ${hardNode.name} 无法访问，求解不可行`);
        return {
          route: [],
          dropped: nodes.map((n) => n.id),
          waitTimes: [],
          arrivalTimes: [],
        };
      }
    }

    // 处理午餐时间块（如果启用）
    if (request.lifestyle_policy?.lunch_break?.enabled) {
      const lunchBreak = request.lifestyle_policy.lunch_break;
      const lunchWindowStart = this.parseTimeToMinutes(lunchBreak.window[0]);
      const lunchWindowEnd = this.parseTimeToMinutes(lunchBreak.window[1]);
      const lunchDuration = lunchBreak.duration_min;

      // 检查是否需要插入午餐时间块
      if (currentTime < lunchWindowEnd && currentTime + lunchDuration <= lunchWindowEnd) {
        const lunchStart = Math.max(currentTime, lunchWindowStart);
        const lunchEnd = lunchStart + lunchDuration;

        if (lunchEnd <= lunchWindowEnd) {
          // 插入午餐时间块
          const lunchNode: PlanNode = {
            id: -1, // 虚拟午餐节点
            name: '午餐时间',
            type: 'break',
            service_duration_min: lunchDuration,
            time_windows: [[lunchBreak.window[0], lunchBreak.window[1]]],
            geo: route.length > 0
              ? nodes.find((n) => n.id === route[route.length - 1])?.geo ?? { lat: 0, lng: 0 }
              : { lat: 0, lng: 0 },
          };

          const result = this.visitNode(
            lunchNode,
            lunchStart,
            timeMatrix,
            route,
            nodes,
            arrivalTimes,
            waitTimes
          );
          currentTime = result.departureTime;
        }
      }
    }

    // 处理软节点（贪心选择）
    const remainingSoftNodes = softNodes.filter((n) => !visited.has(n.id));

    while (remainingSoftNodes.length > 0 && currentTime < dayEnd) {
      let bestNode: PlanNode | null = null;
      let bestScore = -Infinity;
      let bestArrivalTime = currentTime;

      for (const node of remainingSoftNodes) {
        // 检查互斥组约束
        const groupId = node.meta?.disjunction_group_id;
        if (groupId !== undefined && visitedGroups.has(groupId)) {
          continue; // 该组已访问过
        }

        // 检查是否可以访问
        if (!this.canVisitNode(node, currentTime, dayEnd, timeMatrix, route, nodes)) {
          continue;
        }

        // 计算访问该节点的分数
        const travelTime = route.length > 0
          ? timeMatrix.matrix[route[route.length - 1]][node.id]
          : 0;
        const arrivalTime = currentTime + travelTime;
        const waitTime = this.calculateWaitTime(node, arrivalTime);
        const score = this.calculateNodeScore(
          node,
          arrivalTime,
          waitTime,
          travelTime,
          request
        );

        if (score > bestScore) {
          bestNode = node;
          bestScore = score;
          bestArrivalTime = arrivalTime;
        }
      }

      if (bestNode) {
        // 访问最佳节点
        const result = this.visitNode(
          bestNode,
          bestArrivalTime,
          timeMatrix,
          route,
          nodes,
          arrivalTimes,
          waitTimes
        );
        currentTime = result.departureTime;
        visited.add(bestNode.id);

        // 标记互斥组
        const groupId = bestNode.meta?.disjunction_group_id;
        if (groupId !== undefined) {
          visitedGroups.add(groupId);
        }

        // 从剩余列表中移除
        const index = remainingSoftNodes.indexOf(bestNode);
        if (index > -1) {
          remainingSoftNodes.splice(index, 1);
        }
      } else {
        // 无法访问任何节点，停止
        break;
      }
    }

    // 标记未访问的软节点为丢弃
    for (const node of remainingSoftNodes) {
      dropped.push(node.id);
    }

    return {
      route,
      dropped,
      waitTimes,
      arrivalTimes,
    };
  }

  /**
   * 检查是否可以访问节点
   */
  private canVisitNode(
    node: PlanNode,
    currentTime: number,
    dayEnd: number,
    timeMatrix: RobustTimeMatrix,
    route: number[],
    nodes: PlanNode[]
  ): boolean {
    // 计算到达时间
    const travelTime = route.length > 0
      ? timeMatrix.matrix[route[route.length - 1]][node.id]
      : 0;
    const arrivalTime = currentTime + travelTime;

    // 检查时间窗
    if (node.time_windows && node.time_windows.length > 0) {
      const window = node.time_windows[0];
      const windowStart = this.parseTimeToMinutes(window[0]);
      const windowEnd = this.parseTimeToMinutes(window[1]);

      if (arrivalTime > windowEnd) {
        return false; // 晚于时间窗
      }
    }

    // 检查服务时长
    const serviceTime = node.service_duration_min;
    const departureTime = Math.max(
      arrivalTime,
      node.time_windows?.[0] ? this.parseTimeToMinutes(node.time_windows[0][0]) : arrivalTime
    ) + serviceTime;

    if (departureTime > dayEnd) {
      return false; // 超过日界
    }

    return true;
  }

  /**
   * 访问节点
   */
  private visitNode(
    node: PlanNode,
    arrivalTime: number,
    timeMatrix: RobustTimeMatrix,
    route: number[],
    nodes: PlanNode[],
    arrivalTimes: number[],
    waitTimes: number[]
  ): {
    departureTime: number;
  } {
    route.push(node.id);
    arrivalTimes.push(arrivalTime);

    // 计算等待时间
    const waitTime = this.calculateWaitTime(node, arrivalTime);
    waitTimes.push(waitTime);

    // 计算离开时间
    const actualStartTime = arrivalTime + waitTime;
    const departureTime = actualStartTime + node.service_duration_min;

    return { departureTime };
  }

  /**
   * 计算到达时间
   */
  private calculateArrivalTime(
    node: PlanNode,
    currentTime: number,
    timeMatrix: RobustTimeMatrix,
    route: number[],
    nodes: PlanNode[]
  ): number {
    const travelTime = route.length > 0
      ? timeMatrix.matrix[route[route.length - 1]][node.id]
      : 0;
    return currentTime + travelTime;
  }

  /**
   * 计算等待时间
   */
  private calculateWaitTime(node: PlanNode, arrivalTime: number): number {
    if (!node.time_windows || node.time_windows.length === 0) {
      return 0;
    }

    const windowStart = this.parseTimeToMinutes(node.time_windows[0][0]);
    if (arrivalTime < windowStart) {
      return windowStart - arrivalTime;
    }
    return 0;
  }

  /**
   * 计算节点分数
   */
  private calculateNodeScore(
    node: PlanNode,
    arrivalTime: number,
    waitTime: number,
    travelTime: number,
    request: PlanRequest
  ): number {
    const weights = request.objective_weights || {};
    const travelWeight = weights.travel ?? 1.0;
    const waitWeight = weights.wait ?? 1.5;
    const rewardWeight = weights.reward ?? 1.0;

    // 奖励分数
    const reward = node.constraints?.reward ?? 0;

    // 惩罚分数（等待时间、旅行时间）
    const penalty = travelTime * travelWeight + waitTime * waitWeight;

    return reward * rewardWeight - penalty;
  }

  /**
   * 解析时间为分钟（从 00:00 开始）
   */
  private parseTimeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * 后处理：合并虚拟节点，生成最终结果
   */
  private postProcess(
    request: PlanRequest,
    solution: {
      route: number[];
      dropped: number[];
      waitTimes: number[];
      arrivalTimes: number[];
      timeMatrix: RobustTimeMatrix;
    },
    expandedNodes: PlanNode[],
    virtualNodeMap: Map<number, number[]>,
    timeMatrix: RobustTimeMatrix
  ): OptimizationResult {
    const nodeMap = new Map(expandedNodes.map((n) => [n.id, n]));
    const dayStart = this.parseTimeToMinutes(request.day_boundary.start);
    const dayEnd = this.parseTimeToMinutes(request.day_boundary.end);

    // 1. 合并虚拟节点，生成 RouteNode 列表
    const routeNodes: RouteNode[] = [];
    let totalTravel = 0;
    let totalWait = 0;
    let totalService = 0;

    for (let i = 0; i < solution.route.length; i++) {
      const nodeId = solution.route[i];
      const node = nodeMap.get(nodeId);
      if (!node) continue;

      const arrivalTime = solution.arrivalTimes[i];
      const waitTime = solution.waitTimes[i];
      const serviceTime = node.service_duration_min;
      const startService = arrivalTime + waitTime;
      const endService = startService + serviceTime;

      // 计算从前一个节点的旅行时间
      const travelTime = i > 0
        ? this.calculateTravelTimeBetweenNodes(
            solution.route[i - 1],
            nodeId,
            expandedNodes,
            request,
            timeMatrix
          )
        : 0;

      totalTravel += travelTime;
      totalWait += waitTime;
      totalService += serviceTime;

      // 获取原始节点 ID（如果是虚拟节点）
      const originId = node.meta?.origin_id ?? node.id;

      routeNodes.push({
        seq: i + 1,
        node_id: nodeId,
        origin_id: originId !== nodeId ? originId : undefined,
        name: node.name,
        arrival: this.minutesToTimeString(arrivalTime),
        start_service: this.minutesToTimeString(startService),
        end_service: this.minutesToTimeString(endService),
        wait_min: waitTime,
        travel_min_from_prev: travelTime,
      });
    }

    // 2. 生成 DroppedNode 列表
    const droppedNodes: DroppedNode[] = [];
    for (const droppedId of solution.dropped) {
      const node = nodeMap.get(droppedId);
      if (!node) continue;

      // 判断丢弃原因码
      const reasonCode = this.determineDropReasonCode(
        node,
        solution,
        request,
        expandedNodes,
        timeMatrix
      );

      // 计算惩罚值
      const penalty = this.calculateDropPenalty(node);

      // 生成解释
      const context = this.buildDropContext(node, solution, request, expandedNodes, timeMatrix);
      const explanation = this.explanationService.generateDropExplanation(
        node,
        reasonCode,
        context
      );

      droppedNodes.push({
        node_id: node.meta?.origin_id ?? node.id,
        name: node.name,
        reason_code: reasonCode,
        reason: reasonCode, // 兼容旧字段
        penalty,
        explanation,
      });
    }

    // 3. 计算摘要信息
    const totalDay = totalTravel + totalWait + totalService;
    const robustnessScore = this.calculateRobustnessScore(
      routeNodes,
      request,
      dayEnd
    );

    // 4. 生成时间轴事件（包含等待、午餐等显式事件）
    const timeline = this.generateTimeline(routeNodes, request, solution);

    // 5. 生成诊断信息
    const diagnostics = this.generateDiagnostics(
      routeNodes,
      request,
      expandedNodes,
      nodeMap
    );

    // 6. 生成稳健度元数据
    const robustness = this.generateRobustnessMetadata(
      routeNodes,
      request,
      timeMatrix,
      dayEnd
    );

    // 7. 判断状态
    const hardNodes = expandedNodes.filter((n) => n.constraints?.is_hard_node);
    const allHardNodesVisited = hardNodes.every((n) => solution.route.includes(n.id));
    const status = !allHardNodesVisited
      ? 'INFEASIBLE'
      : solution.route.length > 0
      ? 'FEASIBLE'
      : 'INFEASIBLE';

    return {
      status,
      summary: {
        total_travel_min: totalTravel,
        total_wait_min: totalWait,
        total_service_min: totalService,
        total_day_min: totalDay,
        dropped_count: droppedNodes.length,
        robustness_score: robustnessScore,
      },
      route: routeNodes,
      dropped: droppedNodes,
      timeline,
      diagnostics,
      robustness,
    };
  }

  /**
   * 生成时间轴事件
   */
  private generateTimeline(
    routeNodes: RouteNode[],
    request: PlanRequest,
    solution: {
      route: number[];
      dropped: number[];
      waitTimes: number[];
      arrivalTimes: number[];
      timeMatrix: RobustTimeMatrix;
    }
  ): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    const dayStart = this.parseTimeToMinutes(request.day_boundary.start);

    for (let i = 0; i < routeNodes.length; i++) {
      const node = routeNodes[i];
      const arrivalMinutes = this.parseTimeToMinutes(node.arrival);
      const startServiceMinutes = this.parseTimeToMinutes(node.start_service);
      const endServiceMinutes = this.parseTimeToMinutes(node.end_service);

      // 添加节点事件
      events.push({
        type: 'NODE',
        start: node.arrival,
        end: node.end_service,
        duration_min: endServiceMinutes - arrivalMinutes,
        description: node.name,
        node_id: node.node_id,
      });

      // 如果等待时间 > 15 分钟，添加显式等待事件
      if (node.wait_min > 15) {
        events.push({
          type: 'WAIT',
          start: node.arrival,
          end: node.start_service,
          duration_min: node.wait_min,
          description: `等待 ${node.wait_min} 分钟`,
          node_id: node.node_id,
        });
      }

      // 添加旅行事件（到下一个节点）
      if (i < routeNodes.length - 1) {
        const nextNode = routeNodes[i + 1];
        events.push({
          type: 'TRAVEL',
          start: node.end_service,
          end: nextNode.arrival,
          duration_min: node.travel_min_from_prev,
          description: `前往 ${nextNode.name}`,
        });
      }
    }

    // 检查是否有午餐事件
    const lunchBreak = request.lifestyle_policy?.lunch_break;
    if (lunchBreak?.enabled) {
      const lunchWindowStart = this.parseTimeToMinutes(lunchBreak.window[0]);
      const lunchWindowEnd = this.parseTimeToMinutes(lunchBreak.window[1]);
      
      // 查找午餐时间块
      for (const event of events) {
        if (event.type === 'NODE' && event.description === '午餐时间') {
          events.push({
            type: 'LUNCH',
            start: event.start,
            end: event.end,
            duration_min: event.duration_min,
            description: '午餐时间',
          });
          break;
        }
      }
    }

    return events.sort((a, b) => 
      this.parseTimeToMinutes(a.start) - this.parseTimeToMinutes(b.start)
    );
  }

  /**
   * 生成稳健度元数据
   */
  private generateRobustnessMetadata(
    routeNodes: RouteNode[],
    request: PlanRequest,
    timeMatrix: RobustTimeMatrix,
    dayEnd: number
  ): OptimizationResult['robustness'] {
    // 计算总缓冲时间
    const bufferFactor = request.transport_policy?.buffer_factor ?? 1.2;
    const fixedBuffer = request.transport_policy?.fixed_buffer_min ?? 15;
    let totalBuffer = 0;

    for (let i = 0; i < routeNodes.length - 1; i++) {
      const travelTime = routeNodes[i].travel_min_from_prev;
      const apiTime = travelTime / bufferFactor; // 反向计算 API 时间
      const buffer = travelTime - apiTime + fixedBuffer;
      totalBuffer += buffer;
    }

    // 计算总等待时间
    const totalWait = routeNodes.reduce((sum, node) => sum + node.wait_min, 0);

    // 计算最紧张的 3 个节点
    const slackNodes = routeNodes.map((node) => {
      const endService = this.parseTimeToMinutes(node.end_service);
      const slack = dayEnd - endService;
      return {
        node_id: node.node_id,
        slack_min: slack,
      };
    }).sort((a, b) => a.slack_min - b.slack_min).slice(0, 3);

    // 计算风险等级
    const avgSlack = slackNodes.length > 0
      ? slackNodes.reduce((sum, n) => sum + n.slack_min, 0) / slackNodes.length
      : Infinity;
    const riskLevel: 'low' | 'medium' | 'high' =
      avgSlack < 30 ? 'high' :
      avgSlack < 60 ? 'medium' :
      'low';

    return {
      total_buffer_minutes: Math.round(totalBuffer),
      total_wait_minutes: totalWait,
      top3_min_slack_nodes: slackNodes,
      risk_level: riskLevel,
    };
  }

  /**
   * 计算两个节点之间的旅行时间
   */
  private calculateTravelTimeBetweenNodes(
    fromId: number,
    toId: number,
    nodes: PlanNode[],
    request: PlanRequest,
    timeMatrix?: RobustTimeMatrix
  ): number {
    // 如果提供了时间矩阵，使用它
    if (timeMatrix) {
      const fromIndex = nodes.findIndex((n) => n.id === fromId);
      const toIndex = nodes.findIndex((n) => n.id === toId);
      if (fromIndex >= 0 && toIndex >= 0) {
        return timeMatrix.matrix[fromIndex][toIndex];
      }
    }

    // 降级：使用距离估算
    const fromNode = nodes.find((n) => n.id === fromId);
    const toNode = nodes.find((n) => n.id === toId);

    if (!fromNode || !toNode) {
      return 0;
    }

    const distance = this.calculateDistance(fromNode.geo, toNode.geo);
    return Math.round((distance / 1000 / 30) * 60); // 30 km/h 估算
  }

  /**
   * 计算两点间距离（米）
   */
  private calculateDistance(
    point1: { lat: number; lng: number },
    point2: { lat: number; lng: number }
  ): number {
    const R = 6371000;
    const dLat = this.toRadians(point2.lat - point1.lat);
    const dLng = this.toRadians(point2.lng - point1.lng);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(point1.lat)) *
        Math.cos(this.toRadians(point2.lat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * 判断丢弃原因码
   */
  private determineDropReasonCode(
    node: PlanNode,
    solution: {
      route: number[];
      dropped: number[];
      waitTimes: number[];
      arrivalTimes: number[];
    },
    request: PlanRequest,
    nodes: PlanNode[],
    timeMatrix: RobustTimeMatrix
  ): DropReasonCode {
    // 检查时间窗冲突
    if (node.time_windows && node.time_windows.length > 0) {
      const dayEnd = this.parseTimeToMinutes(request.day_boundary.end);
      const lastArrival = solution.arrivalTimes[solution.arrivalTimes.length - 1] || 0;
      const travelTime = solution.route.length > 0
        ? 30 // 估算旅行时间
        : 0;
      const arrivalTime = lastArrival + travelTime;

      const windowEnd = this.parseTimeToMinutes(node.time_windows[0][1]);
      if (arrivalTime > windowEnd || arrivalTime + node.service_duration_min > dayEnd) {
        return DropReasonCode.TIME_WINDOW_CONFLICT;
      }
    }

    // 检查鲁棒时间不可行
    if (solution.route.length > 0) {
      const lastNodeId = solution.route[solution.route.length - 1];
      const lastNodeIndex = nodes.findIndex((n) => n.id === lastNodeId);
      const nodeIndex = nodes.findIndex((n) => n.id === node.id);
      
      if (lastNodeIndex >= 0 && nodeIndex >= 0) {
        const idealTime = timeMatrix.components?.api?.[lastNodeIndex]?.[nodeIndex] ?? 0;
        const robustTime = timeMatrix.matrix[lastNodeIndex][nodeIndex];
        
        if (idealTime < robustTime && idealTime > 0) {
          // 理想时间可行但鲁棒时间不可行
          return DropReasonCode.ROBUST_TIME_INFEASIBLE;
        }
      }
    }

    // 检查是否为硬节点保护
    const hardNodes = nodes.filter((n) => n.constraints?.is_hard_node);
    if (hardNodes.length > 0 && !node.constraints?.is_hard_node) {
      return DropReasonCode.HARD_NODE_PROTECTION;
    }

    // 检查等待时间过长
    if (node.time_windows && node.time_windows.length > 0) {
      const windowStart = this.parseTimeToMinutes(node.time_windows[0][0]);
      const lastArrival = solution.arrivalTimes[solution.arrivalTimes.length - 1] || 0;
      const travelTime = solution.route.length > 0
        ? (timeMatrix.components?.api?.[solution.route.length - 1]?.[nodes.findIndex((n) => n.id === node.id)] ?? 30)
        : 0;
      const arrivalTime = lastArrival + travelTime;
      const waitTime = Math.max(0, windowStart - arrivalTime);
      
      if (waitTime > 15) {
        return DropReasonCode.HIGH_WAIT_TIME;
      }
    }

    // 检查优先级
    const priority = node.constraints?.priority_level ?? 5;
    if (priority >= 4) {
      return DropReasonCode.LOW_PRIORITY_NOT_WORTH;
    }

    return DropReasonCode.INSUFFICIENT_TOTAL_TIME;
  }

  /**
   * 构建丢弃上下文
   */
  private buildDropContext(
    node: PlanNode,
    solution: {
      route: number[];
      dropped: number[];
      waitTimes: number[];
      arrivalTimes: number[];
    },
    request: PlanRequest,
    nodes: PlanNode[],
    timeMatrix: RobustTimeMatrix
  ): Parameters<ExplanationService['generateDropExplanation']>[2] {
    const dayEnd = this.parseTimeToMinutes(request.day_boundary.end);
    const lastArrival = solution.arrivalTimes[solution.arrivalTimes.length - 1] || 0;
    const lastNodeId = solution.route.length > 0 ? solution.route[solution.route.length - 1] : undefined;
    const lastNodeIndex = lastNodeId !== undefined ? nodes.findIndex((n) => n.id === lastNodeId) : -1;
    const nodeIndex = nodes.findIndex((n) => n.id === node.id);
    
    const travelTime = lastNodeIndex >= 0 && nodeIndex >= 0
      ? timeMatrix.matrix[lastNodeIndex][nodeIndex]
      : 30;
    const arrivalTime = lastArrival + travelTime;

    const context: Parameters<ExplanationService['generateDropExplanation']>[2] = {
      arrivalTime,
      dayEnd,
    };

    if (node.time_windows && node.time_windows.length > 0) {
      const windowEnd = this.parseTimeToMinutes(node.time_windows[0][1]);
      context.closeTime = windowEnd;
      
      const windowStart = this.parseTimeToMinutes(node.time_windows[0][0]);
      const waitTime = Math.max(0, windowStart - arrivalTime);
      if (waitTime > 0) {
        context.waitMinutes = waitTime;
      }
    }

    const hardNodes = nodes.filter((n) => n.constraints?.is_hard_node);
    if (hardNodes.length > 0) {
      context.hardNodeCount = hardNodes.length;
    }

    if (lastNodeIndex >= 0 && nodeIndex >= 0) {
      const idealTime = timeMatrix.components?.api?.[lastNodeIndex]?.[nodeIndex] ?? 0;
      const robustTime = timeMatrix.matrix[lastNodeIndex][nodeIndex];
      if (idealTime < robustTime && idealTime > 0) {
        context.robustTimeInfeasible = true;
      }
    }

    return context;
  }

  /**
   * 计算丢弃惩罚
   */
  private calculateDropPenalty(node: PlanNode): number {
    if (node.constraints?.drop_penalty !== undefined) {
      return node.constraints.drop_penalty;
    }

    // 根据优先级计算默认惩罚
    const priority = node.constraints?.priority_level ?? 5;
    const basePenalty = 1000;
    return basePenalty * (6 - priority);
  }

  /**
   * 计算稳健度分数
   */
  private calculateRobustnessScore(
    routeNodes: RouteNode[],
    request: PlanRequest,
    dayEnd: number
  ): number {
    if (routeNodes.length === 0) {
      return 0;
    }

    // 计算关键时间窗的松弛度
    let totalSlack = 0;
    let criticalCount = 0;

    for (const node of routeNodes) {
      // 这里简化处理，实际应该检查每个节点的时间窗
      const endService = this.parseTimeToMinutes(node.end_service);
      const slack = dayEnd - endService;
      totalSlack += Math.max(0, slack);
      if (slack < 30) {
        // 距离日界结束少于30分钟，视为关键
        criticalCount++;
      }
    }

    // 稳健度 = 1 - (关键节点比例) - (平均松弛度不足的比例)
    const criticalRatio = criticalCount / routeNodes.length;
    const avgSlack = totalSlack / routeNodes.length;
    const slackRatio = Math.min(1, avgSlack / 60); // 假设60分钟为理想松弛度

    return Math.max(0, Math.min(1, 1 - criticalRatio * 0.5 - (1 - slackRatio) * 0.3));
  }

  /**
   * 生成诊断信息
   */
  private generateDiagnostics(
    routeNodes: RouteNode[],
    request: PlanRequest,
    nodes: PlanNode[],
    nodeMap: Map<number, PlanNode>
  ): OptimizationResult['diagnostics'] {
    const criticalWindows: Array<{
      node_id: number;
      slack_to_close_min: number;
    }> = [];

    const dayEnd = this.parseTimeToMinutes(request.day_boundary.end);

    for (const routeNode of routeNodes) {
      const node = nodeMap.get(routeNode.node_id);
      if (!node || !node.time_windows || node.time_windows.length === 0) {
        continue;
      }

      const windowEnd = this.parseTimeToMinutes(node.time_windows[0][1]);
      const endService = this.parseTimeToMinutes(routeNode.end_service);
      const slack = windowEnd - endService;

      if (slack < 30) {
        // 距离时间窗关闭少于30分钟，视为关键
        criticalWindows.push({
          node_id: routeNode.origin_id ?? routeNode.node_id,
          slack_to_close_min: slack,
        });
      }
    }

    return {
      critical_windows: criticalWindows.length > 0 ? criticalWindows : undefined,
      assumptions: {
        buffer_factor: request.transport_policy?.buffer_factor ?? 1.2,
        fixed_buffer_min: request.transport_policy?.fixed_buffer_min ?? 15,
      },
    };
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

