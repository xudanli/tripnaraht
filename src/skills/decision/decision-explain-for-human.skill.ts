// src/skills/decision/decision-explain-for-human.skill.ts
/**
 * skill.decision.explainForHuman
 * 
 * 用途：把 DecisionLog + DecisionSource 变成用户可读的解释，是三人格的「翻译官」。
 * 
 * 输入：tripId 或 decisionLog[] + worldModelContext
 * 输出：userFacingNarrative + riskHighlights[] + tradeOffs[]
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { WorldModelContext } from '../../trips/decision/shared/world-model.types';
import { DecisionLogStorageService } from '../../trips/decision/services/decision-log-storage.service';
import { WorldBuildContextSkill } from '../world/world-build-context.skill';

export interface DecisionExplainForHumanInput extends SkillInput {
  /** 行程 ID（如果有） */
  tripId?: string;
  /** 或直接提供决策日志 */
  decisionLog?: Array<{
    persona: string;
    action: string;
    explanation: string;
    reasonCodes?: string[];
    timestamp?: string;
  }>;
  /** 世界模型上下文（可选，如果提供 tripId 会自动获取） */
  world?: WorldModelContext;
}

export interface DecisionExplainForHumanOutput extends SkillOutput {
  /** 用户可读的叙述（分三段） */
  userFacingNarrative: {
    abuSection: string; // Abu 说了什么 & 拦了什么
    drdreSection: string; // Dr.Dre 如何调节节奏
    neptuneSection: string; // Neptune 替换了哪些路段 / POI，为什么不违背路线哲学
  };
  /** 最高优先的 3–5 个风险点 */
  riskHighlights: Array<{
    risk: string;
    severity: 'high' | 'medium' | 'low';
    explanation: string;
  }>;
  /** 做了哪些取舍 */
  tradeOffs: Array<{
    what: string;
    why: string;
    impact: string;
  }>;
  /** 完整解释文本（用于向后兼容） */
  explanation?: string;
  /** 摘要文本（用于向后兼容） */
  summary?: string;
  /** 关键点列表（用于向后兼容） */
  keyPoints?: Array<{
    point: string;
    category: string;
  }>;
}

@Injectable()
export class DecisionExplainForHumanSkill implements Skill<DecisionExplainForHumanInput, DecisionExplainForHumanOutput> {
  private readonly logger = new Logger(DecisionExplainForHumanSkill.name);

  metadata = {
    name: 'decision.explainForHuman',
    description: '将技术性的决策日志转换为用户可读的解释，包括三人格的工作说明、风险点和取舍',
    version: '1.0.0',
    category: 'decision' as const,
  };

  constructor(
    private readonly decisionLogStorage: DecisionLogStorageService,
    private readonly worldBuildContext: WorldBuildContextSkill,
  ) {}

  async execute(input: DecisionExplainForHumanInput): Promise<DecisionExplainForHumanOutput> {
    this.logger.debug(`执行 decision.explainForHuman: tripId=${input.tripId || 'none'}`);

    try {
      // 1. 获取决策日志
      let decisionLog: DecisionExplainForHumanInput['decisionLog'];
      let world: WorldModelContext | undefined = input.world;

      if (input.tripId) {
        const logs = await this.decisionLogStorage.queryLogs({
          tripId: input.tripId,
          limit: 100,
        });
        decisionLog = logs.map(log => ({
          persona: log.persona,
          action: log.action,
          explanation: log.explanation,
          reasonCodes: log.reasonCodes,
          timestamp: log.timestamp,
        }));

        // 获取 world context
        if (!world) {
          const contextResult = await this.worldBuildContext.execute({
            tripId: input.tripId,
          });
          world = contextResult.world;
        }
      } else if (input.decisionLog) {
        decisionLog = input.decisionLog;
      } else {
        throw new Error('必须提供 tripId 或 decisionLog');
      }

      if (!decisionLog || decisionLog.length === 0) {
        return {
          userFacingNarrative: {
            abuSection: '暂无决策记录',
            drdreSection: '暂无节奏调整记录',
            neptuneSection: '暂无路段替换记录',
          },
          riskHighlights: [],
          tradeOffs: [],
          explanation: '暂无决策记录',
          summary: '暂无决策记录',
          keyPoints: [],
        };
      }

      // 2. 分离三个守护者的日志
      const abuLogs = decisionLog.filter(log => log.persona === 'ABU');
      const drdreLogs = decisionLog.filter(log => log.persona === 'DR_DRE');
      const neptuneLogs = decisionLog.filter(log => log.persona === 'NEPTUNE');

      // 3. 生成用户可读的叙述
      const userFacingNarrative = {
        abuSection: this.generateAbuNarrative(abuLogs),
        drdreSection: this.generateDrdreNarrative(drdreLogs),
        neptuneSection: this.generateNeptuneNarrative(neptuneLogs, world),
      };

      // 4. 提取风险点
      const riskHighlights = this.extractRiskHighlights(decisionLog);

      // 5. 提取取舍
      const tradeOffs = this.extractTradeOffs(decisionLog);

      // 生成完整解释和摘要（用于向后兼容）
      const explanation = [
        userFacingNarrative.abuSection,
        userFacingNarrative.drdreSection,
        userFacingNarrative.neptuneSection,
      ].join('\n\n');

      const summary = `本次决策共涉及 ${decisionLog.length} 条记录，${riskHighlights.length} 个风险点，${tradeOffs.length} 个取舍。`;

      const keyPoints = riskHighlights.map(rh => ({
        point: rh.explanation,
        category: rh.severity,
      }));

      return {
        userFacingNarrative,
        riskHighlights,
        tradeOffs,
        explanation,
        summary,
        keyPoints,
      };
    } catch (error: any) {
      this.logger.error(`生成用户解释失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private generateAbuNarrative(logs: any[]): string {
    if (logs.length === 0) {
      return '安全守护者 Abu 检查了行程，未发现安全隐患。';
    }

    const rejectLogs = logs.filter(log => log.action === 'REJECT');
    if (rejectLogs.length > 0) {
      const reasons = rejectLogs.map(log => log.explanation).join('、');
      return `安全守护者 Abu 发现了一些安全隐患：${reasons}。为确保您的安全，这些危险路段已被标记。`;
    }

    return '安全守护者 Abu 检查了行程的所有路段，确认计划安全可行。';
  }

  private generateDrdreNarrative(logs: any[]): string {
    if (logs.length === 0) {
      return '节奏调节者 Dr.Dre 检查了行程节奏，认为当前安排合理。';
    }

    const adjustLogs = logs.filter(log => log.action === 'ADJUST');
    if (adjustLogs.length > 0) {
      const adjustments = adjustLogs.map(log => log.explanation).join('、');
      return `节奏调节者 Dr.Dre 优化了行程节奏：${adjustments}。这能让您更轻松地享受旅程，避免过度疲劳。`;
    }

    return '节奏调节者 Dr.Dre 检查了行程密度，当前节奏适中。';
  }

  private generateNeptuneNarrative(logs: any[], world?: WorldModelContext): string {
    if (logs.length === 0) {
      return '路线守护者 Neptune 检查了路线完整性，所有路段均可用。';
    }

    const replaceLogs = logs.filter(log => log.action === 'REPLACE');
    if (replaceLogs.length > 0) {
      const replacements = replaceLogs.map(log => log.explanation).join('、');
      const philosophyNote = world?.routeDirection?.name 
        ? `我们保持了"${world.routeDirection.name}"路线的核心风格`
        : '我们保持了路线的核心风格';
      return `路线守护者 Neptune 替换了一些不可用的路段：${replacements}。${philosophyNote}，确保您能获得相同的旅行体验。`;
    }

    return '路线守护者 Neptune 检查了路线可用性，所有关键路段均畅通。';
  }

  private extractRiskHighlights(logs: any[]): DecisionExplainForHumanOutput['riskHighlights'] {
    const risks: DecisionExplainForHumanOutput['riskHighlights'] = [];

    // 从 REJECT 和 HARD violation 中提取高风险
    const highRisks = logs
      .filter(log => log.action === 'REJECT' || log.reasonCodes?.some(code => code.includes('HARD')))
      .slice(0, 5)
      .map(log => ({
        risk: log.explanation,
        severity: 'high' as const,
        explanation: log.explanation,
      }));

    risks.push(...highRisks);

    // 从 ADJUST 中提取中等风险
    const mediumRisks = logs
      .filter(log => log.action === 'ADJUST' && !highRisks.some(r => r.risk === log.explanation))
      .slice(0, 3)
      .map(log => ({
        risk: log.explanation,
        severity: 'medium' as const,
        explanation: log.explanation,
      }));

    risks.push(...mediumRisks);

    return risks.slice(0, 5); // 最多返回 5 个
  }

  private extractTradeOffs(logs: any[]): DecisionExplainForHumanOutput['tradeOffs'] {
    const tradeOffs: DecisionExplainForHumanOutput['tradeOffs'] = [];

    // 从 ADJUST 日志中提取取舍
    logs
      .filter(log => log.action === 'ADJUST')
      .forEach(log => {
        tradeOffs.push({
          what: log.explanation,
          why: '为了确保行程节奏合理，避免过度疲劳',
          impact: '行程可能略有调整，但体验更加舒适',
        });
      });

    // 从 REPLACE 日志中提取取舍
    logs
      .filter(log => log.action === 'REPLACE')
      .forEach(log => {
        tradeOffs.push({
          what: log.explanation,
          why: '原路段不可用或存在风险',
          impact: '替换为相似风格的路线，保持旅行体验',
        });
      });

    return tradeOffs;
  }
}

