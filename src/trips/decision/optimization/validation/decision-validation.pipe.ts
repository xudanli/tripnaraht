/**
 * Decision OS 请求验证管道
 * 
 * 提供:
 * - 请求体验证
 * - DSO 结构验证
 * - 业务规则验证
 * - 自定义验证器
 */

import { Injectable, Logger, PipeTransform, ArgumentMetadata, BadRequestException } from '@nestjs/common';

// ========== 验证结果类型 ==========

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
  code: string;
}

export interface ValidationContext {
  userId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

// ========== 验证器接口 ==========

export interface Validator<T = unknown> {
  validate(value: T, context?: ValidationContext): ValidationResult;
}

// ========== 基础验证器 ==========

export class RequiredValidator implements Validator {
  constructor(private readonly fieldName: string) {}

  validate(value: unknown): ValidationResult {
    if (value === undefined || value === null || value === '') {
      return {
        valid: false,
        errors: [{
          field: this.fieldName,
          message: `${this.fieldName} is required`,
          code: 'REQUIRED',
        }],
      };
    }
    return { valid: true, errors: [] };
  }
}

export class StringValidator implements Validator<string> {
  constructor(
    private readonly fieldName: string,
    private readonly options: {
      minLength?: number;
      maxLength?: number;
      pattern?: RegExp;
    } = {},
  ) {}

  validate(value: string): ValidationResult {
    const errors: ValidationError[] = [];

    if (typeof value !== 'string') {
      errors.push({
        field: this.fieldName,
        message: `${this.fieldName} must be a string`,
        value,
        code: 'TYPE_STRING',
      });
      return { valid: false, errors };
    }

    if (this.options.minLength !== undefined && value.length < this.options.minLength) {
      errors.push({
        field: this.fieldName,
        message: `${this.fieldName} must be at least ${this.options.minLength} characters`,
        value,
        code: 'MIN_LENGTH',
      });
    }

    if (this.options.maxLength !== undefined && value.length > this.options.maxLength) {
      errors.push({
        field: this.fieldName,
        message: `${this.fieldName} must be at most ${this.options.maxLength} characters`,
        value,
        code: 'MAX_LENGTH',
      });
    }

    if (this.options.pattern && !this.options.pattern.test(value)) {
      errors.push({
        field: this.fieldName,
        message: `${this.fieldName} does not match required pattern`,
        value,
        code: 'PATTERN',
      });
    }

    return { valid: errors.length === 0, errors };
  }
}

export class NumberValidator implements Validator<number> {
  constructor(
    private readonly fieldName: string,
    private readonly options: {
      min?: number;
      max?: number;
      integer?: boolean;
    } = {},
  ) {}

  validate(value: number): ValidationResult {
    const errors: ValidationError[] = [];

    if (typeof value !== 'number' || isNaN(value)) {
      errors.push({
        field: this.fieldName,
        message: `${this.fieldName} must be a valid number`,
        value,
        code: 'TYPE_NUMBER',
      });
      return { valid: false, errors };
    }

    if (this.options.integer && !Number.isInteger(value)) {
      errors.push({
        field: this.fieldName,
        message: `${this.fieldName} must be an integer`,
        value,
        code: 'INTEGER',
      });
    }

    if (this.options.min !== undefined && value < this.options.min) {
      errors.push({
        field: this.fieldName,
        message: `${this.fieldName} must be at least ${this.options.min}`,
        value,
        code: 'MIN_VALUE',
      });
    }

    if (this.options.max !== undefined && value > this.options.max) {
      errors.push({
        field: this.fieldName,
        message: `${this.fieldName} must be at most ${this.options.max}`,
        value,
        code: 'MAX_VALUE',
      });
    }

    return { valid: errors.length === 0, errors };
  }
}

export class ArrayValidator<T> implements Validator<T[]> {
  constructor(
    private readonly fieldName: string,
    private readonly options: {
      minItems?: number;
      maxItems?: number;
      itemValidator?: Validator<T>;
    } = {},
  ) {}

  validate(value: T[]): ValidationResult {
    const errors: ValidationError[] = [];

    if (!Array.isArray(value)) {
      errors.push({
        field: this.fieldName,
        message: `${this.fieldName} must be an array`,
        value,
        code: 'TYPE_ARRAY',
      });
      return { valid: false, errors };
    }

    if (this.options.minItems !== undefined && value.length < this.options.minItems) {
      errors.push({
        field: this.fieldName,
        message: `${this.fieldName} must have at least ${this.options.minItems} items`,
        value: value.length,
        code: 'MIN_ITEMS',
      });
    }

    if (this.options.maxItems !== undefined && value.length > this.options.maxItems) {
      errors.push({
        field: this.fieldName,
        message: `${this.fieldName} must have at most ${this.options.maxItems} items`,
        value: value.length,
        code: 'MAX_ITEMS',
      });
    }

    if (this.options.itemValidator) {
      value.forEach((item, index) => {
        const result = this.options.itemValidator!.validate(item);
        if (!result.valid) {
          errors.push(...result.errors.map(e => ({
            ...e,
            field: `${this.fieldName}[${index}].${e.field}`,
          })));
        }
      });
    }

    return { valid: errors.length === 0, errors };
  }
}

export class EnumValidator<T extends string> implements Validator<T> {
  constructor(
    private readonly fieldName: string,
    private readonly allowedValues: T[],
  ) {}

  validate(value: T): ValidationResult {
    if (!this.allowedValues.includes(value)) {
      return {
        valid: false,
        errors: [{
          field: this.fieldName,
          message: `${this.fieldName} must be one of: ${this.allowedValues.join(', ')}`,
          value,
          code: 'ENUM',
        }],
      };
    }
    return { valid: true, errors: [] };
  }
}

// ========== DSO 验证器 ==========

export interface DSOValidationOptions {
  requireUserPreferences?: boolean;
  requireConstraints?: boolean;
  maxCandidates?: number;
}

export class DSOValidator implements Validator<Record<string, unknown>> {
  constructor(private readonly options: DSOValidationOptions = {}) {}

  validate(dso: Record<string, unknown>): ValidationResult {
    const errors: ValidationError[] = [];

    if (!dso || typeof dso !== 'object') {
      errors.push({
        field: 'dso',
        message: 'DSO must be a valid object',
        code: 'INVALID_DSO',
      });
      return { valid: false, errors };
    }

    if (!dso.requestId) {
      errors.push({
        field: 'dso.requestId',
        message: 'Request ID is required',
        code: 'REQUIRED',
      });
    }

    if (this.options.requireUserPreferences && !dso.userPreferences) {
      errors.push({
        field: 'dso.userPreferences',
        message: 'User preferences are required',
        code: 'REQUIRED',
      });
    }

    if (this.options.requireConstraints && !dso.constraints) {
      errors.push({
        field: 'dso.constraints',
        message: 'Constraints are required',
        code: 'REQUIRED',
      });
    }

    if (dso.candidates && Array.isArray(dso.candidates)) {
      const maxCandidates = this.options.maxCandidates ?? 1000;
      if ((dso.candidates as unknown[]).length > maxCandidates) {
        errors.push({
          field: 'dso.candidates',
          message: `Cannot have more than ${maxCandidates} candidates`,
          value: (dso.candidates as unknown[]).length,
          code: 'MAX_ITEMS',
        });
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

// ========== 复合验证器 ==========

export class CompositeValidator implements Validator {
  private validators: Array<{ field: string; validator: Validator }> = [];

  addValidator(field: string, validator: Validator): this {
    this.validators.push({ field, validator });
    return this;
  }

  validate(value: Record<string, unknown>, context?: ValidationContext): ValidationResult {
    const errors: ValidationError[] = [];

    for (const { field, validator } of this.validators) {
      const fieldValue = this.getNestedValue(value, field);
      const result = validator.validate(fieldValue, context);

      if (!result.valid) {
        errors.push(...result.errors);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current: unknown, key) => {
      if (current && typeof current === 'object') {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }
}

// ========== 验证管道 ==========

@Injectable()
export class DecisionValidationPipe implements PipeTransform {
  private readonly logger = new Logger(DecisionValidationPipe.name);
  private readonly validators = new Map<string, Validator>();

  constructor() {
    this.registerDefaultValidators();
  }

  registerValidator(name: string, validator: Validator): void {
    this.validators.set(name, validator);
  }

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (!value || metadata.type !== 'body') {
      return value;
    }

    const validatorName = metadata.metatype?.name?.toLowerCase();
    const validator = this.validators.get(validatorName ?? '');

    if (validator) {
      const result = validator.validate(value);

      if (!result.valid) {
        this.logger.warn(`[Validation] Failed: ${JSON.stringify(result.errors)}`);
        throw new BadRequestException({
          message: 'Validation failed',
          errors: result.errors,
        });
      }
    }

    return value;
  }

  private registerDefaultValidators(): void {
    this.validators.set('makedecisionrequestdto', new CompositeValidator()
      .addValidator('requestId', new RequiredValidator('requestId'))
      .addValidator('requestId', new StringValidator('requestId', { minLength: 1, maxLength: 255 }))
      .addValidator('dso', new DSOValidator({ requireUserPreferences: false })));

    this.validators.set('submitfeedbackrequestdto', new CompositeValidator()
      .addValidator('decisionId', new RequiredValidator('decisionId'))
      .addValidator('score', new NumberValidator('score', { min: 0, max: 1 })));
  }
}

// ========== 验证装饰器 ==========

const VALIDATION_RULES_KEY = Symbol('VALIDATION_RULES');

export interface ValidationRule {
  validator: new (...args: unknown[]) => Validator;
  options?: unknown;
}

export function Validate(validator: new (...args: unknown[]) => Validator, options?: unknown): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const existingRules = Reflect.getMetadata(VALIDATION_RULES_KEY, target) || [];
    existingRules.push({ propertyKey, validator, options });
    Reflect.defineMetadata(VALIDATION_RULES_KEY, existingRules, target);
  };
}

export function getValidationRules(target: object): Array<{
  propertyKey: string | symbol;
  validator: new (...args: unknown[]) => Validator;
  options?: unknown;
}> {
  return Reflect.getMetadata(VALIDATION_RULES_KEY, target) || [];
}
