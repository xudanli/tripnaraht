// src/data-quality/services/data-lineage.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  LineageTree,
  DataSourceNode,
  ProcessingStep,
  UserFriendlyExplanation,
  LineageQueryOptions,
} from '../interfaces/data-lineage.interface';
import { ExtendedDataSourceInfo } from '../interfaces/source-annotation.interface';
import { SourceAnnotationService } from './source-annotation.service';

/**
 * 数据血统追踪服务
 * 
 * 实现P2要求的：
 * - LineageTree结构
 * - 处理步骤记录
 * - 用户友好的解释生成
 */
@Injectable()
export class DataLineageService {
  private readonly logger = new Logger(DataLineageService.name);

  constructor(private readonly sourceAnnotationService: SourceAnnotationService) {}

  /**
   * 追踪数据的完整来源路径
   */
  async traceLineage(
    finalOutput: any,
    context?: {
      dataSources?: Record<string, any>;
      processingHistory?: Array<{
        operation: string;
        input: any[];
        output: any;
        method: string;
        parameters?: Record<string, any>;
        timestamp?: string;
        duration?: number;
      }>;
      assumptions?: string[];
      limitations?: string[];
    },
  ): Promise<LineageTree> {
    this.logger.log('Tracing data lineage for final output');

    // 1. 构建数据源节点
    const dataSources: Record<string, DataSourceNode> = {};
    if (context?.dataSources) {
      for (const [sourceId, sourceData] of Object.entries(context.dataSources)) {
        // 为数据源添加来源标注
        const annotated = await this.sourceAnnotationService.annotateAllInformation(sourceData);
        const firstAnnotated = Object.values(annotated.annotatedData)[0];

        if (firstAnnotated) {
          const sourceInfo = firstAnnotated.source;
          dataSources[sourceId] = {
            sourceId,
            type: sourceInfo.type,
            data: this.summarizeData(sourceData),
            reliability: sourceInfo.confidence,
            freshness: this.calculateFreshness(sourceInfo.timestamp, sourceInfo.expiry),
            sourceInfo,
            metadata: {
              totalFields: annotated.statistics.totalFields,
              annotatedFields: annotated.statistics.annotatedFields,
            },
          };
        } else {
          // 如果没有标注信息，创建默认节点
          dataSources[sourceId] = {
            sourceId,
            type: 'UNKNOWN',
            data: this.summarizeData(sourceData),
            reliability: 0.5,
            freshness: {
              timestamp: new Date().toISOString(),
              age: '未知',
              isStale: false,
            },
            sourceInfo: this.createDefaultSourceInfo(sourceId),
          };
        }
      }
    }

    // 2. 构建处理步骤
    const processingSteps: ProcessingStep[] = [];
    if (context?.processingHistory) {
      let stepNumber = 1;
      for (const historyItem of context.processingHistory) {
        // 推断输入数据源ID
        const inputSourceIds = this.inferInputSourceIds(historyItem.input, dataSources);

        processingSteps.push({
          step: stepNumber++,
          operation: historyItem.operation,
          input: inputSourceIds,
          output: this.summarizeData(historyItem.output),
          method: historyItem.method,
          parameters: historyItem.parameters,
          timestamp: historyItem.timestamp || new Date().toISOString(),
          duration: historyItem.duration,
          dependencies: stepNumber > 1 ? [stepNumber - 2] : undefined,
        });
      }
    }

    // 3. 计算最终置信度
    const confidence = this.calculateFinalConfidence(dataSources, processingSteps);

    // 4. 构建LineageTree
    const lineageTree: LineageTree = {
      dataSources,
      processingSteps,
      finalOutput: this.summarizeData(finalOutput),
      confidence,
      assumptions: context?.assumptions || this.generateDefaultAssumptions(dataSources),
      limitations: context?.limitations || this.generateDefaultLimitations(dataSources),
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: '1.0',
      },
    };

    this.logger.log(`Data lineage traced: ${Object.keys(dataSources).length} sources, ${processingSteps.length} steps`);

    return lineageTree;
  }

  /**
   * 生成用户友好的解释
   */
  async generateUserFriendlyExplanation(
    lineage: LineageTree,
    options?: LineageQueryOptions,
  ): Promise<UserFriendlyExplanation> {
    this.logger.log('Generating user-friendly explanation for lineage');

    // 生成简短总结
    const summary = this.generateSummary(lineage);

    // 生成详细解释
    const detailedExplanation = this.generateDetailedExplanation(lineage, options);

    // 生成数据来源说明
    const sourceExplanation = this.generateSourceExplanation(lineage);

    // 生成处理过程说明
    const processExplanation = this.generateProcessExplanation(lineage);

    // 生成置信度说明
    const confidenceExplanation = this.generateConfidenceExplanation(lineage);

    // 生成可视化表示（可选）
    const visualization = options?.generateExplanation
      ? this.generateVisualization(lineage)
      : undefined;

    return {
      summary,
      detailedExplanation,
      sourceExplanation,
      processExplanation,
      confidenceExplanation,
      visualization,
    };
  }

  /**
   * 查询数据血统
   */
  async queryLineage(
    outputValue: any,
    options?: LineageQueryOptions,
  ): Promise<{
    lineage: LineageTree;
    explanation?: UserFriendlyExplanation;
  }> {
    // 简化实现：基于输出值推断血统
    // 实际应该从存储中查询或从上下文构建
    const lineage = await this.traceLineage(outputValue);

    const explanation = options?.generateExplanation
      ? await this.generateUserFriendlyExplanation(lineage, options)
      : undefined;

    return { lineage, explanation };
  }

  // ========== 私有辅助方法 ==========

  /**
   * 汇总数据（避免存储完整数据）
   */
  private summarizeData(data: any): any {
    if (data === null || data === undefined) {
      return null;
    }

    if (typeof data === 'string') {
      return data.length > 100 ? data.substring(0, 100) + '...' : data;
    }

    if (typeof data === 'number' || typeof data === 'boolean') {
      return data;
    }

    if (Array.isArray(data)) {
      return {
        type: 'array',
        length: data.length,
        sample: data.slice(0, 3),
      };
    }

    if (typeof data === 'object') {
      const keys = Object.keys(data);
      return {
        type: 'object',
        keys: keys.slice(0, 10),
        keyCount: keys.length,
        sample: Object.fromEntries(
          Object.entries(data)
            .slice(0, 3)
            .map(([k, v]) => [k, this.summarizeData(v)]),
        ),
      };
    }

    return String(data).substring(0, 100);
  }

  /**
   * 计算数据新鲜度
   */
  private calculateFreshness(timestamp: string, expiry?: string): {
    timestamp: string;
    age: string;
    isStale: boolean;
  } {
    const timestampDate = new Date(timestamp);
    const now = new Date();
    const ageMs = now.getTime() - timestampDate.getTime();

    // 计算年龄描述
    let age: string;
    if (ageMs < 60000) {
      age = '刚刚';
    } else if (ageMs < 3600000) {
      age = `${Math.floor(ageMs / 60000)}分钟前`;
    } else if (ageMs < 86400000) {
      age = `${Math.floor(ageMs / 3600000)}小时前`;
    } else {
      age = `${Math.floor(ageMs / 86400000)}天前`;
    }

    // 判断是否过期
    let isStale = false;
    if (expiry) {
      const expiryDate = new Date(expiry);
      isStale = now.getTime() > expiryDate.getTime();
    } else {
      // 如果没有过期时间，超过7天认为可能过期
      isStale = ageMs > 7 * 24 * 3600000;
    }

    return {
      timestamp,
      age,
      isStale,
    };
  }

  /**
   * 创建默认来源信息
   */
  private createDefaultSourceInfo(sourceId: string): ExtendedDataSourceInfo {
    return {
      type: 'OTHER',
      timestamp: new Date().toISOString(),
      reliability: 'MEDIUM',
      source: 'DATABASE',
      sourceName: sourceId,
      confidence: 0.5,
      verificationLevel: 'D_PENDING',
      isFactual: false,
    };
  }

  /**
   * 推断输入数据源ID
   */
  private inferInputSourceIds(
    input: any[],
    dataSources: Record<string, DataSourceNode>,
  ): string[] {
    const sourceIds: string[] = [];

    // 简化实现：基于输入数据匹配数据源
    for (const [sourceId, sourceNode] of Object.entries(dataSources)) {
      // 检查输入是否包含该数据源的数据
      if (this.dataMatches(input, sourceNode.data)) {
        sourceIds.push(sourceId);
      }
    }

    // 如果没有匹配到，创建临时数据源ID
    if (sourceIds.length === 0 && input.length > 0) {
      const tempId = `temp_${Date.now()}`;
      sourceIds.push(tempId);
    }

    return sourceIds;
  }

  /**
   * 检查数据是否匹配
   */
  private dataMatches(input: any[], sourceData: any): boolean {
    // 简化实现：检查输入中是否包含源数据的特征
    return input.some(item => {
      if (typeof item === 'object' && typeof sourceData === 'object') {
        const itemKeys = Object.keys(item || {});
        const sourceKeys = Object.keys(sourceData || {});
        return itemKeys.some(k => sourceKeys.includes(k));
      }
      return false;
    });
  }

  /**
   * 计算最终置信度
   */
  private calculateFinalConfidence(
    dataSources: Record<string, DataSourceNode>,
    processingSteps: ProcessingStep[],
  ): number {
    if (Object.keys(dataSources).length === 0) {
      return 0.5; // 默认置信度
    }

    // 基于数据源可靠性计算
    const sourceReliabilities = Object.values(dataSources).map(s => s.reliability);
    const avgSourceReliability =
      sourceReliabilities.reduce((a, b) => a + b, 0) / sourceReliabilities.length;

    // 基于处理步骤数量调整（步骤越多，可能引入更多不确定性）
    const stepPenalty = Math.min(0.1, processingSteps.length * 0.01);

    return Math.max(0, Math.min(1, avgSourceReliability - stepPenalty));
  }

  /**
   * 生成默认假设
   */
  private generateDefaultAssumptions(
    dataSources: Record<string, DataSourceNode>,
  ): string[] {
    const assumptions: string[] = [
      '数据来源信息准确',
      '数据处理方法正确',
      '环境条件在预测范围内',
    ];

    // 基于数据源添加特定假设
    for (const source of Object.values(dataSources)) {
      if (source.sourceInfo.verificationLevel === 'D_PENDING') {
        assumptions.push(`数据源"${source.sourceId}"待验证`);
      }
      if (source.freshness.isStale) {
        assumptions.push(`数据源"${source.sourceId}"可能已过期`);
      }
    }

    return assumptions;
  }

  /**
   * 生成默认限制
   */
  private generateDefaultLimitations(
    dataSources: Record<string, DataSourceNode>,
  ): string[] {
    const limitations: string[] = [
      '预测基于历史数据和当前信息，实际结果可能有所不同',
      '数据质量可能影响结果准确性',
    ];

    // 基于数据源添加特定限制
    for (const source of Object.values(dataSources)) {
      if (source.reliability < 0.7) {
        limitations.push(`数据源"${source.sourceId}"可靠性较低`);
      }
      if (source.sourceInfo.verificationLevel === 'E_LLM_GENERATED') {
        limitations.push(`数据源"${source.sourceId}"包含AI生成内容`);
      }
    }

    return limitations;
  }

  /**
   * 生成简短总结
   */
  private generateSummary(lineage: LineageTree): string {
    const sourceCount = Object.keys(lineage.dataSources).length;
    const stepCount = lineage.processingSteps.length;
    const confidencePercent = Math.round(lineage.confidence * 100);

    return `此结果基于${sourceCount}个数据源，经过${stepCount}个处理步骤生成，置信度为${confidencePercent}%。`;
  }

  /**
   * 生成详细解释
   */
  private generateDetailedExplanation(
    lineage: LineageTree,
    options?: LineageQueryOptions,
  ): string {
    const parts: string[] = [];

    // 数据来源部分
    parts.push('## 数据来源');
    for (const [sourceId, source] of Object.entries(lineage.dataSources)) {
      parts.push(`- **${sourceId}**：${source.type}（可靠性：${Math.round(source.reliability * 100)}%）`);
      if (source.freshness.isStale) {
        parts.push(`  - ⚠️ 数据可能已过期（${source.freshness.age}）`);
      }
    }

    // 处理步骤部分
    if (options?.includeSteps !== false) {
      parts.push('\n## 处理步骤');
      for (const step of lineage.processingSteps) {
        parts.push(
          `${step.step}. **${step.operation}**：使用${step.method}方法处理，输入来自${step.input.join('、')}`,
        );
        if (step.duration) {
          parts.push(`   - 耗时：${step.duration}ms`);
        }
      }
    }

    // 假设和限制
    if (lineage.assumptions.length > 0) {
      parts.push('\n## 假设');
      lineage.assumptions.forEach(a => parts.push(`- ${a}`));
    }

    if (lineage.limitations.length > 0) {
      parts.push('\n## 限制');
      lineage.limitations.forEach(l => parts.push(`- ${l}`));
    }

    return parts.join('\n');
  }

  /**
   * 生成数据来源说明
   */
  private generateSourceExplanation(lineage: LineageTree): string {
    const sources = Object.values(lineage.dataSources);
    if (sources.length === 0) {
      return '无数据来源信息';
    }

    const sourceDescriptions = sources.map(source => {
      const reliabilityText =
        source.reliability >= 0.9
          ? '高'
          : source.reliability >= 0.7
            ? '中'
            : '低';
      return `- ${source.sourceId}（${source.type}，可靠性${reliabilityText}）`;
    });

    return `数据来自以下${sources.length}个来源：\n${sourceDescriptions.join('\n')}`;
  }

  /**
   * 生成处理过程说明
   */
  private generateProcessExplanation(lineage: LineageTree): string {
    if (lineage.processingSteps.length === 0) {
      return '无处理步骤记录';
    }

    const stepDescriptions = lineage.processingSteps.map(step => {
      return `${step.step}. ${step.operation}（${step.method}）`;
    });

    return `数据经过以下${lineage.processingSteps.length}个处理步骤：\n${stepDescriptions.join('\n')}`;
  }

  /**
   * 生成置信度说明
   */
  private generateConfidenceExplanation(lineage: LineageTree): string {
    const confidencePercent = Math.round(lineage.confidence * 100);
    let confidenceLevel: string;

    if (lineage.confidence >= 0.9) {
      confidenceLevel = '高';
    } else if (lineage.confidence >= 0.7) {
      confidenceLevel = '中';
    } else if (lineage.confidence >= 0.5) {
      confidenceLevel = '中等偏低';
    } else {
      confidenceLevel = '低';
    }

    const factors: string[] = [];

    // 基于数据源可靠性
    const avgReliability =
      Object.values(lineage.dataSources).reduce((sum, s) => sum + s.reliability, 0) /
      Math.max(1, Object.keys(lineage.dataSources).length);
    if (avgReliability < 0.7) {
      factors.push('数据源可靠性较低');
    }

    // 基于处理步骤数量
    if (lineage.processingSteps.length > 5) {
      factors.push('处理步骤较多，可能引入误差');
    }

    // 基于过期数据
    const staleSources = Object.values(lineage.dataSources).filter(s => s.freshness.isStale);
    if (staleSources.length > 0) {
      factors.push(`${staleSources.length}个数据源可能已过期`);
    }

    let explanation = `置信度为${confidencePercent}%（${confidenceLevel}）`;
    if (factors.length > 0) {
      explanation += `。影响因素：${factors.join('、')}`;
    }

    return explanation;
  }

  /**
   * 生成可视化表示
   */
  private generateVisualization(lineage: LineageTree): UserFriendlyExplanation['visualization'] {
    // 生成树形结构数据
    const treeData = {
      root: {
        name: '最终输出',
        value: lineage.finalOutput,
        confidence: lineage.confidence,
        children: lineage.processingSteps.map(step => ({
          name: step.operation,
          method: step.method,
          children: step.input.map(inputId => {
            const source = lineage.dataSources[inputId];
            return source
              ? {
                  name: source.sourceId,
                  type: source.type,
                  reliability: source.reliability,
                }
              : { name: inputId, type: 'UNKNOWN' };
          }),
        })),
      },
    };

    return {
      type: 'TREE',
      data: treeData,
    };
  }
}
