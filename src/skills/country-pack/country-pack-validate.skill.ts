// src/skills/country-pack/country-pack-validate.skill.ts
/**
 * skill.countryPack.validate
 * 
 * 输入：{ pack, packType }
 * 输出：{ valid, errors, warnings }
 * 
 * 验证 Pack 数据的完整性和正确性
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { PackValidatorService, ValidationResult } from '../../trips/readiness/storage/pack-validator.service';
import { ReadinessPack } from '../../trips/readiness/types/readiness-pack.types';
import { ImportCountryPackDto } from '../../route-directions/dto/import-country-pack.dto';
import { RouteDirectionsService } from '../../route-directions/route-directions.service';

export interface CountryPackValidateInput extends SkillInput {
  /** Pack 数据 */
  pack: ReadinessPack | ImportCountryPackDto;
  /** Pack 类型 */
  packType: 'readiness' | 'routeDirection';
}

export interface CountryPackValidateOutput extends SkillOutput {
  /** 是否有效 */
  valid: boolean;
  /** 错误列表 */
  errors: Array<{
    path: string;
    message: string;
    code: string;
  }>;
  /** 警告列表 */
  warnings: Array<{
    path: string;
    message: string;
    code: string;
  }>;
  /** 验证摘要 */
  summary: {
    totalErrors: number;
    totalWarnings: number;
    criticalIssues: string[];
  };
}

@Injectable()
export class CountryPackValidateSkill implements Skill<CountryPackValidateInput, CountryPackValidateOutput> {
  private readonly logger = new Logger(CountryPackValidateSkill.name);

  metadata = {
    name: 'countryPack.validate',
    description: 'countryPack.validate：验证 Pack 数据的完整性和正确性，输出结构化错误和警告',
    version: '1.0.0',
    category: 'countryPack' as const,
  };

  constructor(
    @Optional() private readonly packValidator?: PackValidatorService,
    @Optional() private readonly routeDirectionsService?: RouteDirectionsService,
  ) {}

  async execute(input: CountryPackValidateInput): Promise<CountryPackValidateOutput> {
    this.logger.debug(`执行 countryPack.validate: type=${input.packType}`);

    if (input.packType === 'readiness') {
      return this.validateReadinessPack(input.pack as ReadinessPack);
    } else {
      return this.validateRouteDirectionPack(input.pack as ImportCountryPackDto);
    }
  }

  /**
   * 验证 ReadinessPack
   */
  private validateReadinessPack(pack: ReadinessPack): CountryPackValidateOutput {
    if (!this.packValidator) {
      this.logger.warn('PackValidatorService 不可用，使用基本验证');
      return this.basicValidateReadinessPack(pack);
    }
    
    const result: ValidationResult = this.packValidator.validate(pack);

    const criticalIssues = result.errors
      .filter(e => e.code === 'MISSING_FIELD' || e.code === 'EMPTY_RULES')
      .map(e => e.message);

    return {
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
      summary: {
        totalErrors: result.errors.length,
        totalWarnings: result.warnings.length,
        criticalIssues,
      },
    };
  }

  /**
   * 验证 RouteDirectionPack
   */
  private validateRouteDirectionPack(pack: ImportCountryPackDto): CountryPackValidateOutput {
    const errors: Array<{ path: string; message: string; code: string }> = [];
    const warnings: Array<{ path: string; message: string; code: string }> = [];

    // 验证基本字段
    if (!pack.countryCode) {
      errors.push({
        path: 'countryCode',
        message: 'countryCode is required',
        code: 'MISSING_FIELD',
      });
    } else if (!/^[A-Z]{2}$/.test(pack.countryCode)) {
      errors.push({
        path: 'countryCode',
        message: 'countryCode must be a 2-letter ISO code',
        code: 'INVALID_FORMAT',
      });
    }

    if (!pack.countryName) {
      errors.push({
        path: 'countryName',
        message: 'countryName is required',
        code: 'MISSING_FIELD',
      });
    }

    // 验证 routeDirections
    if (!pack.routeDirections || pack.routeDirections.length === 0) {
      errors.push({
        path: 'routeDirections',
        message: 'At least one routeDirection is required',
        code: 'EMPTY_ROUTE_DIRECTIONS',
      });
    } else {
      pack.routeDirections.forEach((rd, index) => {
        const basePath = `routeDirections[${index}]`;

        if (!rd.name) {
          errors.push({
            path: `${basePath}.name`,
            message: 'RouteDirection name is required',
            code: 'MISSING_FIELD',
          });
        }

        if (!rd.countryCode) {
          errors.push({
            path: `${basePath}.countryCode`,
            message: 'RouteDirection countryCode is required',
            code: 'MISSING_FIELD',
          });
        } else if (rd.countryCode !== pack.countryCode) {
          warnings.push({
            path: `${basePath}.countryCode`,
            message: `RouteDirection countryCode (${rd.countryCode}) does not match pack countryCode (${pack.countryCode})`,
            code: 'MISMATCH_COUNTRY_CODE',
          });
        }

        if (!rd.tags || rd.tags.length === 0) {
          warnings.push({
            path: `${basePath}.tags`,
            message: 'RouteDirection should have at least one tag',
            code: 'EMPTY_TAGS',
          });
        }
      });
    }

    const criticalIssues = errors
      .filter(e => e.code === 'MISSING_FIELD' || e.code === 'EMPTY_ROUTE_DIRECTIONS')
      .map(e => e.message);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      summary: {
        totalErrors: errors.length,
        totalWarnings: warnings.length,
        criticalIssues,
      },
    };
  }

  /**
   * 基本验证 ReadinessPack（当 PackValidatorService 不可用时使用）
   */
  private basicValidateReadinessPack(pack: ReadinessPack): CountryPackValidateOutput {
    const errors: Array<{ path: string; message: string; code: string }> = [];
    const warnings: Array<{ path: string; message: string; code: string }> = [];

    // 基本字段检查
    if (!pack.packId) {
      errors.push({ path: 'packId', message: 'packId is required', code: 'MISSING_FIELD' });
    }
    if (!pack.destinationId) {
      errors.push({ path: 'destinationId', message: 'destinationId is required', code: 'MISSING_FIELD' });
    }
    if (!pack.version) {
      errors.push({ path: 'version', message: 'version is required', code: 'MISSING_FIELD' });
    }
    if (!pack.geo || !pack.geo.countryCode) {
      errors.push({ path: 'geo.countryCode', message: 'geo.countryCode is required', code: 'MISSING_FIELD' });
    }
    if (!pack.rules || pack.rules.length === 0) {
      errors.push({ path: 'rules', message: 'At least one rule is required', code: 'EMPTY_RULES' });
    }
    if (!pack.checklists || pack.checklists.length === 0) {
      warnings.push({ path: 'checklists', message: 'No checklists provided', code: 'EMPTY_CHECKLISTS' });
    }

    const criticalIssues = errors
      .filter(e => e.code === 'MISSING_FIELD' || e.code === 'EMPTY_RULES')
      .map(e => e.message);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      summary: {
        totalErrors: errors.length,
        totalWarnings: warnings.length,
        criticalIssues,
      },
    };
  }
}

