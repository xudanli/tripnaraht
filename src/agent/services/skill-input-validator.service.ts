// src/agent/services/skill-input-validator.service.ts
/**
 * Skill 输入参数验证服务
 * 
 * 统一的验证服务，支持从以下来源读取验证规则：
 * 1. SkillMetadata.inputSchema（声明式，推荐）
 * 2. SKILL_VALIDATION_RULES 配置（向后兼容）
 * 
 * 验证逻辑：
 * - 检查必需参数是否存在
 * - 检查参数依赖关系（替代参数）
 * - 使用提取器填充参数
 */

import { Injectable, Logger } from '@nestjs/common';
import { SkillMetadata, SkillInputSchema, ParameterExtractor, ParameterTypeCheck } from '../../skills/interfaces/skill.interface';
import { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { AgentContext } from '../interfaces/claude-orchestration.interface';
import { SKILL_VALIDATION_RULES, SkillValidationRule } from './skill-validation-rules.config';

export interface ValidationResult {
  valid: boolean;
  missingParams: string[];
  typeErrors?: Array<{ param: string; message: string }>;
  clarificationMessage?: string;
  solutions?: string[];
}

/**
 * 验证上下文（包含步骤结果，用于从步骤结果中提取参数）
 */
export interface ValidationContext {
  /** Agent 上下文 */
  context?: AgentContext;
  /** 原始请求 */
  request?: RouteAndRunRequestDto;
  /** 步骤结果（用于从前面步骤的结果中提取参数） */
  stepResults?: Record<string, any>;
  /** 执行计划步骤（用于查找步骤 ID 对应的 skill 名称） */
  planSteps?: Array<{ id: string; skillName?: string }>;
}

@Injectable()
export class SkillInputValidatorService {
  private readonly logger = new Logger(SkillInputValidatorService.name);

  /**
   * 验证 skill 输入参数
   * 
   * @param skillName Skill 名称
   * @param input 输入参数
   * @param metadata Skill 元数据（可选，如果提供则优先使用 inputSchema）
   * @param validationContext 验证上下文（包含 context、request、stepResults 等）
   * @returns 验证结果
   */
  validate(
    skillName: string,
    input: Record<string, any>,
    metadata?: SkillMetadata,
    validationContext?: ValidationContext,
  ): ValidationResult {
    // 向后兼容：如果传入的是旧的参数格式，转换为新的格式
    const context = validationContext?.context || (validationContext as any)?.context;
    const request = validationContext?.request || (validationContext as any)?.request;
    const stepResults = validationContext?.stepResults;
    const planSteps = validationContext?.planSteps;

    // 1. 优先使用 SkillMetadata.inputSchema（声明式）
    if (metadata?.inputSchema) {
      return this.validateWithSchema(
        skillName,
        input,
        metadata.inputSchema,
        { context, request, stepResults, planSteps },
      );
    }

    // 2. 降级到配置规则（向后兼容）
    const configRule = SKILL_VALIDATION_RULES[skillName];
    if (configRule) {
      return this.validateWithRule(
        skillName,
        input,
        configRule,
        { context, request, stepResults, planSteps },
      );
    }

    // 3. 没有验证规则，返回通过
    return { valid: true, missingParams: [] };
  }

  /**
   * 使用 SkillInputSchema 验证
   */
  private validateWithSchema(
    skillName: string,
    input: Record<string, any>,
    schema: SkillInputSchema,
    validationContext: ValidationContext,
  ): ValidationResult {
    const missingParams: string[] = [];
    const typeErrors: Array<{ param: string; message: string }> = [];
    const processedInput = { ...input };
    const { context, request } = validationContext;

    // 1. 使用提取器填充参数
    if (schema.extractors) {
      for (const [param, extractor] of Object.entries(schema.extractors)) {
        if (!this.hasValue(processedInput[param])) {
          const extracted = this.extractParameterWithConfig(
            extractor,
            validationContext,
          );
          if (extracted !== undefined) {
            processedInput[param] = extracted;
          }
        }
      }
    }

    // 2. 检查必需参数
    if (schema.required) {
      for (const param of schema.required) {
        if (!this.hasValue(processedInput[param])) {
          missingParams.push(param);
        }
      }
    }

    // 3. 检查依赖关系
    if (schema.dependencies) {
      for (const dep of schema.dependencies) {
        const hasParam = this.hasValue(processedInput[dep.param]);
        const hasAlternatives = dep.alternatives?.some(alt => {
          if (this.hasValue(processedInput[alt])) {
            return true;
          }
          // 特殊处理：tripId 可以从 context/request 中提取
          if (alt === 'tripId' && context && request) {
            return !!(context.tripId || request.trip_id);
          }
          return false;
        });

        if (!hasParam && !hasAlternatives) {
          if (dep.alternatives && dep.alternatives.length > 0) {
            missingParams.push(`${dep.param} 或 ${dep.alternatives.join('、')}`);
          } else {
            missingParams.push(dep.param);
          }
        }
      }
    }

    // 4. 类型检查和范围检查
    if (schema.typeChecks) {
      for (const [param, typeCheck] of Object.entries(schema.typeChecks)) {
        const value = processedInput[param];
        
        // 如果参数不存在，跳过类型检查（由必需参数检查处理）
        if (!this.hasValue(value)) {
          continue;
        }

        const typeError = this.validateTypeAndRange(param, value, typeCheck);
        if (typeError) {
          typeErrors.push(typeError);
        }
      }
    }

    if (missingParams.length > 0 || typeErrors.length > 0) {
      const uniqueMissingParams = [...new Set(missingParams)];

      return {
        valid: false,
        missingParams: uniqueMissingParams,
        typeErrors,
        clarificationMessage: this.buildClarificationMessage(skillName, uniqueMissingParams, typeErrors),
        solutions: this.extractSolutions(skillName, uniqueMissingParams, typeErrors),
      };
    }

    return { valid: true, missingParams: [] };
  }

  /**
   * 使用配置规则验证（向后兼容）
   */
  private validateWithRule(
    skillName: string,
    input: Record<string, any>,
    rule: SkillValidationRule,
    validationContext: ValidationContext,
  ): ValidationResult {
    const { context, request } = validationContext;
    const missingParams: string[] = [];
    const processedInput = { ...input };

    // 1. 使用提取器填充参数
    if (rule.extractors && context && request) {
      for (const [param, extractor] of Object.entries(rule.extractors)) {
        if (!this.hasValue(processedInput[param])) {
          // 特殊处理：countryCode 提取器需要注入 extractCountryCodeFromMessage
          if (param === 'countryCode') {
            const countryCode = this.extractCountryCodeFromMessage(request.message);
            if (countryCode) {
              processedInput[param] = countryCode;
            } else {
              const extracted = extractor(context, request);
              if (extracted) {
                processedInput[param] = extracted;
              }
            }
          } else {
            const extracted = extractor(context, request);
            if (extracted) {
              processedInput[param] = extracted;
            }
          }
        }
      }
    }

    // 2. 检查依赖关系
    if (rule.dependencies) {
      for (const dep of rule.dependencies) {
        const hasParam = this.hasValue(processedInput[dep.param]);
        const hasAlternatives = dep.alternatives?.some(alt => {
          if (this.hasValue(processedInput[alt])) {
            return true;
          }
          // 特殊处理：tripId 可以从 context/request 中提取
          if (alt === 'tripId' && context && request) {
            return !!(context.tripId || request.trip_id);
          }
          return false;
        });

        if (!hasParam && !hasAlternatives) {
          if (dep.alternatives && dep.alternatives.length > 0) {
            missingParams.push(`${dep.param} 或 ${dep.alternatives.join('、')}`);
          } else {
            missingParams.push(dep.param);
          }
        }
      }
    }

    if (missingParams.length > 0) {
      const uniqueMissingParams = [...new Set(missingParams)];
      return {
        valid: false,
        missingParams: uniqueMissingParams,
        clarificationMessage: this.buildClarificationMessage(skillName, uniqueMissingParams),
        solutions: this.extractSolutions(skillName, uniqueMissingParams),
      };
    }

    return { valid: true, missingParams: [] };
  }

  /**
   * 提取参数值（根据提取器配置）
   * 支持从 context/request 或步骤结果中提取
   */
  private extractParameterWithConfig(
    extractor: string | ParameterExtractor,
    validationContext: ValidationContext,
  ): any {
    const { context, request, stepResults, planSteps } = validationContext;

    // 向后兼容：如果 extractor 是字符串，使用旧的提取逻辑
    if (typeof extractor === 'string') {
      return this.extractParameter(extractor, context, request);
    }

    // 新的提取器配置
    const config = extractor as ParameterExtractor;

    switch (config.type) {
      case 'context':
        if (!context) return config.defaultValue;
        return this.extractFromContext(config.name || '', context) ?? config.defaultValue;

      case 'request':
        if (!request) return config.defaultValue;
        return this.extractFromRequest(config.name || '', request) ?? config.defaultValue;

      case 'step':
        if (!stepResults || !config.stepId) return config.defaultValue;
        return this.extractFromStepResult(config.stepId, config.path, stepResults, planSteps) ?? config.defaultValue;

      default:
        return config.defaultValue;
    }
  }

  /**
   * 从 context 中提取参数
   */
  private extractFromContext(name: string, context: AgentContext): any {
    switch (name) {
      case 'tripId':
        return context.tripId;
      case 'userId':
        return context.userId;
      case 'requestId':
        return context.requestId;
      default:
        return (context as any)[name];
    }
  }

  /**
   * 从 request 中提取参数
   */
  private extractFromRequest(name: string, request: RouteAndRunRequestDto): any {
    switch (name) {
      case 'tripId':
      case 'trip_id':
        return request.trip_id;
      case 'userId':
      case 'user_id':
        return request.user_id;
      case 'requestId':
      case 'request_id':
        return request.request_id;
      case 'countryCode':
        return this.extractCountryCodeFromMessage(request.message);
      default:
        return (request as any)[name];
    }
  }

  /**
   * 从步骤结果中提取参数
   */
  private extractFromStepResult(
    stepId: string,
    path: string | undefined,
    stepResults: Record<string, any>,
    planSteps?: Array<{ id: string; skillName?: string }>,
  ): any {
    // 1. 尝试直接使用 stepId 查找结果
    let result = stepResults[stepId];
    
    // 2. 如果找不到，尝试通过 skillName 查找
    if (!result && planSteps) {
      const step = planSteps.find(s => s.id === stepId || s.skillName === stepId);
      if (step) {
        result = stepResults[step.id];
      }
    }

    if (!result) {
      return undefined;
    }

    // 3. 如果指定了路径，从结果中提取
    if (path) {
      return this.getNestedValue(result, path);
    }

    return result;
  }

  /**
   * 从嵌套对象中获取值（支持点号分隔的路径）
   */
  private getNestedValue(obj: any, path: string): any {
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[key];
    }
    
    return current;
  }

  /**
   * 提取参数值（根据提取器名称，向后兼容）
   */
  private extractParameter(
    extractorName: string,
    context?: AgentContext,
    request?: RouteAndRunRequestDto,
  ): any {
    if (!context || !request) {
      return undefined;
    }

    switch (extractorName) {
      case 'tripId':
        return context.tripId || request.trip_id;
      case 'countryCode':
        return this.extractCountryCodeFromMessage(request.message);
      default:
        return undefined;
    }
  }

  /**
   * 从消息中提取国家代码
   */
  private extractCountryCodeFromMessage(message: string): string | undefined {
    // 简单的国家代码提取逻辑（可以从消息中提取，如 "冰岛" -> "IS"）
    // 这里可以扩展更复杂的提取逻辑
    const countryMap: Record<string, string> = {
      '冰岛': 'IS',
      'iceland': 'IS',
      'island': 'IS',
      // 可以添加更多映射
    };

    const lowerMessage = message.toLowerCase();
    for (const [key, code] of Object.entries(countryMap)) {
      if (lowerMessage.includes(key.toLowerCase())) {
        return code;
      }
    }

    return undefined;
  }

  /**
   * 检查参数是否有值
   */
  private hasValue(value: any): boolean {
    if (value === undefined || value === null) {
      return false;
    }
    if (typeof value === 'string' && value.trim() === '') {
      return false;
    }
    if (Array.isArray(value) && value.length === 0) {
      return false;
    }
    return true;
  }

  /**
   * 验证类型和范围
   */
  private validateTypeAndRange(
    param: string,
    value: any,
    typeCheck: ParameterTypeCheck,
  ): { param: string; message: string } | null {
    // 1. 类型检查
    const actualType = this.getType(value);
    if (typeCheck.type !== actualType) {
      return {
        param,
        message: `参数 ${param} 类型错误：期望 ${typeCheck.type}，实际 ${actualType}`,
      };
    }

    // 2. 范围检查（适用于 number）
    if (typeCheck.type === 'number' && typeof value === 'number') {
      if (typeCheck.min !== undefined && value < typeCheck.min) {
        return {
          param,
          message: `参数 ${param} 值过小：期望 >= ${typeCheck.min}，实际 ${value}`,
        };
      }
      if (typeCheck.max !== undefined && value > typeCheck.max) {
        return {
          param,
          message: `参数 ${param} 值过大：期望 <= ${typeCheck.max}，实际 ${value}`,
        };
      }
    }

    // 3. 长度检查（适用于 string 或 array）
    if ((typeCheck.type === 'string' || typeCheck.type === 'array') && Array.isArray(value) || typeof value === 'string') {
      const length = typeof value === 'string' ? value.length : value.length;
      
      if (typeCheck.minLength !== undefined && length < typeCheck.minLength) {
        return {
          param,
          message: `参数 ${param} 长度过短：期望 >= ${typeCheck.minLength}，实际 ${length}`,
        };
      }
      if (typeCheck.maxLength !== undefined && length > typeCheck.maxLength) {
        return {
          param,
          message: `参数 ${param} 长度过长：期望 <= ${typeCheck.maxLength}，实际 ${length}`,
        };
      }
    }

    // 4. 格式验证（适用于 string）
    if (typeCheck.type === 'string' && typeof value === 'string' && typeCheck.format) {
      const formatError = this.validateFormat(value, typeCheck.format);
      if (formatError) {
        return {
          param,
          message: `参数 ${param} 格式错误：${formatError}`,
        };
      }
    }

    // 5. 枚举值检查
    if (typeCheck.enum && !typeCheck.enum.includes(value)) {
      return {
        param,
        message: `参数 ${param} 值不在允许的枚举值中：期望 [${typeCheck.enum.join(', ')}]，实际 ${value}`,
      };
    }

    return null;
  }

  /**
   * 获取值的类型
   */
  private getType(value: any): ParameterTypeCheck['type'] {
    if (value === null) {
      return 'object';
    }
    if (Array.isArray(value)) {
      return 'array';
    }
    const jsType = typeof value;
    switch (jsType) {
      case 'string':
        return 'string';
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'object':
        return 'object';
      default:
        return 'string'; // 默认
    }
  }

  /**
   * 验证格式
   */
  private validateFormat(value: string, format: ParameterTypeCheck['format']): string | null {
    switch (format) {
      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          return '不是有效的邮箱地址';
        }
        break;

      case 'url':
        try {
          new URL(value);
        } catch {
          return '不是有效的 URL';
        }
        break;

      case 'date':
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(value)) {
          return '不是有效的日期格式 (YYYY-MM-DD)';
        }
        break;

      case 'date-time':
        const dateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
        if (!dateTimeRegex.test(value)) {
          return '不是有效的日期时间格式 (ISO 8601)';
        }
        break;

      case 'uuid':
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(value)) {
          return '不是有效的 UUID';
        }
        break;
    }

    return null;
  }

  /**
   * 构建澄清消息
   */
  private buildClarificationMessage(
    skillName: string,
    missingParams: string[],
    typeErrors: Array<{ param: string; message: string }> = [],
  ): string {
    const messages: string[] = [];
    
    if (missingParams.length > 0) {
      messages.push(`缺少必需参数: ${missingParams.join('、')}`);
    }
    
    if (typeErrors.length > 0) {
      messages.push(...typeErrors.map(e => e.message));
    }

    return `无法完成行程规划，因为输入参数验证失败。\n\n问题：\n${messages.map(m => `- ${m}`).join('\n')}\n\n影响：\n- 无法构建世界模型上下文\n- 无法进行路线方向选择\n- 无法生成可执行的行程规划\n\n请提供更多信息，或联系系统管理员获取帮助。`;
  }

  /**
   * 提取解决方案
   */
  private extractSolutions(
    skillName: string,
    missingParams: string[],
    typeErrors: Array<{ param: string; message: string }> = [],
  ): string[] {
    const solutions: string[] = [];

    if (missingParams.some(p => p.includes('tripId') || p.includes('world'))) {
      solutions.push('提供行程 ID (tripId) 或世界模型上下文 (world)');
    }

    if (missingParams.some(p => p.includes('countryCode'))) {
      solutions.push('在消息中明确指定国家或地区（如：冰岛、Iceland）');
    }

    if (missingParams.some(p => p.includes('planState'))) {
      solutions.push('确保前面的步骤已生成 PlanState');
    }

    if (typeErrors.length > 0) {
      solutions.push('检查参数类型和格式是否正确');
      solutions.push('确保参数值在允许的范围内');
    }

    if (solutions.length === 0) {
      solutions.push('检查输入参数是否完整');
      solutions.push('联系系统管理员获取帮助');
    }

    return solutions;
  }
}
