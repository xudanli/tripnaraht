// src/kpu/services/knowledge-validation.service.ts
/**
 * 知识验证服务
 * 
 * 负责验证知识片段和AI输出的准确性、一致性、完整性等
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { ValidationCacheService } from './validation-cache.service';
import { KPUMonitoringService } from './kpu-monitoring.service';
import {
  SnippetValidationParams,
  SnippetValidationResult,
  OutputValidationParams,
  OutputValidationResult,
  ValidatedRetrievalResult,
  Citation,
} from '../types/validation.types';

@Injectable()
export class KnowledgeValidationService {
  private readonly logger = new Logger(KnowledgeValidationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly llmService?: LlmService,
    @Optional() private readonly cacheService?: ValidationCacheService,
    @Optional() private readonly monitoringService?: KPUMonitoringService,
  ) {}

  /**
   * 验证知识片段
   */
  async validateSnippet(
    params: SnippetValidationParams
  ): Promise<SnippetValidationResult> {
    const { content, source, metadata, context, options } = params;

    // 0. 检查缓存
    if (this.cacheService) {
      const cached = await this.cacheService.getCachedSnippetValidation(content);
      if (cached) {
        this.logger.debug('使用缓存的片段验证结果');
        if (this.monitoringService) {
          this.monitoringService.recordCacheHit();
        }
        return cached;
      }
      if (this.monitoringService) {
        this.monitoringService.recordCacheMiss();
      }
    }

    // 1. 事实校验
    let factCheck: 'pass' | 'fail' | 'unknown' = 'unknown';
    if (options?.enableFactCheck) {
      factCheck = await this.checkFactAccuracy(content, source);
    }

    // 2. 来源可信度评估
    const sourceCredibility = await this.assessSourceCredibility(source, metadata);

    // 3. 时效性评估
    const freshness = await this.assessFreshness(metadata);

    // 4. 完整性评估
    const completeness = await this.assessCompleteness(content, context);

    // 5. 一致性检查
    let consistency: 'consistent' | 'inconsistent' | 'unknown' = 'unknown';
    if (options?.enableConsistencyCheck) {
      consistency = await this.checkConsistency(content, source, context);
    }

    // 6. 提取引用
    let citations: Citation[] = [];
    if (options?.enableCitationCheck) {
      citations = await this.extractCitations(content, source);
    }

    const result: SnippetValidationResult = {
      factCheck,
      sourceCredibility,
      freshness,
      completeness,
      consistency,
      citations,
    };

    // 缓存结果
    if (this.cacheService) {
      await this.cacheService.cacheSnippetValidation(content, result);
    }

    return result;
  }

  /**
   * 验证AI输出
   */
  async validateOutput(
    params: OutputValidationParams
  ): Promise<OutputValidationResult> {
    const { output, sources, query, options } = params;

    // 0. 检查缓存
    if (this.cacheService) {
      const cached = await this.cacheService.getCachedOutputValidation(output);
      if (cached) {
        this.logger.debug('使用缓存的输出验证结果');
        return cached;
      }
    }

    const factChecks: OutputValidationResult['factChecks'] = [];
    const consistencyChecks: OutputValidationResult['consistencyChecks'] = [];
    const warnings: string[] = [];
    let totalScore = 100;

    // 1. 事实校验
    if (options?.enableFactCheck) {
      const factCheckResult = await this.checkOutputFacts(output, sources);
      factChecks.push(...factCheckResult.checks);
      if (!factCheckResult.allPassed) {
        totalScore -= factCheckResult.failedCount * 10;
        warnings.push(`发现 ${factCheckResult.failedCount} 个事实错误`);
      }
    }

    // 2. 一致性检查
    if (options?.enableConsistencyCheck) {
      const consistencyResult = await this.checkOutputConsistency(output, sources, query);
      consistencyChecks.push(...consistencyResult.checks);
      if (!consistencyResult.allConsistent) {
        totalScore -= consistencyResult.inconsistentCount * 5;
        warnings.push(`发现 ${consistencyResult.inconsistentCount} 个一致性问题`);
      }
    }

    // 3. 引用完整性检查
    if (options?.enableCitationCheck) {
      const citationResult = await this.checkCitationIntegrity(output, sources);
      if (!citationResult.allValid) {
        totalScore -= citationResult.invalidCount * 15;
        warnings.push(`发现 ${citationResult.invalidCount} 个无效引用`);
      }
    }

    // 4. 完整性检查
    if (options?.enableCompletenessCheck) {
      const completenessResult = await this.checkOutputCompleteness(output, query);
      if (!completenessResult.isComplete) {
        totalScore -= 10;
        warnings.push('输出信息可能不完整');
      }
    }

    const overall: 'pass' | 'fail' | 'warning' = 
      totalScore >= 80 ? 'pass' :
      totalScore >= 60 ? 'warning' : 'fail';

    // 5. 提取所有引用
    const citations = await this.extractOutputCitations(output, sources);

    const result: OutputValidationResult = {
      overall,
      score: Math.max(0, Math.min(100, totalScore)),
      factChecks,
      consistencyChecks,
      citations,
      warnings,
    };

    // 缓存结果
    if (this.cacheService) {
      await this.cacheService.cacheOutputValidation(output, result);
    }

    return result;
  }

  // ========== 私有方法实现 ==========

  /**
   * 检查事实准确性
   * 
   * 使用LLM服务进行基础的事实检查
   */
  private async checkFactAccuracy(content: string, source?: string): Promise<'pass' | 'fail' | 'unknown'> {
    if (!this.llmService) {
      return 'unknown';
    }

    try {
      if (!this.llmService) {
        return 'unknown';
      }

      // 使用LLM检查内容是否包含明显的事实错误
      const prompt = `请检查以下文本是否包含明显的事实错误或矛盾。只回答"pass"（通过）、"fail"（失败）或"unknown"（无法判断）。

文本：
${content.substring(0, 500)}

来源：${source || '未知'}

请只回答一个词：pass、fail或unknown`;

      const llmStartTime = Date.now();
      const response = await this.llmService.callLlmWithSchema(
        LlmProvider.DEEPSEEK,
        prompt
      );
      const llmLatency = Date.now() - llmStartTime;

      // 记录LLM调用指标
      if (this.monitoringService) {
        this.monitoringService.recordLlmCall(true, llmLatency);
      }

      const lowerResponse = response.toLowerCase().trim();
      if (lowerResponse.includes('pass')) {
        return 'pass';
      } else if (lowerResponse.includes('fail')) {
        return 'fail';
      } else {
        return 'unknown';
      }
    } catch (error: any) {
      this.logger.warn(`事实准确性检查失败: ${error?.message}`);
      // 记录LLM调用失败
      if (this.monitoringService) {
        this.monitoringService.recordLlmCall(false, 0);
      }
      return 'unknown';
    }
  }

  /**
   * 评估来源可信度
   */
  private async assessSourceCredibility(source?: string, metadata?: Record<string, any>): Promise<number> {
    // 从metadata中获取sourceCredibility字段
    if (metadata?.sourceCredibility !== undefined) {
      return Math.max(0, Math.min(1, metadata.sourceCredibility));
    }

    // 从metadata中获取credibilityScore（兼容现有字段）
    if (metadata?.credibilityScore !== undefined) {
      return Math.max(0, Math.min(1, metadata.credibilityScore));
    }

    // 默认可信度
    return 0.5;
  }

  /**
   * 评估信息新鲜度
   */
  private async assessFreshness(metadata?: Record<string, any>): Promise<number> {
    if (metadata?.lastUpdated) {
      const daysSinceUpdate = (Date.now() - new Date(metadata.lastUpdated).getTime()) / (1000 * 60 * 60 * 24);
      // 一年内为1，之后递减
      return Math.max(0, 1 - daysSinceUpdate / 365);
    }

    // 如果没有更新时间信息，返回中等新鲜度
    return 0.5;
  }

  /**
   * 评估信息完整性
   */
  private async assessCompleteness(content: string, _context?: Record<string, any>): Promise<number> {
    // 简化版：基于内容长度和关键信息存在性
    if (!content || content.length < 50) {
      return 0.3;
    }

    // TODO: 可以检查关键字段是否存在
    // 目前返回固定值
    return 0.8;
  }

  /**
   * 检查一致性
   * 
   * 检查内容内部一致性、与上下文一致性
   */
  private async checkConsistency(
    _content: string,
    _source?: string,
    _context?: Record<string, any>
  ): Promise<'consistent' | 'inconsistent' | 'unknown'> {
    if (!this.llmService) {
      return 'unknown';
    }

    try {
      // 使用naturalLanguageToTripParams作为临时方案（实际上我们需要一个简单的文本生成方法）
      // TODO: 在LlmService中添加公共的文本生成方法
      // 暂时使用简化实现，不使用LLM
      const response = 'unknown';

      const lowerResponse = response.toLowerCase().trim();
      if (lowerResponse.includes('inconsistent')) {
        return 'inconsistent';
      } else if (lowerResponse.includes('consistent')) {
        return 'consistent';
      } else {
        return 'unknown';
      }
    } catch (error: any) {
      this.logger.warn(`一致性检查失败: ${error?.message}`);
      return 'unknown';
    }
  }

  /**
   * 提取引用
   * 
   * 从内容中提取引用标记、链接等
   */
  private async extractCitations(content: string, source?: string): Promise<Citation[]> {
    const citations: Citation[] = [];

    // 1. 提取URL链接
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = content.match(urlRegex) || [];
    urls.forEach((url, index) => {
      citations.push({
        id: `url_${index}`,
        content: url,
        source: source || 'unknown',
        confidence: 0.8,
      });
    });

    // 2. 提取引用标记（如 [1], [2] 等）
    const citationMarkRegex = /\[(\d+)\]/g;
    const marks = Array.from(content.matchAll(citationMarkRegex));
    marks.forEach((match) => {
      citations.push({
        id: `mark_${match[1]}`,
        content: match[0],
        source: source || 'unknown',
        confidence: 0.7,
      });
    });

    // 3. 如果有来源信息，添加来源引用
    if (source) {
      citations.push({
        id: 'source',
        content: `来源: ${source}`,
        source: source,
        confidence: 0.9,
      });
    }

    return citations;
  }

  /**
   * 检查输出中的事实
   * 
   * 对比输出内容与知识源，检查事实是否一致
   */
  private async checkOutputFacts(output: string, sources: ValidatedRetrievalResult[]) {
    const checks: Array<{
      id: string;
      description: string;
      passed: boolean;
      details: string;
      sources: string[];
    }> = [];
    let failedCount = 0;

    if (!this.llmService || sources.length === 0) {
      return { checks, allPassed: true, failedCount: 0 };
    }

    try {
      // 提取输出中的关键事实
      const sourceTexts = sources.map(s => s.content.substring(0, 200)).join('\n\n');
      
      // 使用LLM检查输出中的事实
      
      const prompt = `请检查以下AI输出中的事实是否与提供的知识源一致。对于每个不一致的事实，请指出。

AI输出：
${output.substring(0, 1000)}

知识源：
${sourceTexts.substring(0, 1000)}

请以JSON格式返回检查结果，格式：
{
  "checks": [
    {
      "id": "fact_1",
      "description": "事实描述",
      "passed": true,
      "details": "详细信息",
      "sources": ["source1"]
    }
  ]
}`;

      const llmStartTime = Date.now();
      const response = await this.llmService.callLlmWithSchema(
        LlmProvider.DEEPSEEK,
        prompt
      );
      const llmLatency = Date.now() - llmStartTime;

      // 记录LLM调用指标
      if (this.monitoringService) {
        this.monitoringService.recordLlmCall(true, llmLatency);
      }
      
      // 尝试解析JSON响应
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          if (result.checks && Array.isArray(result.checks)) {
            checks.push(...result.checks);
            failedCount = checks.filter(c => !c.passed).length;
          }
        }
      } catch (parseError) {
        this.logger.warn(`解析事实检查结果失败: ${parseError}`);
      }
    } catch (error: any) {
      this.logger.warn(`输出事实检查失败: ${error?.message}`);
    }

    return {
      checks,
      allPassed: failedCount === 0,
      failedCount,
    };
  }

  /**
   * 检查输出一致性
   * 
   * 检查输出内部一致性、与查询一致性、与知识源一致性
   */
  private async checkOutputConsistency(output: string, sources: ValidatedRetrievalResult[], query: string) {
    const checks: Array<{
      id: string;
      type: 'internal' | 'external' | 'contextual';
      passed: boolean;
      details: string;
    }> = [];
    let inconsistentCount = 0;

    if (!this.llmService) {
      return { checks, allConsistent: true, inconsistentCount: 0 };
    }

    try {
      if (!this.llmService) {
        return { checks: [], allConsistent: true, inconsistentCount: 0 };
      }

      // 使用LLM检查输出一致性
      const prompt = `请检查以下AI输出的一致性：
1. 输出内部是否一致（没有矛盾）
2. 输出是否与查询一致（回答了问题）
3. 输出是否与知识源一致（基于知识源）

查询：${query}

AI输出：
${output.substring(0, 1000)}

请以JSON格式返回检查结果，格式：
{
  "checks": [
    {
      "id": "consistency_1",
      "type": "internal",
      "passed": true,
      "details": "详细信息"
    }
  ]
}`;

      const llmStartTime = Date.now();
      const response = await this.llmService.callLlmWithSchema(
        LlmProvider.DEEPSEEK,
        prompt
      );
      const llmLatency = Date.now() - llmStartTime;

      // 记录LLM调用指标
      if (this.monitoringService) {
        this.monitoringService.recordLlmCall(true, llmLatency);
      }
      
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          if (result.checks && Array.isArray(result.checks)) {
            checks.push(...result.checks);
            inconsistentCount = checks.filter(c => !c.passed).length;
          }
        }
      } catch (parseError) {
        this.logger.warn(`解析一致性检查结果失败: ${parseError}`);
      }
    } catch (error: any) {
      this.logger.warn(`输出一致性检查失败: ${error?.message}`);
    }

    return {
      checks,
      allConsistent: inconsistentCount === 0,
      inconsistentCount,
    };
  }

  /**
   * 检查引用完整性
   */
  private async checkCitationIntegrity(_output: string, _sources: ValidatedRetrievalResult[]) {
    // TODO: 实现引用完整性检查
    // 检查输出中提到的引用是否真实存在
    return { allValid: true, invalidCount: 0 };
  }

  /**
   * 检查输出完整性
   */
  private async checkOutputCompleteness(_output: string, _query: string) {
    // TODO: 实现输出完整性检查
    // 检查输出是否完整回答了查询
    return { isComplete: true };
  }

  /**
   * 提取输出中的所有引用
   */
  private async extractOutputCitations(output: string, sources: ValidatedRetrievalResult[]): Promise<Citation[]> {
    // 从验证后的知识源中提取引用
    return sources.map(s => ({
      id: s.id,
      content: s.content.substring(0, 200),
      source: s.sourceFile || 'unknown',
      documentId: s.id,
      confidence: s.validation.overallScore,
    }));
  }
}
