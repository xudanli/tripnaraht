// src/agent/services/hallucination-detection.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  FactualClaim,
  VerifiedClaim,
  AnnotatedClaim,
  HallucinationMarkedClaim,
  HallucinationDetectionResult,
  UserNotification,
  ClaimType,
  ConfidenceLevel,
} from '../interfaces/hallucination-detection.interface';
import { SourceAnnotationService } from '../../data-quality/services/source-annotation.service';
import { ExtendedDataSourceInfo } from '../../data-quality/interfaces/source-annotation.interface';

/**
 * 防幻觉检测服务
 * 
 * 实现Step 8：幻觉检测
 * - 8.1：识别所有事实声明
 * - 8.2：来源验证
 * - 8.3：置信度标注
 * - 8.4：幻觉标记
 * - 8.5：用户通知
 */
@Injectable()
export class HallucinationDetectionService {
  private readonly logger = new Logger(HallucinationDetectionService.name);
  private readonly MINIMUM_RELIABILITY_THRESHOLD = 0.7;

  constructor(
    @Optional() private readonly sourceAnnotationService?: SourceAnnotationService,
  ) {}

  /**
   * Step 8: 幻觉检测
   */
  async detectHallucinations(
    output: any,
    _context?: any,
  ): Promise<HallucinationDetectionResult> {
    this.logger.log('Starting hallucination detection (Step 8)');

    // 8.1: 识别所有事实声明
    const factualClaims = this.extractFactualClaims(output);

    // 8.2: 来源验证
    const verifiedClaims = await this.verifySources(factualClaims);

    // 8.3: 置信度标注
    const annotatedClaims = await this.annotateConfidence(verifiedClaims);

    // 8.4: 幻觉标记
    const hallucinationMarked = await this.markHallucinations(annotatedClaims);

    // 8.5: 用户通知
    const userNotification = await this.generateUserNotification(hallucinationMarked);

    // 清理输出
    const cleanedOutput = this.removeHallucinations(output, hallucinationMarked);

    // 统计信息
    const statistics = {
      totalClaims: factualClaims.length,
      verifiedClaims: verifiedClaims.filter(c => c.verified).length,
      hallucinationRisks: hallucinationMarked.filter(c => c.isHallucinationRisk).length,
      removedClaims: hallucinationMarked.filter(c => c.action === 'REMOVE').length,
    };

    this.logger.log(
      `Hallucination detection completed: ${statistics.hallucinationRisks} risks found, ${statistics.removedClaims} claims removed`,
    );

    return {
      verifiedClaims,
      hallucinationRisks: hallucinationMarked.filter(c => c.isHallucinationRisk),
      userNotification,
      cleanedOutput,
      statistics,
    };
  }

  /**
   * 8.1: 识别所有事实声明
   */
  private extractFactualClaims(output: any): FactualClaim[] {
    const claims: FactualClaim[] = [];

    // 如果输出是字符串，提取事实性语句
    if (typeof output === 'string') {
      const sentences = this.splitIntoSentences(output);
      sentences.forEach((sentence, _index) => {
        const claimType = this.classifyClaimType(sentence);
        if (claimType === 'FACT') {
          claims.push({
            text: sentence,
            type: claimType,
            position: {
              start: output.indexOf(sentence),
              end: output.indexOf(sentence) + sentence.length,
            },
            entities: this.extractEntities(sentence),
          });
        }
      });
    } else if (typeof output === 'object' && output !== null) {
      // 如果输出是对象，递归提取
      this.extractClaimsFromObject(output, claims);
    }

    return claims;
  }

  /**
   * 8.2: 来源验证
   */
  private async verifySources(claims: FactualClaim[]): Promise<VerifiedClaim[]> {
    return Promise.all(
      claims.map(async claim => {
        // 搜索可靠来源
        const sources = await this.searchReliableSources(claim);

        if (!sources || sources.length === 0) {
          return {
            ...claim,
            verified: false,
            source: null,
            confidence: 0,
            verifiedAt: new Date(),
          };
        }

        // 检查数据新鲜度
        const freshSources = sources.filter(s => !this.isOutdated(s));

        // 检查来源可靠性
        const reliableSource = freshSources.find(
          s => (s.confidence || 0) >= this.MINIMUM_RELIABILITY_THRESHOLD,
        );

        return {
          ...claim,
          verified: !!reliableSource,
          source: reliableSource || null,
          confidence: reliableSource?.confidence || 0,
          verifiedAt: new Date(),
        };
      }),
    );
  }

  /**
   * 8.3: 置信度标注
   */
  private async annotateConfidence(claims: VerifiedClaim[]): Promise<AnnotatedClaim[]> {
    return claims.map(claim => {
      let confidenceLevel: ConfidenceLevel;

      if (claim.confidence > 0.95) {
        confidenceLevel = 'HIGH';
      } else if (claim.confidence > 0.7) {
        confidenceLevel = 'MEDIUM';
      } else if (claim.confidence > 0) {
        confidenceLevel = 'LOW';
      } else {
        confidenceLevel = 'NONE';
      }

      return {
        ...claim,
        confidenceLevel,
      };
    });
  }

  /**
   * 8.4: 幻觉标记
   */
  private async markHallucinations(
    claims: AnnotatedClaim[],
  ): Promise<HallucinationMarkedClaim[]> {
    return claims.map(claim => {
      const isHallucinationRisk =
        claim.confidenceLevel === 'NONE' ||
        (claim.confidenceLevel === 'LOW' && !claim.verified);

      let action: 'REMOVE' | 'KEEP' | 'FLAG';
      if (isHallucinationRisk && claim.confidenceLevel === 'NONE') {
        action = 'REMOVE';
      } else if (isHallucinationRisk) {
        action = 'FLAG';
      } else {
        action = 'KEEP';
      }

      return {
        ...claim,
        isHallucinationRisk,
        action,
      };
    });
  }

  /**
   * 8.5: 用户通知
   */
  private async generateUserNotification(
    claims: HallucinationMarkedClaim[],
  ): Promise<UserNotification> {
    const hallucinationRisks = claims.filter(c => c.isHallucinationRisk);

    if (hallucinationRisks.length === 0) {
      return {
        hasRisks: false,
        message: null,
      };
    }

    const removedClaims = hallucinationRisks.filter(c => c.action === 'REMOVE');
    const flaggedClaims = hallucinationRisks.filter(c => c.action === 'FLAG');

    let message = '';
    if (removedClaims.length > 0) {
      message += `以下信息无法验证来源，已从输出中移除：${removedClaims.map(c => c.text).join('、')}`;
    }
    if (flaggedClaims.length > 0) {
      if (message) message += '。';
      message += `以下信息置信度较低，请谨慎参考：${flaggedClaims.map(c => c.text).join('、')}`;
    }

    const lowConfidenceItems = claims
      .filter(c => c.confidenceLevel === 'LOW')
      .map(c => ({
        text: c.text,
        confidence: c.confidence,
        source: c.source?.sourceName,
      }));

    return {
      hasRisks: true,
      message,
      lowConfidenceItems,
    };
  }

  // ========== 辅助方法 ==========

  /**
   * 将文本分割成句子
   */
  private splitIntoSentences(text: string): string[] {
    // 简单的句子分割（按句号、问号、感叹号）
    return text
      .split(/[。！？.!?]/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /**
   * 分类声明类型
   */
  private classifyClaimType(text: string): ClaimType {
    const lowerText = text.toLowerCase();

    // 事实性关键词
    const factKeywords = ['是', '有', '位于', '距离', '开放时间', '价格', '评分'];
    if (factKeywords.some(keyword => lowerText.includes(keyword))) {
      return 'FACT';
    }

    // 推测性关键词
    const speculationKeywords = ['可能', '也许', '大概', '估计', '预计'];
    if (speculationKeywords.some(keyword => lowerText.includes(keyword))) {
      return 'SPECULATION';
    }

    // 推荐性关键词
    const recommendationKeywords = ['建议', '推荐', '应该', '最好', '值得'];
    if (recommendationKeywords.some(keyword => lowerText.includes(keyword))) {
      return 'RECOMMENDATION';
    }

    // 意见性关键词
    const opinionKeywords = ['认为', '觉得', '感觉', '喜欢'];
    if (opinionKeywords.some(keyword => lowerText.includes(keyword))) {
      return 'OPINION';
    }

    // 默认视为事实
    return 'FACT';
  }

  /**
   * 提取实体
   */
  private extractEntities(text: string): string[] {
    // 简化实现：提取可能的实体（地名、数字等）
    const entities: string[] = [];

    // 提取数字
    const numbers = text.match(/\d+/g);
    if (numbers) {
      entities.push(...numbers);
    }

    // 提取可能的专有名词（大写字母开头的词）
    const properNouns = text.match(/\b[A-Z][a-z]+\b/g);
    if (properNouns) {
      entities.push(...properNouns);
    }

    return entities;
  }

  /**
   * 从对象中提取声明
   */
  private extractClaimsFromObject(obj: any, claims: FactualClaim[], prefix = ''): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (typeof value === 'string') {
        const claimType = this.classifyClaimType(value);
        if (claimType === 'FACT') {
          claims.push({
            text: value,
            type: claimType,
            entities: this.extractEntities(value),
            metadata: { field: fullKey },
          });
        }
      } else if (typeof value === 'object' && value !== null) {
        this.extractClaimsFromObject(value, claims, fullKey);
      }
    }
  }

  /**
   * 搜索可靠来源
   */
  private async searchReliableSources(claim: FactualClaim): Promise<ExtendedDataSourceInfo[]> {
    // 简化实现：根据声明内容推断来源
    // 实际应该调用数据源服务进行搜索

    if (this.sourceAnnotationService) {
      try {
        // 使用信息源标注服务推断来源
        const annotated = await this.sourceAnnotationService.annotateField('claim', {
          text: claim.text,
          entities: claim.entities,
        });

        if (annotated.source) {
          return [annotated.source];
        }
      } catch (error) {
        this.logger.warn(`Failed to annotate claim source: ${error}`);
      }
    }

    // 默认返回空数组
    return [];
  }

  /**
   * 检查数据源是否过期
   */
  private isOutdated(source: ExtendedDataSourceInfo): boolean {
    if (!source.timestamp) {
      return true;
    }

    const timestamp = new Date(source.timestamp).getTime();
    const now = Date.now();
    const ageHours = (now - timestamp) / (1000 * 60 * 60);

    // 根据数据源类型判断过期时间
    const maxAgeHours: Record<string, number> = {
      WEATHER: 3,
      CROWD: 1,
      TRANSPORT: 24,
      POI: 168, // 7天
      DEFAULT: 24,
    };

    const sourceType = source.type || 'DEFAULT';
    const maxAge = maxAgeHours[sourceType] || maxAgeHours.DEFAULT;

    return ageHours > maxAge;
  }

  /**
   * 移除幻觉内容
   */
  private removeHallucinations(
    output: any,
    markedClaims: HallucinationMarkedClaim[],
  ): any {
    if (typeof output === 'string') {
      let cleaned = output;
      const toRemove = markedClaims.filter(c => c.action === 'REMOVE');

      // 按位置从后往前删除，避免位置偏移
      toRemove
        .sort((a, b) => (b.position?.start || 0) - (a.position?.start || 0))
        .forEach(claim => {
          if (claim.position) {
            cleaned =
              cleaned.slice(0, claim.position.start) + cleaned.slice(claim.position.end);
          } else {
            // 如果没有位置信息，尝试直接替换文本
            cleaned = cleaned.replace(claim.text, '');
          }
        });

      return cleaned.trim();
    } else if (typeof output === 'object' && output !== null) {
      // 对于对象，移除标记为REMOVE的字段
      const cleaned = { ...output };
      const toRemove = markedClaims.filter(c => c.action === 'REMOVE');

      toRemove.forEach(claim => {
        if (claim.metadata?.field) {
          const fieldPath = claim.metadata.field.split('.');
          let current: any = cleaned;
          for (let i = 0; i < fieldPath.length - 1; i++) {
            current = current[fieldPath[i]];
            if (!current) return;
          }
          delete current[fieldPath[fieldPath.length - 1]];
        }
      });

      return cleaned;
    }

    return output;
  }
}
