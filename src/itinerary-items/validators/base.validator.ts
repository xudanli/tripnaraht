// src/itinerary-items/validators/base.validator.ts

import { 
  ValidationCode, 
  ValidationSeverity, 
  ValidationResult, 
  ValidationContext, 
  IValidator,
  ValidationSuggestion
} from '../interfaces/validation.interface';

/**
 * 校验器基类
 * 
 * 所有具体校验器都应继承此类
 */
export abstract class BaseValidator implements IValidator {
  /**
   * 获取校验代码
   */
  abstract getCode(): ValidationCode;

  /**
   * 获取默认严重程度
   */
  abstract getSeverity(): ValidationSeverity;

  /**
   * 执行校验
   */
  abstract validate(context: ValidationContext): Promise<ValidationResult | null>;

  /**
   * 创建校验结果
   * 
   * @param valid 是否通过
   * @param message 消息
   * @param details 详细信息
   * @param suggestions 建议
   */
  protected createResult(
    valid: boolean,
    message: string,
    details: Record<string, any> = {},
    suggestions?: ValidationSuggestion[]
  ): ValidationResult {
    return {
      valid,
      severity: this.getSeverity(),
      code: this.getCode(),
      message,
      details,
      suggestions,
    };
  }

  /**
   * 创建失败结果的快捷方法
   */
  protected fail(
    message: string,
    details: Record<string, any> = {},
    suggestions?: ValidationSuggestion[]
  ): ValidationResult {
    return this.createResult(false, message, details, suggestions);
  }

  /**
   * 创建成功结果的快捷方法
   */
  protected pass(): null {
    return null;
  }
}
