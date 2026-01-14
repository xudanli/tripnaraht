// src/agent/services/sub-agents/core-decision-agent.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { CoreDecisionAgent } from '../../interfaces/sub-agent.interface';
import { TripPlanRequest, OrchestratorState, Itinerary } from '../../interfaces/trip-plan.interface';
import { ToTEvaluatorService } from '../../../trips/decision/tot/tot-evaluator.service';
import { RankingService } from '../../../planning-policy/services/ranking.service';

/**
 * CoreDecision Agent Service (Claude Orchestration)
 * 
 * 职责：多候选方案权衡与最终选择
 */
@Injectable()
export class ClaudeCoreDecisionAgentService implements CoreDecisionAgent {
  private readonly logger = new Logger(ClaudeCoreDecisionAgentService.name);

  constructor(
    @Optional() private readonly totEvaluator?: ToTEvaluatorService,
    @Optional() private readonly rankingService?: RankingService,
  ) {
    this.logger.log(`[ClaudeCoreDecisionAgent] 已初始化`);
    this.logger.log(`[ClaudeCoreDecisionAgent] ToTEvaluator: ${!!this.totEvaluator}, RankingService: ${!!this.rankingService}`);
  }

  /**
   * 权衡多个候选方案并做出最终决策
   */
  async makeDecision(
    candidates: Array<{
      itinerary: Itinerary;
      score: number;
      pros: string[];
      cons: string[];
      evidence_refs: string[];
    }>,
    request: TripPlanRequest,
    context: OrchestratorState,
  ): Promise<{
    selected_itinerary: Itinerary;
    decision_reasoning: string;
    rejected_candidates: Array<{
      itinerary_id: string;
      reason: string;
    }>;
  }> {
    this.logger.debug(`[ClaudeCoreDecisionAgent] 权衡候选方案: request_id=${request.request_id}, 候选数量=${candidates.length}`);

    try {
      if (candidates.length === 0) {
        throw new Error('没有候选方案可供选择');
      }

      // 1. 按分数排序
      const sortedCandidates = [...candidates].sort((a, b) => b.score - a.score);

      // 2. 选择最高分的方案
      const selected = sortedCandidates[0];

      // 3. 生成决策理由
      const decision_reasoning = this.generateDecisionReasoning(selected, sortedCandidates, request);

      // 4. 生成被拒绝的候选方案说明
      const rejected_candidates = sortedCandidates.slice(1).map((candidate, index) => ({
        itinerary_id: candidate.itinerary.request_id || `candidate_${index + 1}`,
        reason: `得分较低（${candidate.score.toFixed(2)} vs ${selected.score.toFixed(2)}）`,
      }));

      this.logger.log(`[ClaudeCoreDecisionAgent] 选择方案: request_id=${selected.itinerary.request_id}, 得分=${selected.score.toFixed(2)}`);

      return {
        selected_itinerary: selected.itinerary,
        decision_reasoning,
        rejected_candidates,
      };
    } catch (error: any) {
      this.logger.error(`[ClaudeCoreDecisionAgent] 决策失败: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  /**
   * 生成决策理由
   */
  private generateDecisionReasoning(
    selected: { itinerary: Itinerary; score: number; pros: string[]; cons: string[] },
    allCandidates: Array<{ itinerary: Itinerary; score: number; pros: string[]; cons: string[] }>,
    request: TripPlanRequest,
  ): string {
    const parts: string[] = [];

    parts.push(`选择得分最高的方案（${selected.score.toFixed(2)}分）`);

    if (selected.pros.length > 0) {
      parts.push(`优点：${selected.pros.slice(0, 3).join('、')}`);
    }

    if (allCandidates.length > 1) {
      const secondBest = allCandidates[1];
      parts.push(`相比第二方案（${secondBest.score.toFixed(2)}分），优势在于：${selected.pros.filter(p => !secondBest.pros.includes(p)).slice(0, 2).join('、') || '综合评分更高'}`);
    }

    return parts.join('。');
  }
}
