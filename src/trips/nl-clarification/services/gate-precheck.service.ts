// src/trips/nl-clarification/services/gate-precheck.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmService } from '../../../llm/services/llm.service';
import { LlmProvider } from '../../../llm/dto/llm-request.dto';
import {
  GatePrecheckConfig,
  GatePrecheckResult,
} from '../config/destination-clarification.config';

@Injectable()
export class GatePrecheckService {
  private readonly logger = new Logger(GatePrecheckService.name);

  constructor(
    @Optional() private readonly llmService?: LlmService,
  ) {}

  /**
   * 执行 Gate 预检查
   */
  async executePrechecks(
    prechecks: GatePrecheckConfig[],
    currentParams: Record<string, any>,
    destinationCode: string
  ): Promise<GatePrecheckResult> {
    this.logger.debug(`执行 Gate 预检查: destinationCode=${destinationCode}, params=${JSON.stringify(currentParams)}`);
    
    // 🆕 修复：统一日期与季节推断
    // 如果存在日期，优先使用基于日期计算的季节，而不是LLM推断的travelSeason
    const normalizedParams = this.normalizeSeasonFromDate(currentParams, destinationCode);
    
    for (const precheck of prechecks) {
      // 检查触发条件（使用标准化后的参数）
      const shouldTrigger = this.checkTriggerConditions(precheck.triggerConditions, normalizedParams);
      this.logger.debug(`Gate 预检查 ${precheck.checkId}: 触发条件检查结果=${shouldTrigger}`);
      
      if (!shouldTrigger) {
        continue; // 跳过未触发的检查
      }
      
      // 执行检查（使用标准化后的参数）
      this.logger.debug(`执行 Gate 预检查: ${precheck.checkId}`);
      const checkResult = await this.executeCheck(precheck, normalizedParams, destinationCode);
      this.logger.debug(`Gate 预检查 ${precheck.checkId} 结果: passed=${checkResult.passed}, reason=${checkResult.reason}`);
      
      if (!checkResult.passed) {
        // 检查失败，返回阻止结果
        this.logger.warn(`Gate 预检查 ${precheck.checkId} 阻止: ${checkResult.reason}`);
        return {
          blocked: true,
          checkId: precheck.checkId,
          warningMessage: precheck.failureResponse.warningMessage,
          alternatives: precheck.failureResponse.alternatives,
          additionalQuestions: precheck.failureResponse.additionalQuestions,
        };
      }
    }
    
    this.logger.debug('所有 Gate 预检查通过');
    return { blocked: false };
  }

  /**
   * 🆕 统一日期与季节推断
   * 
   * 如果存在日期，优先使用基于日期计算的季节，而不是LLM推断的travelSeason
   * 这样可以避免日期（9月）和季节推断（winter）不一致的问题
   */
  private normalizeSeasonFromDate(params: Record<string, any>, destinationCode?: string): Record<string, any> {
    const normalized = { ...params };
    
    // 检查是否有日期
    const startDate = params.startDate || params.start_date;
    
    if (startDate) {
      // 基于日期计算季节
      const calculatedSeason = this.calculateSeasonFromDate(startDate, destinationCode);
      
      // 映射季节值（如果配置使用不同的枚举值）
      let mappedSeason = calculatedSeason;
      if (destinationCode === 'IS' && calculatedSeason === 'shoulder') {
        mappedSeason = 'spring_autumn'; // 冰岛配置使用 spring_autumn
      }
      
      // 如果LLM推断的travelSeason与日期计算的季节不一致，使用日期计算的季节
      if (params.travelSeason && params.travelSeason !== mappedSeason) {
        this.logger.warn(
          `季节推断不一致: travelSeason=${params.travelSeason}, 日期=${startDate}, 计算的季节=${mappedSeason}。使用基于日期的季节。`
        );
        normalized.travelSeason = mappedSeason;
        normalized.seasonSource = 'date_calculated'; // 标记季节来源
      } else if (!params.travelSeason) {
        // 如果没有travelSeason，使用计算的季节
        normalized.travelSeason = mappedSeason;
        normalized.seasonSource = 'date_calculated';
      }
    }
    
    return normalized;
  }

  /**
   * 基于日期计算季节
   * 
   * 规则（标准季节划分）：
   * - 12月、1月、2月：winter（冬季）
   * - 6月、7月、8月：summer（夏季）
   * - 3月-5月、9月-11月：spring_autumn（过渡季）
   * 
   * 注意：对于冰岛等极地地区，虽然9月-3月是极光季，但9月仍属于过渡季（spring_autumn），
   * 只有11月-3月才是真正的冬季（winter）。这样可以避免日期和季节推断不一致的问题。
   */
  private calculateSeasonFromDate(dateStr: string, destinationCode?: string): 'winter' | 'summer' | 'spring_autumn' | 'shoulder' {
    try {
      // 处理ISO格式日期
      const date = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00Z');
      const month = date.getUTCMonth() + 1; // 1-12
      
      // 标准季节划分
      if (month >= 12 || month <= 2) {
        return 'winter';
      } else if (month >= 6 && month <= 8) {
        return 'summer';
      } else {
        // 3月-5月、9月-11月：过渡季
        // 对于冰岛配置，使用 spring_autumn；其他配置使用 shoulder
        return destinationCode === 'IS' ? 'spring_autumn' : 'shoulder';
      }
    } catch (error) {
      this.logger.warn(`日期解析失败: ${dateStr}, 使用默认季节`);
      return 'shoulder';
    }
  }

  /**
   * 检查触发条件
   * 
   * 🆕 重要改进：只在用户明确提供的字段上触发 Gate 检查
   * 如果字段是 LLM 推断的（在 inferredFields 中），则不触发检查
   * 这样可以避免用户还没说预算就被预算警告阻止的问题
   */
  private checkTriggerConditions(
    conditions: GatePrecheckConfig['triggerConditions'],
    currentParams: Record<string, any>
  ): boolean {
    // 获取推断字段列表
    const inferredFields: string[] = currentParams.inferredFields || [];
    
    // 检查必需字段
    for (const field of conditions.requiredFields) {
      const fieldValue = currentParams[field];
      
      // 🆕 检查字段是否是推断的（而非用户明确提供的）
      // 如果是推断字段，不应触发 Gate 检查，应该先让用户确认
      if (inferredFields.includes(field)) {
        this.logger.debug(`Gate 触发条件检查跳过: 字段 ${field} 是推断值（未经用户确认），不触发预检查`);
        return false;
      }

      // 不能用 !fieldValue：hasWinterDrivingExperience=false、数值 0 等合法取值会被误判为「缺失」
      if (!this.isTriggerRequiredFieldPresent(fieldValue)) {
        this.logger.debug(`Gate 触发条件检查失败: 缺少必需字段 ${field}`);
        return false;
      }
    }
    
    // 检查字段值条件
    if (conditions.fieldConditions && conditions.fieldConditions.length > 0) {
      for (const condition of conditions.fieldConditions) {
        const fieldValue = currentParams[condition.fieldId];
        
        // 🆕 同样检查字段条件中的字段是否是推断的
        if (inferredFields.includes(condition.fieldId)) {
          this.logger.debug(`Gate 触发条件检查跳过: 条件字段 ${condition.fieldId} 是推断值`);
          return false;
        }
        
        if (!this.evaluateFieldCondition(fieldValue, condition.operator, condition.value)) {
          return false;
        }
      }
    }
    
    return true;
  }

  /** 触发条件里的「必填」是否已出现（允许 boolean false / number 0） */
  private isTriggerRequiredFieldPresent(value: unknown): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }

  /**
   * 评估字段条件
   */
  private evaluateFieldCondition(
    fieldValue: any,
    operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'in' | 'not_in',
    expectedValue: any
  ): boolean {
    switch (operator) {
      case 'equals':
        return fieldValue === expectedValue;
      case 'not_equals':
        return fieldValue !== expectedValue;
      case 'greater_than':
        return Number(fieldValue) > Number(expectedValue);
      case 'less_than':
        return Number(fieldValue) < Number(expectedValue);
      case 'in':
        return Array.isArray(expectedValue) && expectedValue.includes(fieldValue);
      case 'not_in':
        return Array.isArray(expectedValue) && !expectedValue.includes(fieldValue);
      default:
        return false;
    }
  }

  /**
   * 执行检查
   */
  private async executeCheck(
    precheck: GatePrecheckConfig,
    currentParams: Record<string, any>,
    destinationCode: string
  ): Promise<{ passed: boolean; reason?: string }> {
    if (precheck.checkLogic.useLLM && this.llmService) {
      // 使用 LLM 检查
      return await this.executeLLMCheck(precheck, currentParams, destinationCode);
    } else if (precheck.checkLogic.useRuleEngine && precheck.checkLogic.ruleExpression) {
      // 使用规则引擎检查
      return this.evaluateRuleExpression(precheck.checkLogic.ruleExpression, currentParams);
    }
    
    // 默认通过
    return { passed: true };
  }

  /**
   * 执行 LLM 检查
   */
  private async executeLLMCheck(
    precheck: GatePrecheckConfig,
    currentParams: Record<string, any>,
    _destinationCode: string
  ): Promise<{ passed: boolean; reason?: string }> {
    if (!this.llmService || !precheck.checkLogic.llmPrompt) {
      return { passed: true };
    }
    
    try {
      // 构建 Prompt
      const prompt = this.buildLLMPrompt(precheck, currentParams);
      
      // 调用 LLM
      const response = await this.llmService.callLlmWithSchema(
        LlmProvider.ANTHROPIC,
        prompt,
        {
          type: 'object',
          properties: {
            passed: { type: 'boolean', description: '检查是否通过' },
            reason: { type: 'string', description: '通过或失败的原因' },
          },
          required: ['passed'],
        }
      );
      
      const result = JSON.parse(response);
      return {
        passed: result.passed === true,
        reason: result.reason,
      };
    } catch (error: any) {
      this.logger.error(`LLM 检查失败: ${error.message}`, error.stack);
      // LLM 检查失败时，默认通过（避免误阻止）
      return { passed: true, reason: `LLM检查失败: ${error.message}` };
    }
  }

  /**
   * 构建 LLM Prompt
   */
  private buildLLMPrompt(
    precheck: GatePrecheckConfig,
    currentParams: Record<string, any>
  ): string {
    let prompt = precheck.checkLogic.llmPrompt || '';
    
    // 替换模板变量
    prompt = prompt.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return currentParams[key] !== undefined ? String(currentParams[key]) : match;
    });
    
    // 添加上下文
    prompt = `你是一个旅行安全专家。请检查以下情况：

当前参数：
${JSON.stringify(currentParams, null, 2)}

检查规则：
${prompt}

请返回 JSON 格式：
{
  "passed": true/false,
  "reason": "通过或失败的原因"
}`;
    
    return prompt;
  }

  /**
   * 评估规则表达式
   */
  private evaluateRuleExpression(
    ruleExpression: string,
    currentParams: Record<string, any>
  ): { passed: boolean; reason?: string } {
    try {
      // 简单的规则表达式评估
      // 支持格式：fieldName === value, fieldName !== value, fieldName > value 等
      
      // 替换变量
      let expression = ruleExpression;
      for (const [key, value] of Object.entries(currentParams)) {
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        if (typeof value === 'string') {
          expression = expression.replace(regex, `"${value}"`);
        } else {
          expression = expression.replace(regex, String(value));
        }
      }
      
      // 评估表达式（注意：这里使用 eval，生产环境应该使用更安全的表达式解析器）
      // eslint-disable-next-line no-eval
      const result = eval(expression);
      
      return {
        passed: Boolean(result),
        reason: result ? '规则检查通过' : '规则检查失败',
      };
    } catch (error: any) {
      this.logger.error(`规则表达式评估失败: ${error.message}`, error.stack);
      return { passed: true, reason: `规则评估失败: ${error.message}` };
    }
  }
}
