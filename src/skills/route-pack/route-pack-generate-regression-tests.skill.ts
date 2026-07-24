// src/skills/route-pack/route-pack-generate-regression-tests.skill.ts
/**
 * tripnara.routePack.generateRegressionTests
 * 
 * P1: 生成 RoutePack 回归测试
 * 
 * 功能：为 RoutePack 生成回归测试用例，确保 Pack 变更不会破坏现有功能
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { RoutePack } from './route-pack-new-skeleton.skill';

export interface RoutePackGenerateRegressionTestsInput extends SkillInput {
  /** RoutePack 数据 */
  pack: RoutePack;
  
  /** 测试场景（可选，默认生成标准场景） */
  testScenarios?: Array<{
    name: string;
    context: {
      countryCode: string;
      season?: number;
      userProfile?: {
        pacePreference?: 'SLOW' | 'MEDIUM' | 'FAST';
        altitudeTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
        riskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
      };
    };
    expectedOutcomes?: string[];
  }>;
}

export interface RoutePackGenerateRegressionTestsOutput extends SkillOutput {
  /** 生成的测试用例 */
  tests: Array<{
    id: string;
    name: string;
    description: string;
    type: 'routePack';
    input: any;
    expectedOutput?: any;
    assertions: Array<{
      type: string;
      description: string;
      check: string;
    }>;
  }>;
  
  /** 测试摘要 */
  summary: {
    totalTests: number;
    testTypes: Record<string, number>;
  };
}

@Injectable()
export class RoutePackGenerateRegressionTestsSkill
  implements Skill<RoutePackGenerateRegressionTestsInput, RoutePackGenerateRegressionTestsOutput>
{
  private readonly logger = new Logger(RoutePackGenerateRegressionTestsSkill.name);

  metadata = {
    name: 'routePack.generateRegressionTests',
    description: '为 routePack 生成回归测试用例，防止 Pack 变更破坏现有块。在 routePack validate 后或 CI 维护 RouteDirection Pack 契约时调用。',
    version: '1.0.0',
    category: 'countryPack' as const,
  };

  async execute(
    input: RoutePackGenerateRegressionTestsInput,
  ): Promise<RoutePackGenerateRegressionTestsOutput> {
    this.logger.debug(
      `执行 routePack.generateRegressionTests: packId=${input.pack.metadata.packId}`,
    );

    const tests: Array<{
      id: string;
      name: string;
      description: string;
      type: 'routePack';
      input: any;
      expectedOutput?: any;
      assertions: Array<{ type: string; description: string; check: string }>;
    }> = [];

    const countryCode = input.pack.metadata.countryCode;
    const packId = input.pack.metadata.packId;

    // 标准测试场景
    const standardScenarios = input.testScenarios || [
      {
        name: 'Basic Route Selection',
        context: {
          countryCode,
          season: 7, // 夏季
          userProfile: {
            pacePreference: 'MEDIUM',
            altitudeTolerance: 'MEDIUM',
            riskTolerance: 'MEDIUM',
          },
        },
        expectedOutcomes: ['Route should be selectable', 'Constraints should be valid'],
      },
      {
        name: 'High Altitude Route',
        context: {
          countryCode,
          season: 7,
          userProfile: {
            pacePreference: 'SLOW',
            altitudeTolerance: 'HIGH',
            riskTolerance: 'LOW',
          },
        },
        expectedOutcomes: ['Altitude constraints should be checked', 'Risk profile should be evaluated'],
      },
      {
        name: 'Winter Route',
        context: {
          countryCode,
          season: 1, // 冬季
          userProfile: {
            pacePreference: 'MEDIUM',
            altitudeTolerance: 'MEDIUM',
            riskTolerance: 'MEDIUM',
          },
        },
        expectedOutcomes: ['Seasonality should be checked', 'Weather risks should be evaluated'],
      },
    ];

    // 为每个场景生成测试用例
    standardScenarios.forEach((scenario, index) => {
      const testId = `${packId}:test:${index + 1}`;
      
      // 提取相关的 blocks
      const constraintBlocks = input.pack.blocks.filter((b) => b.type === 'constraint');
      const riskBlocks = input.pack.blocks.filter((b) => b.type === 'risk' || b.type === 'safety');
      const seasonalityBlocks = input.pack.blocks.filter((b) => b.type === 'seasonality');

      const assertions: Array<{ type: string; description: string; check: string }> = [];

      // 约束块断言
      if (constraintBlocks.length > 0) {
        assertions.push({
          type: 'constraint',
          description: 'Constraint blocks should be present and valid',
          check: `constraintBlocks.length > 0 && constraintBlocks.every(b => b.evidence && b.evidence.length > 0)`,
        });
      }

      // 风险块断言
      if (riskBlocks.length > 0) {
        assertions.push({
          type: 'risk',
          description: 'Risk blocks should be present and valid',
          check: `riskBlocks.length > 0 && riskBlocks.every(b => b.evidence && b.evidence.length > 0)`,
        });
      }

      // 季节性块断言（如果测试场景包含季节）
      if (scenario.context.season && seasonalityBlocks.length > 0) {
        assertions.push({
          type: 'seasonality',
          description: 'Seasonality blocks should be present and valid',
          check: `seasonalityBlocks.length > 0 && seasonalityBlocks.every(b => b.evidence && b.evidence.length > 0)`,
        });
      }

      // 证据溯源断言
      assertions.push({
        type: 'evidence',
        description: 'All blocks should have evidence for RAG credibility',
        check: `pack.blocks.every(b => b.evidence && b.evidence.length > 0 && b.source && b.lastVerifiedAt)`,
      });

      // 元数据断言
      assertions.push({
        type: 'metadata',
        description: 'Pack metadata should be complete',
        check: `pack.metadata.packId && pack.metadata.countryCode && pack.metadata.version && pack.metadata.lastVerifiedAt`,
      });

      tests.push({
        id: testId,
        name: scenario.name,
        description: `Test ${scenario.name} for RoutePack ${packId}`,
        type: 'routePack',
        input: {
          pack: input.pack,
          context: scenario.context,
        },
        expectedOutput: {
          outcomes: scenario.expectedOutcomes || [],
        },
        assertions,
      });
    });

    // 统计测试类型
    const testTypes: Record<string, number> = {};
    tests.forEach((test) => {
      test.assertions.forEach((assertion) => {
        testTypes[assertion.type] = (testTypes[assertion.type] || 0) + 1;
      });
    });

    return {
      tests,
      summary: {
        totalTests: tests.length,
        testTypes,
      },
    };
  }
}
