// src/skills/route-pack/route-pack-new-skeleton.skill.ts
/**
 * tripnara.routePack.newSkeleton
 * 
 * P1: 创建 RoutePack 骨架
 * 
 * 功能：为 RouteDirection 创建 Pack 化骨架，包含 blocks、evidence、source 等
 * 参考 CountryPack 的结构，但专门针对 RouteDirection
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { BlockEvidence, BlockDataSource } from '../../agent/context-engine/types/context-package.types';

/**
 * RoutePack 结构
 */
export interface RoutePack {
  metadata: {
    packId: string;
    routeDirectionId?: number;
    routeDirectionUuid?: string;
    countryCode: string;
    version: string;
    lastVerifiedAt: string;
  };
  blocks: Array<{
    blockId: string;
    type: 'constraint' | 'preference' | 'safety' | 'logistics' | 'seasonality' | 'risk';
    content: string;
    evidence: BlockEvidence[];
    source: BlockDataSource;
    lastVerifiedAt: string;
    metadata?: Record<string, any>;
  }>;
}

export interface RoutePackNewSkeletonInput extends SkillInput {
  /** 路线方向 ID 或 UUID（可选，如果提供则从数据库加载） */
  routeDirectionId?: number;
  routeDirectionUuid?: string;
  
  /** 国家代码（必需） */
  countryCode: string;
  
  /** 路线方向名称（如果未提供 routeDirectionId，则创建新骨架） */
  routeDirectionName?: string;
  routeDirectionNameCN?: string;
  routeDirectionNameEN?: string;
  
  /** Pack 版本（默认 "1.0.0"） */
  version?: string;
}

export interface RoutePackNewSkeletonOutput extends SkillOutput {
  /** 生成的 RoutePack 骨架 */
  pack: RoutePack;
  
  /** 模板说明 */
  template: {
    type: string;
    description: string;
    requiredFields: string[];
    optionalFields: string[];
  };
}

@Injectable()
export class RoutePackNewSkeletonSkill
  implements Skill<RoutePackNewSkeletonInput, RoutePackNewSkeletonOutput>
{
  private readonly logger = new Logger(RoutePackNewSkeletonSkill.name);

  metadata = {
    name: 'routePack.newSkeleton',
    description: '创建 RoutePack 骨架：为 RouteDirection 创建 Pack 化骨架，包含 blocks、evidence、source 等',
    version: '1.0.0',
    category: 'countryPack' as const, // 使用 countryPack 类别，因为属于 Knowledge Pack MCP
  };

  constructor() {}

  async execute(
    input: RoutePackNewSkeletonInput,
  ): Promise<RoutePackNewSkeletonOutput> {
    this.logger.debug(
      `执行 routePack.newSkeleton: countryCode=${input.countryCode}, routeDirectionId=${input.routeDirectionId}`,
    );

    const now = new Date().toISOString();
    const version = input.version || '1.0.0';
    
    // 生成 packId
    const routeDirectionIdentifier = input.routeDirectionUuid || 
                                     input.routeDirectionId?.toString() || 
                                     input.routeDirectionName?.toUpperCase().replace(/\s+/g, '_') || 
                                     'NEW_ROUTE';
    const packId = `routePack:${input.countryCode}:${routeDirectionIdentifier}`;

    // 创建 blocks
    const blocks: RoutePack['blocks'] = [
      // 1. 约束块（constraints）
      {
        blockId: `${packId}:constraints`,
        type: 'constraint',
        content: '路线约束条件（海拔、爬升、坡度等）',
        evidence: [
          {
            source: 'RouteDirection Data',
            verifiedAt: now,
            confidence: 0.8,
            metadata: {
              sourceType: 'database',
            },
          },
        ],
        source: 'PACK',
        lastVerifiedAt: now,
        metadata: {
          note: '需要从 RouteDirection.constraints 中提取',
        },
      },
      // 2. 偏好块（preferences）
      {
        blockId: `${packId}:preferences`,
        type: 'preference',
        content: '路线偏好（观景点、温泉、摄影等）',
        evidence: [
          {
            source: 'RouteDirection Data',
            verifiedAt: now,
            confidence: 0.8,
            metadata: {
              sourceType: 'database',
            },
          },
        ],
        source: 'PACK',
        lastVerifiedAt: now,
        metadata: {
          note: '需要从 RouteDirection.constraints.objectives 中提取',
        },
      },
      // 3. 安全块（safety）
      {
        blockId: `${packId}:safety`,
        type: 'safety',
        content: '安全信息（高反、封路、渡轮依赖等）',
        evidence: [
          {
            source: 'RouteDirection Data',
            verifiedAt: now,
            confidence: 0.8,
            metadata: {
              sourceType: 'database',
            },
          },
        ],
        source: 'PACK',
        lastVerifiedAt: now,
        metadata: {
          note: '需要从 RouteDirection.riskProfile 中提取',
        },
      },
      // 4. 季节性块（seasonality）
      {
        blockId: `${packId}:seasonality`,
        type: 'seasonality',
        content: '季节性信息（最佳月份、避免月份等）',
        evidence: [
          {
            source: 'RouteDirection Data',
            verifiedAt: now,
            confidence: 0.8,
            metadata: {
              sourceType: 'database',
            },
          },
        ],
        source: 'PACK',
        lastVerifiedAt: now,
        metadata: {
          note: '需要从 RouteDirection.seasonality 中提取',
        },
      },
      // 5. 风险块（risk）
      {
        blockId: `${packId}:risk`,
        type: 'risk',
        content: '风险画像（高反、封路、天气窗口等）',
        evidence: [
          {
            source: 'RouteDirection Data',
            verifiedAt: now,
            confidence: 0.8,
            metadata: {
              sourceType: 'database',
            },
          },
        ],
        source: 'PACK',
        lastVerifiedAt: now,
        metadata: {
          note: '需要从 RouteDirection.riskProfile 中提取',
        },
      },
      // 6. 物流块（logistics）
      {
        blockId: `${packId}:logistics`,
        type: 'logistics',
        content: '物流信息（入口枢纽、许可要求等）',
        evidence: [
          {
            source: 'RouteDirection Data',
            verifiedAt: now,
            confidence: 0.8,
            metadata: {
              sourceType: 'database',
            },
          },
        ],
        source: 'PACK',
        lastVerifiedAt: now,
        metadata: {
          note: '需要从 RouteDirection.entryHubs 和 RouteDirection.constraints 中提取',
        },
      },
    ];

    const pack: RoutePack = {
      metadata: {
        packId,
        routeDirectionId: input.routeDirectionId,
        routeDirectionUuid: input.routeDirectionUuid,
        countryCode: input.countryCode,
        version,
        lastVerifiedAt: now,
      },
      blocks,
    };

    return {
      pack,
      template: {
        type: 'RoutePack',
        description: '路线方向 Pack，用于定义路线方向的知识块，支持验证、回归测试、演进',
        requiredFields: [
          'metadata.packId',
          'metadata.countryCode',
          'metadata.version',
          'blocks',
        ],
        optionalFields: [
          'metadata.routeDirectionId',
          'metadata.routeDirectionUuid',
          'blocks[].metadata',
        ],
      },
    };
  }
}
