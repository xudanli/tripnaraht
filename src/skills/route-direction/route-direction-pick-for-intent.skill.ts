// src/skills/route-direction/route-direction-pick-for-intent.skill.ts
/**
 * skill.routeDirection.pickForIntent
 * 
 * 输入：{ countryCode, season, userIntentTags }
 * 输出：{ routeDirectionId, reasoning, alternatives }
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { RouteDirectionSelectorService, UserIntent } from '../../route-directions/services/route-direction-selector.service';
import { RouteDirectionsService } from '../../route-directions/route-directions.service';

export interface RouteDirectionPickForIntentInput extends SkillInput {
  /** 国家代码（ISO 3166-1 alpha-2） */
  countryCode: string;
  /** 季节（月份 1-12） */
  season: number;
  /** 用户意图标签 */
  userIntentTags: string[];
  /** 其他用户意图参数（可选） */
  userIntent?: Partial<UserIntent>;
}

export interface RouteDirectionPickForIntentOutput extends SkillOutput {
  /** 推荐的路线方向 ID */
  routeDirectionId: string;
  /** 推荐理由 */
  reasoning: string;
  /** 备选方案 */
  alternatives: Array<{
    routeDirectionId: string;
    name: string;
    score: number;
    reasoning: string;
  }>;
}

@Injectable()
export class RouteDirectionPickForIntentSkill implements Skill<RouteDirectionPickForIntentInput, RouteDirectionPickForIntentOutput> {
  private readonly logger = new Logger(RouteDirectionPickForIntentSkill.name);

  metadata = {
    name: 'routeDirection.pickForIntent',
    description: 'routeDirection.pickForIntent：根据国家、季节和用户意图标签选择最合适的路线方向',
    version: '1.0.0',
    category: 'routeDirection' as const,
    inputSchema: {
      required: ['countryCode'],
      extractors: {
        countryCode: 'countryCode',
      },
    },
  };

  constructor(
    @Optional() private readonly routeDirectionSelector?: RouteDirectionSelectorService,
    @Optional() private readonly routeDirectionsService?: RouteDirectionsService,
  ) {}

  async execute(input: RouteDirectionPickForIntentInput): Promise<RouteDirectionPickForIntentOutput> {
    // 验证必需字段
    if (!input.countryCode) {
      throw new Error('routeDirection.pickForIntent 需要 countryCode 参数');
    }
    if (typeof input.season !== 'number' || input.season < 1 || input.season > 12) {
      throw new Error('routeDirection.pickForIntent 需要有效的 season 参数 (1-12)');
    }
    if (!Array.isArray(input.userIntentTags)) {
      this.logger.warn(`userIntentTags 不是数组，使用默认值: ${JSON.stringify(input.userIntentTags)}`);
      input.userIntentTags = [];
    }

    this.logger.debug(
      `执行 routeDirection.pickForIntent: country=${input.countryCode}, season=${input.season}, tags=${input.userIntentTags.join(',')}`
    );

    // 优先使用 RouteDirectionSelectorService（智能推荐）
    if (this.routeDirectionSelector) {
      try {
        // 构建 UserIntent
        const userIntent: UserIntent = {
          preferences: input.userIntentTags,
          ...input.userIntent,
        };

        // 调用 RouteDirectionSelector
        const recommendations = await this.routeDirectionSelector.pickRouteDirections(
          userIntent,
          input.countryCode,
          input.season
        );

        if (recommendations.length > 0) {
          // 取第一个推荐作为主要推荐
          const primary = recommendations[0];
          const alternatives = recommendations.slice(1, 4).map(rec => ({
            routeDirectionId: rec.routeDirection.uuid || String(rec.routeDirection.id),
            name: rec.routeDirection.nameCN || rec.routeDirection.nameEN || rec.routeDirection.name,
            score: rec.score || 0,
            reasoning: (rec as any).explanation?.summary || '无说明',
          }));

          return {
            routeDirectionId: primary.routeDirection.uuid || String(primary.routeDirection.id),
            reasoning: (primary as any).explanation?.summary || '基于用户意图和季节匹配',
            alternatives,
          };
        }
      } catch (error: any) {
        this.logger.warn(`RouteDirectionSelectorService 执行失败，尝试降级方案: ${error.message}`);
        // 继续执行降级方案
      }
    }

    // 降级方案 1: 使用 RouteDirectionsService 直接查询
    if (this.routeDirectionsService) {
      try {
        this.logger.debug('使用 RouteDirectionsService 降级方案');
        const results = await this.routeDirectionsService.findRouteDirectionsByCountry(
          input.countryCode,
          {
            tags: input.userIntentTags.length > 0 ? input.userIntentTags : undefined,
            month: input.season,
            limit: 5,
          }
        );

        if (results.active.length > 0) {
          const primary = results.active[0];
          const alternatives = results.active.slice(1, 4).map(rd => ({
            routeDirectionId: rd.uuid || String(rd.id),
            name: rd.nameCN || rd.nameEN || rd.name || '未知路线',
            score: 0.7, // 降级方案使用固定分数
            reasoning: `基于国家代码和季节匹配（降级方案）`,
          }));

          return {
            routeDirectionId: primary.uuid || String(primary.id),
            reasoning: `基于国家代码 ${input.countryCode} 和季节 ${input.season} 月匹配（降级方案，未使用智能推荐）`,
            alternatives,
          };
        }
      } catch (error: any) {
        this.logger.warn(`RouteDirectionsService 降级方案也失败: ${error.message}`);
        // 继续执行最终降级方案
      }
    }

    // 关键依赖缺失：抛出明确错误，不返回默认值
    const errorMessage = [
      '无法完成路线方向选择，因为关键依赖服务不可用。',
      '',
      '缺失的服务：',
      '- RouteDirectionSelectorService（智能推荐服务）',
      '- RouteDirectionsService（路线方向查询服务）',
      '',
      '影响：',
      '- 无法选择适合的路线方向',
      '- 无法进行安全评估（Should-Exist Gate）',
      '- 无法生成可执行的行程规划',
      '',
      '解决方案：',
      '1. 设置环境变量 ENABLE_ROUTE_DIRECTIONS_MODULE=true 以启用完整功能',
      '2. 或提供更具体的行程需求（如具体路线名称、已保存的行程 ID）',
      '3. 联系系统管理员检查 RouteDirectionsModule 是否正确配置',
    ].join('\n');

    this.logger.error(`[RouteDirectionPickForIntentSkill] 关键依赖缺失: ${errorMessage}`);
    
    // 抛出包含完整信息的错误
    const error = new Error(errorMessage);
    (error as any).isCriticalDependencyMissing = true;
    (error as any).missingServices = ['RouteDirectionSelectorService', 'RouteDirectionsService'];
    (error as any).solutions = [
      '设置环境变量 ENABLE_ROUTE_DIRECTIONS_MODULE=true',
      '提供更具体的行程需求',
      '联系系统管理员检查配置',
    ];
    throw error;
  }
}

