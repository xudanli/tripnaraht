// src/skills/decision/decision-replay.skill.ts
/**
 * tripnara.decision.replay
 * 
 * P0: E2E 回放
 * 
 * 给定 logs + inputs，回放并 diff，这是 E2E 与评测的生命线
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillOutput } from '../interfaces/skill.interface';
import { BaseSkillInput } from '../interfaces/base-skill-input.interface';
import { E2EReplayService } from '../../trips/decision/evaluation/e2e-replay.service';
import {
  E2ECase,
  E2ECaseInput,
  E2EDiff,
  E2EReplayResult,
  DecisionTraceSummary,
  UserProfile,
} from '../../trips/decision/evaluation/e2e-case.types';
import {
  buildDecisionTraceSummary,
  buildReplayLogDiffs,
  type ReplayLogDiff,
} from '../../trips/decision/evaluation/replay-trace-contract';
import { DecisionLogEntry } from '../../trips/decision/shared/decision-result.types';
import { DecisionReplayService, RiskTrajectory } from '../../agent/services/decision-replay.service';

export interface DecisionReplayInput extends BaseSkillInput {
  /** E2E Case ID（可选，如果提供则从存储加载） */
  caseId?: string;
  
  /** 直接提供 E2E Case（如果 caseId 未提供） */
  testCase?: {
    id: string;
    name: string;
    description: string;
    input: E2ECaseInput;
    expected?: {
      routeDirectionId?: string;
      routeDirectionTags?: string[];
      abuExpected?: {
        action: 'ALLOW' | 'REJECT';
        reasonCodes?: string[];
        violations?: string[];
      };
      drdreExpected?: {
        mustAdjust: boolean;
        adjustmentTypes?: ('SPLIT_DAY' | 'BUFFER_DAY' | 'ADJUST_PACE')[];
      };
      neptuneExpected?: {
        mustRepair: boolean;
        replacementTypes?: ('ENTRY' | 'POI' | 'SEGMENT')[];
      };
      finalState: {
        allowed: boolean;
        planDays?: number;
      };
    };
  };
  
  /** 或者直接提供输入（简化版） */
  inputs?: {
    tripId?: string;
    countryCode: string;
    userProfile: UserProfile;
    season?: number;
    userQuery?: string;
  };
  
  /** 可选的期望日志（用于 diff） */
  expectedLogs?: DecisionLogEntry[];
}

export interface DecisionReplayOutput extends SkillOutput {
  /** 实际执行结果 */
  actual: {
    logs: DecisionLogEntry[];
    finalPlan?: {
      days: number;
      allowed: boolean;
    };
    routeDirectionId?: string;
  };
  
  /** 差异分析 */
  diff?: {
    hasDiff: boolean;
    logDiffs?: Array<{
      expected: DecisionLogEntry;
      actual: DecisionLogEntry;
      diffs: ReplayLogDiff['diffs'];
    }>;
    finalStateDiff?: string;
    abuDiff?: string[];
    drdreDiff?: string[];
    neptuneDiff?: string[];
    routeDirectionDiff?: string;
    traceDiff?: E2EDiff['traceDiff'];
  };
  
  /** 是否通过 */
  passed: boolean;
  
  /** 执行时间（毫秒） */
  executionTime: number;
  
  /** 风险轨迹（用于产品化回放/失败路径识别） */
  risk_trajectory?: RiskTrajectory[];

  /** Replay-focused trace summary extracted from actual.logs metadata. */
  traceSummary?: DecisionTraceSummary;

  /** Case 信息 */
  case?: {
    id: string;
    name: string;
    description: string;
  };
}

@Injectable()
export class DecisionReplaySkill implements Skill<DecisionReplayInput, DecisionReplayOutput> {
  private readonly logger = new Logger(DecisionReplaySkill.name);

  metadata = {
    name: 'decision.replay',
    description: 'decision.replay：E2E 回放 decision logs+inputs 并 diff 期望输出。在评测/CI 回归或调试 orchestration 决策链时调用。',
    version: '1.0.0',
    category: 'decision' as const,
  };

  constructor(
    @Optional() private readonly e2eReplayService?: E2EReplayService,
    @Optional() private readonly decisionReplayService?: DecisionReplayService,
  ) {}

  async execute(input: DecisionReplayInput): Promise<DecisionReplayOutput> {
    this.logger.debug(
      `执行 decision.replay: caseId=${input.caseId || 'none'}, hasTestCase=${!!input.testCase}`,
    );

    try {
      if (!this.e2eReplayService) {
        throw new Error('E2EReplayService 未注入');
      }

      let testCase: E2ECase;

      // 1. 加载或构建 E2E Case
      if (input.caseId) {
        // 从存储加载
        const loadedCase = await this.e2eReplayService.loadCase(input.caseId);
        if (!loadedCase) {
          throw new Error(`E2E Case 未找到: ${input.caseId}`);
        }
        testCase = loadedCase;
      } else if (input.testCase) {
        // 从输入构建
        testCase = {
          id: input.testCase.id,
          name: input.testCase.name,
          description: input.testCase.description,
          input: input.testCase.input,
          expected: input.testCase.expected
            ? {
                routeDirectionId: input.testCase.expected.routeDirectionId,
                routeDirectionTags: input.testCase.expected.routeDirectionTags,
                abuExpected: input.testCase.expected.abuExpected
                  ? {
                      action: input.testCase.expected.abuExpected.action,
                      reasonCodes: input.testCase.expected.abuExpected.reasonCodes,
                      violations: input.testCase.expected.abuExpected.violations,
                    }
                  : undefined,
                drdreExpected: input.testCase.expected.drdreExpected
                  ? {
                      mustAdjust: input.testCase.expected.drdreExpected.mustAdjust,
                      adjustmentTypes: input.testCase.expected.drdreExpected.adjustmentTypes,
                    }
                  : undefined,
                neptuneExpected: input.testCase.expected.neptuneExpected
                  ? {
                      mustRepair: input.testCase.expected.neptuneExpected.mustRepair,
                      replacementTypes: input.testCase.expected.neptuneExpected.replacementTypes,
                    }
                  : undefined,
                finalState: {
                  allowed: input.testCase.expected.finalState.allowed,
                  planDays: input.testCase.expected.finalState.planDays,
                },
              }
            : undefined,
        } as E2ECase;
      } else if (input.inputs) {
        // 从简化输入构建（没有期望值，只回放）
        testCase = {
          id: `replay-${Date.now()}`,
          name: 'Direct Replay',
          description: '直接回放（无期望值）',
          input: {
            userProfile: input.inputs.userProfile,
            season: input.inputs.season || 7,
            countryCode: input.inputs.countryCode,
            userQuery: input.inputs.userQuery || `回放 ${input.inputs.countryCode}`,
          },
          expected: undefined as any,
        } as E2ECase;
      } else {
        throw new Error('必须提供 caseId、testCase 或 inputs 之一');
      }

      // 2. 执行回放
      const replayResult: E2EReplayResult = await this.e2eReplayService.replay(testCase);

      // 2.1 构建风险轨迹（如果 DecisionReplayService 可用且 timeline 已存在）
      const tripRunId = replayResult?.case?.id || undefined;
      const riskTrajectory =
        this.decisionReplayService && tripRunId
          ? this.decisionReplayService.buildRiskTrajectory(tripRunId)
          : undefined;
      const logDiffs =
        input.expectedLogs && input.expectedLogs.length > 0
          ? buildReplayLogDiffs(input.expectedLogs, replayResult.actual.logs)
          : undefined;
      const hasMetadataDiff = (logDiffs?.length ?? 0) > 0;

      // 3. 构建输出
      return {
        actual: {
          logs: replayResult.actual.logs,
          finalPlan: replayResult.actual.finalPlan,
          routeDirectionId: replayResult.actual.routeDirectionId,
        },
        diff: (() => {
          if (!replayResult.diff) return undefined;
          return {
            hasDiff: replayResult.diff.hasDiff || hasMetadataDiff,
            logDiffs,
            finalStateDiff: replayResult.diff.finalStateDiff,
            abuDiff: replayResult.diff.abuDiff,
            drdreDiff: replayResult.diff.drdreDiff,
            neptuneDiff: replayResult.diff.neptuneDiff,
            routeDirectionDiff: replayResult.diff.routeDirectionDiff,
            traceDiff: replayResult.diff.traceDiff,
          };
        })(),
        passed: !(replayResult.diff?.hasDiff || hasMetadataDiff),
        executionTime: replayResult.executionTime || 0,
        risk_trajectory: riskTrajectory,
        traceSummary: replayResult.actual.traceSummary ?? buildDecisionTraceSummary(replayResult.actual.logs),
        case: {
          id: replayResult.case.id,
          name: replayResult.case.name,
          description: replayResult.case.description,
        },
      };
    } catch (error: any) {
      this.logger.error(`E2E 回放失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
