// src/skills/readiness/readiness-generate-checklist.skill.ts
/**
 * skill.readiness.generateChecklist
 * 
 * 输入：{ world: WorldModelContext, routeDirection, userProfile }
 * 输出：行前清单（证件、装备、健康/高反、车辆配置等）
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ReadinessAgentService } from '../../trips/decision/readiness/readiness-agent.service';
import { WorldModelContext } from '../../trips/decision/shared/world-model.types';
import { TripPlan } from '../../trips/decision/plan-model';

export interface ReadinessGenerateChecklistInput extends SkillInput {
  /** 世界模型上下文 */
  world: WorldModelContext;
  /** 路线方向（可选，用于增强检查） */
  routeDirection?: any;
  /** 用户画像（可选） */
  userProfile?: {
    nationality?: string;
    residencyCountry?: string;
    tags?: string[];
  };
  /** 行程计划（可选，用于基于实际行程生成检查项） */
  plan?: TripPlan;
}

export interface ReadinessGenerateChecklistOutput extends SkillOutput {
  /** 检查清单项 */
  items: Array<{
    type: 'GEAR' | 'DOCUMENT' | 'HEALTH' | 'SKILL';
    severity: 'MUST' | 'SHOULD' | 'OPTIONAL';
    title: string;
    description: string;
    reason: string;
  }>;
  /** 按类型分组 */
  itemsByType: {
    GEAR: Array<any>;
    DOCUMENT: Array<any>;
    HEALTH: Array<any>;
    SKILL: Array<any>;
  };
  /** 按严重程度分组 */
  itemsBySeverity: {
    MUST: Array<any>;
    SHOULD: Array<any>;
    OPTIONAL: Array<any>;
  };
  /** 摘要 */
  summary: {
    totalItems: number;
    mustItems: number;
    shouldItems: number;
    optionalItems: number;
  };
}

@Injectable()
export class ReadinessGenerateChecklistSkill implements Skill<ReadinessGenerateChecklistInput, ReadinessGenerateChecklistOutput> {
  private readonly logger = new Logger(ReadinessGenerateChecklistSkill.name);

  metadata = {
    name: 'readiness.generateChecklist',
    description: '基于世界模型和路线方向生成行前准备清单（证件、装备、健康、技能等）',
    version: '1.0.0',
    category: 'readiness' as const,
    inputSchema: {
      dependencies: [
        { param: 'world', alternatives: ['tripId'] },
        { param: 'tripId', alternatives: ['world'] },
      ],
      extractors: {
        tripId: 'tripId',
      },
    },
  };

  constructor(
    private readonly readinessAgent: ReadinessAgentService,
  ) {}

  async execute(input: ReadinessGenerateChecklistInput): Promise<ReadinessGenerateChecklistOutput> {
    this.logger.debug(`执行 readiness.generateChecklist`);

    // 如果没有提供 plan，创建一个空的 TripPlan
    const plan: TripPlan = input.plan || {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      days: [],
    };

    // 调用 ReadinessAgent
    const result = this.readinessAgent.run(input.world, plan);

    // 转换格式
    return {
      items: result.items.map(item => ({
        type: item.type,
        severity: item.severity,
        title: item.title,
        description: item.description || '',
        reason: item.reasonSignals?.join(', ') || '',
      })),
      itemsByType: {
        GEAR: result.itemsByType.GEAR || [],
        DOCUMENT: result.itemsByType.DOCUMENT || [],
        HEALTH: result.itemsByType.HEALTH || [],
        SKILL: result.itemsByType.SKILL || [],
      },
      itemsBySeverity: {
        MUST: result.itemsBySeverity.MUST || [],
        SHOULD: result.itemsBySeverity.SHOULD || [],
        OPTIONAL: result.itemsBySeverity.OPTIONAL || [],
      },
      summary: {
        totalItems: result.items.length,
        mustItems: result.itemsBySeverity.MUST?.length || 0,
        shouldItems: result.itemsBySeverity.SHOULD?.length || 0,
        optionalItems: result.itemsBySeverity.OPTIONAL?.length || 0,
      },
    };
  }
}

