// src/skills/country-pack/country-pack-generate-regression-tests.skill.ts
/**
 * skill.countryPack.generateRegressionTests
 * 
 * 输入：{ pack, packType, testScenarios }
 * 输出：{ tests, testCases }
 * 
 * 为 Pack 生成回归测试用例
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ReadinessPack } from '../../trips/readiness/types/readiness-pack.types';
import { ImportCountryPackDto } from '../../route-directions/dto/import-country-pack.dto';
import { TripContext } from '../../trips/readiness/types/trip-context.types';

export interface CountryPackGenerateRegressionTestsInput extends SkillInput {
  /** Pack 数据 */
  pack: ReadinessPack | ImportCountryPackDto;
  /** Pack 类型 */
  packType: 'readiness' | 'routeDirection';
  /** 测试场景（可选，默认生成标准场景） */
  testScenarios?: Array<{
    name: string;
    context: Partial<TripContext>;
    expectedOutcomes?: string[];
  }>;
}

export interface CountryPackGenerateRegressionTestsOutput extends SkillOutput {
  /** 生成的测试用例 */
  tests: Array<{
    id: string;
    name: string;
    description: string;
    type: 'readiness' | 'routeDirection';
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
export class CountryPackGenerateRegressionTestsSkill implements Skill<CountryPackGenerateRegressionTestsInput, CountryPackGenerateRegressionTestsOutput> {
  private readonly logger = new Logger(CountryPackGenerateRegressionTestsSkill.name);

  metadata = {
    name: 'countryPack.generateRegressionTests',
    description: '为 Pack 生成回归测试用例，确保 Pack 变更不会破坏现有功能',
    version: '1.0.0',
    category: 'countryPack' as const,
  };

  async execute(input: CountryPackGenerateRegressionTestsInput): Promise<CountryPackGenerateRegressionTestsOutput> {
    this.logger.debug(`执行 countryPack.generateRegressionTests: type=${input.packType}`);

    if (input.packType === 'readiness') {
      return this.generateReadinessPackTests(input.pack as ReadinessPack, input.testScenarios);
    } else {
      return this.generateRouteDirectionPackTests(input.pack as ImportCountryPackDto, input.testScenarios);
    }
  }

  /**
   * 为 ReadinessPack 生成测试用例
   */
  private generateReadinessPackTests(
    pack: ReadinessPack,
    customScenarios?: Array<{ name: string; context: Partial<TripContext>; expectedOutcomes?: string[] }>
  ): CountryPackGenerateRegressionTestsOutput {
    const tests: Array<{
      id: string;
      name: string;
      description: string;
      type: 'readiness' | 'routeDirection';
      input: any;
      expectedOutput?: any;
      assertions: Array<{ type: string; description: string; check: string }>;
    }> = [];

    // 标准测试场景
    const standardScenarios = customScenarios || [
      {
        name: 'Basic Entry Check',
        context: {
          traveler: {
            nationality: 'US',
          },
          itinerary: {
            countries: [pack.geo.countryCode],
            season: 'summer',
          },
        },
        expectedOutcomes: ['Should have entry_transit rules'],
      },
      {
        name: 'High Risk Traveler',
        context: {
          traveler: {
            nationality: 'CN',
            riskTolerance: 'low',
          },
          itinerary: {
            countries: [pack.geo.countryCode],
            activities: ['hiking'],
            season: 'winter',
          },
        },
        expectedOutcomes: ['Should have safety_hazards rules'],
      },
      {
        name: 'All Seasons Coverage',
        context: {
          traveler: {},
          itinerary: {
            countries: [pack.geo.countryCode],
          },
        },
        expectedOutcomes: ['Should work for all supported seasons'],
      },
    ];

    // 为每个规则生成测试用例
    pack.rules.forEach((rule, index) => {
      tests.push({
        id: `test.rule.${rule.id}`,
        name: `Rule: ${rule.id}`,
        description: `Test rule ${rule.id} in category ${rule.category}`,
        type: 'readiness',
        input: {
          packId: pack.packId,
          context: this.buildTestContext(rule, pack),
        },
        assertions: [
          {
            type: 'rule_triggered',
            description: `Rule ${rule.id} should be triggered`,
            check: `result.findings[0].rules.some(r => r.id === '${rule.id}')`,
          },
          {
            type: 'action_level',
            description: `Action level should be ${rule.then.level}`,
            check: `result.findings[0].rules.find(r => r.id === '${rule.id}').then.level === '${rule.then.level}'`,
          },
        ],
      });
    });

    // 为每个场景生成测试用例
    standardScenarios.forEach((scenario, index) => {
      tests.push({
        id: `test.scenario.${index + 1}`,
        name: scenario.name,
        description: `Test scenario: ${scenario.name}`,
        type: 'readiness',
        input: {
          packId: pack.packId,
          context: scenario.context as TripContext,
        },
        expectedOutput: scenario.expectedOutcomes,
        assertions: scenario.expectedOutcomes?.map(outcome => ({
          type: 'outcome_check',
          description: outcome,
          check: `result.findings[0].${outcome.toLowerCase().replace(/\s+/g, '_')}`,
        })) || [],
      });
    });

    // 生成结构验证测试
    tests.push({
      id: 'test.structure',
      name: 'Pack Structure Validation',
      description: 'Validate pack structure and required fields',
      type: 'readiness',
      input: {
        pack,
      },
      assertions: [
        {
          type: 'structure',
          description: 'Pack should have all required fields',
          check: "pack.packId && pack.destinationId && pack.version && pack.rules && pack.checklists",
        },
        {
          type: 'rules_count',
          description: 'Pack should have at least one rule',
          check: 'pack.rules.length > 0',
        },
        {
          type: 'checklists_count',
          description: 'Pack should have at least one checklist',
          check: 'pack.checklists.length > 0',
        },
      ],
    });

    return {
      tests,
      summary: {
        totalTests: tests.length,
        testTypes: {
          rule: pack.rules.length,
          scenario: standardScenarios.length,
          structure: 1,
        },
      },
    };
  }

  /**
   * 为 RouteDirectionPack 生成测试用例
   */
  private generateRouteDirectionPackTests(
    pack: ImportCountryPackDto,
    customScenarios?: Array<{ name: string; context: Partial<TripContext>; expectedOutcomes?: string[] }>
  ): CountryPackGenerateRegressionTestsOutput {
    const tests: Array<{
      id: string;
      name: string;
      description: string;
      type: 'readiness' | 'routeDirection';
      input: any;
      expectedOutput?: any;
      assertions: Array<{ type: string; description: string; check: string }>;
    }> = [];

    // 为每个 RouteDirection 生成测试用例
    pack.routeDirections.forEach((rd, index) => {
      tests.push({
        id: `test.rd.${rd.name}`,
        name: `RouteDirection: ${rd.name}`,
        description: `Test route direction ${rd.name}`,
        type: 'routeDirection',
        input: {
          countryCode: pack.countryCode,
          routeDirectionName: rd.name,
          userIntent: {
            preferences: rd.tags || [],
          },
        },
        assertions: [
          {
            type: 'rd_found',
            description: `RouteDirection ${rd.name} should be found`,
            check: `result.routeDirection.name === '${rd.name}'`,
          },
          {
            type: 'country_match',
            description: `Country code should match`,
            check: `result.routeDirection.countryCode === '${pack.countryCode}'`,
          },
        ],
      });
    });

    // 生成导入测试
    tests.push({
      id: 'test.import',
      name: 'Pack Import Test',
      description: 'Test importing the entire pack',
      type: 'routeDirection',
      input: {
        pack,
      },
      assertions: [
        {
          type: 'import_success',
          description: 'All route directions should be imported successfully',
          check: 'result.successCount === pack.routeDirections.length',
        },
        {
          type: 'no_errors',
          description: 'No import errors',
          check: 'result.failedCount === 0',
        },
      ],
    });

    // 生成结构验证测试
    tests.push({
      id: 'test.structure',
      name: 'Pack Structure Validation',
      description: 'Validate pack structure and required fields',
      type: 'routeDirection',
      input: {
        pack,
      },
      assertions: [
        {
          type: 'structure',
          description: 'Pack should have all required fields',
          check: "pack.countryCode && pack.countryName && pack.routeDirections",
        },
        {
          type: 'route_directions_count',
          description: 'Pack should have at least one route direction',
          check: 'pack.routeDirections.length > 0',
        },
      ],
    });

    return {
      tests,
      summary: {
        totalTests: tests.length,
        testTypes: {
          routeDirection: pack.routeDirections.length,
          import: 1,
          structure: 1,
        },
      },
    };
  }

  /**
   * 构建测试上下文（基于规则条件）
   */
  private buildTestContext(rule: ReadinessPack['rules'][0], pack: ReadinessPack): Partial<TripContext> {
    // 简化实现：基于规则的条件构建基本上下文
    const context: Partial<TripContext> = {
      itinerary: {
        countries: [pack.geo.countryCode],
        season: pack.supportedSeasons[0] || 'summer',
      },
    };

    // 如果规则有 appliesTo，添加到上下文
    if (rule.appliesTo) {
      if (rule.appliesTo.activities) {
        context.itinerary = {
          countries: [pack.geo.countryCode], // 确保 countries 始终存在
          season: context.itinerary?.season || pack.supportedSeasons[0] || 'summer',
          activities: rule.appliesTo.activities,
        };
      }
      if (rule.appliesTo.seasons) {
        context.itinerary = {
          countries: [pack.geo.countryCode], // 确保 countries 始终存在
          season: rule.appliesTo.seasons[0],
          ...(context.itinerary?.activities ? { activities: context.itinerary.activities } : {}),
        };
      }
    }

    return context;
  }
}

