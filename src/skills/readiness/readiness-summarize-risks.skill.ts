// src/skills/readiness/readiness-summarize-risks.skill.ts
/**
 * skill.readiness.summarizeRisks
 * 
 * 用途：从 WorldModel + 决策结果中，提炼 3 行「这次旅程最需要留意什么」。
 * 不只是带什么，而是为什么要带。
 * 
 * 输入：tripId 或 worldModelContext + finalPlan
 * 输出：topRisks[] + riskMitigationTips[] + readinessScore
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { WorldModelContext, RoutePlanDraft } from '../../trips/decision/shared/world-model.types';
import { WorldBuildContextSkill } from '../world/world-build-context.skill';
import { DecisionRunThreeGuardiansSkill } from '../decision/decision-run-three-guardians.skill';
import { PrismaService } from '../../prisma/prisma.service';

export interface ReadinessSummarizeRisksInput extends SkillInput {
  /** 行程 ID（如果有） */
  tripId?: string;
  /** 或直接提供世界模型上下文 */
  world?: WorldModelContext;
  /** 最终计划（可选，如果提供 tripId 会自动获取决策结果） */
  finalPlan?: RoutePlanDraft;
}

export interface ReadinessSummarizeRisksOutput extends SkillOutput {
  /** 最高优先级风险列表 */
  topRisks: Array<{
    risk: string; // 如：高海拔 / 夜间驾驶 / F-road / 海况不稳
    category: 'altitude' | 'road' | 'weather' | 'health' | 'other';
    severity: 'high' | 'medium' | 'low';
    description: string;
  }>;
  /** 每个风险对应的缓解建议 */
  riskMitigationTips: Array<{
    risk: string;
    tips: string[]; // 每个风险对应 1–2 句建议
  }>;
  /** 准备度评分（0–100，给 UI 用的指标） */
  readinessScore: number;
}

@Injectable()
export class ReadinessSummarizeRisksSkill implements Skill<ReadinessSummarizeRisksInput, ReadinessSummarizeRisksOutput> {
  private readonly logger = new Logger(ReadinessSummarizeRisksSkill.name);

  metadata = {
    name: 'readiness.summarizeRisks',
    description: '从 world 模型与决策结果提炼 readiness 关键风险与缓解建议。在 readiness 阶段向用户展示行前风险摘要时调用。',
    version: '1.0.0',
    category: 'readiness' as const,
  };

  constructor(
    private readonly worldBuildContext: WorldBuildContextSkill,
    private readonly decisionRunThreeGuardians: DecisionRunThreeGuardiansSkill,
    private readonly prisma: PrismaService,
  ) {}

  async execute(input: ReadinessSummarizeRisksInput): Promise<ReadinessSummarizeRisksOutput> {
    this.logger.debug(`执行 readiness.summarizeRisks: tripId=${input.tripId || 'none'}`);

    try {
      // 1. 获取或构建 WorldModelContext
      let world: WorldModelContext;

      if (input.tripId) {
        const contextResult = await this.worldBuildContext.execute({
          tripId: input.tripId,
        });
        world = contextResult.world;

        // 如果有决策结果，获取决策摘要
        // TODO: 从 tripId 获取已有的决策结果
      } else if (input.world) {
        world = input.world;
      } else {
        throw new Error('必须提供 tripId 或 world');
      }

      // 2. 分析风险
      const risks = this.analyzeRisks(world, input.finalPlan);
      
      // 3. 生成缓解建议
      const riskMitigationTips = this.generateMitigationTips(risks);

      // 4. 计算准备度评分
      const readinessScore = this.calculateReadinessScore(risks);

      return {
        topRisks: risks.slice(0, 5), // 最多返回 5 个风险
        riskMitigationTips,
        readinessScore,
      };
    } catch (error: any) {
      this.logger.error(`总结风险失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private analyzeRisks(world: WorldModelContext, plan?: RoutePlanDraft): ReadinessSummarizeRisksOutput['topRisks'] {
    const risks: ReadinessSummarizeRisksOutput['topRisks'] = [];

    // 1. 分析海拔风险
    const demEvidence = world.physical?.demEvidence || [];
    const highAltitudeSegments = demEvidence.filter(seg => 
      (seg.metadata as any)?.elevationRange?.max > 3000 // 超过 3000 米
    );

    if (highAltitudeSegments.length > 0) {
      risks.push({
        risk: '高海拔',
        category: 'altitude',
        severity: 'high',
        description: `行程中有 ${highAltitudeSegments.length} 个路段海拔超过 3000 米，可能出现高反症状`,
      });
    }

    // 2. 分析道路风险（F-road）
    const hazardZones = world.physical?.hazardZones || [];
    const fRoadHazards = hazardZones.filter(hz => {
      const metadata = hz.metadata || {};
      const zoneId = hz.zoneId || '';
      return (hz.type === 'OTHER' && (metadata.type === 'F_ROAD' || zoneId.toLowerCase().includes('f-road'))) ||
             metadata.fRoad === true ||
             zoneId.toLowerCase().includes('f-road');
    });

    if (fRoadHazards.length > 0) {
      risks.push({
        risk: 'F-road 路段',
        category: 'road',
        severity: 'high',
        description: `行程包含 ${fRoadHazards.length} 个 F-road 路段，需要四驱车和丰富驾驶经验`,
      });
    }

    // 3. 分析天气/海况风险
    const countryCode = world.physical?.countryCode || '';
    const month = world.physical?.month || 1;
    
    // 冰岛冬季海况
    if (countryCode === 'IS' && (month >= 10 || month <= 3)) {
      risks.push({
        risk: '冬季海况不稳',
        category: 'weather',
        severity: 'medium',
        description: '冬季冰岛海况多变，可能影响出海活动',
      });
    }

    // 4. 分析健康风险（基于人体能力模型）
    const human = world.human;
    if (human && (human.maxDailyAscentM || 0) < 1000) {
      risks.push({
        risk: '体力限制',
        category: 'health',
        severity: 'medium',
        description: '基于您的体能评估，行程中某些爬升路段可能需要额外准备',
      });
    }

    // 5. 分析夜间驾驶
    if (plan) {
      // TODO: 分析计划中是否有夜间驾驶时段
      // 简化处理
    }

    return risks.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  private generateMitigationTips(risks: ReadinessSummarizeRisksOutput['topRisks']): ReadinessSummarizeRisksOutput['riskMitigationTips'] {
    const tipsMap: Record<string, string[]> = {
      '高海拔': [
        '提前一周开始服用红景天或乙酰唑胺（需医生指导）',
        '行程中前 2-3 天避免剧烈运动，给身体适应时间',
        '准备便携式氧气瓶作为紧急备用',
      ],
      'F-road 路段': [
        '必须租用四驱车（推荐 4x4 SUV），并购买全险',
        '提前学习 F-road 驾驶技巧，查看最新路况信息',
        '准备应急工具：拖车绳、急救包、卫星通讯设备',
      ],
      '冬季海况不稳': [
        '关注天气预报，灵活调整出海行程',
        '准备防晕船药物',
        '选择经验丰富的船长和船只',
      ],
      '体力限制': [
        '适当减少每日活动量，增加休息时间',
        '准备登山杖和护膝等辅助装备',
        '考虑雇佣向导或选择更轻松的替代路线',
      ],
      '夜间驾驶': [
        '避免夜间长途驾驶，优先选择白天行程',
        '如果必须夜间行驶，确保车辆灯光正常，准备反光衣',
      ],
    };

    return risks.map(risk => ({
      risk: risk.risk,
      tips: tipsMap[risk.risk] || [`请注意 ${risk.description}`],
    }));
  }

  private calculateReadinessScore(risks: ReadinessSummarizeRisksOutput['topRisks']): number {
    // 基础分 100
    let score = 100;

    // 高风险每个 -20 分
    const highRiskCount = risks.filter(r => r.severity === 'high').length;
    score -= highRiskCount * 20;

    // 中风险每个 -10 分
    const mediumRiskCount = risks.filter(r => r.severity === 'medium').length;
    score -= mediumRiskCount * 10;

    // 低风险每个 -5 分
    const lowRiskCount = risks.filter(r => r.severity === 'low').length;
    score -= lowRiskCount * 5;

    // 确保分数在 0-100 之间
    return Math.max(0, Math.min(100, score));
  }
}

