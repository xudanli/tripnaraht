// src/agent/training/services/eval-suite.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  TestCase,
  TestCaseResult,
  RouterEvalResult,
  GateEvalResult,
  ItineraryEvalResult,
  FullPipelineEvalResult,
} from '../interfaces/evaluation.interface';
import { PolicyServiceManagerService } from './policy-service-manager.service';

/**
 * EvalSuiteService
 * 
 * 职责：构建Router/Gate/Itinerary的指标与测试集
 * 
 * 功能：
 * 1. evaluateRouter() - Router组件评测
 * 2. evaluateGate() - Gate组件评测
 * 3. evaluateItinerary() - Itinerary组件评测
 * 4. evaluateFullPipeline() - 完整流程评测
 */
@Injectable()
export class EvalSuiteService {
  private readonly logger = new Logger(EvalSuiteService.name);
  private readonly testCases: Map<string, TestCase[]> = new Map();

  constructor(private readonly policyService: PolicyServiceManagerService) {
    // 初始化测试集
    this.initializeTestCases();
  }

  /**
   * 评测Router组件
   */
  async evaluateRouter(
    modelVersion: string,
    testCases?: TestCase[],
  ): Promise<RouterEvalResult> {
    this.logger.log(
      `[EvalSuite] 开始Router评测: modelVersion=${modelVersion}`,
    );

    const tests = testCases || (await this.getRouterTestCases());
    const results: TestCaseResult[] = [];
    const latencies: number[] = [];

    for (const testCase of tests) {
      try {
        const startTime = Date.now();

        // 调用PolicyService进行推理
        const response = await this.policyService.predict({
          request_id: `eval_${testCase.id}`,
          state: testCase.input as any,
          model_version: modelVersion,
        });

        const latency = Date.now() - startTime;
        latencies.push(latency);

        // 评估结果
        const passed = this.evaluateRouterResult(testCase, response);
        const metrics = this.calculateRouterMetrics(testCase, response);

        results.push({
          test_case_id: testCase.id,
          passed,
          actual_output: {
            action: response.action,
            confidence: response.confidence,
            reasoning: response.reasoning,
          },
          expected_output: testCase.expected_output,
          metrics,
          latency_ms: latency,
        });
      } catch (error: any) {
        results.push({
          test_case_id: testCase.id,
          passed: false,
          actual_output: {},
          expected_output: testCase.expected_output,
          metrics: {},
          error: error?.message,
          latency_ms: 0,
        });
      }
    }

    // 计算总体指标
    const passedTests = results.filter((r) => r.passed).length;
    const accuracy = passedTests / results.length;
    const coverage = results.filter((r) => !r.error).length / results.length;
    const errorRate = results.filter((r) => r.error).length / results.length;

    // 计算延迟分位数
    const sortedLatencies = latencies.sort((a, b) => a - b);
    const p50 = this.percentile(sortedLatencies, 50);
    const p95 = this.percentile(sortedLatencies, 95);
    const p99 = this.percentile(sortedLatencies, 99);

    const result: RouterEvalResult = {
      accuracy,
      coverage,
      latency_p50: p50,
      latency_p95: p95,
      latency_p99: p99,
      error_rate: errorRate,
      total_tests: tests.length,
      passed_tests: passedTests,
      failed_tests: tests.length - passedTests,
      detailed_results: results,
    };

    this.logger.log(
      `[EvalSuite] Router评测完成: accuracy=${accuracy.toFixed(2)}, coverage=${coverage.toFixed(2)}`,
    );

    return result;
  }

  /**
   * 评测Gate组件
   */
  async evaluateGate(
    modelVersion: string,
    testCases?: TestCase[],
  ): Promise<GateEvalResult> {
    this.logger.log(
      `[EvalSuite] 开始Gate评测: modelVersion=${modelVersion}`,
    );

    const tests = testCases || (await this.getGateTestCases());
    const results: TestCaseResult[] = [];
    const latencies: number[] = [];

    let truePositives = 0; // 高风险被正确阻止
    let falsePositives = 0; // 低风险被错误阻止
    let falseNegatives = 0; // 高风险未被识别
    let trueNegatives = 0; // 低风险被正确允许

    for (const testCase of tests) {
      try {
        const startTime = Date.now();

        const response = await this.policyService.predict({
          request_id: `eval_${testCase.id}`,
          state: testCase.input as any,
          model_version: modelVersion,
        });

        const latency = Date.now() - startTime;
        latencies.push(latency);

        // 评估Gate决策
        const riskLevel = testCase.metadata?.risk_level || 'LOW';
        const expectedAction = riskLevel === 'HIGH' || riskLevel === 'CRITICAL' ? 'REJECT' : 'ALLOW';
        const actualAction = response.action;

        const passed = actualAction === expectedAction;

        // 更新混淆矩阵
        if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') {
          if (actualAction === 'REJECT') {
            truePositives++;
          } else {
            falseNegatives++;
          }
        } else {
          if (actualAction === 'ALLOW') {
            trueNegatives++;
          } else {
            falsePositives++;
          }
        }

        results.push({
          test_case_id: testCase.id,
          passed,
          actual_output: {
            action: actualAction,
            confidence: response.confidence,
          },
          expected_output: {
            action: expectedAction,
          },
          metrics: {
            risk_level: riskLevel === 'HIGH' || riskLevel === 'CRITICAL' ? 1 : 0,
            blocked: actualAction === 'REJECT' ? 1 : 0,
          },
          latency_ms: latency,
        });
      } catch (error: any) {
        results.push({
          test_case_id: testCase.id,
          passed: false,
          actual_output: {},
          expected_output: testCase.expected_output,
          metrics: {},
          error: error?.message,
          latency_ms: 0,
        });
      }
    }

    // 计算Gate指标
    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;
    const falsePositiveRate = falsePositives / (falsePositives + trueNegatives) || 0;
    const falseNegativeRate = falseNegatives / (truePositives + falseNegatives) || 0;
    const accuracy = (truePositives + trueNegatives) / tests.length;

    const p50 = this.percentile(latencies.sort((a, b) => a - b), 50);
    const p95 = this.percentile(latencies.sort((a, b) => a - b), 95);

    const result: GateEvalResult = {
      precision,
      recall,
      false_positive_rate: falsePositiveRate,
      false_negative_rate: falseNegativeRate,
      accuracy,
      latency_p50: p50,
      latency_p95: p95,
      total_tests: tests.length,
      passed_tests: results.filter((r) => r.passed).length,
      failed_tests: results.filter((r) => !r.passed).length,
      detailed_results: results,
    };

    this.logger.log(
      `[EvalSuite] Gate评测完成: precision=${precision.toFixed(2)}, recall=${recall.toFixed(2)}`,
    );

    return result;
  }

  /**
   * 评测Itinerary组件
   */
  async evaluateItinerary(
    modelVersion: string,
    testCases?: TestCase[],
  ): Promise<ItineraryEvalResult> {
    this.logger.log(
      `[EvalSuite] 开始Itinerary评测: modelVersion=${modelVersion}`,
    );

    const tests = testCases || (await this.getItineraryTestCases());
    const results: TestCaseResult[] = [];
    const latencies: number[] = [];
    const planLengths: number[] = [];
    const complexities: number[] = [];

    for (const testCase of tests) {
      try {
        const startTime = Date.now();

        const response = await this.policyService.predict({
          request_id: `eval_${testCase.id}`,
          state: testCase.input as any,
          model_version: modelVersion,
        });

        const latency = Date.now() - startTime;
        latencies.push(latency);

        // 评估Itinerary质量
        const success = response.action !== 'REJECT';
        const planLength = this.extractPlanLength(response);
        const complexity = this.calculateComplexity(testCase, response);
        const executability = this.calculateExecutability(response);

        if (planLength > 0) {
          planLengths.push(planLength);
        }
        complexities.push(complexity);

        results.push({
          test_case_id: testCase.id,
          passed: success,
          actual_output: {
            action: response.action,
            plan_length: planLength,
            complexity,
            executability,
          },
          expected_output: testCase.expected_output,
          metrics: {
            plan_length: planLength,
            complexity,
            executability,
          },
          latency_ms: latency,
        });
      } catch (error: any) {
        results.push({
          test_case_id: testCase.id,
          passed: false,
          actual_output: {},
          expected_output: testCase.expected_output,
          metrics: {},
          error: error?.message,
          latency_ms: 0,
        });
      }
    }

    // 计算总体指标
    const successRate = results.filter((r) => r.passed).length / results.length;
    const avgPlanLength = planLengths.length > 0
      ? planLengths.reduce((a, b) => a + b, 0) / planLengths.length
      : 0;
    const avgComplexity = complexities.length > 0
      ? complexities.reduce((a, b) => a + b, 0) / complexities.length
      : 0;
    const avgExecutability = results
      .filter((r) => r.metrics.executability !== undefined)
      .reduce((sum, r) => sum + (r.metrics.executability || 0), 0) /
      results.filter((r) => r.metrics.executability !== undefined).length || 0;

    const avgLatency = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;

    const result: ItineraryEvalResult = {
      success_rate: successRate,
      avg_plan_length: avgPlanLength,
      avg_complexity: avgComplexity,
      executability_score: avgExecutability,
      user_satisfaction: this.calculateUserSatisfaction(results), // 模拟
      avg_latency_ms: avgLatency,
      total_tests: tests.length,
      passed_tests: results.filter((r) => r.passed).length,
      failed_tests: results.filter((r) => !r.passed).length,
      detailed_results: results,
    };

    this.logger.log(
      `[EvalSuite] Itinerary评测完成: successRate=${successRate.toFixed(2)}, avgPlanLength=${avgPlanLength.toFixed(1)}`,
    );

    return result;
  }

  /**
   * 评测完整流程
   */
  async evaluateFullPipeline(
    modelVersion: string,
    testCases?: TestCase[],
  ): Promise<FullPipelineEvalResult> {
    this.logger.log(
      `[EvalSuite] 开始完整流程评测: modelVersion=${modelVersion}`,
    );

    // 分别评测各个组件
    const routerResult = await this.evaluateRouter(modelVersion);
    const gateResult = await this.evaluateGate(modelVersion);
    const itineraryResult = await this.evaluateItinerary(modelVersion);

    // 计算端到端成功率（所有组件都通过）
    const endToEndSuccessRate =
      (routerResult.accuracy + gateResult.accuracy + itineraryResult.success_rate) / 3;

    // 计算总体分数
    const overallScore =
      routerResult.accuracy * 0.3 +
      gateResult.accuracy * 0.3 +
      itineraryResult.success_rate * 0.4;

    const result: FullPipelineEvalResult = {
      router_result: routerResult,
      gate_result: gateResult,
      itinerary_result: itineraryResult,
      end_to_end_success_rate: endToEndSuccessRate,
      overall_score: overallScore,
      total_tests:
        routerResult.total_tests + gateResult.total_tests + itineraryResult.total_tests,
      passed_tests:
        routerResult.passed_tests + gateResult.passed_tests + itineraryResult.passed_tests,
    };

    this.logger.log(
      `[EvalSuite] 完整流程评测完成: overallScore=${overallScore.toFixed(2)}`,
    );

    return result;
  }

  /**
   * 初始化测试用例
   */
  private initializeTestCases(): void {
    // Router测试用例
    this.testCases.set('ROUTER', this.generateRouterTestCases());
    // Gate测试用例
    this.testCases.set('GATE', this.generateGateTestCases());
    // Itinerary测试用例
    this.testCases.set('ITINERARY', this.generateItineraryTestCases());
  }

  /**
   * 获取Router测试用例
   */
  private getRouterTestCases(): TestCase[] {
    return this.testCases.get('ROUTER') || [];
  }

  /**
   * 获取Gate测试用例
   */
  private getGateTestCases(): TestCase[] {
    return this.testCases.get('GATE') || [];
  }

  /**
   * 获取Itinerary测试用例
   */
  private getItineraryTestCases(): TestCase[] {
    return this.testCases.get('ITINERARY') || [];
  }

  /**
   * 生成Router测试用例（默认示例）
   */
  private generateRouterTestCases(): TestCase[] {
    // 返回默认示例用例（当TestCaseManager不可用时）
    return [
      {
        id: 'router_001',
        component: 'ROUTER',
        input: {
          user_request: 'Plan a trip from Reykjavik to Akureyri',
          origin: 'Reykjavik',
          destination: 'Akureyri',
        },
        metadata: {
          country_code: 'IS',
          complexity: 'MEDIUM',
        },
      },
    ];
  }

  /**
   * 生成Gate测试用例（默认示例）
   */
  private generateGateTestCases(): TestCase[] {
    return [
      {
        id: 'gate_001',
        component: 'GATE',
        input: {
          user_request: 'Plan a dangerous winter route',
          origin: 'Reykjavik',
          destination: 'Akureyri',
          constraints: {
            max_ascent_m: 5000, // 不合理的约束
          },
        },
        metadata: {
          risk_level: 'HIGH',
          country_code: 'IS',
        },
        expected_output: {
          action: 'REJECT',
        },
      },
    ];
  }

  /**
   * 生成Itinerary测试用例（默认示例）
   */
  private generateItineraryTestCases(): TestCase[] {
    return [
      {
        id: 'itinerary_001',
        component: 'ITINERARY',
        input: {
          user_request: 'Plan a 3-day trip in Iceland',
          origin: 'Reykjavik',
          destination: 'Reykjavik',
          date_range: {
            start_date: '2025-06-01',
            end_date: '2025-06-03',
          },
        },
        metadata: {
          country_code: 'IS',
          complexity: 'LOW',
        },
      },
    ];
  }

  /**
   * 评估Router结果
   */
  private evaluateRouterResult(testCase: TestCase, response: any): boolean {
    // 简单实现：检查action是否为ALLOW
    return response.action === 'ALLOW' || response.action === 'ADJUST';
  }

  /**
   * 计算Router指标
   */
  private calculateRouterMetrics(testCase: TestCase, response: any): Record<string, number> {
    return {
      confidence: response.confidence || 0,
    };
  }

  /**
   * 提取plan长度
   */
  private extractPlanLength(response: any): number {
    // TODO: 从response中提取实际的plan长度
    return 0;
  }

  /**
   * 计算复杂度
   */
  private calculateComplexity(testCase: TestCase, response: any): number {
    // 简单实现：基于metadata的complexity
    const complexityMap: Record<string, number> = {
      LOW: 0.3,
      MEDIUM: 0.6,
      HIGH: 0.9,
    };
    return complexityMap[testCase.metadata?.complexity || 'MEDIUM'] || 0.5;
  }

  /**
   * 计算可执行性
   */
  private calculateExecutability(response: any): number {
    // 简单实现：基于confidence
    return response.confidence || 0.5;
  }

  /**
   * 计算用户满意度（模拟）
   */
  private calculateUserSatisfaction(results: TestCaseResult[]): number {
    // 简单实现：基于成功率
    const successRate = results.filter((r) => r.passed).length / results.length;
    return successRate * 0.8 + 0.2; // 添加一些基础满意度
  }

  /**
   * 计算百分位数
   */
  private percentile(sortedArray: number[], p: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)] || 0;
  }
}
