// src/route-directions/services/route-direction-observability.service.ts
/**
 * RouteDirection 观测服务
 * 
 * 统一埋点（日志 + metrics）：
 * - Latency: rd_select_ms, poi_pool_query_ms, constraints_inject_ms, plan_generate_ms, neptune_repair_ms
 * - Quality: poi_pool_size, hard_constraints_hit_count, soft_constraints_hit_count, repair_action_count, selected_rd_id 分布
 * - Error: corridor_geom_invalid, poi_query_timeout, no_candidates_fallback_used
 * 
 * 验收：能用一次请求的 trace 回答"慢在哪""为什么选了这条 RD""为什么 POI pool 变小"
 */

import { Injectable, Logger } from '@nestjs/common';

export interface RouteDirectionTrace {
  requestId: string;
  startTime: number;
  endTime?: number;
  
  // Latency metrics (ms)
  latencies: {
    rdSelectMs?: number;
    poiPoolQueryMs?: number;
    constraintsInjectMs?: number;
    planGenerateMs?: number;
    neptuneRepairMs?: number;
  };
  
  // Quality metrics
  quality: {
    poiPoolSize?: number;
    hardConstraintsHitCount?: number;
    softConstraintsHitCount?: number;
    repairActionCount?: number;
    selectedRdId?: number;
    selectedRdName?: string;
  };
  
  // Error metrics
  errors: {
    corridorGeomInvalid?: boolean;
    poiQueryTimeout?: boolean;
    noCandidatesFallbackUsed?: boolean;
    errorMessages?: string[];
  };
  
  // Decision context (for explainability)
  decisionContext?: {
    countryCode?: string;
    month?: number;
    userIntent?: {
      preferences?: string[];
      pace?: string;
      riskTolerance?: string;
    };
    scoreBreakdown?: {
      tagMatch?: number;
      seasonMatch?: number;
      paceMatch?: number;
      riskMatch?: number;
      totalScore?: number;
    };
    matchedSignals?: Record<string, any>;
  };
  
  // POI pool evolution (for debugging "why POI pool shrunk")
  poiPoolEvolution?: {
    initialSize?: number;
    afterRdFilter?: number;
    afterConstraints?: number;
    finalSize?: number;
    filters?: Array<{
      stage: string;
      sizeBefore: number;
      sizeAfter: number;
      reason?: string;
    }>;
  };
}

@Injectable()
export class RouteDirectionObservabilityService {
  private readonly logger = new Logger(RouteDirectionObservabilityService.name);
  
  // 内存存储 traces（生产环境建议使用 Redis 或外部存储）
  private readonly traces: Map<string, RouteDirectionTrace> = new Map();
  private readonly maxTracesInMemory = 1000;
  
  // Metrics 聚合（用于统计）
  private readonly metrics = {
    latencies: {
      rdSelectMs: [] as number[],
      poiPoolQueryMs: [] as number[],
      constraintsInjectMs: [] as number[],
      planGenerateMs: [] as number[],
      neptuneRepairMs: [] as number[],
    },
    quality: {
      poiPoolSizes: [] as number[],
      hardConstraintsHitCounts: [] as number[],
      softConstraintsHitCounts: [] as number[],
      repairActionCounts: [] as number[],
      selectedRdIds: [] as number[],
    },
    errors: {
      corridorGeomInvalid: 0,
      poiQueryTimeout: 0,
      noCandidatesFallbackUsed: 0,
    },
  };

  /**
   * 创建新的 trace
   */
  createTrace(requestId: string): RouteDirectionTrace {
    const trace: RouteDirectionTrace = {
      requestId,
      startTime: Date.now(),
      latencies: {},
      quality: {},
      errors: {},
    };
    
    this.traces.set(requestId, trace);
    
    // 限制内存中的 traces 数量
    if (this.traces.size > this.maxTracesInMemory) {
      const firstKey = this.traces.keys().next().value;
      this.traces.delete(firstKey);
    }
    
    return trace;
  }

  /**
   * 记录 RD 选择延迟
   */
  recordRdSelectLatency(requestId: string, latencyMs: number): void {
    const trace = this.traces.get(requestId);
    if (trace) {
      trace.latencies.rdSelectMs = latencyMs;
      this.metrics.latencies.rdSelectMs.push(latencyMs);
      this.logger.debug(`[TRACE ${requestId}] RD selection took ${latencyMs}ms`);
    }
  }

  /**
   * 记录 POI pool 查询延迟
   */
  recordPoiPoolQueryLatency(requestId: string, latencyMs: number): void {
    const trace = this.traces.get(requestId);
    if (trace) {
      trace.latencies.poiPoolQueryMs = latencyMs;
      this.metrics.latencies.poiPoolQueryMs.push(latencyMs);
      this.logger.debug(`[TRACE ${requestId}] POI pool query took ${latencyMs}ms`);
    }
  }

  /**
   * 记录约束注入延迟
   */
  recordConstraintsInjectLatency(requestId: string, latencyMs: number): void {
    const trace = this.traces.get(requestId);
    if (trace) {
      trace.latencies.constraintsInjectMs = latencyMs;
      this.metrics.latencies.constraintsInjectMs.push(latencyMs);
      this.logger.debug(`[TRACE ${requestId}] Constraints injection took ${latencyMs}ms`);
    }
  }

  /**
   * 记录计划生成延迟
   */
  recordPlanGenerateLatency(requestId: string, latencyMs: number): void {
    const trace = this.traces.get(requestId);
    if (trace) {
      trace.latencies.planGenerateMs = latencyMs;
      this.metrics.latencies.planGenerateMs.push(latencyMs);
      this.logger.debug(`[TRACE ${requestId}] Plan generation took ${latencyMs}ms`);
    }
  }

  /**
   * 记录 Neptune 修复延迟
   */
  recordNeptuneRepairLatency(requestId: string, latencyMs: number): void {
    const trace = this.traces.get(requestId);
    if (trace) {
      trace.latencies.neptuneRepairMs = latencyMs;
      this.metrics.latencies.neptuneRepairMs.push(latencyMs);
      this.logger.debug(`[TRACE ${requestId}] Neptune repair took ${latencyMs}ms`);
    }
  }

  /**
   * 记录 POI pool 大小
   */
  recordPoiPoolSize(requestId: string, size: number, stage?: string): void {
    const trace = this.traces.get(requestId);
    if (trace) {
      if (!trace.poiPoolEvolution) {
        trace.poiPoolEvolution = {
          filters: [],
        };
      }
      
      if (stage === 'initial') {
        trace.poiPoolEvolution.initialSize = size;
      } else if (stage === 'afterRdFilter') {
        trace.poiPoolEvolution.afterRdFilter = size;
      } else if (stage === 'afterConstraints') {
        trace.poiPoolEvolution.afterConstraints = size;
      } else if (stage === 'final') {
        trace.poiPoolEvolution.finalSize = size;
        trace.quality.poiPoolSize = size;
        this.metrics.quality.poiPoolSizes.push(size);
      }
      
      this.logger.debug(`[TRACE ${requestId}] POI pool size at ${stage || 'unknown'}: ${size}`);
    }
  }

  /**
   * 记录 POI pool 过滤阶段
   */
  recordPoiPoolFilter(requestId: string, stage: string, sizeBefore: number, sizeAfter: number, reason?: string): void {
    const trace = this.traces.get(requestId);
    if (trace) {
      if (!trace.poiPoolEvolution) {
        trace.poiPoolEvolution = {
          filters: [],
        };
      }
      
      trace.poiPoolEvolution.filters!.push({
        stage,
        sizeBefore,
        sizeAfter,
        reason,
      });
      
      this.logger.debug(
        `[TRACE ${requestId}] POI pool filtered at ${stage}: ${sizeBefore} -> ${sizeAfter}${reason ? ` (${reason})` : ''}`
      );
    }
  }

  /**
   * 记录硬约束命中次数
   */
  recordHardConstraintsHit(requestId: string, count: number): void {
    const trace = this.traces.get(requestId);
    if (trace) {
      trace.quality.hardConstraintsHitCount = count;
      this.metrics.quality.hardConstraintsHitCounts.push(count);
      this.logger.debug(`[TRACE ${requestId}] Hard constraints hit: ${count}`);
    }
  }

  /**
   * 记录软约束命中次数
   */
  recordSoftConstraintsHit(requestId: string, count: number): void {
    const trace = this.traces.get(requestId);
    if (trace) {
      trace.quality.softConstraintsHitCount = count;
      this.metrics.quality.softConstraintsHitCounts.push(count);
      this.logger.debug(`[TRACE ${requestId}] Soft constraints hit: ${count}`);
    }
  }

  /**
   * 记录修复动作次数
   */
  recordRepairActionCount(requestId: string, count: number): void {
    const trace = this.traces.get(requestId);
    if (trace) {
      trace.quality.repairActionCount = count;
      this.metrics.quality.repairActionCounts.push(count);
      this.logger.debug(`[TRACE ${requestId}] Repair actions: ${count}`);
    }
  }

  /**
   * 记录选中的 RouteDirection
   */
  recordSelectedRd(requestId: string, rdId: number, rdName: string, decisionContext?: RouteDirectionTrace['decisionContext']): void {
    const trace = this.traces.get(requestId);
    if (trace) {
      trace.quality.selectedRdId = rdId;
      trace.quality.selectedRdName = rdName;
      if (decisionContext) {
        trace.decisionContext = decisionContext;
      }
      this.metrics.quality.selectedRdIds.push(rdId);
      this.logger.log(`[TRACE ${requestId}] Selected RD: ${rdName} (ID: ${rdId})`);
    }
  }

  /**
   * 记录错误：corridor_geom_invalid
   */
  recordCorridorGeomInvalid(requestId: string, errorMessage?: string): void {
    const trace = this.traces.get(requestId);
    if (trace) {
      trace.errors.corridorGeomInvalid = true;
      if (errorMessage) {
        if (!trace.errors.errorMessages) {
          trace.errors.errorMessages = [];
        }
        trace.errors.errorMessages.push(`corridor_geom_invalid: ${errorMessage}`);
      }
      this.metrics.errors.corridorGeomInvalid++;
      this.logger.warn(`[TRACE ${requestId}] Corridor geometry invalid: ${errorMessage || 'unknown'}`);
    }
  }

  /**
   * 记录错误：poi_query_timeout
   */
  recordPoiQueryTimeout(requestId: string, timeoutMs?: number): void {
    const trace = this.traces.get(requestId);
    if (trace) {
      trace.errors.poiQueryTimeout = true;
      if (!trace.errors.errorMessages) {
        trace.errors.errorMessages = [];
      }
      trace.errors.errorMessages.push(`poi_query_timeout${timeoutMs ? ` (${timeoutMs}ms)` : ''}`);
      this.metrics.errors.poiQueryTimeout++;
      this.logger.warn(`[TRACE ${requestId}] POI query timeout${timeoutMs ? ` after ${timeoutMs}ms` : ''}`);
    }
  }

  /**
   * 记录错误：no_candidates_fallback_used
   */
  recordNoCandidatesFallback(requestId: string, reason?: string): void {
    const trace = this.traces.get(requestId);
    if (trace) {
      trace.errors.noCandidatesFallbackUsed = true;
      if (reason) {
        if (!trace.errors.errorMessages) {
          trace.errors.errorMessages = [];
        }
        trace.errors.errorMessages.push(`no_candidates_fallback: ${reason}`);
      }
      this.metrics.errors.noCandidatesFallbackUsed++;
      this.logger.warn(`[TRACE ${requestId}] No candidates fallback used${reason ? `: ${reason}` : ''}`);
    }
  }

  /**
   * 完成 trace
   */
  completeTrace(requestId: string): RouteDirectionTrace | null {
    const trace = this.traces.get(requestId);
    if (trace) {
      trace.endTime = Date.now();
      const totalLatency = trace.endTime - trace.startTime;
      this.logger.log(`[TRACE ${requestId}] Completed in ${totalLatency}ms`);
      return trace;
    }
    return null;
  }

  /**
   * 获取 trace（用于调试和问题排查）
   */
  getTrace(requestId: string): RouteDirectionTrace | null {
    return this.traces.get(requestId) || null;
  }

  /**
   * 生成 trace 报告（回答"慢在哪""为什么选了这条 RD""为什么 POI pool 变小"）
   */
  generateTraceReport(requestId: string): {
    latencyBreakdown: {
      slowestStage?: string;
      slowestLatency?: number;
      totalLatency?: number;
      breakdown: Record<string, number>;
    };
    rdSelection: {
      selectedRdId?: number;
      selectedRdName?: string;
      whySelected?: {
        scoreBreakdown?: Record<string, number>;
        matchedSignals?: Record<string, any>;
      };
    };
    poiPoolEvolution: {
      initialSize?: number;
      finalSize?: number;
      shrinkage?: number;
      shrinkagePercentage?: number;
      filters?: Array<{
        stage: string;
        sizeBefore: number;
        sizeAfter: number;
        reason?: string;
      }>;
    };
  } {
    const trace = this.getTrace(requestId);
    if (!trace) {
      return {
        latencyBreakdown: { breakdown: {} },
        rdSelection: {},
        poiPoolEvolution: {},
      };
    }

    // 分析延迟
    const latencies = trace.latencies;
    const latencyEntries = Object.entries(latencies).filter(([_, v]) => v !== undefined) as Array<[string, number]>;
    const slowest = latencyEntries.reduce(
      (max, [stage, latency]) => (latency > max.latency ? { stage, latency } : max),
      { stage: '', latency: 0 }
    );
    const totalLatency = trace.endTime ? trace.endTime - trace.startTime : undefined;

    // 分析 RD 选择
    const rdSelection = {
      selectedRdId: trace.quality.selectedRdId,
      selectedRdName: trace.quality.selectedRdName,
      whySelected: trace.decisionContext
        ? {
            scoreBreakdown: trace.decisionContext.scoreBreakdown
              ? {
                  tagMatch: trace.decisionContext.scoreBreakdown.tagMatch,
                  seasonMatch: trace.decisionContext.scoreBreakdown.seasonMatch,
                  paceMatch: trace.decisionContext.scoreBreakdown.paceMatch,
                  riskMatch: trace.decisionContext.scoreBreakdown.riskMatch,
                  totalScore: trace.decisionContext.scoreBreakdown.totalScore,
                }
              : undefined,
            matchedSignals: trace.decisionContext.matchedSignals,
          }
        : undefined,
    };

    // 分析 POI pool 变化
    const poiPoolEvolution = trace.poiPoolEvolution
      ? {
          initialSize: trace.poiPoolEvolution.initialSize,
          finalSize: trace.poiPoolEvolution.finalSize,
          shrinkage:
            trace.poiPoolEvolution.initialSize && trace.poiPoolEvolution.finalSize
              ? trace.poiPoolEvolution.initialSize - trace.poiPoolEvolution.finalSize
              : undefined,
          shrinkagePercentage:
            trace.poiPoolEvolution.initialSize && trace.poiPoolEvolution.finalSize
              ? ((trace.poiPoolEvolution.initialSize - trace.poiPoolEvolution.finalSize) /
                  trace.poiPoolEvolution.initialSize) *
                100
              : undefined,
          filters: trace.poiPoolEvolution.filters,
        }
      : {};

    return {
      latencyBreakdown: {
        slowestStage: slowest.stage || undefined,
        slowestLatency: slowest.latency > 0 ? slowest.latency : undefined,
        totalLatency,
        breakdown: Object.fromEntries(latencyEntries),
      },
      rdSelection,
      poiPoolEvolution,
    };
  }

  /**
   * 获取聚合 metrics
   */
  getMetrics(): {
    latencies: {
      rdSelectMs: { avg: number; p95: number; p99: number };
      poiPoolQueryMs: { avg: number; p95: number; p99: number };
      constraintsInjectMs: { avg: number; p95: number; p99: number };
      planGenerateMs: { avg: number; p95: number; p99: number };
      neptuneRepairMs: { avg: number; p95: number; p99: number };
    };
    quality: {
      poiPoolSize: { avg: number; min: number; max: number };
      hardConstraintsHitCount: { avg: number; max: number };
      softConstraintsHitCount: { avg: number; max: number };
      repairActionCount: { avg: number; max: number };
      selectedRdIdDistribution: Record<number, number>;
    };
    errors: {
      corridorGeomInvalid: number;
      poiQueryTimeout: number;
      noCandidatesFallbackUsed: number;
    };
  } {
    const calculateStats = (values: number[]) => {
      if (values.length === 0) {
        return { avg: 0, p95: 0, p99: 0, min: 0, max: 0 };
      }
      const sorted = [...values].sort((a, b) => a - b);
      return {
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        p95: sorted[Math.floor(sorted.length * 0.95)],
        p99: sorted[Math.floor(sorted.length * 0.99)],
        min: sorted[0],
        max: sorted[sorted.length - 1],
      };
    };

    // 计算 selected_rd_id 分布
    const rdIdDistribution: Record<number, number> = {};
    this.metrics.quality.selectedRdIds.forEach((id) => {
      rdIdDistribution[id] = (rdIdDistribution[id] || 0) + 1;
    });

    return {
      latencies: {
        rdSelectMs: calculateStats(this.metrics.latencies.rdSelectMs),
        poiPoolQueryMs: calculateStats(this.metrics.latencies.poiPoolQueryMs),
        constraintsInjectMs: calculateStats(this.metrics.latencies.constraintsInjectMs),
        planGenerateMs: calculateStats(this.metrics.latencies.planGenerateMs),
        neptuneRepairMs: calculateStats(this.metrics.latencies.neptuneRepairMs),
      },
      quality: {
        poiPoolSize: calculateStats(this.metrics.quality.poiPoolSizes),
        hardConstraintsHitCount: {
          avg: calculateStats(this.metrics.quality.hardConstraintsHitCounts).avg,
          max: calculateStats(this.metrics.quality.hardConstraintsHitCounts).max,
        },
        softConstraintsHitCount: {
          avg: calculateStats(this.metrics.quality.softConstraintsHitCounts).avg,
          max: calculateStats(this.metrics.quality.softConstraintsHitCounts).max,
        },
        repairActionCount: {
          avg: calculateStats(this.metrics.quality.repairActionCounts).avg,
          max: calculateStats(this.metrics.quality.repairActionCounts).max,
        },
        selectedRdIdDistribution: rdIdDistribution,
      },
      errors: {
        corridorGeomInvalid: this.metrics.errors.corridorGeomInvalid,
        poiQueryTimeout: this.metrics.errors.poiQueryTimeout,
        noCandidatesFallbackUsed: this.metrics.errors.noCandidatesFallbackUsed,
      },
    };
  }

  /**
   * 清理旧的 traces（定期调用）
   */
  cleanupOldTraces(maxAgeMs: number = 3600000): void {
    const now = Date.now();
    for (const [requestId, trace] of this.traces.entries()) {
      if (trace.endTime && now - trace.endTime > maxAgeMs) {
        this.traces.delete(requestId);
      }
    }
  }
}

