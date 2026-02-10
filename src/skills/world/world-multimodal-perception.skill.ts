/**
 * world.multimodalPerception Skill
 * 
 * 获取多模态感知数据（图像、文本）
 * 使用ImageDirectService的MCP工具和VisionService处理图像
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import { MultimodalWorldPerceptionService } from './services/multimodal-world-perception.service';
import { MultimodalPerceptionData } from './interfaces/unified-world-model.interface';

export interface WorldMultimodalPerceptionInput extends SkillInput {
  /** POI ID（可选） */
  poiId?: string;
  
  /** 路线方向ID（可选） */
  routeDirectionId?: string;
}

export interface WorldMultimodalPerceptionOutput extends SkillOutput {
  /** 多模态感知数据 */
  perception: MultimodalPerceptionData;
  
  /** 证据ID */
  evidence_id: string;
  
  /** 数据源 */
  source: string;
}

@SkillDecorator({
  name: 'world.multimodalPerception',
  description: '获取多模态感知数据（图像、文本分析）',
  version: '1.0.0',
  category: 'world',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class WorldMultimodalPerceptionSkill implements Skill<WorldMultimodalPerceptionInput, WorldMultimodalPerceptionOutput> {
  private readonly logger = new Logger(WorldMultimodalPerceptionSkill.name);

  metadata = {
    name: 'world.multimodalPerception',
    description: '获取多模态感知数据（图像、文本分析）',
    version: '1.0.0',
    category: 'world' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: [],
      typeChecks: {},
    },
  };

  constructor(
    @Optional() private multimodalWorldPerceptionService?: MultimodalWorldPerceptionService,
  ) {
    this.logger.log(`[WorldMultimodalPerceptionSkill] 已初始化`);
  }

  async execute(input: WorldMultimodalPerceptionInput): Promise<WorldMultimodalPerceptionOutput> {
    this.logger.log(
      `执行 world.multimodalPerception: poiId=${input.poiId}, routeDirectionId=${input.routeDirectionId}`,
    );

    try {
      // 使用MultimodalWorldPerceptionService获取感知数据
      if (this.multimodalWorldPerceptionService) {
        const perceptionResult = await this.multimodalWorldPerceptionService.aggregatePerceptionResults(
          input.poiId,
          input.routeDirectionId,
        );

        return {
          perception: perceptionResult,
          evidence_id: `world_multimodal_perception_${Date.now()}`,
          source: 'MultimodalWorldPerceptionService',
        };
      }

      // 降级策略：返回空感知数据
      this.logger.warn(`[WorldMultimodalPerceptionSkill] MultimodalWorldPerceptionService不可用，返回空感知数据`);
      return {
        perception: {
          poiId: input.poiId,
          routeDirectionId: input.routeDirectionId,
          images: [],
          texts: [],
          aggregatedInsights: {
            averageSentiment: 0,
            commonKeywords: [],
            commonTopics: [],
          },
          confidence: 0.3,
        },
        evidence_id: `world_multimodal_perception_fallback_${Date.now()}`,
        source: 'fallback',
      };
    } catch (error: any) {
      this.logger.error(
        `world.multimodalPerception 失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }
}
