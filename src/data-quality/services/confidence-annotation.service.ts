// src/data-quality/services/confidence-annotation.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  ConfidenceLevel,
  ConfidenceLevelDefinition,
  UncertaintyAnnotation,
  EnhancedConfidenceAnnotation,
  ConfidenceAnnotatedData,
  BatchConfidenceAnnotationResult,
  ConfidenceAnnotationConfig,
} from '../interfaces/confidence-annotation.interface';
import {
  ExtendedDataSourceInfo,
  VerificationLevel,
  SourceAnnotatedData,
} from '../interfaces/source-annotation.interface';
import { SourceAnnotationService } from './source-annotation.service';

/**
 * 置信度标注服务
 * 
 * 实现P2要求的：
 * - 信息可信度标注（A/B/C/D等级）
 * - 为所有信息添加来源和置信度
 * - 不确定信息的标注
 */
@Injectable()
export class ConfidenceAnnotationService {
  private readonly logger = new Logger(ConfidenceAnnotationService.name);

  /**
   * 置信度等级定义
   */
  private readonly confidenceLevelDefinitions: Record<ConfidenceLevel, ConfidenceLevelDefinition> = {
    A: {
      level: 'A',
      name: '高可信度',
      confidenceRange: { min: 0.9, max: 1.0 },
      description: '信息高度可信，来自多个独立可靠来源，已充分验证',
      usageGuidance: '可以直接使用，无需额外验证',
    },
    B: {
      level: 'B',
      name: '可信',
      confidenceRange: { min: 0.7, max: 0.9 },
      description: '信息可信，来自官方或权威渠道，基本可靠',
      usageGuidance: '可以使用，但建议关注数据时效性',
    },
    C: {
      level: 'C',
      name: '中等可信度',
      confidenceRange: { min: 0.5, max: 0.7 },
      description: '信息中等可信，可能来自用户反馈或单一来源',
      usageGuidance: '谨慎使用，建议交叉验证',
    },
    D: {
      level: 'D',
      name: '低可信度',
      confidenceRange: { min: 0.0, max: 0.5 },
      description: '信息可信度较低，可能缺失、过期或未经验证',
      usageGuidance: '不建议直接使用，需要进一步验证',
    },
  };

  constructor(private readonly sourceAnnotationService: SourceAnnotationService) {}

  /**
   * 为所有信息添加置信度标注
   */
  async annotateAllWithConfidence(
    data: any,
    config?: ConfidenceAnnotationConfig,
  ): Promise<BatchConfidenceAnnotationResult> {
    this.logger.log('Starting confidence annotation for all information');

    const defaultConfig: ConfidenceAnnotationConfig = {
      showLowConfidence: true,
      showLLMGenerated: false,
      minConfidenceThreshold: 0.0,
      requireSourceVerification: false,
      ...config,
    };

    // 首先进行来源标注
    const sourceAnnotationResult = await this.sourceAnnotationService.annotateAllInformation(data);

    const annotatedData: Record<string, ConfidenceAnnotatedData> = {};
    const statistics = {
      totalFields: 0,
      annotatedFields: 0,
      levelA: 0,
      levelB: 0,
      levelC: 0,
      levelD: 0,
      uncertainFields: 0,
      llmGeneratedFields: 0,
    };

    const confidenceScores: number[] = [];

    // 为每个已标注的字段添加置信度标注
    for (const [key, sourceAnnotated] of Object.entries(sourceAnnotationResult.annotatedData)) {
      statistics.totalFields++;

      try {
        const confidenceAnnotated = await this.enhanceWithConfidence(
          key,
          sourceAnnotated,
          defaultConfig,
        );

        annotatedData[key] = confidenceAnnotated;
        statistics.annotatedFields++;

        // 更新统计
        const level = confidenceAnnotated.confidence.confidenceLevel;
        statistics[`level${level}` as keyof typeof statistics]++;

        if (confidenceAnnotated.confidence.uncertainty) {
          statistics.uncertainFields++;
        }

        if (sourceAnnotated.source.verificationLevel === 'E_LLM_GENERATED') {
          statistics.llmGeneratedFields++;
        }

        confidenceScores.push(confidenceAnnotated.confidence.confidenceScore);
      } catch (error) {
        this.logger.warn(`Failed to annotate confidence for field ${key}:`, error);
      }
    }

    // 计算总体置信度
    const averageScore =
      confidenceScores.length > 0
        ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
        : 0;
    const averageLevel = this.scoreToConfidenceLevel(averageScore);
    const lowestLevel = this.findLowestConfidenceLevel(annotatedData);

    this.logger.log(
      `Confidence annotation completed: ${statistics.annotatedFields}/${statistics.totalFields} fields annotated`,
    );

    return {
      annotatedData,
      statistics,
      overallConfidence: {
        averageScore,
        averageLevel,
        lowestLevel,
      },
      annotatedAt: new Date(),
    };
  }

  /**
   * 为单个字段增强置信度标注
   */
  async enhanceWithConfidence(
    fieldName: string,
    sourceAnnotated: SourceAnnotatedData,
    config: ConfidenceAnnotationConfig,
  ): Promise<ConfidenceAnnotatedData> {
    const source = sourceAnnotated.source;
    const confidenceScore = source.confidence;

    // 确定置信度等级
    const confidenceLevel = this.scoreToConfidenceLevel(confidenceScore);

    // 检测不确定信息
    const uncertainty = await this.detectUncertainty(fieldName, sourceAnnotated, confidenceScore);

    // 生成置信度理由
    const confidenceReason = this.generateConfidenceReason(source, confidenceLevel, uncertainty);

    // 生成用户友好的描述
    const userFriendlyDescription = this.generateUserFriendlyDescription(
      confidenceLevel,
      source,
      uncertainty,
    );

    // 构建增强的置信度标注
    const enhancedConfidence: EnhancedConfidenceAnnotation = {
      confidenceLevel,
      confidenceScore,
      source,
      verificationLevel: source.verificationLevel,
      uncertainty,
      confidenceReason,
      userFriendlyDescription,
    };

    // 确定是否显示给用户
    const shouldDisplay = this.shouldDisplayToUser(enhancedConfidence, config);

    // 生成显示建议
    const displaySuggestion = this.generateDisplaySuggestion(enhancedConfidence, config);

    return {
      value: sourceAnnotated.value,
      fieldName,
      confidence: enhancedConfidence,
      shouldDisplay,
      displaySuggestion,
    };
  }

  /**
   * 检测不确定信息
   */
  private async detectUncertainty(
    fieldName: string,
    sourceAnnotated: SourceAnnotatedData,
    confidenceScore: number,
  ): Promise<UncertaintyAnnotation | undefined> {
    const source = sourceAnnotated.source;

    // 1. LLM生成内容
    if (source.verificationLevel === 'E_LLM_GENERATED') {
      return {
        type: 'LLM_GENERATED',
        degree: 0.7,
        reason: '此信息由AI生成，未经验证',
        impact: ['准确性不确定', '可能需要人工验证'],
        mitigation: ['建议交叉验证', '查看原始数据源'],
      };
    }

    // 2. 数据缺失
    if (sourceAnnotated.value === null || sourceAnnotated.value === undefined) {
      return {
        type: 'MISSING_DATA',
        degree: 1.0,
        reason: '数据缺失',
        impact: ['无法提供准确信息'],
        mitigation: ['尝试从其他来源获取', '使用估算值'],
      };
    }

    // 3. 数据过期
    if (source.expiry) {
      const expiryTime = new Date(source.expiry).getTime();
      const now = Date.now();
      if (expiryTime < now) {
        const daysSinceExpiry = (now - expiryTime) / (1000 * 60 * 60 * 24);
        return {
          type: 'OUTDATED_DATA',
          degree: Math.min(1.0, daysSinceExpiry / 30), // 过期时间越长，不确定度越高
          reason: `数据已过期${Math.round(daysSinceExpiry)}天`,
          impact: ['信息可能已过时', '准确性可能下降'],
          mitigation: ['更新数据源', '验证当前状态'],
        };
      }
    }

    // 4. 估算值
    if (source.source === 'ESTIMATED' || source.type === 'ESTIMATED') {
      return {
        type: 'ESTIMATED_VALUE',
        degree: 0.6,
        reason: '此值为估算值，非实际测量',
        impact: ['可能存在误差'],
        mitigation: ['使用实际测量值', '了解估算方法'],
      };
    }

    // 5. 低置信度
    if (confidenceScore < 0.5) {
      return {
        type: 'LOW_CONFIDENCE',
        degree: 1.0 - confidenceScore,
        reason: `置信度较低（${Math.round(confidenceScore * 100)}%）`,
        impact: ['信息可靠性较低'],
        mitigation: ['寻找更多来源', '交叉验证'],
      };
    }

    // 6. 部分验证
    if (source.verificationLevel === 'D_PENDING') {
      return {
        type: 'PARTIAL_VERIFICATION',
        degree: 0.5,
        reason: '信息待验证',
        impact: ['未完全验证'],
        mitigation: ['等待验证完成', '使用已验证的替代信息'],
      };
    }

    return undefined;
  }

  /**
   * 评分转换为置信度等级
   */
  private scoreToConfidenceLevel(score: number): ConfidenceLevel {
    if (score >= 0.9) return 'A';
    if (score >= 0.7) return 'B';
    if (score >= 0.5) return 'C';
    return 'D';
  }

  /**
   * 查找最低置信度等级
   */
  private findLowestConfidenceLevel(
    annotatedData: Record<string, ConfidenceAnnotatedData>,
  ): ConfidenceLevel {
    const levels: ConfidenceLevel[] = Object.values(annotatedData).map(
      d => d.confidence.confidenceLevel,
    );

    if (levels.includes('D')) return 'D';
    if (levels.includes('C')) return 'C';
    if (levels.includes('B')) return 'B';
    return 'A';
  }

  /**
   * 生成置信度理由
   */
  private generateConfidenceReason(
    source: ExtendedDataSourceInfo,
    level: ConfidenceLevel,
    uncertainty?: UncertaintyAnnotation,
  ): string {
    const reasons: string[] = [];

    // 基于验证等级
    const verificationReasonMap: Record<VerificationLevel, string> = {
      A_VERIFIED: '已通过多个独立来源验证',
      B_RELIABLE: '来自官方或权威渠道',
      C_USER_FEEDBACK: '基于用户反馈',
      D_PENDING: '待验证',
      E_LLM_GENERATED: '由AI生成',
    };
    reasons.push(verificationReasonMap[source.verificationLevel]);

    // 基于可靠性
    if (source.reliability === 'HIGH') {
      reasons.push('数据源可靠性高');
    } else if (source.reliability === 'LOW') {
      reasons.push('数据源可靠性较低');
    }

    // 基于交叉验证
    if (source.crossValidationCount && source.crossValidationCount > 1) {
      reasons.push(`已通过${source.crossValidationCount}个来源交叉验证`);
    }

    // 基于不确定信息
    if (uncertainty) {
      reasons.push(`存在不确定性：${uncertainty.reason}`);
    }

    return reasons.join('；');
  }

  /**
   * 生成用户友好的描述
   */
  private generateUserFriendlyDescription(
    level: ConfidenceLevel,
    source: ExtendedDataSourceInfo,
    uncertainty?: UncertaintyAnnotation,
  ): string {
    const definition = this.confidenceLevelDefinitions[level];
    let description = `${definition.name}（${definition.description}）`;

    // 添加来源信息
    if (source.sourceName) {
      description += `，来源：${source.sourceName}`;
    }

    // 添加不确定信息
    if (uncertainty) {
      description += `。注意：${uncertainty.reason}`;
    }

    return description;
  }

  /**
   * 判断是否应该显示给用户
   */
  private shouldDisplayToUser(
    confidence: EnhancedConfidenceAnnotation,
    config: ConfidenceAnnotationConfig,
  ): boolean {
    // 如果置信度低于阈值，不显示
    if (confidence.confidenceScore < config.minConfidenceThreshold) {
      return false;
    }

    // 如果是LLM生成且配置不显示，不显示
    if (
      confidence.source.verificationLevel === 'E_LLM_GENERATED' &&
      !config.showLLMGenerated
    ) {
      return false;
    }

    // 如果置信度低且配置不显示低置信度，不显示
    if (confidence.confidenceLevel === 'D' && !config.showLowConfidence) {
      return false;
    }

    // 如果需要来源验证但未验证，不显示
    if (
      config.requireSourceVerification &&
      confidence.verificationLevel === 'D_PENDING'
    ) {
      return false;
    }

    return true;
  }

  /**
   * 生成显示建议
   */
  private generateDisplaySuggestion(
    confidence: EnhancedConfidenceAnnotation,
    _config: ConfidenceAnnotationConfig,
  ): ConfidenceAnnotatedData['displaySuggestion'] {
    const suggestion: ConfidenceAnnotatedData['displaySuggestion'] = {
      showConfidence: true,
      showSource: true,
      showUncertainty: !!confidence.uncertainty,
    };

    // 如果置信度低，建议显示警告
    if (confidence.confidenceLevel === 'D' || confidence.confidenceScore < 0.5) {
      suggestion.warningMessage = `此信息置信度较低（${confidence.confidenceLevel}级），请谨慎使用`;
    }

    // 如果有不确定信息，建议显示
    if (confidence.uncertainty) {
      suggestion.warningMessage = confidence.uncertainty.reason;
    }

    return suggestion;
  }

  /**
   * 获取置信度等级定义
   */
  getConfidenceLevelDefinition(level: ConfidenceLevel): ConfidenceLevelDefinition {
    return this.confidenceLevelDefinitions[level];
  }

  /**
   * 获取所有置信度等级定义
   */
  getAllConfidenceLevelDefinitions(): Record<ConfidenceLevel, ConfidenceLevelDefinition> {
    return this.confidenceLevelDefinitions;
  }

  /**
   * 格式化置信度标注（用于显示）
   */
  formatConfidenceAnnotation(confidence: EnhancedConfidenceAnnotation): string {
    const emojiMap: Record<ConfidenceLevel, string> = {
      A: '🟢',
      B: '🟡',
      C: '🟠',
      D: '🔴',
    };

    const definition = this.confidenceLevelDefinitions[confidence.confidenceLevel];
    const emoji = emojiMap[confidence.confidenceLevel];

    let formatted = `${emoji} **${confidence.confidenceLevel}级（${definition.name}）**\n`;
    formatted += `置信度：${Math.round(confidence.confidenceScore * 100)}%\n`;
    formatted += `来源：${confidence.source.sourceName}\n`;
    formatted += `说明：${confidence.userFriendlyDescription}\n`;

    if (confidence.uncertainty) {
      formatted += `\n⚠️ **不确定性**：${confidence.uncertainty.reason}\n`;
      if (confidence.uncertainty.mitigation && confidence.uncertainty.mitigation.length > 0) {
        formatted += `缓解措施：${confidence.uncertainty.mitigation.join('、')}\n`;
      }
    }

    return formatted;
  }
}
