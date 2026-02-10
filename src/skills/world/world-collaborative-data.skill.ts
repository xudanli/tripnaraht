/**
 * world.collaborativeData Skill
 * 
 * 获取协作世界模型数据（用户贡献、专家验证）
 * 使用CollaborativeWorldModelService获取已验证的贡献数据
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import { CollaborativeWorldModelService } from './services/collaborative-world-model.service';
import { UserContribution } from './services/collaborative-world-model.service';

export interface WorldCollaborativeDataInput extends SkillInput {
  /** 目标ID（roadId, poiId, routeDirectionId等） */
  targetId: string;
  
  /** 贡献类型（可选） */
  contributionType?: string;
}

export interface WorldCollaborativeDataOutput extends SkillOutput {
  /** 已验证的贡献列表 */
  contributions: UserContribution[];
  
  /** 数据质量评分（平均） */
  averageQualityScore: number;
  
  /** 证据ID */
  evidence_id: string;
  
  /** 数据源 */
  source: string;
}

@SkillDecorator({
  name: 'world.collaborativeData',
  description: '获取协作世界模型数据（用户贡献、专家验证）',
  version: '1.0.0',
  category: 'world',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class WorldCollaborativeDataSkill implements Skill<WorldCollaborativeDataInput, WorldCollaborativeDataOutput> {
  private readonly logger = new Logger(WorldCollaborativeDataSkill.name);

  metadata = {
    name: 'world.collaborativeData',
    description: '获取协作世界模型数据（用户贡献、专家验证）',
    version: '1.0.0',
    category: 'world' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['targetId'],
      typeChecks: {
        targetId: { type: 'string' as const },
      },
    },
  };

  constructor(
    @Optional() private collaborativeWorldModelService?: CollaborativeWorldModelService,
  ) {
    this.logger.log(`[WorldCollaborativeDataSkill] 已初始化`);
  }

  async execute(input: WorldCollaborativeDataInput): Promise<WorldCollaborativeDataOutput> {
    this.logger.log(
      `执行 world.collaborativeData: targetId=${input.targetId}, type=${input.contributionType}`,
    );

    try {
      // 使用CollaborativeWorldModelService获取已验证的贡献
      if (this.collaborativeWorldModelService) {
        const contributions = await this.collaborativeWorldModelService.getVerifiedContributions(
          input.targetId,
          input.contributionType as any,
        );

        // 计算平均质量评分
        const averageQualityScore =
          contributions.length > 0
            ? contributions.reduce((sum, c) => sum + c.qualityScore, 0) /
              contributions.length
            : 0;

        return {
          contributions,
          averageQualityScore,
          evidence_id: `world_collaborative_data_${Date.now()}`,
          source: 'CollaborativeWorldModelService',
        };
      }

      // 降级策略：返回空数据
      this.logger.warn(`[WorldCollaborativeDataSkill] CollaborativeWorldModelService不可用，返回空数据`);
      return {
        contributions: [],
        averageQualityScore: 0,
        evidence_id: `world_collaborative_data_fallback_${Date.now()}`,
        source: 'fallback',
      };
    } catch (error: any) {
      this.logger.error(
        `world.collaborativeData 失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }
}
