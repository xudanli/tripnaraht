// src/skills/decision/decision-replay.skill.ts
/**
 * tripnara.decision.replay
 * 
 * P0: E2E 回放
 * 
 * 给定 logs + inputs，回放并 diff，这是 E2E 与评测的生命线
 */

import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { BaseSkillInput } from '../interfaces/base-skill-input.interface';
import { E2EReplayService } from '../../trips/decision/evaluation/e2e-replay.service';
import {
  E2ECase,
  E2ECaseInput,
  E2EReplayResult,
  UserProfile,
} from '../../trips/decision/evaluation/e2e-case.types';
import { DecisionLogEntry } from '../../trips/decision/shared/decision-result.types';

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
      diff: string;
    }>;
    finalStateDiff?: string;
    abuDiff?: string[];
    drdreDiff?: string[];
    neptuneDiff?: string[];
    routeDirectionDiff?: string;
  };
  
  /** 是否通过 */
  passed: boolean;
  
  /** 执行时间（毫秒） */
  executionTime: number;
  
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
    description: 'E2E 回放：给定 logs + inputs，回放并 diff，这是 E2E 与评测的生命线',
    version: '1.0.0',
    category: 'decision' as const,
  };

  constructor(
    @Optional() private readonly e2eReplayService?: E2EReplayService,
  ) {}

  async execute(input: DecisionReplayInput): Promise<DecisionReplayOutput> {
    this.logger.debug(
      `执行 decision.replay: caseId=${input.caseId || 'none'}, hasTestCase=${!!input.testCase}`,
    );

    try {
      if (!this.e2eReplayService) {
        throw new Error('E2EReplayService 未注入');
      }

      let testCase: E2ECase | null = null;

      // 1. 加载或构建 E2E Case
      if (input.caseId) {
        // 从存储加载
        testCase = await this.e2eReplayService.loadCase(input.caseId);
        if (!testCase) {
          throw new Error(`E2E Case 未找到: ${input.caseId}`);
        }
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
        };
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
          expected: undefined,
        };
      } else {
        throw new Error('必须提供 caseId、testCase 或 inputs 之一');
      }

      // 2. 执行回放
      const replayResult: E2EReplayResult = await this.e2eReplayService.replay(testCase);

      // 3. 构建输出
      return {
        actual: {
          logs: replayResult.actual.logs,
          finalPlan: replayResult.actual.finalPlan,
          routeDirectionId: replayResult.actual.routeDirectionId,
        },
        diff: replayResult.diff
          ? {
              hasDiff: replayResult.diff.hasDiff,
              logDiffs: undefined, // TODO: 如果需要详细的日志 diff，可以在这里实现
              finalStateDiff: replayResult.diff.finalStateDiff,
              abuDiff: replayResult.diff.abuDiff,
              drdreDiff: replayResult.diff.drdreDiff,
              neptuneDiff: replayResult.diff.neptuneDiff,
              routeDirectionDiff: replayResult.diff.routeDirectionDiff,
            }
          : undefined,
        passed: replayResult.passed,
        executionTime: replayResult.executionTime || 0,
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
