/**
 * ExpectedUtility Log Service
 *
 * Phase 3：记录每次 ExpectedUtility 评估，为 v2 数据校正、反向学习提供数据
 * Phase 2：同步写入数据飞轮 Layer 1（FlywheelDecisionLog）
 */

import { Injectable, Optional } from '@nestjs/common';
import { DecisionLogStorageService } from './decision-log-storage.service';
import { DailyUtilityResult, DailyUtilityWeights } from '../optimization/daily-utility';
import { FlywheelPipelineService } from '../flywheel/flywheel-pipeline.service';

/** 采样率：1 = 100%，0.1 = 10% */
const EXPECTED_UTILITY_LOG_SAMPLE_RATE =
  parseFloat(process.env.EXPECTED_UTILITY_LOG_SAMPLE_RATE || '1') || 1;

export interface ExpectedUtilityLogContext {
  planId?: string;
  tripId?: string;
  userId?: string;
  countryCode?: string;
  source?: 'multi_plan_generator' | 'compute_daily_utility_api' | 'internal';
}

@Injectable()
export class ExpectedUtilityLogService {
  constructor(
    @Optional() private readonly decisionLogStorage?: DecisionLogStorageService,
    @Optional() private readonly flywheelPipeline?: FlywheelPipelineService,
  ) {}

  /**
   * 记录 ExpectedUtility 评估
   * 采样率由 EXPECTED_UTILITY_LOG_SAMPLE_RATE 控制
   */
  async logEvaluation(
    result: DailyUtilityResult,
    weights: DailyUtilityWeights,
    context: ExpectedUtilityLogContext
  ): Promise<void> {
    if (!this.decisionLogStorage) return;
    if (Math.random() > EXPECTED_UTILITY_LOG_SAMPLE_RATE) return;

    try {
      const dayBreakdowns = result.dayUtilities.map(({ day, breakdown }) => ({
        dayIndex: day.day,
        date: day.date,
        ...breakdown,
      }));

      await this.decisionLogStorage.saveLogEntry(
        {
          persona: 'EXPECTED_UTILITY',
          action: 'EVALUATE',
          decisionSource: 'UTILITY',
          decisionStage: 'PLAN_SCORE',
          explanation: `totalExpectedUtility=${result.totalExpectedUtility.toFixed(4)}, penalties=${result.penalties.totalPenalty.toFixed(4)}`,
          reasonCodes: [],
          evidenceRefs: [],
          timestamp: new Date().toISOString(),
        },
        {
          tripId: context.tripId,
          countryCode: context.countryCode,
          metadata: {
            planId: context.planId,
            source: context.source,
            totalExpectedUtility: result.totalExpectedUtility,
            penalties: result.penalties,
            weights,
            dayBreakdowns,
          },
        }
      );
      // Phase 2：数据飞轮 Layer 1（已通过采样率）
      if (this.flywheelPipeline && context.userId && context.tripId) {
        this.flywheelPipeline
          .recordDecision({
            userId: context.userId,
            tripId: context.tripId,
            contextSnapshot: { routePhilosophy: 'default' },
            utilityWeights: Object.fromEntries(
              Object.entries(weights).map(([k, v]) => [k, Number(v)]),
            ),
            candidatePlans: undefined,
            selectedPlan: {
              totalExpectedUtility: result.totalExpectedUtility,
              penalties: result.penalties,
            },
          })
          .catch(() => {});
      }
    } catch (error) {
      // 不阻断主流程
      console.warn('ExpectedUtility log failed:', error);
    }
  }
}
