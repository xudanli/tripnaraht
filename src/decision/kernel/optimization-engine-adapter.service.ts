/**
 * Optimization Engine Adapter
 *
 * Phase 2.2: 从 DSO 抽取 OptimizationHints 给 LLM
 * 数据来源：environmentState（weatherRisk）、tripState、research_data 扩展
 *
 * 未来可扩展：调用 GuardianDebateService、ObjectiveFunctionService 抽取 weightSummary
 *
 * 参考: docs/DECISION_KERNEL_GAP_ANALYSIS.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { DecisionState, OptimizationHints } from './decision-state.types';

@Injectable()
export class OptimizationEngineAdapterService {
  private readonly logger = new Logger(OptimizationEngineAdapterService.name);

  /**
   * 从 DSO 抽取优化提示（趋势信息，非公式）
   */
  getHints(state: DecisionState): OptimizationHints | undefined {
    const hints: OptimizationHints = {};

    if (state.environmentState?.weatherRisk !== undefined) {
      const r = state.environmentState.weatherRisk;
      hints.safetyTrend = r > 0.7 ? 'HIGH' : r > 0.3 ? 'MEDIUM' : 'LOW';
    }
    if (state.environmentState?.failureRiskLevel) {
      hints.safetyTrend = hints.safetyTrend ?? state.environmentState.failureRiskLevel;
    }

    if (state.tripState?.fatigue !== undefined) {
      const f = state.tripState.fatigue;
      hints.fatigueTrend = f > 0.7 ? 'HIGH' : f > 0.3 ? 'MEDIUM' : 'LOW';
    }

    if (state.riskLevel) {
      hints.safetyTrend = hints.safetyTrend ?? (state.riskLevel === 'CRITICAL' ? 'HIGH' : state.riskLevel);
    }

    if (Object.keys(hints).length === 0) return undefined;

    this.logger.debug(`[OptimizationAdapter] Hints: ${JSON.stringify(hints)}`);
    return hints;
  }
}
