// src/agent/training/services/security-red-team.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  SecurityRedTeamTestCase,
  SecurityRedTeamTestResult,
  ConstraintCheckResult,
} from '../interfaces/safety-compliance.interface';
import { ConstraintsEngineService } from './constraints-engine.service';
import { randomUUID } from 'crypto';

/**
 * SecurityRedTeamService
 * 
 * 职责：构建安全红队用例（高风险目的地/季节）
 * 
 * 功能：
 * 1. createTestCase() - 创建安全测试用例
 * 2. runRedTeamTests() - 运行红队测试
 */
@Injectable()
export class SecurityRedTeamService {
  private readonly logger = new Logger(SecurityRedTeamService.name);
  private readonly testCases: Map<string, SecurityRedTeamTestCase> = new Map();

  constructor(private readonly constraintsEngine: ConstraintsEngineService) {
    // 初始化测试用例
    this.initializeTestCases();
  }

  /**
   * 创建安全测试用例
   */
  createTestCase(testCase: Omit<SecurityRedTeamTestCase, 'test_id'>): SecurityRedTeamTestCase {
    const fullTestCase: SecurityRedTeamTestCase = {
      ...testCase,
      test_id: `test_${randomUUID()}`,
    };

    this.testCases.set(fullTestCase.test_id, fullTestCase);

    this.logger.log(
      `[SecurityRedTeam] 创建测试用例: testId=${fullTestCase.test_id}, name=${fullTestCase.name}`,
    );

    return fullTestCase;
  }

  /**
   * 运行红队测试
   */
  async runRedTeamTests(
    testCaseIds?: string[],
  ): Promise<SecurityRedTeamTestResult[]> {
    this.logger.log(
      `[SecurityRedTeam] 开始运行红队测试: testCaseIds=${testCaseIds?.length || 'all'}`,
    );

    const testsToRun = testCaseIds
      ? testCaseIds.map((id) => this.testCases.get(id)).filter(Boolean) as SecurityRedTeamTestCase[]
      : Array.from(this.testCases.values());

    const results: SecurityRedTeamTestResult[] = [];

    for (const testCase of testsToRun) {
      try {
        const startTime = Date.now();

        // 执行约束检查
        const constraintResult = await this.constraintsEngine.checkConstraints(
          testCase.input as any, // Itinerary
          {
            country_code: testCase.metadata?.country_code,
            season: testCase.metadata?.season,
          },
        );

        const executionTime = Date.now() - startTime;

        // 评估结果
        const actualResult = {
          blocked: constraintResult.is_blocked,
          sev_level: constraintResult.sev_level,
          requires_approval: constraintResult.requires_approval,
          violations: constraintResult.violations,
        };

        const passed =
          actualResult.blocked === testCase.expected_result.should_block &&
          actualResult.sev_level === testCase.expected_result.sev_level &&
          actualResult.requires_approval === testCase.expected_result.required_approval;

        const result: SecurityRedTeamTestResult = {
          test_id: testCase.test_id,
          test_case: testCase,
          actual_result: actualResult,
          passed,
          execution_time_ms: executionTime,
        };

        results.push(result);

        if (!passed) {
          this.logger.warn(
            `[SecurityRedTeam] 测试用例未通过: testId=${testCase.test_id}, name=${testCase.name}`,
          );
        }
      } catch (error: any) {
        this.logger.error(
          `[SecurityRedTeam] 测试用例执行失败: testId=${testCase.test_id}, error=${error?.message}`,
        );

        results.push({
          test_id: testCase.test_id,
          test_case: testCase,
          actual_result: {
            blocked: false,
            sev_level: 'SEV-4',
            requires_approval: false,
            violations: [],
          },
          passed: false,
          execution_time_ms: 0,
          error: error?.message,
        });
      }
    }

    const passedCount = results.filter((r) => r.passed).length;
    this.logger.log(
      `[SecurityRedTeam] 红队测试完成: passed=${passedCount}/${results.length}`,
    );

    return results;
  }

  /**
   * 初始化测试用例
   */
  private initializeTestCases(): void {
    // 高风险目的地测试用例
    this.createTestCase({
      name: '冰岛冬季危险路线',
      category: 'HIGH_RISK_DESTINATION',
      description: '测试冰岛冬季危险路线的约束检查',
      input: {
        country_code: 'IS',
        season: 'WINTER',
        route: {
          difficulty: 'EXTREME',
          weather_risk: 'HIGH',
        },
      },
      expected_result: {
        should_block: true,
        sev_level: 'SEV-1',
        required_approval: false,
      },
      metadata: {
        country_code: 'IS',
        season: 'WINTER',
      },
    });

    // 高风险季节测试用例
    this.createTestCase({
      name: '雨季高风险路线',
      category: 'HIGH_RISK_SEASON',
      description: '测试雨季高风险路线的约束检查',
      input: {
        season: 'RAINY',
        route: {
          flood_risk: 'HIGH',
        },
      },
      expected_result: {
        should_block: false,
        sev_level: 'SEV-2',
        required_approval: true,
      },
      metadata: {
        season: 'RAINY',
      },
    });

    // 边缘案例测试用例
    this.createTestCase({
      name: '极端天气条件',
      category: 'EDGE_CASE',
      description: '测试极端天气条件的约束检查',
      input: {
        weather: {
          wind_speed: 30, // m/s
          visibility: 0.1, // km
        },
      },
      expected_result: {
        should_block: true,
        sev_level: 'SEV-1',
        required_approval: false,
      },
      metadata: {},
    });

    // 更多测试用例...
  }

  /**
   * 获取测试用例
   */
  getTestCase(testId: string): SecurityRedTeamTestCase | undefined {
    return this.testCases.get(testId);
  }

  /**
   * 列出所有测试用例
   */
  listTestCases(category?: SecurityRedTeamTestCase['category']): SecurityRedTeamTestCase[] {
    let cases = Array.from(this.testCases.values());

    if (category) {
      cases = cases.filter((c) => c.category === category);
    }

    return cases;
  }
}
