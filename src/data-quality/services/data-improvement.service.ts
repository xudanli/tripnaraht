// src/data-quality/services/data-improvement.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  ImprovementMetric,
  ImprovementMetricType,
  ProblemAnalysis,
  ImprovementDirection,
  ImprovementImplementation,
  ImprovementValidation,
  LearningCycleState,
  ContinuousImprovementResult,
} from '../interfaces/data-improvement.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { DataQualityFrameworkService } from './data-quality-framework.service';
import { LearningService } from '../../trips/decision/learning/learning.service';

/**
 * 数据持续改进服务
 * 
 * 实现P2要求的：
 * - 学习循环（收集反馈、分析问题、确定改进方向、实施改进、验证改进）
 * - 改进指标测量（用户满意度、预测准确度、决策质量、数据质量、系统可靠性）
 * - 改进验证机制
 */
@Injectable()
export class DataImprovementService {
  private readonly logger = new Logger(DataImprovementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataQualityFramework: DataQualityFrameworkService,
    @Optional() private readonly learningService?: LearningService,
  ) {}

  /**
   * 执行持续改进循环
   */
  async continuousImprovementLoop(
    cycleId?: string,
  ): Promise<ContinuousImprovementResult> {
    this.logger.log(`Starting continuous improvement loop${cycleId ? ` (cycle: ${cycleId})` : ''}`);

    const cycleState: LearningCycleState = {
      cycleId: cycleId || `cycle_${Date.now()}`,
      phase: 'COLLECT_FEEDBACK',
      startTime: new Date().toISOString(),
      currentMetrics: {} as Record<ImprovementMetricType, ImprovementMetric>,
      problems: [],
      improvementDirections: [],
      implementations: [],
      validations: [],
    };

    // Phase 1: 收集反馈
    await this.collectFeedback(cycleState);

    // Phase 2: 分析问题
    await this.analyzeProblems(cycleState);

    // Phase 3: 确定改进方向
    await this.determineImprovementDirections(cycleState);

    // Phase 4: 实施改进
    await this.implementImprovements(cycleState);

    // Phase 5: 验证改进
    await this.validateImprovements(cycleState);

    // 生成改进报告
    const improvementReport = this.generateImprovementReport(cycleState);

    // 计算总体改进情况
    const overallImprovement = this.calculateOverallImprovement(cycleState);

    // 生成下一步行动
    const nextActions = this.generateNextActions(cycleState, overallImprovement);

    return {
      cycleState,
      overallImprovement,
      nextActions,
      improvementReport,
    };
  }

  /**
   * 测量改进指标
   */
  async measureImprovementMetrics(): Promise<Record<ImprovementMetricType, ImprovementMetric>> {
    this.logger.log('Measuring improvement metrics');

    const metrics: Record<ImprovementMetricType, ImprovementMetric> = {
      USER_SATISFACTION: await this.measureUserSatisfaction(),
      PREDICTION_ACCURACY: await this.measurePredictionAccuracy(),
      DECISION_QUALITY: await this.measureDecisionQuality(),
      DATA_QUALITY: await this.measureDataQuality(),
      SYSTEM_RELIABILITY: await this.measureSystemReliability(),
    };

    return metrics;
  }

  /**
   * 验证改进效果
   */
  async validateImprovementEffect(
    implementationId: string,
    validationMethod: ImprovementValidation['validationMethod'],
  ): Promise<ImprovementValidation> {
    this.logger.log(`Validating improvement effect for implementation ${implementationId}`);

    // 获取实施记录
    const implementation = await this.getImplementation(implementationId);
    if (!implementation) {
      throw new Error(`Implementation ${implementationId} not found`);
    }

    // 获取改进前的指标
    const metricsBefore = await this.getMetricsBeforeImplementation(implementationId);

    // 获取改进后的指标
    const metricsAfter = await this.measureImprovementMetrics();

    // 计算改进情况
    const metricImprovements: ImprovementValidation['metricImprovements'] = {} as any;
    for (const metricType of Object.keys(metricsBefore) as ImprovementMetricType[]) {
      const before = metricsBefore[metricType].currentValue;
      const after = metricsAfter[metricType].currentValue;
      const improvement = after - before;
      const significant = Math.abs(improvement) > 0.05; // 改进超过5%认为显著

      metricImprovements[metricType] = {
        before,
        after,
        improvement,
        significant,
      };
    }

    // 判断验证结论
    const conclusion = this.determineValidationConclusion(metricImprovements);

    // 生成验证说明和建议
    const explanation = this.generateValidationExplanation(metricImprovements, conclusion);
    const recommendations = this.generateValidationRecommendations(metricImprovements, conclusion);

    return {
      validationId: `validation_${Date.now()}`,
      implementationId,
      validationTime: new Date().toISOString(),
      validationMethod,
      metricImprovements,
      conclusion,
      explanation,
      recommendations,
    };
  }

  // ========== 学习循环各阶段方法 ==========

  /**
   * Phase 1: 收集反馈
   */
  private async collectFeedback(cycleState: LearningCycleState): Promise<void> {
    this.logger.log('Phase 1: Collecting feedback');
    cycleState.phase = 'COLLECT_FEEDBACK';

    // 收集用户反馈
    const userFeedback = await this.collectUserFeedback();

    // 收集系统指标
    const systemMetrics = await this.collectSystemMetrics();

    // 收集数据质量反馈
    const dataQualityFeedback = await this.collectDataQualityFeedback();

    // 更新当前指标
    cycleState.currentMetrics = await this.measureImprovementMetrics();

    this.logger.log(`Collected feedback: ${userFeedback.length} user feedbacks, ${systemMetrics.length} system metrics`);
  }

  /**
   * Phase 2: 分析问题
   */
  private async analyzeProblems(cycleState: LearningCycleState): Promise<void> {
    this.logger.log('Phase 2: Analyzing problems');
    cycleState.phase = 'ANALYZE_PROBLEMS';

    const problems: ProblemAnalysis[] = [];

    // 分析指标问题
    for (const [metricType, metric] of Object.entries(cycleState.currentMetrics)) {
      if (metric.currentValue < metric.targetValue) {
        const gap = metric.targetValue - metric.currentValue;
        problems.push({
          problemId: `problem_${metricType}_${Date.now()}`,
          description: `${metric.name}低于目标值（当前：${Math.round(metric.currentValue * 100)}%，目标：${Math.round(metric.targetValue * 100)}%）`,
          severity: gap > 0.3 ? 'CRITICAL' : gap > 0.2 ? 'HIGH' : gap > 0.1 ? 'MEDIUM' : 'LOW',
          affectedMetrics: [metricType as ImprovementMetricType],
          rootCauses: this.identifyRootCauses(metricType as ImprovementMetricType, metric),
          impact: this.assessImpact(metricType as ImprovementMetricType, gap),
          frequency: this.calculateFrequency(metricType as ImprovementMetricType),
        });
      }

      // 如果趋势下降，也记录问题
      if (metric.trend === 'DECLINING') {
        problems.push({
          problemId: `problem_${metricType}_declining_${Date.now()}`,
          description: `${metric.name}呈下降趋势`,
          severity: 'MEDIUM',
          affectedMetrics: [metricType as ImprovementMetricType],
          rootCauses: ['需要分析下降原因'],
          impact: ['可能影响用户体验'],
          frequency: 0.5,
        });
      }
    }

    cycleState.problems = problems;
    this.logger.log(`Identified ${problems.length} problems`);
  }

  /**
   * Phase 3: 确定改进方向
   */
  private async determineImprovementDirections(cycleState: LearningCycleState): Promise<void> {
    this.logger.log('Phase 3: Determining improvement directions');
    cycleState.phase = 'DETERMINE_DIRECTIONS';

    const directions: ImprovementDirection[] = [];

    // 为每个问题生成改进方向
    for (const problem of cycleState.problems) {
      const improvementDirections = this.generateImprovementDirectionsForProblem(problem);
      directions.push(...improvementDirections);
    }

    // 按优先级排序
    directions.sort((a, b) => {
      const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    cycleState.improvementDirections = directions;
    this.logger.log(`Determined ${directions.length} improvement directions`);
  }

  /**
   * Phase 4: 实施改进
   */
  private async implementImprovements(cycleState: LearningCycleState): Promise<void> {
    this.logger.log('Phase 4: Implementing improvements');
    cycleState.phase = 'IMPLEMENT';

    const implementations: ImprovementImplementation[] = [];

    // 实施高优先级的改进方向
    const highPriorityDirections = cycleState.improvementDirections.filter(
      d => d.priority === 'HIGH',
    );

    for (const direction of highPriorityDirections.slice(0, 3)) {
      // 简化实现：记录实施计划
      const implementation: ImprovementImplementation = {
        implementationId: `impl_${direction.improvementId}_${Date.now()}`,
        improvementId: direction.improvementId,
        startTime: new Date().toISOString(),
        status: 'PLANNED',
        changes: [direction.description],
        implementedBy: 'system',
      };

      implementations.push(implementation);
    }

    cycleState.implementations = implementations;
    this.logger.log(`Planned ${implementations.length} improvements`);
  }

  /**
   * Phase 5: 验证改进
   */
  private async validateImprovements(cycleState: LearningCycleState): Promise<void> {
    this.logger.log('Phase 5: Validating improvements');
    cycleState.phase = 'VALIDATE';

    const validations: ImprovementValidation[] = [];

    // 验证已完成的改进
    for (const implementation of cycleState.implementations.filter(
      i => i.status === 'COMPLETED',
    )) {
      try {
        const validation = await this.validateImprovementEffect(
          implementation.implementationId,
          'BEFORE_AFTER',
        );
        validations.push(validation);
      } catch (error) {
        this.logger.warn(`Failed to validate implementation ${implementation.implementationId}: ${error}`);
      }
    }

    cycleState.validations = validations;
    this.logger.log(`Validated ${validations.length} improvements`);
  }

  // ========== 指标测量方法 ==========

  /**
   * 测量用户满意度
   */
  private async measureUserSatisfaction(): Promise<ImprovementMetric> {
    // 从决策日志和用户反馈中计算满意度
    const recentLogs = await this.getRecentDecisionLogs(30); // 最近30天
    const feedbacks = await this.getUserFeedbacks(recentLogs.map(l => l.id));

    let totalSatisfaction = 0;
    let satisfactionCount = 0;

    for (const feedback of feedbacks) {
      if (feedback.satisfaction !== null && feedback.satisfaction !== undefined) {
        totalSatisfaction += feedback.satisfaction;
        satisfactionCount++;
      }
    }

    const currentValue = satisfactionCount > 0 ? totalSatisfaction / satisfactionCount / 10 : 0.7; // 默认0.7
    const history = await this.getMetricHistory('USER_SATISFACTION', 30);

    return {
      type: 'USER_SATISFACTION',
      name: '用户满意度',
      currentValue,
      targetValue: 0.85,
      history,
      trend: this.calculateTrend(history),
      improvementPotential: Math.max(0, 0.85 - currentValue),
    };
  }

  /**
   * 测量预测准确度
   */
  private async measurePredictionAccuracy(): Promise<ImprovementMetric> {
    // 从决策结果和实际结果对比中计算准确度
    const outcomes = await this.getDecisionOutcomes(30);

    let accuratePredictions = 0;
    let totalPredictions = 0;

    for (const outcome of outcomes) {
      if (outcome.expectedOutcome && outcome.actualOutcome) {
        totalPredictions++;
        // 简化实现：比较预期和实际结果
        const accuracy = this.compareOutcomes(outcome.expectedOutcome, outcome.actualOutcome);
        if (accuracy > 0.7) {
          accuratePredictions++;
        }
      }
    }

    const currentValue = totalPredictions > 0 ? accuratePredictions / totalPredictions : 0.75;
    const history = await this.getMetricHistory('PREDICTION_ACCURACY', 30);

    return {
      type: 'PREDICTION_ACCURACY',
      name: '预测准确度',
      currentValue,
      targetValue: 0.8,
      history,
      trend: this.calculateTrend(history),
      improvementPotential: Math.max(0, 0.8 - currentValue),
    };
  }

  /**
   * 测量决策质量
   */
  private async measureDecisionQuality(): Promise<ImprovementMetric> {
    // 基于决策日志的质量指标
    const recentLogs = await this.getRecentDecisionLogs(30);
    const qualityScores = recentLogs.map(log => this.calculateDecisionQualityScore(log));

    const currentValue =
      qualityScores.length > 0
        ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
        : 0.75;
    const history = await this.getMetricHistory('DECISION_QUALITY', 30);

    return {
      type: 'DECISION_QUALITY',
      name: '决策质量',
      currentValue,
      targetValue: 0.8,
      history,
      trend: this.calculateTrend(history),
      improvementPotential: Math.max(0, 0.8 - currentValue),
    };
  }

  /**
   * 测量数据质量
   */
  private async measureDataQuality(): Promise<ImprovementMetric> {
    // 使用数据质量框架评估
    const sampleData = await this.getSampleData();
    const qualityAssessment = await this.dataQualityFramework.assessOverallQuality(sampleData);

    const currentValue = qualityAssessment.overallScore;
    const history = await this.getMetricHistory('DATA_QUALITY', 30);

    return {
      type: 'DATA_QUALITY',
      name: '数据质量',
      currentValue,
      targetValue: 0.9,
      history,
      trend: this.calculateTrend(history),
      improvementPotential: Math.max(0, 0.9 - currentValue),
    };
  }

  /**
   * 测量系统可靠性
   */
  private async measureSystemReliability(): Promise<ImprovementMetric> {
    // 基于错误率和系统可用性
    const errors = await this.getSystemErrors(30);
    const totalRequests = await this.getTotalRequests(30);

    const errorRate = totalRequests > 0 ? errors.length / totalRequests : 0;
    const currentValue = 1 - errorRate; // 可靠性 = 1 - 错误率
    const history = await this.getMetricHistory('SYSTEM_RELIABILITY', 30);

    return {
      type: 'SYSTEM_RELIABILITY',
      name: '系统可靠性',
      currentValue: Math.max(0, currentValue),
      targetValue: 0.95,
      history,
      trend: this.calculateTrend(history),
      improvementPotential: Math.max(0, 0.95 - currentValue),
    };
  }

  // ========== 辅助方法 ==========

  /**
   * 收集用户反馈
   */
  private async collectUserFeedback(): Promise<any[]> {
    // 从数据库查询用户反馈
    try {
      const feedbacks = await this.prisma.tripOutcomeFeedback.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 最近30天
          },
        },
        take: 100,
      });
      return feedbacks;
    } catch (error) {
      this.logger.warn(`Failed to collect user feedback: ${error}`);
      return [];
    }
  }

  /**
   * 收集系统指标
   */
  private async collectSystemMetrics(): Promise<any[]> {
    // 简化实现：返回空数组
    // 实际应该从监控系统收集指标
    return [];
  }

  /**
   * 收集数据质量反馈
   */
  private async collectDataQualityFeedback(): Promise<any[]> {
    // 简化实现：返回空数组
    // 实际应该从数据质量评估中收集反馈
    return [];
  }

  /**
   * 识别根本原因
   */
  private identifyRootCauses(
    metricType: ImprovementMetricType,
    metric: ImprovementMetric,
  ): string[] {
    const causes: string[] = [];

    if (metric.trend === 'DECLINING') {
      causes.push('指标呈下降趋势，需要分析原因');
    }

    if (metric.currentValue < metric.targetValue) {
      const gap = metric.targetValue - metric.currentValue;
      if (gap > 0.2) {
        causes.push('指标与目标值差距较大');
      }
    }

    // 基于指标类型添加特定原因
    switch (metricType) {
      case 'USER_SATISFACTION':
        causes.push('用户反馈数据不足', '预测准确性影响满意度');
        break;
      case 'PREDICTION_ACCURACY':
        causes.push('预测模型需要优化', '训练数据质量不足');
        break;
      case 'DATA_QUALITY':
        causes.push('数据源可靠性问题', '数据更新不及时');
        break;
    }

    return causes;
  }

  /**
   * 评估影响
   */
  private assessImpact(metricType: ImprovementMetricType, gap: number): string[] {
    const impacts: string[] = [];

    switch (metricType) {
      case 'USER_SATISFACTION':
        impacts.push('用户体验下降', '用户流失风险增加');
        break;
      case 'PREDICTION_ACCURACY':
        impacts.push('决策质量下降', '用户信任度降低');
        break;
      case 'DATA_QUALITY':
        impacts.push('决策依据不可靠', '系统输出质量下降');
        break;
      case 'SYSTEM_RELIABILITY':
        impacts.push('系统稳定性问题', '服务可用性下降');
        break;
    }

    if (gap > 0.3) {
      impacts.push('严重影响系统性能');
    }

    return impacts;
  }

  /**
   * 计算频率
   */
  private calculateFrequency(metricType: ImprovementMetricType): number {
    // 简化实现：基于历史数据计算频率
    // 实际应该分析历史数据
    return 0.5;
  }

  /**
   * 为问题生成改进方向
   */
  private generateImprovementDirectionsForProblem(
    problem: ProblemAnalysis,
  ): ImprovementDirection[] {
    const directions: ImprovementDirection[] = [];

    // 基于问题类型生成改进方向
    for (const metricType of problem.affectedMetrics) {
      const direction: ImprovementDirection = {
        improvementId: `improvement_${problem.problemId}_${metricType}_${Date.now()}`,
        name: `改进${this.getMetricName(metricType)}`,
        description: `针对"${problem.description}"的改进措施`,
        targetProblems: [problem.problemId],
        expectedMetricImprovements: {
          [metricType]: 0.1, // 预期改进10%
        } as Record<ImprovementMetricType, number>,
        implementationDifficulty: problem.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
        expectedEffect: `预期将${this.getMetricName(metricType)}提升10%`,
        priority: problem.severity === 'CRITICAL' || problem.severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
      };

      directions.push(direction);
    }

    return directions;
  }

  /**
   * 获取实施记录
   */
  private async getImplementation(implementationId: string): Promise<ImprovementImplementation | null> {
    // 简化实现：返回null
    // 实际应该从数据库查询
    return null;
  }

  /**
   * 获取改进前的指标
   */
  private async getMetricsBeforeImplementation(
    implementationId: string,
  ): Promise<Record<ImprovementMetricType, ImprovementMetric>> {
    // 简化实现：返回当前指标
    // 实际应该从历史记录中查询改进前的指标
    return await this.measureImprovementMetrics();
  }

  /**
   * 判断验证结论
   */
  private determineValidationConclusion(
    metricImprovements: ImprovementValidation['metricImprovements'],
  ): ImprovementValidation['conclusion'] {
    const improvements = Object.values(metricImprovements);
    const significantImprovements = improvements.filter(m => m.significant && m.improvement > 0);
    const significantDeclines = improvements.filter(m => m.significant && m.improvement < 0);

    if (significantImprovements.length > significantDeclines.length) {
      return 'SUCCESS';
    } else if (significantDeclines.length > significantImprovements.length) {
      return 'FAILED';
    } else if (significantImprovements.length > 0) {
      return 'PARTIAL_SUCCESS';
    } else {
      return 'INCONCLUSIVE';
    }
  }

  /**
   * 生成验证说明
   */
  private generateValidationExplanation(
    metricImprovements: ImprovementValidation['metricImprovements'],
    conclusion: ImprovementValidation['conclusion'],
  ): string {
    const improvements = Object.entries(metricImprovements)
      .filter(([, m]) => m.significant && m.improvement > 0)
      .map(([type, m]) => `${this.getMetricName(type as ImprovementMetricType)}提升${Math.round(m.improvement * 100)}%`);

    const declines = Object.entries(metricImprovements)
      .filter(([, m]) => m.significant && m.improvement < 0)
      .map(([type, m]) => `${this.getMetricName(type as ImprovementMetricType)}下降${Math.round(Math.abs(m.improvement) * 100)}%`);

    if (conclusion === 'SUCCESS') {
      return `改进成功：${improvements.join('、')}`;
    } else if (conclusion === 'FAILED') {
      return `改进失败：${declines.join('、')}`;
    } else if (conclusion === 'PARTIAL_SUCCESS') {
      return `部分成功：${improvements.join('、')}，但${declines.join('、')}`;
    } else {
      return '改进效果不明显，需要更多数据验证';
    }
  }

  /**
   * 生成验证建议
   */
  private generateValidationRecommendations(
    metricImprovements: ImprovementValidation['metricImprovements'],
    conclusion: ImprovementValidation['conclusion'],
  ): string[] {
    const recommendations: string[] = [];

    if (conclusion === 'SUCCESS') {
      recommendations.push('改进措施有效，可以继续应用');
      recommendations.push('考虑将改进措施推广到其他场景');
    } else if (conclusion === 'FAILED') {
      recommendations.push('改进措施效果不佳，需要重新评估');
      recommendations.push('考虑回滚改进措施');
      recommendations.push('分析失败原因，调整改进方向');
    } else if (conclusion === 'PARTIAL_SUCCESS') {
      recommendations.push('改进措施部分有效，需要优化');
      recommendations.push('针对未改进的指标调整策略');
    } else {
      recommendations.push('需要更多数据和时间来验证改进效果');
      recommendations.push('延长验证周期');
    }

    return recommendations;
  }

  /**
   * 计算总体改进情况
   */
  private calculateOverallImprovement(cycleState: LearningCycleState): ContinuousImprovementResult['overallImprovement'] {
    const improvements: ImprovementMetricType[] = [];
    const declines: ImprovementMetricType[] = [];

    // 分析验证结果
    for (const validation of cycleState.validations) {
      for (const [metricType, improvement] of Object.entries(validation.metricImprovements)) {
        if (improvement.significant) {
          if (improvement.improvement > 0) {
            improvements.push(metricType as ImprovementMetricType);
          } else if (improvement.improvement < 0) {
            declines.push(metricType as ImprovementMetricType);
          }
        }
      }
    }

    // 计算平均改进幅度
    let totalImprovement = 0;
    let improvementCount = 0;

    for (const validation of cycleState.validations) {
      for (const improvement of Object.values(validation.metricImprovements)) {
        if (improvement.improvement > 0) {
          totalImprovement += improvement.improvement;
          improvementCount++;
        }
      }
    }

    const averageMetricImprovement = improvementCount > 0 ? totalImprovement / improvementCount : 0;

    return {
      averageMetricImprovement,
      improvedMetrics: Array.from(new Set(improvements)),
      declinedMetrics: Array.from(new Set(declines)),
    };
  }

  /**
   * 生成下一步行动
   */
  private generateNextActions(
    cycleState: LearningCycleState,
    overallImprovement: ContinuousImprovementResult['overallImprovement'],
  ): string[] {
    const actions: string[] = [];

    // 基于验证结果生成行动
    if (overallImprovement.improvedMetrics.length > 0) {
      actions.push(`继续监控${overallImprovement.improvedMetrics.length}个已改进的指标`);
    }

    if (overallImprovement.declinedMetrics.length > 0) {
      actions.push(`优先处理${overallImprovement.declinedMetrics.length}个下降的指标`);
    }

    // 基于未解决的问题生成行动
    const unresolvedProblems = cycleState.problems.filter(
      p => !cycleState.improvementDirections.some(d => d.targetProblems.includes(p.problemId)),
    );
    if (unresolvedProblems.length > 0) {
      actions.push(`分析${unresolvedProblems.length}个未解决的问题`);
    }

    // 基于待实施的改进生成行动
    const pendingImplementations = cycleState.improvementDirections.filter(
      d => !cycleState.implementations.some(i => i.improvementId === d.improvementId),
    );
    if (pendingImplementations.length > 0) {
      actions.push(`实施${pendingImplementations.length}个待实施的改进方向`);
    }

    if (actions.length === 0) {
      actions.push('继续收集反馈，监控指标变化');
    }

    return actions;
  }

  /**
   * 生成改进报告
   */
  private generateImprovementReport(cycleState: LearningCycleState): string {
    const parts: string[] = [];

    parts.push(`# 数据持续改进循环报告（${cycleState.cycleId}）`);
    parts.push(`\n## 当前指标`);
    for (const [type, metric] of Object.entries(cycleState.currentMetrics)) {
      parts.push(`- **${metric.name}**：${Math.round(metric.currentValue * 100)}%（目标：${Math.round(metric.targetValue * 100)}%）`);
      parts.push(`  - 趋势：${metric.trend === 'IMPROVING' ? '上升' : metric.trend === 'DECLINING' ? '下降' : '稳定'}`);
      parts.push(`  - 改进空间：${Math.round(metric.improvementPotential * 100)}%`);
    }

    parts.push(`\n## 发现的问题（${cycleState.problems.length}个）`);
    for (const problem of cycleState.problems) {
      parts.push(`- **${problem.description}**（严重程度：${problem.severity}）`);
      parts.push(`  - 根本原因：${problem.rootCauses.join('、')}`);
    }

    parts.push(`\n## 确定的改进方向（${cycleState.improvementDirections.length}个）`);
    for (const direction of cycleState.improvementDirections.slice(0, 5)) {
      parts.push(`- **${direction.name}**（优先级：${direction.priority}）`);
      parts.push(`  - ${direction.description}`);
    }

    parts.push(`\n## 实施的改进（${cycleState.implementations.length}个）`);
    for (const implementation of cycleState.implementations) {
      parts.push(`- **${implementation.implementationId}**（状态：${implementation.status}）`);
    }

    parts.push(`\n## 验证结果（${cycleState.validations.length}个）`);
    for (const validation of cycleState.validations) {
      parts.push(`- **${validation.conclusion}**：${validation.explanation}`);
    }

    return parts.join('\n');
  }

  // ========== 数据访问辅助方法 ==========

  /**
   * 获取最近的决策日志
   */
  private async getRecentDecisionLogs(days: number): Promise<any[]> {
    try {
      const logs = await this.prisma.decisionLog.findMany({
        where: {
          timestamp: {
            gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
          },
        },
        take: 100,
      });
      return logs;
    } catch (error) {
      this.logger.warn(`Failed to get recent decision logs: ${error}`);
      return [];
    }
  }

  /**
   * 获取用户反馈
   */
  private async getUserFeedbacks(logIds: string[]): Promise<any[]> {
    try {
      const outcomes = await this.prisma.decisionOutcome.findMany({
        where: {
          decisionId: {
            in: logIds,
          },
        },
      });
      return outcomes;
    } catch (error) {
      this.logger.warn(`Failed to get user feedbacks: ${error}`);
      return [];
    }
  }

  /**
   * 获取决策结果
   */
  private async getDecisionOutcomes(days: number): Promise<any[]> {
    try {
      const outcomes = await this.prisma.decisionOutcome.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
          },
        },
        take: 100,
      });
      return outcomes;
    } catch (error) {
      this.logger.warn(`Failed to get decision outcomes: ${error}`);
      return [];
    }
  }

  /**
   * 获取指标历史
   */
  private async getMetricHistory(
    metricType: ImprovementMetricType,
    days: number,
  ): Promise<Array<{ timestamp: string; value: number }>> {
    // 简化实现：返回空数组
    // 实际应该从历史记录中查询
    return [];
  }

  /**
   * 计算趋势
   */
  private calculateTrend(
    history: Array<{ timestamp: string; value: number }>,
  ): 'IMPROVING' | 'STABLE' | 'DECLINING' {
    if (history.length < 2) {
      return 'STABLE';
    }

    const recent = history.slice(-5); // 最近5个数据点
    const first = recent[0].value;
    const last = recent[recent.length - 1].value;

    const change = last - first;
    if (change > 0.05) {
      return 'IMPROVING';
    } else if (change < -0.05) {
      return 'DECLINING';
    } else {
      return 'STABLE';
    }
  }

  /**
   * 比较预期和实际结果
   */
  private compareOutcomes(expected: any, actual: any): number {
    // 简化实现：返回0.8
    // 实际应该详细比较预期和实际结果
    return 0.8;
  }

  /**
   * 计算决策质量分数
   */
  private calculateDecisionQualityScore(log: any): number {
    // 简化实现：基于日志特征计算质量分数
    let score = 0.5;

    if (log.explanation) {
      score += 0.2; // 有解释说明质量较高
    }

    if (log.evidenceRefs && log.evidenceRefs.length > 0) {
      score += 0.2; // 有证据引用说明质量较高
    }

    if (log.status === 'ACCEPTED') {
      score += 0.1; // 被接受说明质量较高
    }

    return Math.min(1.0, score);
  }

  /**
   * 获取样本数据
   */
  private async getSampleData(): Promise<any> {
    // 简化实现：返回空对象
    // 实际应该获取实际的数据样本
    return {};
  }

  /**
   * 获取系统错误
   */
  private async getSystemErrors(days: number): Promise<any[]> {
    // 简化实现：返回空数组
    // 实际应该从错误日志中查询
    return [];
  }

  /**
   * 获取总请求数
   */
  private async getTotalRequests(days: number): Promise<number> {
    // 简化实现：返回1000
    // 实际应该从访问日志中统计
    return 1000;
  }

  /**
   * 获取指标名称
   */
  private getMetricName(metricType: ImprovementMetricType): string {
    const nameMap: Record<ImprovementMetricType, string> = {
      USER_SATISFACTION: '用户满意度',
      PREDICTION_ACCURACY: '预测准确度',
      DECISION_QUALITY: '决策质量',
      DATA_QUALITY: '数据质量',
      SYSTEM_RELIABILITY: '系统可靠性',
    };
    return nameMap[metricType] || metricType;
  }
}
