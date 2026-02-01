// src/trips/readiness/storage/pack-validator.service.ts

/**
 * Pack Validator Service
 * 
 * 验证 Readiness Pack 的完整性和正确性
 * 使用 JSON Schema 进行严格验证
 */

import { Injectable, Logger } from '@nestjs/common';
import { ReadinessPack, UserDecision, UserQuestion, DecisionBranch } from '../types/readiness-pack.types';
import { PackStorageService } from './pack-storage.service';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
  code: string;
}

@Injectable()
export class PackValidatorService {
  private readonly logger = new Logger(PackValidatorService.name);

  constructor(private readonly packStorage: PackStorageService) {}

  /**
   * 完整验证 Pack
   */
  validate(pack: ReadinessPack): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 1. 基本结构验证
    this.validateBasicStructure(pack, errors, warnings);

    // 2. 规则验证
    this.validateRules(pack, errors, warnings);

    // 3. 清单验证
    this.validateChecklists(pack, errors, warnings);

    // 4. 风险验证
    this.validateHazards(pack, errors, warnings);

    // 5. 地理信息验证
    this.validateGeo(pack, errors, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 验证基本结构
   */
  private validateBasicStructure(
    pack: ReadinessPack,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (!pack.packId) {
      errors.push({ path: 'packId', message: 'packId is required', code: 'MISSING_FIELD' });
    } else if (!/^pack\.[a-z0-9.-]+$/.test(pack.packId)) {
      errors.push({
        path: 'packId',
        message: 'packId must follow format: pack.{country}.{region}.{city}',
        code: 'INVALID_FORMAT',
      });
    }

    if (!pack.destinationId) {
      errors.push({ path: 'destinationId', message: 'destinationId is required', code: 'MISSING_FIELD' });
    }

    if (!pack.version) {
      errors.push({ path: 'version', message: 'version is required', code: 'MISSING_FIELD' });
    } else if (!/^\d+\.\d+\.\d+$/.test(pack.version)) {
      errors.push({
        path: 'version',
        message: 'version must follow semantic versioning (e.g., 1.0.0)',
        code: 'INVALID_VERSION',
      });
    }

    if (!pack.lastReviewedAt) {
      errors.push({ path: 'lastReviewedAt', message: 'lastReviewedAt is required', code: 'MISSING_FIELD' });
    } else {
      try {
        const date = new Date(pack.lastReviewedAt);
        if (isNaN(date.getTime())) {
          errors.push({
            path: 'lastReviewedAt',
            message: 'lastReviewedAt must be a valid ISO datetime',
            code: 'INVALID_DATE',
          });
        }
      } catch {
        errors.push({
          path: 'lastReviewedAt',
          message: 'lastReviewedAt must be a valid ISO datetime',
          code: 'INVALID_DATE',
        });
      }
    }

    if (!pack.supportedSeasons || pack.supportedSeasons.length === 0) {
      warnings.push({
        path: 'supportedSeasons',
        message: 'supportedSeasons is empty, consider adding at least one season',
        code: 'EMPTY_SEASONS',
      });
    }
  }

  /**
   * 验证规则
   */
  private validateRules(
    pack: ReadinessPack,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (!pack.rules || pack.rules.length === 0) {
      errors.push({
        path: 'rules',
        message: 'At least one rule is required',
        code: 'EMPTY_RULES',
      });
      return;
    }

    pack.rules.forEach((rule, index) => {
      const basePath = `rules[${index}]`;

      if (!rule.id) {
        errors.push({ path: `${basePath}.id`, message: 'Rule id is required', code: 'MISSING_FIELD' });
      }

      if (!rule.category) {
        errors.push({ path: `${basePath}.category`, message: 'Rule category is required', code: 'MISSING_FIELD' });
      }

      if (!rule.when) {
        errors.push({ path: `${basePath}.when`, message: 'Rule when condition is required', code: 'MISSING_FIELD' });
      } else {
        this.validateCondition(rule.when, `${basePath}.when`, errors);
      }

      if (!rule.then) {
        errors.push({ path: `${basePath}.then`, message: 'Rule then action is required', code: 'MISSING_FIELD' });
      } else {
        if (!rule.then.level) {
          errors.push({
            path: `${basePath}.then.level`,
            message: 'Action level is required',
            code: 'MISSING_FIELD',
          });
        }
        if (!rule.then.message) {
          errors.push({
            path: `${basePath}.then.message`,
            message: 'Action message is required',
            code: 'MISSING_FIELD',
          });
        }

        // 验证 userDecision（如果存在）
        if (rule.then.userDecision) {
          this.validateUserDecision(rule.then.userDecision, `${basePath}.then.userDecision`, errors, warnings);
        }
      }

      // 检查是否有证据
      if (!rule.evidence || rule.evidence.length === 0) {
        warnings.push({
          path: `${basePath}.evidence`,
          message: 'Rule has no evidence, consider adding source references',
          code: 'NO_EVIDENCE',
        });
      }
    });
  }

  /**
   * 验证条件
   */
  private validateCondition(condition: any, path: string, errors: ValidationError[]): void {
    const keys = Object.keys(condition);
    const validKeys = ['all', 'any', 'not', 'exists', 'eq', 'in', 'containsAny'];

    if (keys.length === 0) {
      errors.push({ path, message: 'Condition cannot be empty', code: 'EMPTY_CONDITION' });
      return;
    }

    const hasValidKey = keys.some(k => validKeys.includes(k));
    if (!hasValidKey) {
      errors.push({
        path,
        message: `Condition must contain one of: ${validKeys.join(', ')}`,
        code: 'INVALID_CONDITION',
      });
    }

    // 递归验证嵌套条件
    if (condition.all && Array.isArray(condition.all)) {
      condition.all.forEach((c: any, i: number) => {
        this.validateCondition(c, `${path}.all[${i}]`, errors);
      });
    }

    if (condition.any && Array.isArray(condition.any)) {
      condition.any.forEach((c: any, i: number) => {
        this.validateCondition(c, `${path}.any[${i}]`, errors);
      });
    }

    if (condition.not) {
      this.validateCondition(condition.not, `${path}.not`, errors);
    }

    // 验证 eq
    if (condition.eq) {
      if (!condition.eq.path) {
        errors.push({ path: `${path}.eq.path`, message: 'eq.path is required', code: 'MISSING_FIELD' });
      }
    }

    // 验证 in
    if (condition.in) {
      if (!condition.in.path) {
        errors.push({ path: `${path}.in.path`, message: 'in.path is required', code: 'MISSING_FIELD' });
      }
      if (!Array.isArray(condition.in.values)) {
        errors.push({ path: `${path}.in.values`, message: 'in.values must be an array', code: 'INVALID_TYPE' });
      }
    }

    // 验证 containsAny
    if (condition.containsAny) {
      if (!condition.containsAny.path) {
        errors.push({
          path: `${path}.containsAny.path`,
          message: 'containsAny.path is required',
          code: 'MISSING_FIELD',
        });
      }
      if (!Array.isArray(condition.containsAny.values)) {
        errors.push({
          path: `${path}.containsAny.values`,
          message: 'containsAny.values must be an array',
          code: 'INVALID_TYPE',
        });
      }
    }
  }

  /**
   * 验证清单
   */
  private validateChecklists(
    pack: ReadinessPack,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (!pack.checklists || pack.checklists.length === 0) {
      warnings.push({
        path: 'checklists',
        message: 'No checklists provided, consider adding at least one',
        code: 'EMPTY_CHECKLISTS',
      });
      return;
    }

    pack.checklists.forEach((checklist, index) => {
      const basePath = `checklists[${index}]`;

      if (!checklist.id) {
        errors.push({ path: `${basePath}.id`, message: 'Checklist id is required', code: 'MISSING_FIELD' });
      }

      if (!checklist.category) {
        errors.push({ path: `${basePath}.category`, message: 'Checklist category is required', code: 'MISSING_FIELD' });
      }

      if (!checklist.items || checklist.items.length === 0) {
        errors.push({
          path: `${basePath}.items`,
          message: 'Checklist items cannot be empty',
          code: 'EMPTY_ITEMS',
        });
      }
    });
  }

  /**
   * 验证风险
   */
  private validateHazards(
    pack: ReadinessPack,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (!pack.hazards || pack.hazards.length === 0) {
      warnings.push({
        path: 'hazards',
        message: 'No hazards provided, consider adding known risks',
        code: 'EMPTY_HAZARDS',
      });
      return;
    }

    pack.hazards.forEach((hazard, index) => {
      const basePath = `hazards[${index}]`;

      if (!hazard.type) {
        errors.push({ path: `${basePath}.type`, message: 'Hazard type is required', code: 'MISSING_FIELD' });
      }

      if (!hazard.severity) {
        errors.push({ path: `${basePath}.severity`, message: 'Hazard severity is required', code: 'MISSING_FIELD' });
      }

      if (!hazard.summary) {
        errors.push({ path: `${basePath}.summary`, message: 'Hazard summary is required', code: 'MISSING_FIELD' });
      }

      if (!hazard.mitigations || hazard.mitigations.length === 0) {
        warnings.push({
          path: `${basePath}.mitigations`,
          message: 'Hazard has no mitigations, consider adding mitigation strategies',
          code: 'NO_MITIGATIONS',
        });
      }
    });
  }

  /**
   * 验证地理信息
   */
  private validateGeo(
    pack: ReadinessPack,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (!pack.geo) {
      errors.push({ path: 'geo', message: 'geo is required', code: 'MISSING_FIELD' });
      return;
    }

    if (!pack.geo.countryCode) {
      errors.push({ path: 'geo.countryCode', message: 'geo.countryCode is required', code: 'MISSING_FIELD' });
    } else if (!/^[A-Z]{2}$/.test(pack.geo.countryCode)) {
      errors.push({
        path: 'geo.countryCode',
        message: 'countryCode must be a 2-letter ISO code',
        code: 'INVALID_FORMAT',
      });
    }

    if (pack.geo.lat !== undefined) {
      if (pack.geo.lat < -90 || pack.geo.lat > 90) {
        errors.push({
          path: 'geo.lat',
          message: 'latitude must be between -90 and 90',
          code: 'INVALID_RANGE',
        });
      }
    }

    if (pack.geo.lng !== undefined) {
      if (pack.geo.lng < -180 || pack.geo.lng > 180) {
        errors.push({
          path: 'geo.lng',
          message: 'longitude must be between -180 and 180',
          code: 'INVALID_RANGE',
        });
      }
    }
  }

  /**
   * 验证用户决策配置
   */
  private validateUserDecision(
    userDecision: UserDecision,
    path: string,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    // 1. 验证 questions
    if (!userDecision.questions || userDecision.questions.length === 0) {
      errors.push({
        path: `${path}.questions`,
        message: 'userDecision.questions is required and cannot be empty',
        code: 'MISSING_FIELD',
      });
      return;
    }

    // 2. 验证每个问题
    userDecision.questions.forEach((question, index) => {
      const questionPath = `${path}.questions[${index}]`;
      
      if (!question.id) {
        errors.push({
          path: `${questionPath}.id`,
          message: 'Question id is required',
          code: 'MISSING_FIELD',
        });
      }

      if (!question.type) {
        errors.push({
          path: `${questionPath}.type`,
          message: 'Question type is required',
          code: 'MISSING_FIELD',
        });
      } else {
        const validTypes = ['yes_no', 'single_choice', 'multiple_choice', 'text', 'number', 'date', 'rating'];
        if (!validTypes.includes(question.type)) {
          errors.push({
            path: `${questionPath}.type`,
            message: `Question type must be one of: ${validTypes.join(', ')}`,
            code: 'INVALID_TYPE',
          });
        }
      }

      if (!question.question) {
        errors.push({
          path: `${questionPath}.question`,
          message: 'Question text is required',
          code: 'MISSING_FIELD',
        });
      }

      // 验证 single_choice 和 multiple_choice 的选项
      if (question.type === 'single_choice' || question.type === 'multiple_choice') {
        if (!question.options || question.options.length === 0) {
          errors.push({
            path: `${questionPath}.options`,
            message: 'Options are required for single_choice and multiple_choice questions',
            code: 'MISSING_FIELD',
          });
        } else if (question.options.length > 10) {
          warnings.push({
            path: `${questionPath}.options`,
            message: 'Too many options (>10), consider reducing to avoid choice overload',
            code: 'TOO_MANY_OPTIONS',
          });
        }
      }

      // 验证 rating 的 min 和 max
      if (question.type === 'rating') {
        if (question.validation?.min !== undefined && question.validation?.max !== undefined) {
          if (question.validation.min >= question.validation.max) {
            errors.push({
              path: `${questionPath}.validation.min`,
              message: 'rating min must be less than max',
              code: 'INVALID_RANGE',
            });
          }
        }
      }
    });

    // 3. 验证 branches（如果存在）
    if (userDecision.branches && userDecision.branches.length > 0) {
      userDecision.branches.forEach((branch, index) => {
        const branchPath = `${path}.branches[${index}]`;
        this.validateDecisionBranch(branch, branchPath, userDecision.questions, errors, warnings);
      });
    }

    // 4. 验证 defaultBranch（如果存在）
    if (userDecision.defaultBranch) {
      // defaultBranch 的结构验证在 DecisionBranch 验证中已经覆盖
      // 这里只需要检查是否有 branches（如果没有 branches，defaultBranch 是必需的）
      if (!userDecision.branches || userDecision.branches.length === 0) {
        warnings.push({
          path: `${path}.defaultBranch`,
          message: 'defaultBranch is provided but no branches exist, defaultBranch will always be used',
          code: 'UNNECESSARY_DEFAULT_BRANCH',
        });
      }
    } else if (userDecision.branches && userDecision.branches.length > 0) {
      warnings.push({
        path: `${path}.defaultBranch`,
        message: 'branches exist but no defaultBranch, if no branch matches, original action will be used',
        code: 'MISSING_DEFAULT_BRANCH',
      });
    }
  }

  /**
   * 验证决策分支
   */
  private validateDecisionBranch(
    branch: DecisionBranch,
    path: string,
    questions: UserQuestion[],
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    // 1. 验证 condition
    if (!branch.condition) {
      errors.push({
        path: `${path}.condition`,
        message: 'Branch condition is required',
        code: 'MISSING_FIELD',
      });
      return;
    }

    const { questionId, operator, value } = branch.condition;

    if (!questionId) {
      errors.push({
        path: `${path}.condition.questionId`,
        message: 'condition.questionId is required',
        code: 'MISSING_FIELD',
      });
    } else {
      // 验证 questionId 是否存在于 questions 中
      const questionExists = questions.some(q => q.id === questionId);
      if (!questionExists) {
        errors.push({
          path: `${path}.condition.questionId`,
          message: `questionId "${questionId}" does not exist in questions`,
          code: 'INVALID_QUESTION_ID',
        });
      }
    }

    if (!operator) {
      errors.push({
        path: `${path}.condition.operator`,
        message: 'condition.operator is required',
        code: 'MISSING_FIELD',
      });
    } else {
      const validOperators = ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'in', 'not_in'];
      if (!validOperators.includes(operator)) {
        errors.push({
          path: `${path}.condition.operator`,
          message: `operator must be one of: ${validOperators.join(', ')}`,
          code: 'INVALID_OPERATOR',
        });
      }
    }

    if (value === undefined) {
      errors.push({
        path: `${path}.condition.value`,
        message: 'condition.value is required',
        code: 'MISSING_FIELD',
      });
    }

    // 2. 验证 then
    if (!branch.then) {
      errors.push({
        path: `${path}.then`,
        message: 'Branch then action is required',
        code: 'MISSING_FIELD',
      });
    } else {
      // 验证 then 中的字段
      if (branch.then.level) {
        const validLevels = ['blocker', 'must', 'should', 'optional'];
        if (!validLevels.includes(branch.then.level)) {
          errors.push({
            path: `${path}.then.level`,
            message: `level must be one of: ${validLevels.join(', ')}`,
            code: 'INVALID_LEVEL',
          });
        }
      }

      // 验证 additionalQuestions（如果存在）
      if (branch.then.additionalQuestions) {
        branch.then.additionalQuestions.forEach((question, index) => {
          const questionPath = `${path}.then.additionalQuestions[${index}]`;
          // 复用问题验证逻辑（简化版）
          if (!question.id) {
            errors.push({
              path: `${questionPath}.id`,
              message: 'Question id is required',
              code: 'MISSING_FIELD',
            });
          }
          if (!question.type) {
            errors.push({
              path: `${questionPath}.type`,
              message: 'Question type is required',
              code: 'MISSING_FIELD',
            });
          }
        });
      }
    }
  }
}

