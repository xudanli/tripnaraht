// src/trips/readiness/storage/pack-validator.service.ts

/**
 * Pack Validator Service
 * 
 * 验证 Readiness Pack 的完整性和正确性
 * 使用 JSON Schema 进行严格验证
 */

import { Injectable, Logger } from '@nestjs/common';
import { ReadinessPack } from '../types/readiness-pack.types';
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
}

