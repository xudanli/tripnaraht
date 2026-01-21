// src/agent/training/services/trajectory-etl.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  RLTrajectory,
  RLTrajectoryStep,
  RLState,
  RLAction,
  RLReward,
  TrajectoryETLOptions,
  ETLExportFormat,
  ETLExportResult,
} from '../interfaces/trajectory.interface';
import { Itinerary, DecisionLogEntry, GateResult } from '../../interfaces/trip-plan.interface';
import { ComplianceResult } from '../interfaces/trajectory.interface';
import { DataQualityCheckerService } from './data-quality-checker.service';
import { PIIAnonymizerService, PIIAnonymizationConfig } from './pii-anonymizer.service';
import { DatasetVersionManagerService } from './dataset-version-manager.service';
import { DataQualityResult } from './data-quality-checker.service';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * TrajectoryETLService
 * 
 * 职责：将DecisionLog/State/ToolCall转换为(s,a,r,s')格式的ETL管道
 * 
 * 功能：
 * 1. extractTrajectories() - 从数据库抽取轨迹数据
 * 2. transformToRLFormat() - 转换为RL格式
 * 3. loadToDataset() - 加载到训练数据集（导出为文件）
 */
@Injectable()
export class TrajectoryETLService {
  private readonly logger = new Logger(TrajectoryETLService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly qualityChecker: DataQualityCheckerService,
    private readonly piiAnonymizer: PIIAnonymizerService,
    private readonly versionManager: DatasetVersionManagerService,
  ) {}

  /**
   * 从数据库抽取轨迹数据
   */
  async extractTrajectories(
    options: TrajectoryETLOptions = {},
  ): Promise<RLTrajectory[]> {
    this.logger.log(
      `[TrajectoryETL] 开始抽取轨迹数据: options=${JSON.stringify(options)}`,
    );

    // 构建查询条件
    const where: any = {};

    if (options.trajectory_ids && options.trajectory_ids.length > 0) {
      where.trajectoryId = { in: options.trajectory_ids };
    }

    if (options.request_ids && options.request_ids.length > 0) {
      where.requestId = { in: options.request_ids };
    }

    if (options.min_validation_score !== undefined) {
      where.validationScore = { gte: options.min_validation_score };
    }

    if (options.min_total_reward !== undefined) {
      where.totalReward = { gte: options.min_total_reward };
    }

    if (options.model_version) {
      where.modelVersion = options.model_version;
    }

    if (options.country_code) {
      where.countryCode = options.country_code;
    }

    if (options.date_range) {
      where.createdAt = {
        gte: new Date(options.date_range.start),
        lte: new Date(options.date_range.end),
      };
    }

    // 只抽取已验证的轨迹
    where.validationStatus = 'VALIDATED';

    // 查询轨迹
    const trajectories = await this.prisma.validatedTrajectory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options.limit || 1000,
      skip: options.offset || 0,
    });

    this.logger.log(
      `[TrajectoryETL] 找到 ${trajectories.length} 条轨迹`,
    );

    // 转换为RL格式
    const rlTrajectories: RLTrajectory[] = [];

    for (const trajectory of trajectories) {
      try {
        const rlTrajectory = await this.transformToRLFormat(trajectory);
        
        // 进行数据质量检查
        const qualityResult = await this.qualityChecker.validateTrajectory(rlTrajectory);
        
        if (qualityResult.isValid) {
          rlTrajectories.push(rlTrajectory);
        } else {
          this.logger.warn(
            `[TrajectoryETL] 轨迹质量检查未通过: trajectoryId=${rlTrajectory.trajectory_id}, score=${qualityResult.score.toFixed(2)}, issues=${qualityResult.issues.length}`,
          );
          // 可以选择是否包含低质量轨迹（根据配置）
        }
      } catch (error: any) {
        this.logger.warn(
          `[TrajectoryETL] 转换轨迹失败: trajectoryId=${trajectory.trajectoryId}, error=${error?.message}`,
        );
        // 继续处理其他轨迹
      }
    }

    this.logger.log(
      `[TrajectoryETL] 成功转换 ${rlTrajectories.length} 条轨迹`,
    );

    return rlTrajectories;
  }

  /**
   * 转换为RL格式（s,a,r,s'）
   */
  async transformToRLFormat(trajectory: any): Promise<RLTrajectory> {
    const plan = trajectory.plan as Itinerary;
    const decisionTrace = (trajectory.decisionTrace || []) as DecisionLogEntry[];
    const researchData = (trajectory.researchData || {}) as Record<string, any>;
    const gateResult = trajectory.gateResult as GateResult | null;
    const complianceResult = trajectory.complianceResult as ComplianceResult | null;
    const rewardSignals = (trajectory.rewardSignals || []) as any[];

    // 构建初始状态（s0）
    const initialState: RLState = {
      request_id: trajectory.requestId,
      trip_id: trajectory.tripId || undefined,
      user_request: this.extractUserRequest(trajectory),
      research_data: researchData,
      gate_result: gateResult || undefined,
      compliance_result: complianceResult || undefined,
      current_itinerary: plan || undefined,
      decision_history: [],
      metadata: {
        country_code: trajectory.countryCode || undefined,
        model_version: trajectory.modelVersion || undefined,
        timestamp: trajectory.createdAt.toISOString(),
      },
    };

    // 构建轨迹步骤
    const steps: RLTrajectoryStep[] = [];

    // 步骤1: PLAN_GENERATE动作
    if (plan) {
      steps.push({
        step_index: 0,
        state: initialState,
        action: {
          action_type: 'PLAN_GENERATE',
          action_params: {
            plan: plan,
          },
          reasoning: this.extractReasoning(decisionTrace, 'PLAN_GENERATE'),
          decision_point: 'plan_generation',
          actor: this.extractActor(decisionTrace, 'PLAN_GENERATE'),
        },
        reward: {
          total_reward: trajectory.totalReward || 0,
          reward_signals: rewardSignals,
          validation_score: trajectory.validationScore || undefined,
          user_approval: trajectory.userApproval || undefined,
          execution_success: trajectory.executionResult?.success || undefined,
        },
        next_state: {
          ...initialState,
          current_itinerary: plan,
          decision_history: decisionTrace,
        },
        timestamp: trajectory.createdAt.toISOString(),
      });
    }

    // 如果有决策日志，为每个决策点创建步骤
    if (decisionTrace && decisionTrace.length > 0) {
      for (let i = 0; i < decisionTrace.length; i++) {
        const decision = decisionTrace[i];
        const prevStep = steps[steps.length - 1];
        const prevState = prevStep?.next_state || initialState;

        // 构建动作
        // Extract decision point from step or metadata
        const decisionPoint = decision.metadata?.decisionPoint || decision.step || 'plan_generation';
        const userChoice = decision.metadata?.userChoice;
        const options = decision.metadata?.options;
        const scores = decision.metadata?.scores;
        const reasons = decision.metadata?.reasons;
        
        const action: RLAction = {
          action_type: this.mapDecisionPointToActionType(decisionPoint),
          action_params: {
            decision_point: decisionPoint,
            selected_option: userChoice || options?.[0],
            options: options,
          },
          reasoning: decision.outputs_summary,
          decision_point: decisionPoint,
          actor: decision.actor,
          alternatives_considered: options?.map((opt: any, idx: number) => ({
            option: opt,
            score: scores?.[idx],
            reason: reasons?.[idx],
          })),
        };

        // 构建下一状态
        const nextState: RLState = {
          ...prevState,
          decision_history: [...(prevState.decision_history || []), decision],
        };

        // 构建奖励（如果是最后一个决策，使用总奖励）
        const reward: RLReward = {
          total_reward: i === decisionTrace.length - 1 ? (trajectory.totalReward || 0) : 0,
          reward_signals: i === decisionTrace.length - 1 ? rewardSignals : [],
          validation_score: i === decisionTrace.length - 1 ? trajectory.validationScore : undefined,
        };

        steps.push({
          step_index: steps.length,
          state: prevState,
          action,
          reward,
          next_state: nextState,
          timestamp: decision.timestamp || trajectory.createdAt.toISOString(),
        });
      }
    }

    // 构建完整轨迹
    const rlTrajectory: RLTrajectory = {
      trajectory_id: trajectory.trajectoryId,
      request_id: trajectory.requestId,
      trip_id: trajectory.tripId || undefined,
      steps,
      metadata: {
        model_version: trajectory.modelVersion || 'v1.0',
        country_code: trajectory.countryCode || undefined,
        created_at: trajectory.createdAt.toISOString(),
        updated_at: trajectory.updatedAt.toISOString(),
        validation_status: trajectory.validationStatus,
        validation_score: trajectory.validationScore || undefined,
        total_reward: trajectory.totalReward || 0,
      },
    };

    return rlTrajectory;
  }

  /**
   * 导出轨迹数据集
   */
  async exportTrajectories(
    trajectories: RLTrajectory[],
    format: ETLExportFormat = 'jsonl',
    outputDir: string = './data/training',
  ): Promise<ETLExportResult> {
    this.logger.log(
      `[TrajectoryETL] 导出轨迹数据集: count=${trajectories.length}, format=${format}`,
    );

    // 确保输出目录存在
    await fs.mkdir(outputDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileExtension = format === 'parquet' ? 'parquet' : format === 'jsonl' ? 'jsonl' : 'json';
    const fileName = `trajectories_${timestamp}.${fileExtension}`;
    const filePath = path.join(outputDir, fileName);

    let fileSizeBytes = 0;

    if (format === 'jsonl') {
      // JSONL格式：每行一个JSON对象
      const lines = trajectories.map((t) => JSON.stringify(t));
      const content = lines.join('\n');
      await fs.writeFile(filePath, content, 'utf-8');
      fileSizeBytes = Buffer.byteLength(content, 'utf-8');
    } else if (format === 'json') {
      // JSON格式：单个JSON数组
      const content = JSON.stringify(trajectories, null, 2);
      await fs.writeFile(filePath, content, 'utf-8');
      fileSizeBytes = Buffer.byteLength(content, 'utf-8');
    } else if (format === 'parquet') {
      // Parquet格式：需要安装parquetjs库
      // 这里先抛出错误，提示需要安装依赖
      throw new Error(
        'Parquet export requires parquetjs library. Please install: npm install parquetjs',
      );
    }

    // 计算统计信息
    const totalSteps = trajectories.reduce((sum, t) => sum + t.steps.length, 0);
    const avgReward =
      trajectories.reduce((sum, t) => sum + (t.metadata.total_reward || 0), 0) /
      trajectories.length;
    const avgValidationScore =
      trajectories
        .filter((t) => t.metadata.validation_score !== undefined)
        .reduce(
          (sum, t) => sum + (t.metadata.validation_score || 0),
          0,
        ) / trajectories.filter((t) => t.metadata.validation_score !== undefined).length || 0;

    const result: ETLExportResult = {
      format,
      file_path: filePath,
      record_count: trajectories.length,
      file_size_bytes: fileSizeBytes,
      metadata: {
        exported_at: new Date().toISOString(),
        trajectory_ids: trajectories.map((t) => t.trajectory_id),
        stats: {
          total_steps: totalSteps,
          avg_reward: avgReward,
          avg_validation_score: avgValidationScore,
        },
      },
    };

    this.logger.log(
      `[TrajectoryETL] 导出完成: filePath=${filePath}, recordCount=${result.record_count}, fileSize=${(fileSizeBytes / 1024 / 1024).toFixed(2)}MB`,
    );

    return result;
  }

  /**
   * 加载到训练数据集（导出为文件）
   */
  async loadToDataset(
    options: TrajectoryETLOptions = {},
    format: ETLExportFormat = 'jsonl',
    outputDir: string = './data/training',
    anonymizePII: boolean = true,
    piiConfig?: PIIAnonymizationConfig,
    createVersion: boolean = true,
  ): Promise<ETLExportResult & { version?: string }> {
    this.logger.log(
      `[TrajectoryETL] 加载到训练数据集: options=${JSON.stringify(options)}`,
    );

    // 1. 抽取轨迹
    const trajectories = await this.extractTrajectories(options);

    if (trajectories.length === 0) {
      throw new Error('No trajectories found matching the criteria');
    }

    // 2. 数据集质量检查
    const qualityResult = await this.qualityChecker.validateDataset(trajectories);
    this.logger.log(
      `[TrajectoryETL] 数据集质量检查: score=${qualityResult.score.toFixed(2)}, valid=${qualityResult.stats.valid_trajectories}/${qualityResult.stats.total_trajectories}`,
    );

    // 3. PII脱敏（如果启用）
    let finalTrajectories = trajectories;
    if (anonymizePII) {
      this.logger.log(`[TrajectoryETL] 开始PII脱敏: count=${trajectories.length}`);
      finalTrajectories = await Promise.all(
        trajectories.map((t) => this.piiAnonymizer.anonymizeTrajectory(t, piiConfig)),
      );
      this.logger.log(`[TrajectoryETL] PII脱敏完成`);
    }

    // 4. 导出为指定格式
    const result = await this.exportTrajectories(finalTrajectories, format, outputDir);

    // 5. 生成质量报告
    const qualityReportPath = path.join(
      outputDir,
      `quality_report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    await fs.writeFile(
      qualityReportPath,
      JSON.stringify(qualityResult, null, 2),
      'utf-8',
    );
    this.logger.log(`[TrajectoryETL] 质量报告已生成: ${qualityReportPath}`);

    // 6. 创建数据集版本（如果启用）
    let version: string | undefined;
    if (createVersion) {
      try {
        const datasetVersion = await this.versionManager.createDatasetVersion(
          result,
          qualityResult,
          {
            date_range: options.date_range,
            filter_criteria: {
              min_validation_score: options.min_validation_score,
              min_total_reward: options.min_total_reward,
              model_version: options.model_version,
              country_code: options.country_code,
              trajectory_ids: options.trajectory_ids,
              request_ids: options.request_ids,
            },
            total_trajectories: finalTrajectories.length,
          },
          anonymizePII
            ? {
                enabled: true,
                config_hash: piiConfig
                  ? createHash('sha256')
                      .update(JSON.stringify(piiConfig))
                      .digest('hex')
                      .substring(0, 16)
                  : undefined,
              }
            : undefined,
        );
        version = datasetVersion.version;
        this.logger.log(`[TrajectoryETL] 数据集版本已创建: version=${version}`);
      } catch (error: any) {
        this.logger.warn(
          `[TrajectoryETL] 创建数据集版本失败: ${error?.message}`,
        );
        // 不阻止导出，继续执行
      }
    }

    return {
      ...result,
      version,
    };
  }

  /**
   * 辅助方法：提取用户请求
   */
  private extractUserRequest(trajectory: any): string {
    // 尝试从决策日志中提取用户请求
    const decisionTrace = trajectory.decisionTrace || [];
    if (decisionTrace.length > 0 && decisionTrace[0].inputs_summary) {
      return decisionTrace[0].inputs_summary;
    }

    // 如果没有，返回默认值
    return `Plan trip for request: ${trajectory.requestId}`;
  }

  /**
   * 辅助方法：提取推理过程
   */
  private extractReasoning(
    decisionTrace: DecisionLogEntry[],
    actionType: string,
  ): string | undefined {
    const relevantDecision = decisionTrace.find(
      (d) => {
        const decisionPoint = d.metadata?.decisionPoint || d.step || 'plan_generation';
        return this.mapDecisionPointToActionType(decisionPoint) === actionType;
      },
    );
    return relevantDecision?.outputs_summary;
  }

  /**
   * 辅助方法：提取执行者
   */
  private extractActor(
    decisionTrace: DecisionLogEntry[],
    actionType: string,
  ): string | undefined {
    const relevantDecision = decisionTrace.find(
      (d) => {
        const decisionPoint = d.metadata?.decisionPoint || d.step || 'plan_generation';
        return this.mapDecisionPointToActionType(decisionPoint) === actionType;
      },
    );
    return relevantDecision?.actor;
  }

  /**
   * 辅助方法：将决策点映射到动作类型
   */
  private mapDecisionPointToActionType(decisionPoint: string): RLAction['action_type'] {
    const mapping: Record<string, RLAction['action_type']> = {
      plan_generation: 'PLAN_GENERATE',
      route_optimization: 'ROUTE_ADJUST',
      pace_adjustment: 'PACE_ADJUST',
      budget_estimation: 'BUDGET_ADJUST',
      transport_selection: 'TRANSPORT_SELECT',
      poi_selection: 'POI_SELECT',
      gate_check: 'GATE_CHECK',
      compliance_check: 'COMPLIANCE_CHECK',
      user_clarification: 'USER_CLARIFICATION',
    };

    return mapping[decisionPoint.toLowerCase()] || 'PLAN_GENERATE';
  }
}
