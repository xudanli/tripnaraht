// src/trips/decision/evaluation/e2e-replay.service.ts
/**
 * E2E Replay Service
 * 
 * 用于 E2E Case 的回放和评测
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { TripDecisionEngineService } from '../trip-decision-engine.service';
import { DecisionLogStorageService } from '../services/decision-log-storage.service';
import { E2ECaseStorageService } from './e2e-case-storage.service';
import {
  E2ECase,
  E2EActualResult,
  E2EReplayResult,
} from './e2e-case.types';
import { analyzeDiff } from './e2e-assertions';
import { buildDecisionTraceSummary } from './replay-trace-contract';
import { TripWorldState } from '../world-model';

@Injectable()
export class E2EReplayService {
  private readonly logger = new Logger(E2EReplayService.name);
  private readonly uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  constructor(
    private readonly decisionEngine: TripDecisionEngineService,
    private readonly logStorage: DecisionLogStorageService,
    @Optional() private readonly caseStorage?: E2ECaseStorageService,
  ) {}

  /**
   * 加载 E2E Case
   */
  async loadCase(caseId: string): Promise<E2ECase | null> {
    if (this.caseStorage) {
      return await this.caseStorage.loadCase(caseId);
    }
    this.logger.warn('E2ECaseStorageService 未注入，无法加载 E2E Case: ' + caseId);
    return null;
  }

  /**
   * 执行单个 E2E Case 回放
   */
  async replay(testCase: E2ECase): Promise<E2EReplayResult> {
    const startTime = Date.now();
    this.logger.debug('开始回放 E2E Case: ' + testCase.id + ' - ' + testCase.name);

    try {
      // 1. 构建 TripWorldState
      const worldState = this.buildWorldState(testCase);

      // 2. 执行决策引擎
      const requestId = 'e2e-' + testCase.id;
      const result = await this.decisionEngine.generatePlan(
        worldState,
        requestId
      );

      // 3. 获取决策日志
      // Production logs usually query by UUID tripId; replay runs use requestId as the stable audit key.
      const tripId = result.log.inputDigest?.tripId;
      const logs = await this.logStorage.queryLogs(
        this.isUuid(tripId)
          ? { tripId, limit: 1000 }
          : { requestId, limit: 1000 },
      );

      // 4. 构建实际结果
      const actual: E2EActualResult = {
        routeDirectionId: result.log.routeDirection?.selected?.uuid,
        decisionRunLog: result.log as any,
        logs: logs
          .map(log => ({
            persona: log.persona,
            action: log.action,
            explanation: log.explanation,
            reasonCodes: log.reasonCodes,
            evidenceRefs: log.evidenceRefs,
            timestamp: log.timestamp,
            decisionSource: log.decisionSource,
            decisionStage: log.decisionStage,
            metadata: (log as any).metadata,
            jepaTrace: (log as any).jepaTrace,
          }))
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
        finalPlan: {
          days: result.plan.days?.length || 0,
          // 判断是否允许：如果有 strategyLogs 且最后一个不是 REJECT，则允许
          allowed: result.log.strategyLogs && result.log.strategyLogs.length > 0
            ? result.log.strategyLogs[result.log.strategyLogs.length - 1].action !== 'REJECT'
            : true,
        },
      };
      actual.traceSummary = buildDecisionTraceSummary(actual.logs);

      // 5. 分析差异
      const diff = analyzeDiff(testCase.expected, actual);

      // 6. 判断是否通过
      const passed = !diff.hasDiff;

      const executionTime = Date.now() - startTime;
      this.logger.debug(
        'E2E Case 回放完成: ' + testCase.id + ', 通过=' + passed + ', 耗时=' + executionTime + 'ms'
      );

      return {
        case: testCase,
        actual,
        diff,
        passed,
        executionTime,
      };
    } catch (error: any) {
      this.logger.error(
        'E2E Case 回放失败: ' + testCase.id + ', 错误=' + error.message,
        error.stack
      );

      return {
        case: testCase,
        actual: {
          logs: [],
        },
        diff: {
          hasDiff: true,
          finalStateDiff: '执行失败: ' + error.message,
        },
        passed: false,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * 批量回放所有 E2E Cases
   */
  async replayAll(cases: E2ECase[]): Promise<E2EReplayResult[]> {
    this.logger.debug('开始批量回放 ' + cases.length + ' 个 E2E Cases');

    const results: E2EReplayResult[] = [];

    for (const testCase of cases) {
      const result = await this.replay(testCase);
      results.push(result);
    }

    const passedCount = results.filter(r => r.passed).length;
    const failedCount = results.length - passedCount;
    const totalCount = results.length;

    this.logger.log(
      '批量回放完成: 总计=' + totalCount + ', 通过=' + passedCount + ', 失败=' + failedCount
    );

    return results;
  }

  /**
   * 构建 TripWorldState
   */
  private buildWorldState(testCase: E2ECase): TripWorldState {
    // 构建用户画像
    const userProfile = testCase.input.userProfile;

    // 构建上下文
    const context: any = {
      destination: testCase.input.countryCode,
      startDate: this.getStartDateForSeason(testCase.input.season),
      durationDays: 7, // 默认 7 天，可以从 testCase 中读取
      preferences: {
        pace: userProfile.pacePreference || 'MEDIUM',
        riskTolerance: userProfile.riskTolerance || 'MEDIUM',
        tags: userProfile.preferredRouteTypes || [],
      },
    };

    // 构建完整的 TripWorldState
    return {
      context,
      candidatesByDate: {}, // E2E Case 不需要候选池
      signals: {
        lastUpdatedAt: new Date().toISOString(),
      },
    } as unknown as TripWorldState;
  }

  /**
   * 根据季节获取开始日期
   */
  private getStartDateForSeason(month: number): string {
    const currentYear = new Date().getFullYear();
    const date = new Date(currentYear, month - 1, 1);
    return date.toISOString().split('T')[0];
  }

  private isUuid(value: string | undefined): value is string {
    return !!value && this.uuidRegex.test(value);
  }
}
