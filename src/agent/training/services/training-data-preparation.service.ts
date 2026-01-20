// src/agent/training/services/training-data-preparation.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RewardSignal } from '../interfaces/trajectory.interface';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * TrainingDataPreparationService
 * 
 * 职责：筛选高质量轨迹，准备SFT训练数据
 * 
 * 筛选标准（论文要求）：
 * 1. validationStatus = 'VALIDATED'
 * 2. validationScore >= 0.8
 * 3. totalReward > 0（用户反馈积极）
 * 4. 未被用于训练过（或使用次数 < 3）
 */
@Injectable()
export class TrainingDataPreparationService {
  private readonly logger = new Logger(TrainingDataPreparationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 准备训练批次
   */
  async prepareTrainingBatch(options: {
    minScore?: number;
    minReward?: number;
    maxUsageCount?: number;
    batchSize?: number;
    modelVersion?: string;
    countryCode?: string;
  } = {}): Promise<TrainingBatch> {
    const {
      minScore = 0.8,
      minReward = 0,
      maxUsageCount = 3,
      batchSize = 1000,
      modelVersion,
      countryCode,
    } = options;

    this.logger.log(
      `[TrainingDataPrep] 准备训练批次: minScore=${minScore}, minReward=${minReward}, maxUsageCount=${maxUsageCount}, batchSize=${batchSize}`,
    );

    // 构建查询条件
    const where: any = {
      validationStatus: 'VALIDATED',
      validationScore: { gte: minScore },
      totalReward: { gt: minReward },
      usedForTrainingCount: { lt: maxUsageCount },
    };

    if (modelVersion) {
      where.modelVersion = modelVersion;
    }

    if (countryCode) {
      where.countryCode = countryCode;
    }

    // 查询符合条件的轨迹
    const trajectories = await this.prisma.validatedTrajectory.findMany({
      where,
      orderBy: [
        { totalReward: 'desc' }, // 优先选择 reward 高的
        { validationScore: 'desc' }, // 其次选择 score 高的
        { createdAt: 'desc' }, // 最后选择最新的
      ],
      take: batchSize,
    });

    this.logger.log(
      `[TrainingDataPrep] 找到 ${trajectories.length} 条符合条件的轨迹`,
    );

    // 转换为 SFT 训练数据格式
    const trainingData = trajectories.map((t) => this.convertToSFTFormat(t));

    // 统计信息
    const stats = {
      totalTrajectories: trajectories.length,
      avgScore: this.calculateAverage(trajectories.map((t) => t.validationScore)),
      avgReward: this.calculateAverage(trajectories.map((t) => t.totalReward)),
      minScore: Math.min(...trajectories.map((t) => t.validationScore)),
      maxScore: Math.max(...trajectories.map((t) => t.validationScore)),
      minReward: Math.min(...trajectories.map((t) => t.totalReward)),
      maxReward: Math.max(...trajectories.map((t) => t.totalReward)),
      modelVersions: [...new Set(trajectories.map((t) => t.modelVersion))],
      countryCodes: [
        ...new Set(trajectories.map((t) => t.countryCode).filter((c) => c !== null)),
      ],
    };

    return {
      batchId: `batch_${Date.now()}`,
      trajectories: trajectories.map((t) => ({
        trajectoryId: t.trajectoryId,
        requestId: t.requestId,
        tripId: t.tripId,
        validationScore: t.validationScore,
        totalReward: t.totalReward,
        modelVersion: t.modelVersion,
      })),
      trainingData,
      stats,
      createdAt: new Date(),
    };
  }

  /**
   * 标记轨迹为已使用
   */
  async markAsUsed(
    trajectoryIds: string[],
    batchId: string,
  ): Promise<void> {
    this.logger.log(
      `[TrainingDataPrep] 标记 ${trajectoryIds.length} 条轨迹为已使用: batchId=${batchId}`,
    );

    await this.prisma.validatedTrajectory.updateMany({
      where: {
        trajectoryId: { in: trajectoryIds },
      },
      data: {
        usedForTraining: true,
        usedForTrainingCount: { increment: 1 },
        trainingBatchId: batchId,
      },
    });

    this.logger.log(`[TrainingDataPrep] 轨迹标记完成`);
  }

  /**
   * 导出训练数据为 JSONL 格式
   */
  async exportToJSONL(
    batch: TrainingBatch,
    outputPath: string,
  ): Promise<{ filePath: string; lineCount: number }> {
    this.logger.log(
      `[TrainingDataPrep] 导出训练数据为 JSONL: batchId=${batch.batchId}, outputPath=${outputPath}`,
    );

    // 确保输出目录存在
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });

    // 写入 JSONL 文件（每行一个 JSON 对象）
    const lines: string[] = [];
    for (const example of batch.trainingData) {
      // 转换为标准 SFT 格式（根据具体 LLM 框架要求调整）
      const sftExample = {
        messages: [
          {
            role: 'user',
            content: this.formatUserInput(example.input),
          },
          {
            role: 'assistant',
            content: this.formatAssistantOutput(example.output),
          },
        ],
        metadata: example.metadata,
      };
      lines.push(JSON.stringify(sftExample));
    }

    await fs.writeFile(outputPath, lines.join('\n') + '\n', 'utf-8');

    this.logger.log(
      `[TrainingDataPrep] JSONL 导出完成: ${lines.length} 条记录`,
    );

    return {
      filePath: outputPath,
      lineCount: lines.length,
    };
  }

  /**
   * 导出训练数据为 JSON 格式
   */
  async exportToJSON(
    batch: TrainingBatch,
    outputPath: string,
  ): Promise<{ filePath: string; recordCount: number }> {
    this.logger.log(
      `[TrainingDataPrep] 导出训练数据为 JSON: batchId=${batch.batchId}, outputPath=${outputPath}`,
    );

    // 确保输出目录存在
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });

    // 构建完整的 JSON 对象
    const jsonData = {
      batch_id: batch.batchId,
      created_at: batch.createdAt.toISOString(),
      stats: batch.stats,
      trajectories: batch.trajectories,
      training_data: batch.trainingData.map((example) => ({
        messages: [
          {
            role: 'user',
            content: this.formatUserInput(example.input),
          },
          {
            role: 'assistant',
            content: this.formatAssistantOutput(example.output),
          },
        ],
        metadata: example.metadata,
      })),
    };

    await fs.writeFile(outputPath, JSON.stringify(jsonData, null, 2), 'utf-8');

    this.logger.log(
      `[TrainingDataPrep] JSON 导出完成: ${batch.trainingData.length} 条记录`,
    );

    return {
      filePath: outputPath,
      recordCount: batch.trainingData.length,
    };
  }

  /**
   * 格式化用户输入（用于 SFT 训练）
   */
  private formatUserInput(input: SFTTrainingExample['input']): string {
    const parts: string[] = [];

    // 用户请求
    parts.push(`用户请求: ${input.user_request}`);

    // 研究数据（如果有）
    if (input.research_data && Object.keys(input.research_data).length > 0) {
      parts.push(`\n研究数据: ${JSON.stringify(input.research_data, null, 2)}`);
    }

    // Gate 结果（如果有）
    if (input.gate_result) {
      parts.push(
        `\nGate 结果: ${input.gate_result.gate_result} (置信度: ${input.gate_result.confidence || 'N/A'})`,
      );
    }

    // Compliance 结果（如果有风险警告）
    if (
      input.compliance_result?.risk_warnings &&
      input.compliance_result.risk_warnings.length > 0
    ) {
      const warnings = input.compliance_result.risk_warnings
        .map((w) => `[${w.level}] ${w.message}`)
        .join('\n');
      parts.push(`\n合规警告:\n${warnings}`);
    }

    return parts.join('\n');
  }

  /**
   * 格式化助手输出（用于 SFT 训练）
   */
  private formatAssistantOutput(output: SFTTrainingExample['output']): string {
    const parts: string[] = [];

    // 推理过程
    if (output.reasoning) {
      parts.push(`推理过程:\n${output.reasoning}`);
    }

    // 生成的计划
    parts.push(`\n生成的计划:\n${JSON.stringify(output.plan, null, 2)}`);

    // 决策链（如果有）
    if (output.decision_trace && Array.isArray(output.decision_trace)) {
      const traceSummary = output.decision_trace
        .map(
          (entry: any) =>
            `- [${entry.step}] ${entry.actor}: ${entry.outputs_summary || entry.inputs_summary}`,
        )
        .join('\n');
      parts.push(`\n决策链:\n${traceSummary}`);
    }

    return parts.join('\n');
  }

  /**
   * 转换为 SFT 训练数据格式
   */
  private convertToSFTFormat(trajectory: any): SFTTrainingExample {
    // 提取用户请求（从 decisionTrace 或 researchData）
    const userRequest = this.extractUserRequest(trajectory);

    // 提取生成的计划
    const generatedPlan = trajectory.plan;

    // 提取决策链
    const decisionTrace = trajectory.decisionTrace;

    // 构建训练示例
    return {
      input: {
        user_request: userRequest,
        research_data: trajectory.researchData,
        gate_result: trajectory.gateResult,
        compliance_result: trajectory.complianceResult,
      },
      output: {
        plan: generatedPlan,
        decision_trace: decisionTrace,
        reasoning: this.extractReasoning(decisionTrace),
      },
      metadata: {
        trajectory_id: trajectory.trajectoryId,
        request_id: trajectory.requestId,
        trip_id: trajectory.tripId,
        validation_score: trajectory.validationScore,
        total_reward: trajectory.totalReward,
        model_version: trajectory.modelVersion,
        timestamp: trajectory.timestamp.toISOString(),
      },
    };
  }

  /**
   * 从决策链提取用户请求
   */
  private extractUserRequest(trajectory: any): string {
    // 尝试从 decisionTrace 的第一个条目提取
    const decisionTrace = trajectory.decisionTrace;
    if (Array.isArray(decisionTrace) && decisionTrace.length > 0) {
      const firstEntry = decisionTrace[0];
      if (firstEntry.inputs_summary) {
        return firstEntry.inputs_summary;
      }
    }

    // 如果无法提取，返回默认值
    return '用户规划请求';
  }

  /**
   * 从决策链提取推理过程
   */
  private extractReasoning(decisionTrace: any): string {
    if (!Array.isArray(decisionTrace)) {
      return '';
    }

    return decisionTrace
      .map((entry) => {
        const parts: string[] = [];
        if (entry.step) parts.push(`步骤: ${entry.step}`);
        if (entry.actor) parts.push(`执行者: ${entry.actor}`);
        if (entry.inputs_summary) parts.push(`输入: ${entry.inputs_summary}`);
        if (entry.outputs_summary) parts.push(`输出: ${entry.outputs_summary}`);
        return parts.join('; ');
      })
      .join('\n');
  }

  /**
   * 计算平均值
   */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }
}

/**
 * SFT 训练数据格式
 */
export interface SFTTrainingExample {
  input: {
    user_request: string;
    research_data: any;
    gate_result: any;
    compliance_result: any;
  };
  output: {
    plan: any;
    decision_trace: any;
    reasoning: string;
  };
  metadata: {
    trajectory_id: string;
    request_id: string;
    trip_id: string | null;
    validation_score: number;
    total_reward: number;
    model_version: string;
    timestamp: string;
  };
}

/**
 * 训练批次
 */
export interface TrainingBatch {
  batchId: string;
  trajectories: Array<{
    trajectoryId: string;
    requestId: string;
    tripId: string | null;
    validationScore: number;
    totalReward: number;
    modelVersion: string;
  }>;
  trainingData: SFTTrainingExample[];
  stats: {
    totalTrajectories: number;
    avgScore: number;
    avgReward: number;
    minScore: number;
    maxScore: number;
    minReward: number;
    maxReward: number;
    modelVersions: string[];
    countryCodes: string[];
  };
  createdAt: Date;
}
