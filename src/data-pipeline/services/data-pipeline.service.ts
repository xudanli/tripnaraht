// src/data-pipeline/services/data-pipeline.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { DataQualityFrameworkService } from '../../data-quality/services/data-quality-framework.service';
import { DataPrivacyFrameworkService } from '../../data-privacy/services/data-privacy-framework.service';
import { DataCleaningService } from './data-cleaning.service';
import { DataStandardizationService } from './data-standardization.service';
import {
  CollectedData,
  ProcessedData,
  CollectionTaskConfig,
  ValidationResult,
  DataQualityException,
} from '../interfaces/data-pipeline.interface';
import {
  PipelineDefinition,
  PipelineStep,
  PipelineExecutionState,
  PipelineExecutionResult,
  PipelineMonitoringConfig,
} from '../interfaces/pipeline-definition.interface';

/**
 * 数据管道服务
 * 
 * 实现完整的数据管道框架：
 * 1. 数据采集管道（data_collection_pipeline）
 * 2. 数据处理管道（data_processing_pipeline）
 * 3. 数据应用管道（data_application_pipeline）
 */
@Injectable()
export class DataPipelineService {
  private readonly logger = new Logger(DataPipelineService.name);

  constructor(
    private readonly dataCleaningService: DataCleaningService,
    private readonly dataStandardizationService: DataStandardizationService,
    @Optional() private readonly dataQualityFramework?: DataQualityFrameworkService,
    @Optional() private readonly dataPrivacyFramework?: DataPrivacyFrameworkService,
  ) {}

  /**
   * 数据采集管道
   */
  async dataCollectionPipeline(
    collectionTasks?: Record<string, CollectionTaskConfig>,
  ): Promise<CollectedData> {
    this.logger.log('Starting data collection pipeline');

    // 默认采集任务配置
    const defaultTasks: Record<string, CollectionTaskConfig> = {
      userData: { frequency: 'on_change', source: 'user_input' },
      routeData: { frequency: 'daily', source: 'internal_db' },
      weatherData: { frequency: '3_hours', source: 'weather_api' },
      crowdData: { frequency: '30_minutes', source: 'crowd_sensor' },
    };

    const tasks = collectionTasks || defaultTasks;
    const collectedData: CollectedData = {};

    for (const [taskName, taskConfig] of Object.entries(tasks)) {
      try {
        // 获取数据
        const rawData = await this.fetchData(taskConfig.source, taskConfig.frequency);

        // 验证数据
        const validated = await this.validateSchema(rawData, taskName);

        if (validated.valid) {
          collectedData[taskName] = {
            rawData,
            collectedAt: new Date(),
            source: taskConfig.source,
            metadata: {
              frequency: taskConfig.frequency,
              sourceId: taskConfig.sourceId,
              config: taskConfig.config,
            },
          };

          // 存储原始数据（可选）
          // await this.storeRawData(taskName, rawData);
        } else {
          this.logger.warn(`Validation failed for ${taskName}:`, validated.errors);
          await this.logValidationError(taskName, validated);
        }
      } catch (error) {
        this.logger.error(`Failed to collect data for ${taskName}:`, error);
      }
    }

    this.logger.log(`Data collection completed: ${Object.keys(collectedData).length} tasks succeeded`);

    return collectedData;
  }

  /**
   * 数据处理管道
   */
  async dataProcessingPipeline(rawData: CollectedData): Promise<ProcessedData> {
    this.logger.log('Starting data processing pipeline');

    // Step 1: 清洗
    const cleanedData = await this.cleanData(rawData);

    // Step 2: 转换与标准化
    const standardizedData = await this.standardizeData(cleanedData);

    // Step 3: 数据融合（可选，需要数据融合服务）
    // const fusedData = await this.fuseMultipleSources(standardizedData);

    // Step 4: 特征工程（可选）
    // const engineeredFeatures = await this.engineerFeatures(standardizedData);

    return {
      cleaned: cleanedData,
      standardized: standardizedData,
      processedAt: new Date(),
      metadata: {
        sourceCount: Object.keys(rawData).length,
        processingSteps: ['cleaning', 'standardization'],
      },
    };
  }

  /**
   * 数据应用管道
   */
  async dataApplicationPipeline(processedData: ProcessedData): Promise<void> {
    this.logger.log('Starting data application pipeline');

    // 流向AI推理系统
    const inferenceData = this.extractInferenceFeatures(processedData);
    await this.sendToInferenceEngine(inferenceData);

    // 流向风险控制系统
    const riskData = this.extractRiskFeatures(processedData);
    await this.sendToRiskSystem(riskData);

    // 流向决策支持系统
    const decisionData = this.extractDecisionFeatures(processedData);
    await this.sendToDecisionSystem(decisionData);

    // 流向用户界面
    const uiData = this.prepareUIData(processedData);
    await this.sendToUI(uiData);

    // 存储到决策日志
    await this.logDecisionData(processedData);
  }

  /**
   * 完整数据流处理
   */
  async processDataFlow(
    userInput?: Record<string, any>,
    collectionTasks?: Record<string, CollectionTaskConfig>,
  ): Promise<ProcessedData> {
    this.logger.log('Starting complete data flow processing');

    // 1. 数据采集
    const rawData = await this.dataCollectionPipeline(collectionTasks);

    // 2. 数据验证（质量检查）
    if (this.dataQualityFramework) {
      const qualityCheck = await this.dataQualityFramework.assessOverallQuality(rawData, {
        requiredFields: [],
      });

      if (qualityCheck.overallScore < 0.8) {
        this.logger.warn(`Data quality below threshold: ${qualityCheck.overallScore}`);
        throw new DataQualityException('数据质量不达标', qualityCheck);
      }
    }

    // 3. 数据处理
    const processedData = await this.dataProcessingPipeline(rawData);

    // 4. 数据应用
    await this.dataApplicationPipeline(processedData);

    return processedData;
  }

  // ========== 辅助方法 ==========

  /**
   * 获取数据
   */
  private async fetchData(source: string, frequency: string): Promise<any> {
    // 模拟数据获取
    // 实际实现应该根据source类型调用相应的服务
    this.logger.debug(`Fetching data from ${source} with frequency ${frequency}`);

    // 返回模拟数据
    return {
      source,
      frequency,
      timestamp: new Date().toISOString(),
      data: {},
    };
  }

  /**
   * 验证数据模式
   */
  private async validateSchema(data: any, taskName: string): Promise<ValidationResult> {
    const errors: ValidationResult['errors'] = [];
    const warnings: ValidationResult['warnings'] = [];

    // 基本验证
    if (!data) {
      errors.push({
        field: 'root',
        message: 'Data is null or undefined',
        code: 'MISSING_DATA',
      });
    }

    // 根据任务类型进行特定验证
    if (taskName === 'userData' && !data.userId) {
      errors.push({
        field: 'userId',
        message: 'User ID is required',
        code: 'MISSING_FIELD',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 记录验证错误
   */
  private async logValidationError(taskName: string, validation: ValidationResult): Promise<void> {
    this.logger.error(`Validation error for ${taskName}:`, validation.errors);
    // 实际实现应该记录到数据库或日志系统
  }

  /**
   * 清洗数据（委托给清洗服务）
   */
  private async cleanData(rawData: CollectedData): Promise<any> {
    // 合并所有采集的数据
    const combinedData: any = {};
    for (const [taskName, taskData] of Object.entries(rawData)) {
      combinedData[taskName] = taskData.rawData;
    }

    const cleaned = await this.dataCleaningService.cleanData(combinedData);
    return cleaned;
  }

  /**
   * 标准化数据（委托给标准化服务）
   */
  private async standardizeData(cleanedData: any): Promise<any> {
    const standardized = await this.dataStandardizationService.standardizeData(cleanedData);
    return standardized;
  }

  /**
   * 提取推理特征
   */
  private extractInferenceFeatures(processedData: ProcessedData): any {
    return {
      standardized: processedData.standardized.units,
      metadata: processedData.metadata,
    };
  }

  /**
   * 提取风险特征
   */
  private extractRiskFeatures(processedData: ProcessedData): any {
    return {
      cleaned: processedData.cleaned,
      metadata: processedData.metadata,
    };
  }

  /**
   * 提取决策特征
   */
  private extractDecisionFeatures(processedData: ProcessedData): any {
    return {
      standardized: processedData.standardized,
      metadata: processedData.metadata,
    };
  }

  /**
   * 准备UI数据
   */
  private prepareUIData(processedData: ProcessedData): any {
    return {
      data: processedData.standardized.units,
      processedAt: processedData.processedAt,
    };
  }

  /**
   * 发送到推理引擎
   */
  private async sendToInferenceEngine(_data: any): Promise<void> {
    this.logger.debug('Sending data to inference engine');
    // 实际实现应该调用推理引擎服务
  }

  /**
   * 发送到风险系统
   */
  private async sendToRiskSystem(_data: any): Promise<void> {
    this.logger.debug('Sending data to risk system');
    // 实际实现应该调用风险系统服务
  }

  /**
   * 发送到决策系统
   */
  private async sendToDecisionSystem(_data: any): Promise<void> {
    this.logger.debug('Sending data to decision system');
    // 实际实现应该调用决策系统服务
  }

  /**
   * 发送到UI
   */
  private async sendToUI(_data: any): Promise<void> {
    this.logger.debug('Sending data to UI');
    // 实际实现应该调用UI服务或通过WebSocket推送
  }

  /**
   * 记录决策数据
   */
  private async logDecisionData(_processedData: ProcessedData): Promise<void> {
    this.logger.debug('Logging decision data');
    // 实际实现应该记录到决策日志表
  }

  // ========== 管道定义和执行（增强功能）==========

  /**
   * 创建管道定义
   */
  createPipelineDefinition(
    name: string,
    steps: Array<Omit<PipelineStep, 'id' | 'status'>>,
    description?: string
  ): PipelineDefinition {
    const pipelineId = `pipeline_${Date.now()}`;
    const pipelineSteps: PipelineStep[] = steps.map((step, index) => ({
      ...step,
      id: `step_${index}_${Date.now()}`,
      status: 'PENDING',
      retryConfig: step.retryConfig || {
        maxRetries: 3,
        retryDelay: 1000,
        backoffMultiplier: 2,
      },
      timeout: step.timeout || 30000,
      errorHandler: step.errorHandler || 'RETRY',
    }));

    return {
      id: pipelineId,
      name,
      description,
      steps: pipelineSteps,
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: '1.0.0',
      },
    };
  }

  /**
   * 执行管道
   */
  async executePipeline(
    definition: PipelineDefinition,
    inputData?: any,
    _monitoringConfig?: PipelineMonitoringConfig
  ): Promise<PipelineExecutionResult> {
    const executionId = `exec_${Date.now()}`;
    const startTime = new Date().toISOString();
    
    this.logger.log(`Executing pipeline: ${definition.name} (${executionId})`);

    const executionState: PipelineExecutionState = {
      executionId,
      pipelineId: definition.id,
      status: 'RUNNING',
      stepStates: new Map(),
      startTime,
      errors: [],
      metrics: {
        totalSteps: definition.steps.length,
        completedSteps: 0,
        failedSteps: 0,
        skippedSteps: 0,
        totalDuration: 0,
        stepDurations: {},
      },
    };

    let currentData: any = inputData;
    let outputData: ProcessedData | undefined;

    try {
      // 按依赖顺序执行步骤
      const executionOrder = this.resolveExecutionOrder(definition.steps);
      
      for (const stepId of executionOrder) {
        const step = definition.steps.find(s => s.id === stepId);
        if (!step) continue;

        executionState.currentStepId = stepId;
        executionState.stepStates.set(stepId, 'RUNNING');
        const stepStartTime = Date.now();

        try {
          currentData = await this.executePipelineStep(step, currentData);
          executionState.stepStates.set(stepId, 'COMPLETED');
          executionState.metrics.completedSteps++;
          executionState.metrics.stepDurations[stepId] = Date.now() - stepStartTime;
        } catch (error: any) {
          executionState.stepStates.set(stepId, 'FAILED');
          executionState.metrics.failedSteps++;
          executionState.metrics.stepDurations[stepId] = Date.now() - stepStartTime;
          executionState.errors.push({
            stepId,
            error: error.message || String(error),
            timestamp: new Date().toISOString(),
          });

          // 错误处理
          const shouldContinue = await this.handlePipelineStepError(
            step,
            error,
            executionState,
            definition
          );
          if (!shouldContinue) {
            executionState.status = 'FAILED';
            break;
          }
        }
      }

      executionState.status = executionState.metrics.failedSteps === 0 ? 'COMPLETED' : 'FAILED';
      executionState.endTime = new Date().toISOString();
      executionState.metrics.totalDuration = 
        new Date(executionState.endTime).getTime() - new Date(executionState.startTime).getTime();

      if (currentData && typeof currentData === 'object' && 'processedAt' in currentData) {
        outputData = currentData as ProcessedData;
      }

      const qualityMetrics = outputData
        ? await this.calculatePipelineQualityMetrics(outputData)
        : undefined;

      const recommendations = this.generatePipelineRecommendations(executionState, qualityMetrics);

      const resultStatus: PipelineExecutionResult['status'] = 
        executionState.status === 'COMPLETED' && executionState.metrics.failedSteps === 0
          ? 'SUCCESS'
          : executionState.metrics.completedSteps > 0
          ? 'PARTIAL_SUCCESS'
          : 'FAILED';

      return {
        executionId,
        pipelineId: definition.id,
        status: resultStatus,
        output: outputData,
        executionState,
        qualityMetrics,
        recommendations,
      };
    } catch (error: any) {
      this.logger.error(`Pipeline execution failed: ${error.message}`, error.stack);
      executionState.status = 'FAILED';
      executionState.endTime = new Date().toISOString();
      
      return {
        executionId,
        pipelineId: definition.id,
        status: 'FAILED',
        executionState,
        recommendations: [`管道执行失败: ${error.message}`],
      };
    }
  }

  /**
   * 解析执行顺序
   */
  private resolveExecutionOrder(steps: PipelineStep[]): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (stepId: string): void => {
      if (visiting.has(stepId)) {
        throw new Error(`Circular dependency detected: ${stepId}`);
      }
      if (visited.has(stepId)) return;

      visiting.add(stepId);
      const step = steps.find(s => s.id === stepId);
      if (step?.dependencies) {
        for (const depId of step.dependencies) {
          visit(depId);
        }
      }
      visiting.delete(stepId);
      visited.add(stepId);
      order.push(stepId);
    };

    for (const step of steps) {
      if (!visited.has(step.id)) {
        visit(step.id);
      }
    }

    return order;
  }

  /**
   * 执行管道步骤
   */
  private async executePipelineStep(
    step: PipelineStep,
    inputData: any
  ): Promise<any> {
    const timeout = step.timeout || 30000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Step ${step.name} timeout`)), timeout);
    });

    const stepPromise = (async () => {
      switch (step.type) {
        case 'COLLECT':
          return await this.dataCollectionPipeline(step.config as Record<string, CollectionTaskConfig>);
        case 'VALIDATE':
          return await this.validateSchema(inputData, step.name);
        case 'CLEAN':
          return await this.dataCleaningService.cleanData(inputData);
        case 'STANDARDIZE':
          return await this.dataStandardizationService.standardizeData(inputData);
        case 'APPLY':
          return await this.dataApplicationPipeline(inputData as ProcessedData);
        default:
          return inputData;
      }
    })();

    return await Promise.race([stepPromise, timeoutPromise]);
  }

  /**
   * 处理管道步骤错误
   */
  private async handlePipelineStepError(
    step: PipelineStep,
    error: Error,
    executionState: PipelineExecutionState,
    definition: PipelineDefinition
  ): Promise<boolean> {
    const lastError = executionState.errors[executionState.errors.length - 1];
    const retryCount = (lastError?.retryCount || 0) + 1;

    switch (step.errorHandler) {
      case 'ABORT':
        return false;
      case 'SKIP':
        executionState.stepStates.set(step.id, 'SKIPPED');
        executionState.metrics.skippedSteps++;
        return true;
      case 'RETRY':
        if (retryCount <= (step.retryConfig?.maxRetries || 3)) {
          const delay = (step.retryConfig?.retryDelay || 1000) * 
                       Math.pow(step.retryConfig?.backoffMultiplier || 2, retryCount - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
          if (lastError) lastError.retryCount = retryCount;
          return true; // 继续重试
        }
        return false;
      case 'FALLBACK':
        if (step.fallbackStepId) {
          const fallbackStep = definition.steps.find(s => s.id === step.fallbackStepId);
          if (fallbackStep) {
            executionState.stepStates.set(step.id, 'SKIPPED');
            executionState.metrics.skippedSteps++;
            return true;
          }
        }
        return false;
      default:
        return false;
    }
  }

  /**
   * 计算管道质量指标
   */
  private async calculatePipelineQualityMetrics(
    processedData: ProcessedData
  ): Promise<PipelineExecutionResult['qualityMetrics']> {
    if (!this.dataQualityFramework) {
      return undefined;
    }

    const assessment = await this.dataQualityFramework.assessOverallQuality(processedData);
    return {
      overallScore: assessment.overallScore,
      completeness: assessment.completeness.currentValue,
      accuracy: assessment.accuracy.currentValue,
      timeliness: assessment.timeliness.currentValue,
    };
  }

  /**
   * 生成管道建议
   */
  private generatePipelineRecommendations(
    executionState: PipelineExecutionState,
    qualityMetrics?: PipelineExecutionResult['qualityMetrics']
  ): string[] {
    const recommendations: string[] = [];

    if (executionState.metrics.failedSteps > 0) {
      recommendations.push(`有 ${executionState.metrics.failedSteps} 个步骤失败，建议检查错误日志`);
    }

    if (qualityMetrics && qualityMetrics.overallScore < 0.7) {
      recommendations.push(`数据质量较低（${(qualityMetrics.overallScore * 100).toFixed(1)}%），建议改进数据源`);
    }

    return recommendations;
  }
}
