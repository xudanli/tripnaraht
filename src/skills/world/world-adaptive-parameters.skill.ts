/**
 * world.adaptiveParameters Skill
 * 
 * 获取自适应世界模型参数
 * 基于用户反馈和学习后的能力自动调整参数
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import { AdaptiveWorldModelService } from './services/adaptive-world-model.service';
import { AdaptiveParameters } from './interfaces/unified-world-model.interface';
import { markWorldSkillDegraded } from './utils/world-skill-degraded.util';

export interface WorldAdaptiveParametersInput extends SkillInput {
  /** 路线方向ID（可选） */
  routeDirectionId?: string;
  
  /** 用户ID（可选） */
  userId?: string;
}

export interface WorldAdaptiveParametersOutput extends SkillOutput {
  /** 自适应参数 */
  parameters: AdaptiveParameters;
  
  /** 证据ID */
  evidence_id: string;
  
  /** 数据源 */
  source: string;
  
  /** 版本ID（如果有） */
  versionId?: string;

  degraded?: boolean;
  degradedReason?: string;
}

@SkillDecorator({
  name: 'world.adaptiveParameters',
  description: 'world.adaptiveParameters：获取自适应世界模型参数（基于用户反馈和学习后的能力）',
  version: '1.0.0',
  category: 'world',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class WorldAdaptiveParametersSkill implements Skill<WorldAdaptiveParametersInput, WorldAdaptiveParametersOutput> {
  private readonly logger = new Logger(WorldAdaptiveParametersSkill.name);

  metadata = {
    name: 'world.adaptiveParameters',
    description: 'world.adaptiveParameters：获取自适应世界模型参数（基于用户反馈和学习后的能力）',
    version: '1.0.0',
    category: 'world' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: [],
      typeChecks: {},
    },
  };

  constructor(
    @Optional() private adaptiveWorldModelService?: AdaptiveWorldModelService,
  ) {
    this.logger.log(`[WorldAdaptiveParametersSkill] 已初始化`);
  }

  async execute(input: WorldAdaptiveParametersInput): Promise<WorldAdaptiveParametersOutput> {
    this.logger.log(
      `执行 world.adaptiveParameters: routeDirectionId=${input.routeDirectionId}, userId=${input.userId}`,
    );

    try {
      // 使用AdaptiveWorldModelService获取参数
      if (this.adaptiveWorldModelService) {
        const parameters = await this.adaptiveWorldModelService.getAdaptiveParameters(
          input.routeDirectionId,
          input.userId,
        );

        return {
          parameters,
          evidence_id: `world_adaptive_parameters_${Date.now()}`,
          source: 'AdaptiveWorldModelService',
        };
      }

      // 降级策略：返回默认参数（显式 degraded）
      this.logger.warn(`[WorldAdaptiveParametersSkill] AdaptiveWorldModelService不可用，返回默认参数`);
      return markWorldSkillDegraded(
        {
          parameters: {
            routeDifficultyAdjustment: 1.0,
            timeEstimateAdjustment: 1.0,
            riskAssessmentAdjustment: 1.0,
          },
          evidence_id: `world_adaptive_parameters_fallback_${Date.now()}`,
          source: 'fallback',
        },
        'AdaptiveWorldModelService unavailable',
      );
    } catch (error: any) {
      this.logger.error(
        `world.adaptiveParameters 失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }
}
