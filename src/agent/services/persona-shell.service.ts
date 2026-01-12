// src/agent/services/persona-shell.service.ts
/**
 * PersonaShellService
 * 
 * 人格外壳服务：将底层能力模块的结果包装成三人格的输出
 * 
 * 设计原则：
 * - 面向用户只显示"三人格"（Abu/Dr.Dre/Neptune）作为可解释与信任的"人格外壳"
 * - 其他角色（预算/交通/节奏/总规划师）都隐藏成能力模块
 * - 所有决策都以"Abu 说"、"Dr.Dre 说"、"Neptune 说"的形式呈现
 */

import { Injectable, Logger } from '@nestjs/common';
import { PlanState } from '../../skills/plan/shared/plan-state.types';

export type PersonaName = 'ABU' | 'DR_DRE' | 'NEPTUNE';

export interface PersonaStatement {
  /** 人格名称 */
  persona: PersonaName;
  
  /** 人格图标 */
  icon: string;
  
  /** 人格标语 */
  slogan: string;
  
  /** 决策结论 */
  verdict: 'ALLOW' | 'ADJUST' | 'REPLACE' | 'REJECT' | 'NEED_CONFIRM';
  
  /** 面向用户的解释（第一人称） */
  explanation: string;
  
  /** 证据引用 */
  evidence: Array<{
    source: string;
    excerpt: string;
    relevance: string;
  }>;
  
  /** 建议的行动（如果有） */
  recommendations?: Array<{
    action: string;
    reason: string;
    impact: string;
  }>;
  
  /** 需要用户确认的点（如果有） */
  confirmations?: string[];
}

export interface PersonaShellOutput {
  /** 三人格的决策陈述 */
  personas: {
    abu: PersonaStatement | null;
    drdre: PersonaStatement | null;
    neptune: PersonaStatement | null;
  };
  
  /** 综合决策结果 */
  consolidatedDecision: {
    status: 'ALLOW' | 'NEED_CONFIRM' | 'REJECT';
    summary: string;
    nextSteps: string[];
  };
  
  /** 决策时间戳 */
  timestamp: string;
}

@Injectable()
export class PersonaShellService {
  private readonly logger = new Logger(PersonaShellService.name);

  /**
   * 将 PlanState 转换为三人格输出
   */
  async wrapAsPersonas(planState: PlanState): Promise<PersonaShellOutput> {
    this.logger.debug(`包装 PlanState 为三人格输出: planId=${planState.plan_id}`);

    const personas = {
      abu: this.buildAbuStatement(planState),
      drdre: this.buildDrdreStatement(planState),
      neptune: this.buildNeptuneStatement(planState),
    };

    const consolidatedDecision = this.buildConsolidatedDecision(planState, personas);

    return {
      personas,
      consolidatedDecision,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 构建 Abu 的陈述
   * 
   * Abu 负责：安全、合规、物理现实
   * 整合：预算超支检测、交通不可达检测、门控预检查
   */
  private buildAbuStatement(planState: PlanState): PersonaStatement | null {
    const statements: string[] = [];
    const evidence: PersonaStatement['evidence'] = [];
    const recommendations: PersonaStatement['recommendations'] = [];
    const confirmations: string[] = [];

    // 1. 检查预算超支（预算规划师的结果）
    if (planState.budget.overrun && planState.budget.overrun.overrunAmount > 0) {
      const overrunRatio = planState.budget.overrun.overrunAmount / (planState.constraints.budget?.total || 1);
      if (overrunRatio > 0.2) {
        statements.push(`预算超支 ${planState.budget.overrun.overrunAmount} ${planState.constraints.budget?.currency || 'CNY'}，超出总预算的 20%，这在当前约束下存在明显风险。`);
        recommendations.push({
          action: '调整预算或降低消费档位',
          reason: '预算严重超支',
          impact: '确保行程在经济可承受范围内',
        });
      } else {
        statements.push(`预算略有超支 ${planState.budget.overrun.overrunAmount} ${planState.constraints.budget?.currency || 'CNY'}，建议确认是否接受。`);
        confirmations.push('是否接受预算超支？');
      }
      
      if (planState.budget.overrun.overrunDrivers.length > 0) {
        const topDriver = planState.budget.overrun.overrunDrivers[0];
        evidence.push({
          source: '预算分析',
          excerpt: `${topDriver.category} 类别超支 ${topDriver.amount} ${planState.constraints.budget?.currency || 'CNY'}`,
          relevance: '主要超支来源',
        });
      }
    }

    // 2. 检查交通不可达（交通规划师的结果）
    const infeasibleSegments = planState.mobility.transferSegments.filter(
      seg => seg.feasibility === 'infeasible'
    );
    if (infeasibleSegments.length > 0) {
      statements.push(`${infeasibleSegments.length} 段跨城交通不可达，这在当前时间窗口下无法执行。`);
      recommendations.push({
        action: '调整路线或时间窗口',
        reason: '交通不可达',
        impact: '确保所有路段都可执行',
      });
      evidence.push({
        source: '交通可达性分析',
        excerpt: `${infeasibleSegments.map(s => `${s.from.city} → ${s.to.city}`).join(', ')} 不可达`,
        relevance: '硬约束违反',
      });
    }

    // 3. 检查门控状态
    if (planState.gate.status === 'REJECT') {
      statements.push(`方案存在硬违规，无法通过安全检查。`);
      if (planState.gate.reasons.length > 0) {
        statements.push(...planState.gate.reasons);
      }
    } else if (planState.gate.status === 'NEED_CONFIRM') {
      if (planState.gate.missingEvidence.length > 0) {
        statements.push(`缺少关键证据：${planState.gate.missingEvidence.join(', ')}，需要进一步确认。`);
        confirmations.push(...planState.gate.missingEvidence.map(e => `请确认：${e}`));
      }
    }

    // 4. 检查三人格评审结果（如果有）
    if (planState.gate.guardianResults?.abu) {
      const abuResult = planState.gate.guardianResults.abu;
      if (abuResult.verdict === 'REJECT') {
        statements.push(`经过安全检查，发现硬违规，无法通过。`);
        if (abuResult.evidence.length > 0) {
          evidence.push(...abuResult.evidence.map(e => ({
            source: 'Abu 安全检查',
            excerpt: e,
            relevance: '硬违规证据',
          })));
        }
      }
    }

    if (statements.length === 0 && recommendations.length === 0) {
      // 如果没有问题，Abu 给出允许的陈述
      return {
        persona: 'ABU',
        icon: '🐻‍❄️',
        slogan: '我负责：这条路，真的能走吗？',
        verdict: 'ALLOW',
        explanation: '经过安全检查，当前方案在物理现实和合规性方面没有问题。我负责把你带去安全地带，这条路可以走。',
        evidence: [],
      };
    }

    return {
      persona: 'ABU',
      icon: '🐻‍❄️',
      slogan: '我负责：这条路，真的能走吗？',
      verdict: planState.gate.status === 'REJECT' ? 'REJECT' : 'NEED_CONFIRM',
      explanation: statements.join(' ') || '需要进一步安全检查。',
      evidence,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
      confirmations: confirmations.length > 0 ? confirmations : undefined,
    };
  }

  /**
   * 构建 Dr.Dre 的陈述
   * 
   * Dr.Dre 负责：节奏、疲劳、人体能力
   * 整合：节奏规划师的结果（时间窗、疲劳评分、节奏调整）
   */
  private buildDrdreStatement(planState: PlanState): PersonaStatement | null {
    const statements: string[] = [];
    const evidence: PersonaStatement['evidence'] = [];
    const recommendations: PersonaStatement['recommendations'] = [];

    // 1. 检查疲劳评分（节奏规划师的结果）
    if (planState.pace.fatigueScore) {
      const score = planState.pace.fatigueScore.paceScore;
      if (score > 85) {
        statements.push(`当前节奏的疲劳评分是 ${score}/100，明显过高。原本的节奏会让你在行程中后期明显疲劳。`);
        recommendations.push({
          action: '插入休息日或减少每日活动',
          reason: '疲劳评分过高',
          impact: '让每一天刚刚好，体验更稳定',
        });
        
        if (planState.pace.fatigueScore.fatigueDrivers.length > 0) {
          const topDriver = planState.pace.fatigueScore.fatigueDrivers[0];
          evidence.push({
            source: '节奏分析',
            excerpt: `${topDriver.type}: ${topDriver.description} (严重度: ${topDriver.severity})`,
            relevance: '主要疲劳驱动因素',
          });
        }
      } else if (score > 70) {
        statements.push(`当前节奏的疲劳评分是 ${score}/100，略高。建议适当调整，让每一天刚刚好。`);
        recommendations.push({
          action: '优化时间分配或减少部分活动',
          reason: '疲劳评分略高',
          impact: '提升整体体验稳定性',
        });
      } else {
        statements.push(`当前节奏的疲劳评分是 ${score}/100，节奏合理。`);
      }

      // 建议休息点
      if (planState.pace.fatigueScore.suggestedRestPoints.length > 0) {
        const restPoints = planState.pace.fatigueScore.suggestedRestPoints;
        statements.push(`建议在第 ${restPoints.map(r => r.day).join(', ')} 天安排轻松活动或休息。`);
      }
    }

    // 2. 检查时间窗（节奏规划师的结果）
    if (planState.pace.timeWindows && planState.pace.timeWindows.length > 0) {
      const insufficientDays = planState.pace.timeWindows.filter(
        tw => {
          const start = parseInt(tw.start.split(':')[0]);
          const end = parseInt(tw.end.split(':')[0]);
          return (end - start) < 6;
        }
      );
      if (insufficientDays.length > 0) {
        statements.push(`${insufficientDays.length} 天的可用时间不足 6 小时，节奏可能过紧。`);
        recommendations.push({
          action: '调整时间分配或减少活动',
          reason: '可用时间不足',
          impact: '确保每天有足够的体验时间',
        });
      }
    }

    // 3. 检查三人格评审结果（如果有）
    if (planState.gate.guardianResults?.drdre) {
      const drdreResult = planState.gate.guardianResults.drdre;
      if (drdreResult.verdict === 'ADJUST') {
        statements.push(`经过节奏评估，建议调整行程节奏。`);
        if (drdreResult.evidence.length > 0) {
          evidence.push(...drdreResult.evidence.map(e => ({
            source: 'Dr.Dre 节奏评估',
            excerpt: e,
            relevance: '节奏调整建议',
          })));
        }
      }
    }

    if (statements.length === 0) {
      return {
        persona: 'DR_DRE',
        icon: '🐕',
        slogan: '别太累，我会让每一天刚刚好。',
        verdict: 'ALLOW',
        explanation: '当前节奏合理，每一天都刚刚好，体验稳定。',
        evidence: [],
      };
    }

    return {
      persona: 'DR_DRE',
      icon: '🐕',
      slogan: '别太累，我会让每一天刚刚好。',
      verdict: planState.pace.fatigueScore && planState.pace.fatigueScore.paceScore > 70 ? 'ADJUST' : 'ALLOW',
      explanation: statements.join(' '),
      evidence,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
    };
  }

  /**
   * 构建 Neptune 的陈述
   * 
   * Neptune 负责：空间修复、替代方案、路线哲学保持
   * 整合：总规划师的方案生成、交通规划师的 PlanB、安全守门人的替代方案
   */
  private buildNeptuneStatement(planState: PlanState): PersonaStatement | null {
    const statements: string[] = [];
    const evidence: PersonaStatement['evidence'] = [];
    const recommendations: PersonaStatement['recommendations'] = [];

    // 1. 检查高风险段（交通规划师的结果）
    const highRiskSegments = planState.mobility.transferSegments.filter(
      seg => seg.riskFlags.some(flag => flag.severity === 'high')
    );
    if (highRiskSegments.length > 0) {
      statements.push(`${highRiskSegments.length} 段跨城交通存在高风险。`);
      recommendations.push({
        action: '选择替代交通方式或调整时间窗口',
        reason: '交通风险过高',
        impact: '保持路线哲学的前提下，提供更可靠的替代',
      });
      
      highRiskSegments.forEach(seg => {
        const highRiskFlags = seg.riskFlags.filter(f => f.severity === 'high');
        evidence.push({
          source: '交通风险分析',
          excerpt: `${seg.from.city} → ${seg.to.city}: ${highRiskFlags.map(f => f.description).join(', ')}`,
          relevance: '高风险标记',
        });
      });
    }

    // 2. 检查方案骨架（总规划师的结果）
    if (planState.metadata?.selectedSkeleton) {
      const skeletonName = planState.metadata.selectedSkeletonName || planState.metadata.selectedSkeleton;
      statements.push(`已选择 ${skeletonName} 方案骨架，路线哲学已确定。`);
    }

    // 3. 检查三人格评审结果（如果有）
    if (planState.gate.guardianResults?.neptune) {
      const neptuneResult = planState.gate.guardianResults.neptune;
      if (neptuneResult.verdict === 'REPLACE') {
        statements.push(`路线本身没有问题，但部分路段需要替换。我为你准备了替代方案，你走的仍然是同一条路线，体验不会打折扣。`);
        if (neptuneResult.evidence.length > 0) {
          evidence.push(...neptuneResult.evidence.map(e => ({
            source: 'Neptune 空间修复',
            excerpt: e,
            relevance: '替代方案说明',
          })));
        }
      }
    }

    // 4. 检查替代方案（如果有）
    if (planState.gate.status === 'SUGGEST_REPLACE') {
      statements.push(`当前方案存在可修复的问题，我为你准备了替代方案。`);
    }

    if (statements.length === 0 && recommendations.length === 0) {
      return {
        persona: 'NEPTUNE',
        icon: '🦦',
        slogan: '如果行不通，我会给你一个刚刚好的替代。',
        verdict: 'ALLOW',
        explanation: '当前方案在空间和路线哲学方面没有问题，所有路段都可行。',
        evidence: [],
      };
    }

    return {
      persona: 'NEPTUNE',
      icon: '🦦',
      slogan: '如果行不通，我会给你一个刚刚好的替代。',
      verdict: highRiskSegments.length > 0 || planState.gate.status === 'SUGGEST_REPLACE' ? 'REPLACE' : 'ALLOW',
      explanation: statements.join(' ') || '路线需要一些调整。',
      evidence,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
    };
  }

  /**
   * 构建综合决策结果
   */
  private buildConsolidatedDecision(
    planState: PlanState,
    personas: PersonaShellOutput['personas']
  ): PersonaShellOutput['consolidatedDecision'] {
    const allVerdicts = [
      personas.abu?.verdict,
      personas.drdre?.verdict,
      personas.neptune?.verdict,
    ].filter(Boolean) as string[];

    // 如果有 REJECT，综合决策是 REJECT
    if (allVerdicts.includes('REJECT')) {
      return {
        status: 'REJECT',
        summary: 'Abu 发现硬违规，方案无法通过安全检查。',
        nextSteps: [
          '查看 Abu 的详细说明',
          '调整约束条件或选择其他方案',
        ],
      };
    }

    // 如果有 ADJUST 或 REPLACE，综合决策是 NEED_CONFIRM
    if (allVerdicts.some(v => v === 'ADJUST' || v === 'REPLACE' || v === 'NEED_CONFIRM')) {
      const summaries: string[] = [];
      const nextSteps: string[] = [];

      if (personas.abu?.verdict === 'NEED_CONFIRM') {
        summaries.push('Abu 需要进一步确认');
        nextSteps.push('查看 Abu 的确认点');
      }
      if (personas.drdre?.verdict === 'ADJUST') {
        summaries.push('Dr.Dre 建议调整节奏');
        nextSteps.push('查看 Dr.Dre 的节奏建议');
      }
      if (personas.neptune?.verdict === 'REPLACE') {
        summaries.push('Neptune 建议替换部分路段');
        nextSteps.push('查看 Neptune 的替代方案');
      }

      return {
        status: 'NEED_CONFIRM',
        summary: summaries.join('；') || '需要进一步确认',
        nextSteps,
      };
    }

    // 否则是 ALLOW
    return {
      status: 'ALLOW',
      summary: '三人格一致通过，方案可行。',
      nextSteps: [
        '查看完整的行程详情',
        '确认并锁定方案',
      ],
    };
  }
}
