// src/skills/route-pack/route-pack-validate.skill.ts
/**
 * tripnara.routePack.validate
 * 
 * P1: 验证 RoutePack
 * 
 * 功能：验证 RoutePack 数据的完整性和正确性，输出结构化错误和警告
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { RoutePack } from './route-pack-new-skeleton.skill';

export interface RoutePackValidateInput extends SkillInput {
  /** RoutePack 数据 */
  pack: RoutePack;
}

export interface RoutePackValidateOutput extends SkillOutput {
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
export class RoutePackValidateSkill
  implements Skill<RoutePackValidateInput, RoutePackValidateOutput>
{
  private readonly logger = new Logger(RoutePackValidateSkill.name);

  metadata = {
    name: 'routePack.validate',
    description: '验证 RoutePack 数据的完整性和正确性，输出结构化错误和警告',
    version: '1.0.0',
    category: 'countryPack' as const,
  };

  constructor() {}

  async execute(input: RoutePackValidateInput): Promise<RoutePackValidateOutput> {
    this.logger.debug(`执行 routePack.validate: packId=${input.pack.metadata.packId}`);

    const errors: Array<{ path: string; message: string; code: string }> = [];
    const warnings: Array<{ path: string; message: string; code: string }> = [];

    // 1. 验证 metadata
    if (!input.pack.metadata) {
      errors.push({
        path: 'metadata',
        message: 'metadata is required',
        code: 'MISSING_FIELD',
      });
    } else {
      if (!input.pack.metadata.packId) {
        errors.push({
          path: 'metadata.packId',
          message: 'metadata.packId is required',
          code: 'MISSING_FIELD',
        });
      } else if (!input.pack.metadata.packId.startsWith('routePack:')) {
        warnings.push({
          path: 'metadata.packId',
          message: 'packId should start with "routePack:"',
          code: 'INVALID_FORMAT',
        });
      }

      if (!input.pack.metadata.countryCode) {
        errors.push({
          path: 'metadata.countryCode',
          message: 'metadata.countryCode is required',
          code: 'MISSING_FIELD',
        });
      } else if (!/^[A-Z]{2}$/.test(input.pack.metadata.countryCode)) {
        errors.push({
          path: 'metadata.countryCode',
          message: 'countryCode must be a 2-letter ISO code',
          code: 'INVALID_FORMAT',
        });
      }

      if (!input.pack.metadata.version) {
        errors.push({
          path: 'metadata.version',
          message: 'metadata.version is required',
          code: 'MISSING_FIELD',
        });
      } else if (!/^\d+\.\d+\.\d+$/.test(input.pack.metadata.version)) {
        warnings.push({
          path: 'metadata.version',
          message: 'version should follow semantic versioning (e.g., "1.0.0")',
          code: 'INVALID_FORMAT',
        });
      }

      if (!input.pack.metadata.lastVerifiedAt) {
        warnings.push({
          path: 'metadata.lastVerifiedAt',
          message: 'lastVerifiedAt is recommended',
          code: 'MISSING_FIELD',
        });
      }
    }

    // 2. 验证 blocks
    if (!input.pack.blocks || input.pack.blocks.length === 0) {
      errors.push({
        path: 'blocks',
        message: 'At least one block is required',
        code: 'EMPTY_BLOCKS',
      });
    } else {
      input.pack.blocks.forEach((block, index) => {
        const basePath = `blocks[${index}]`;

        if (!block.blockId) {
          errors.push({
            path: `${basePath}.blockId`,
            message: 'blockId is required',
            code: 'MISSING_FIELD',
          });
        }

        if (!block.type) {
          errors.push({
            path: `${basePath}.type`,
            message: 'type is required',
            code: 'MISSING_FIELD',
          });
        } else {
          const validTypes = ['constraint', 'preference', 'safety', 'logistics', 'seasonality', 'risk'];
          if (!validTypes.includes(block.type)) {
            errors.push({
              path: `${basePath}.type`,
              message: `type must be one of: ${validTypes.join(', ')}`,
              code: 'INVALID_VALUE',
            });
          }
        }

        if (!block.content) {
          warnings.push({
            path: `${basePath}.content`,
            message: 'content is recommended',
            code: 'MISSING_FIELD',
          });
        }

        // 验证 evidence
        if (!block.evidence || block.evidence.length === 0) {
          warnings.push({
            path: `${basePath}.evidence`,
            message: 'evidence is recommended for RAG credibility',
            code: 'MISSING_FIELD',
          });
        } else {
          block.evidence.forEach((evidence, evIndex) => {
            const evPath = `${basePath}.evidence[${evIndex}]`;
            if (!evidence.source) {
              errors.push({
                path: `${evPath}.source`,
                message: 'evidence.source is required',
                code: 'MISSING_FIELD',
              });
            }
            if (!evidence.verifiedAt) {
              errors.push({
                path: `${evPath}.verifiedAt`,
                message: 'evidence.verifiedAt is required',
                code: 'MISSING_FIELD',
              });
            }
            if (evidence.confidence === undefined || evidence.confidence < 0 || evidence.confidence > 1) {
              warnings.push({
                path: `${evPath}.confidence`,
                message: 'confidence should be between 0 and 1',
                code: 'INVALID_VALUE',
              });
            }
          });
        }

        if (!block.source) {
          warnings.push({
            path: `${basePath}.source`,
            message: 'source is recommended',
            code: 'MISSING_FIELD',
          });
        }

        if (!block.lastVerifiedAt) {
          warnings.push({
            path: `${basePath}.lastVerifiedAt`,
            message: 'lastVerifiedAt is recommended',
            code: 'MISSING_FIELD',
          });
        }
      });
    }

    const criticalIssues = errors
      .filter((e) => e.code === 'MISSING_FIELD' || e.code === 'EMPTY_BLOCKS')
      .map((e) => e.message);

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
