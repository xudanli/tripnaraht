// src/trips/nl-clarification/services/gate-precheck.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmService } from '../../../llm/services/llm.service';
import { LlmProvider } from '../../../llm/dto/llm-request.dto';
import {
  GatePrecheckConfig,
  GatePrecheckResult,
  ClarificationQuestionDef,
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
    
    for (const precheck of prechecks) {
      // 检查触发条件
      const shouldTrigger = this.checkTriggerConditions(precheck.triggerConditions, currentParams);
      this.logger.debug(`Gate 预检查 ${precheck.checkId}: 触发条件检查结果=${shouldTrigger}`);
      
      if (!shouldTrigger) {
        continue; // 跳过未触发的检查
      }
      
      // 执行检查
      this.logger.debug(`执行 Gate 预检查: ${precheck.checkId}`);
      const checkResult = await this.executeCheck(precheck, currentParams, destinationCode);
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
   * 检查触发条件
   */
  private checkTriggerConditions(
    conditions: GatePrecheckConfig['triggerConditions'],
    currentParams: Record<string, any>
  ): boolean {
    // 检查必需字段
    for (const field of conditions.requiredFields) {
      const fieldValue = currentParams[field];
      if (!fieldValue) {
        this.logger.debug(`Gate 触发条件检查失败: 缺少必需字段 ${field}`);
        return false;
      }
      // 如果是数组字段，检查是否为空数组
      if (Array.isArray(fieldValue) && fieldValue.length === 0) {
        this.logger.debug(`Gate 触发条件检查失败: 数组字段 ${field} 为空`);
        return false;
      }
    }
    
    // 检查字段值条件
    if (conditions.fieldConditions && conditions.fieldConditions.length > 0) {
      for (const condition of conditions.fieldConditions) {
        const fieldValue = currentParams[condition.fieldId];
        if (!this.evaluateFieldCondition(fieldValue, condition.operator, condition.value)) {
          return false;
        }
      }
    }
    
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
    destinationCode: string
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
