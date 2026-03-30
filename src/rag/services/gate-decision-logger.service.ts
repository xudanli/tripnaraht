// src/rag/services/gate-decision-logger.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChunkRetrievalResult } from './chunk-retrieval.service';

/**
 * Gate 决策日志服务
 *
 * 职责：记录 Should-Exist Gate 的完整决策过程
 *
 * 设计原则（遵循 CLAUDE.md）：
 * 1. 可追溯：记录所有证据来源（RAG chunks + Tool 调用）
 * 2. 可解释：记录决策推理过程和依据
 * 3. 可审计：决策日志持久化，支持回溯
 * 4. 可改进：分析决策质量，优化规则
 *
 * 决策日志结构：
 * - request_id: 请求唯一标识
 * - step: INTAKE | RESEARCH | GATE_EVAL | PLAN_GEN | VERIFY | REPAIR | NARRATE
 * - actor: Orchestrator | Planner | Gatekeeper | Compliance | LocalInsight | CoreDecision | Narrator
 * - inputs_summary: 输入摘要
 * - outputs_summary: 输出摘要（gate_result, violations, required_adjustments）
 * - evidence_refs: 证据引用列表（RAG + Tool）
 * - retrieval_trace: RAG chunks 和 Tool 调用详细追踪
 * - timestamp: 时间戳
 */

export enum GateResult {
  ALLOW = 'ALLOW',                        // 允许
  ADJUST_REQUIRED = 'ADJUST_REQUIRED',    // 需要调整
  BLOCK = 'BLOCK',                        // 拒绝
  NEED_USER_CONFIRM = 'NEED_USER_CONFIRM', // 需要用户确认
}

export enum ViolationType {
  REACHABILITY = 'REACHABILITY',     // 可达性问题
  SAFETY = 'SAFETY',                 // 安全问题
  DEM = 'DEM',                       // 地形问题（坡度/爬升）
  DATA_MISSING = 'DATA_MISSING',     // 数据缺失
  SEASONAL = 'SEASONAL',             // 季节限制
  WEATHER = 'WEATHER',               // 天气风险
  ROAD_CLOSURE = 'ROAD_CLOSURE',     // 道路封闭
  VEHICLE_CAPABILITY = 'VEHICLE_CAPABILITY', // 车辆能力不足
  FATIGUE = 'FATIGUE',               // 疲劳超阈值
}

export enum ViolationSeverity {
  HARD = 'HARD',   // 硬性违规（必须阻止）
  SOFT = 'SOFT',   // 软性违规（建议调整）
}

export enum AdjustmentAction {
  CHANGE_MODE = 'CHANGE_MODE',               // 改变交通方式
  CHANGE_DATES = 'CHANGE_DATES',             // 改变日期
  SHORTEN_DAY = 'SHORTEN_DAY',               // 缩短单日行程
  REPLACE_SEGMENT = 'REPLACE_SEGMENT',       // 替换路段
  REPLACE_POI = 'REPLACE_POI',               // 替换 POI
  ADD_BUFFER = 'ADD_BUFFER',                 // 增加缓冲时间
  CHANGE_ROUTE = 'CHANGE_ROUTE',             // 改变路线
  ADD_REST = 'ADD_REST',                     // 增加休息
  UPGRADE_VEHICLE = 'UPGRADE_VEHICLE',       // 升级车辆（2WD → 4WD）
}

export enum WorkflowStep {
  INTAKE = 'INTAKE',
  RESEARCH = 'RESEARCH',
  GATE_EVAL = 'GATE_EVAL',
  PLAN_GEN = 'PLAN_GEN',
  VERIFY = 'VERIFY',
  REPAIR = 'REPAIR',
  NARRATE = 'NARRATE',
  DONE = 'DONE',
  FAILED = 'FAILED',
}

export enum Actor {
  Orchestrator = 'Orchestrator',
  Planner = 'Planner',
  Gatekeeper = 'Gatekeeper',
  Compliance = 'Compliance',
  LocalInsight = 'LocalInsight',
  CoreDecision = 'CoreDecision',
  Narrator = 'Narrator',
}

export interface Violation {
  type: ViolationType;
  severity: ViolationSeverity;
  detail: string;
  affectedSegment?: string; // 受影响的路段/POI ID
}

export interface RequiredAdjustment {
  action: AdjustmentAction;
  why: string;
  priority?: number; // 1 = 最高优先级
  alternatives?: string[]; // 替代方案
}

export interface EvidenceRef {
  evidence_id: string;
  source: string; // "RAG: attractions.json" | "Tool: weather.getForecast" | "Tool: road_status.getClosures"
  last_verified_at: string; // ISO 8601
  confidence: number; // 0-1
  url?: string;
  excerpt?: string; // 关键引用片段
}

export interface ToolCall {
  tool_name: string;
  input: any;
  output: any;
  output_summary?: string;
  latency_ms?: number;
  success: boolean;
  error?: string;
}

export interface GateEvaluation {
  gate_result: GateResult;
  confidence: number; // 0-1
  violations: Violation[];
  required_adjustments: RequiredAdjustment[];
  alternatives?: Alternative[];
  ragChunks?: ChunkRetrievalResult[]; // RAG 检索结果
  toolCalls?: ToolCall[]; // Tool 调用记录
}

export interface Alternative {
  description: string;
  type: 'ROUTE' | 'POI' | 'DATES' | 'MODE';
  details: any;
  confidence?: number;
}

export interface DecisionLogEntry {
  request_id: string;
  step: WorkflowStep;
  actor: Actor;
  timestamp: string; // ISO 8601

  inputs_summary: {
    route?: any;
    constraints?: any;
    query?: string;
    [key: string]: any;
  };

  outputs_summary: {
    gate_result?: GateResult;
    confidence?: number;
    violations?: Violation[];
    required_adjustments?: RequiredAdjustment[];
    alternatives?: Alternative[];
    [key: string]: any;
  };

  evidence_refs: EvidenceRef[];

  retrieval_trace?: {
    rag_chunks: Array<{
      chunk_id: string;
      similarity: number;
      text_preview: string; // 前 200 字符
      source_file?: string;
    }>;
    tool_calls: Array<{
      tool_name: string;
      input: any;
      output_summary: string;
      latency_ms?: number;
      success: boolean;
    }>;
  };

  metadata?: {
    latency_ms?: number;
    [key: string]: any;
  };
}

@Injectable()
export class GateDecisionLoggerService {
  private readonly logger = new Logger(GateDecisionLoggerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 记录 Should-Exist Gate 决策日志
   *
   * @param requestId - 请求 ID
   * @param gateEval - Gate 评估结果
   * @param evidenceRefs - 证据引用
   * @param metadata - 额外元数据
   */
  async logGateDecision(
    requestId: string,
    gateEval: GateEvaluation,
    evidenceRefs: EvidenceRef[],
    metadata?: { latency_ms?: number; [key: string]: any }
  ): Promise<void> {
    try {
      const decisionLog: DecisionLogEntry = {
        request_id: requestId,
        step: WorkflowStep.GATE_EVAL,
        actor: Actor.Gatekeeper,
        timestamp: new Date().toISOString(),

        inputs_summary: {
          // 输入可以从 gateEval 的上下文获取
          // 这里示例化，实际使用时需要传入
        },

        outputs_summary: {
          gate_result: gateEval.gate_result,
          confidence: gateEval.confidence,
          violations: gateEval.violations,
          required_adjustments: gateEval.required_adjustments,
          alternatives: gateEval.alternatives,
        },

        evidence_refs: evidenceRefs,

        retrieval_trace: {
          rag_chunks: (gateEval.ragChunks || []).map((chunk) => ({
            chunk_id: chunk.chunkId,
            similarity: chunk.similarity,
            text_preview: chunk.content.substring(0, 200),
            source_file: chunk.sourceFile,
          })),
          tool_calls: (gateEval.toolCalls || []).map((call) => ({
            tool_name: call.tool_name,
            input: call.input,
            output_summary: call.output_summary || JSON.stringify(call.output).substring(0, 500),
            latency_ms: call.latency_ms,
            success: call.success,
          })),
        },

        metadata,
      };

      // 持久化到数据库
      await this.saveDecisionLog(decisionLog);

      this.logger.log(
        `[GateDecisionLogger] 记录决策: requestId=${requestId}, result=${gateEval.gate_result}, confidence=${gateEval.confidence.toFixed(2)}, violations=${gateEval.violations.length}`
      );
    } catch (error: any) {
      this.logger.error(`[GateDecisionLogger] 记录失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 记录通用工作流步骤（非 Gate 专属）
   */
  async logWorkflowStep(
    requestId: string,
    step: WorkflowStep,
    actor: Actor,
    inputs: any,
    outputs: any,
    evidenceRefs?: EvidenceRef[],
    metadata?: any
  ): Promise<void> {
    try {
      const decisionLog: DecisionLogEntry = {
        request_id: requestId,
        step,
        actor,
        timestamp: new Date().toISOString(),
        inputs_summary: inputs,
        outputs_summary: outputs,
        evidence_refs: evidenceRefs || [],
        metadata,
      };

      await this.saveDecisionLog(decisionLog);

      this.logger.debug(
        `[DecisionLogger] 记录步骤: requestId=${requestId}, step=${step}, actor=${actor}`
      );
    } catch (error: any) {
      this.logger.error(`[DecisionLogger] 记录失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 保存决策日志到数据库
   */
  private async saveDecisionLog(log: DecisionLogEntry): Promise<void> {
    // TODO: 创建 decision_logs 表
    // Schema:
    // - id: uuid (PK)
    // - request_id: string (indexed)
    // - step: enum
    // - actor: enum
    // - timestamp: timestamp
    // - inputs_summary: jsonb
    // - outputs_summary: jsonb
    // - evidence_refs: jsonb
    // - retrieval_trace: jsonb
    // - metadata: jsonb
    // - created_at: timestamp

    // 保存到数据库（使用 RagDecisionLog 模型）
    await this.prisma.ragDecisionLog.create({
      data: {
        requestId: log.request_id,
        step: log.step,
        actor: log.actor,
        timestamp: new Date(log.timestamp),
        inputsSummary: log.inputs_summary,
        outputsSummary: log.outputs_summary,
        evidenceRefs: JSON.parse(JSON.stringify(log.evidence_refs)),
        retrievalTrace: log.retrieval_trace,
        metadata: log.metadata,
      },
    });

    // 同时记录到日志以便追踪
    this.logger.log(
      `[DecisionLog] ${JSON.stringify({
        request_id: log.request_id,
        step: log.step,
        actor: log.actor,
        gate_result: log.outputs_summary.gate_result,
        violations_count: log.outputs_summary.violations?.length || 0,
        evidence_count: log.evidence_refs.length,
      })}`
    );
  }

  /**
   * 查询决策日志
   */
  async getDecisionLogs(_params: {
    requestId?: string;
    step?: WorkflowStep;
    actor?: Actor;
    startDate?: Date;
    endDate?: Date;
    gateResult?: GateResult;
    limit?: number;
    offset?: number;
  }): Promise<{
    logs: DecisionLogEntry[];
    total: number;
  }> {
    // TODO: 实现查询
    // 目前返回空数据
    return {
      logs: [],
      total: 0,
    };
  }

  /**
   * 获取请求的完整决策链路
   */
  async getDecisionChain(_requestId: string): Promise<DecisionLogEntry[]> {
    // TODO: 实现查询
    // 按 timestamp 排序返回该 request_id 的所有步骤
    return [];
  }

  /**
   * 分析 Gate 决策质量
   *
   * 用于评估 Gate 的准确率、证据覆盖率等
   */
  async analyzeGateQuality(_params?: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<{
    totalDecisions: number;
    byResult: Record<GateResult, number>;
    averageConfidence: number;
    averageEvidenceCount: number;
    averageViolationsCount: number;
    topViolationTypes: Array<{ type: ViolationType; count: number }>;
    topAdjustmentActions: Array<{ action: AdjustmentAction; count: number }>;
  }> {
    // TODO: 实现统计分析
    return {
      totalDecisions: 0,
      byResult: {
        [GateResult.ALLOW]: 0,
        [GateResult.ADJUST_REQUIRED]: 0,
        [GateResult.BLOCK]: 0,
        [GateResult.NEED_USER_CONFIRM]: 0,
      },
      averageConfidence: 0,
      averageEvidenceCount: 0,
      averageViolationsCount: 0,
      topViolationTypes: [],
      topAdjustmentActions: [],
    };
  }

  /**
   * 辅助方法：从 RAG chunks 生成证据引用
   */
  createEvidenceRefsFromChunks(
    chunks: ChunkRetrievalResult[],
    confidence?: number
  ): EvidenceRef[] {
    return chunks.map((chunk) => ({
      evidence_id: chunk.chunkId,
      source: `RAG: ${chunk.sourceFile || 'unknown'}`,
      last_verified_at: new Date().toISOString(),
      confidence: confidence || chunk.similarity,
      excerpt: chunk.content.substring(0, 200),
    }));
  }

  /**
   * 辅助方法：从 Tool 调用生成证据引用
   */
  createEvidenceRefsFromTools(
    toolCalls: ToolCall[],
    confidence?: number
  ): EvidenceRef[] {
    return toolCalls
      .filter((call) => call.success)
      .map((call) => ({
        evidence_id: `tool_${call.tool_name}_${Date.now()}`,
        source: `Tool: ${call.tool_name}`,
        last_verified_at: new Date().toISOString(),
        confidence: confidence || 0.9, // Tool 调用默认高置信度
        excerpt: call.output_summary || JSON.stringify(call.output).substring(0, 200),
      }));
  }
}
