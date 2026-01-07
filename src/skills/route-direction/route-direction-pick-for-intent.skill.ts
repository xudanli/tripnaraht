// src/skills/route-direction/route-direction-pick-for-intent.skill.ts
/**
 * skill.routeDirection.pickForIntent
 * 
 * 输入：{ countryCode, season, userIntentTags }
 * 输出：{ routeDirectionId, reasoning, alternatives }
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { RouteDirectionSelectorService, UserIntent } from '../../route-directions/services/route-direction-selector.service';

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
    description: '根据国家、季节和用户意图标签选择最合适的路线方向',
    version: '1.0.0',
    category: 'routeDirection' as const,
  };

  constructor(
    private readonly routeDirectionSelector: RouteDirectionSelectorService,
  ) {}

  async execute(input: RouteDirectionPickForIntentInput): Promise<RouteDirectionPickForIntentOutput> {
    this.logger.debug(
      `执行 routeDirection.pickForIntent: country=${input.countryCode}, season=${input.season}, tags=${input.userIntentTags.join(',')}`
    );

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

    if (recommendations.length === 0) {
      throw new Error(`未找到 ${input.countryCode} 在 ${input.season} 月的路线方向`);
    }

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
}

