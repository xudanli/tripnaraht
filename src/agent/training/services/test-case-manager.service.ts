// src/agent/training/services/test-case-manager.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TestCase } from '../interfaces/evaluation.interface';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * TestCaseManagerService
 * 
 * 职责：管理测试用例库（从文件或数据库加载）
 * 
 * 功能：
 * 1. loadTestCases() - 从文件或数据库加载测试用例
 * 2. getRouterTestCases() - 获取Router测试用例
 * 3. getGateTestCases() - 获取Gate测试用例
 * 4. getItineraryTestCases() - 获取Itinerary测试用例
 * 5. addTestCase() - 添加测试用例
 */
@Injectable()
export class TestCaseManagerService {
  private readonly logger = new Logger(TestCaseManagerService.name);
  private readonly testCasesDir: string;
  private testCasesCache: Map<string, TestCase[]> = new Map();

  constructor(private readonly configService: ConfigService) {
    // 从环境变量或配置获取测试用例目录
    this.testCasesDir =
      this.configService.get<string>('TEST_CASES_DIR') ||
      path.join(process.cwd(), 'data', 'test-cases');
  }

  /**
   * 从文件加载测试用例
   */
  async loadTestCasesFromFile(
    component: 'ROUTER' | 'GATE' | 'ITINERARY',
  ): Promise<TestCase[]> {
    const fileName = `${component.toLowerCase()}_test_cases.json`;
    const filePath = path.join(this.testCasesDir, fileName);

    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const testCases = JSON.parse(fileContent) as TestCase[];

      // 验证测试用例格式
      const validTestCases = testCases.filter((tc) => this.validateTestCase(tc, component));

      this.logger.log(
        `[TestCaseManager] 从文件加载测试用例: component=${component}, count=${validTestCases.length}`,
      );

      return validTestCases;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.logger.warn(
          `[TestCaseManager] 测试用例文件不存在: ${filePath}，返回示例用例`,
        );
        return this.getDefaultTestCases(component);
      }
      this.logger.error(
        `[TestCaseManager] 加载测试用例失败: ${error?.message}`,
        error?.stack,
      );
      return this.getDefaultTestCases(component);
    }
  }

  /**
   * 获取Router测试用例
   */
  async getRouterTestCases(): Promise<TestCase[]> {
    const cacheKey = 'ROUTER';
    if (this.testCasesCache.has(cacheKey)) {
      return this.testCasesCache.get(cacheKey)!;
    }

    const testCases = await this.loadTestCasesFromFile('ROUTER');
    this.testCasesCache.set(cacheKey, testCases);
    return testCases;
  }

  /**
   * 获取Gate测试用例
   */
  async getGateTestCases(): Promise<TestCase[]> {
    const cacheKey = 'GATE';
    if (this.testCasesCache.has(cacheKey)) {
      return this.testCasesCache.get(cacheKey)!;
    }

    const testCases = await this.loadTestCasesFromFile('GATE');
    this.testCasesCache.set(cacheKey, testCases);
    return testCases;
  }

  /**
   * 获取Itinerary测试用例
   */
  async getItineraryTestCases(): Promise<TestCase[]> {
    const cacheKey = 'ITINERARY';
    if (this.testCasesCache.has(cacheKey)) {
      return this.testCasesCache.get(cacheKey)!;
    }

    const testCases = await this.loadTestCasesFromFile('ITINERARY');
    this.testCasesCache.set(cacheKey, testCases);
    return testCases;
  }

  /**
   * 添加测试用例（保存到文件）
   */
  async addTestCase(testCase: TestCase): Promise<void> {
    const component = testCase.component;
    const testCases = await this.loadTestCasesFromFile(component);
    testCases.push(testCase);

    const fileName = `${component.toLowerCase()}_test_cases.json`;
    const filePath = path.join(this.testCasesDir, fileName);

    // 确保目录存在
    await fs.mkdir(this.testCasesDir, { recursive: true });

    // 保存到文件
    await fs.writeFile(filePath, JSON.stringify(testCases, null, 2), 'utf-8');

    // 清除缓存
    this.testCasesCache.delete(component);

    this.logger.log(
      `[TestCaseManager] 添加测试用例: component=${component}, id=${testCase.id}`,
    );
  }

  /**
   * 验证测试用例格式
   */
  private validateTestCase(testCase: TestCase, expectedComponent: string): boolean {
    if (!testCase.id || !testCase.component || !testCase.input) {
      return false;
    }

    if (testCase.component !== expectedComponent) {
      return false;
    }

    return true;
  }

  /**
   * 获取默认测试用例（示例）
   */
  private getDefaultTestCases(component: 'ROUTER' | 'GATE' | 'ITINERARY'): TestCase[] {
    switch (component) {
      case 'ROUTER':
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
          {
            id: 'router_002',
            component: 'ROUTER',
            input: {
              user_request: 'I want to visit Iceland for 7 days',
              origin: undefined,
              destination: 'IS',
            },
            metadata: {
              country_code: 'IS',
              complexity: 'LOW',
            },
          },
        ];

      case 'GATE':
        return [
          {
            id: 'gate_001',
            component: 'GATE',
            input: {
              user_request: 'Plan a trip to Iceland in winter',
              origin: undefined,
              destination: 'IS',
              season: 'WINTER',
            },
            metadata: {
              country_code: 'IS',
              risk_level: 'HIGH',
            },
          },
          {
            id: 'gate_002',
            component: 'GATE',
            input: {
              user_request: 'Plan a trip to a dangerous area',
              origin: undefined,
              destination: 'HIGH_RISK_AREA',
            },
            metadata: {
              country_code: undefined,
              risk_level: 'CRITICAL',
            },
          },
        ];

      case 'ITINERARY':
        return [
          {
            id: 'itinerary_001',
            component: 'ITINERARY',
            input: {
              user_request: 'Plan a 7-day trip to Iceland',
              origin: 'Reykjavik',
              destination: 'Reykjavik',
              duration_days: 7,
            },
            metadata: {
              country_code: 'IS',
              complexity: 'MEDIUM',
            },
          },
          {
            id: 'itinerary_002',
            component: 'ITINERARY',
            input: {
              user_request: 'Plan a weekend trip to Reykjavik',
              origin: 'Reykjavik',
              destination: 'Reykjavik',
              duration_days: 2,
            },
            metadata: {
              country_code: 'IS',
              complexity: 'LOW',
            },
          },
        ];

      default:
        return [];
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.testCasesCache.clear();
    this.logger.log('[TestCaseManager] 测试用例缓存已清除');
  }
}
