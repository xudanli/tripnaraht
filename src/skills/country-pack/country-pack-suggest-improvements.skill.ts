// src/skills/country-pack/country-pack-suggest-improvements.skill.ts
/**
 * skill.countryPack.suggestImprovements
 * 
 * 用途：在 validate 之后的下一步，不只是告诉你哪里错，还告诉你该补什么。
 * 
 * 输入：countryCode + packType + currentPackSnapshot
 * 输出：missingFields[] + qualityGaps[] + priorityTodo[]
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ReadinessPack } from '../../trips/readiness/types/readiness-pack.types';
import { ImportCountryPackDto } from '../../route-directions/dto/import-country-pack.dto';
import { CountryPackValidateSkill } from './country-pack-validate.skill';

export interface CountryPackSuggestImprovementsInput extends SkillInput {
  /** 国家代码 */
  countryCode: string;
  /** Pack 类型 */
  packType: 'readiness' | 'routeDirection';
  /** 当前 Pack 快照 */
  currentPackSnapshot: ReadinessPack | ImportCountryPackDto;
}

export interface CountryPackSuggestImprovementsOutput extends SkillOutput {
  /** 缺失字段 */
  missingFields: Array<{
    path: string;
    field: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
  }>;
  /** 质量缺口 */
  qualityGaps: Array<{
    category: string;
    issue: string;
    current: string | number;
    recommended: string | number;
    impact: 'high' | 'medium' | 'low';
  }>;
  /** 优先级待办事项（按影响力排序） */
  priorityTodo: Array<{
    task: string;
    priority: 'high' | 'medium' | 'low';
    estimatedEffort: string;
    impact: string;
    actionableSteps: string[];
  }>;
}

@Injectable()
export class CountryPackSuggestImprovementsSkill implements Skill<CountryPackSuggestImprovementsInput, CountryPackSuggestImprovementsOutput> {
  private readonly logger = new Logger(CountryPackSuggestImprovementsSkill.name);

  metadata = {
    name: 'countryPack.suggestImprovements',
    description: 'countryPack.suggestImprovements：在验证 Pack 后提供改进建议，包括缺失字段、质量缺口和优先级待办事项',
    version: '1.0.0',
    category: 'countryPack' as const,
  };

  constructor(
    @Optional() private readonly packValidateSkill?: CountryPackValidateSkill,
  ) {}

  async execute(input: CountryPackSuggestImprovementsInput): Promise<CountryPackSuggestImprovementsOutput> {
    this.logger.debug(`执行 countryPack.suggestImprovements: countryCode=${input.countryCode}, packType=${input.packType}`);

    try {
      // 1. 先验证 Pack，获取错误和警告
      let validateResult: any;
      if (this.packValidateSkill) {
        validateResult = await this.packValidateSkill.execute({
          pack: input.currentPackSnapshot,
          packType: input.packType,
        });
      } else {
        // 如果 packValidateSkill 不可用，创建一个基本的验证结果
        this.logger.warn('CountryPackValidateSkill 不可用，使用基本验证结果');
        validateResult = {
          valid: true,
          errors: [],
          warnings: [],
          summary: {
            totalErrors: 0,
            totalWarnings: 0,
            criticalIssues: [],
          },
        };
      }

      // 2. 分析缺失字段
      const missingFields = this.analyzeMissingFields(validateResult.errors, input.packType);

      // 3. 分析质量缺口
      const qualityGaps = this.analyzeQualityGaps(input.currentPackSnapshot, input.packType);

      // 4. 生成优先级待办事项
      const priorityTodo = this.generatePriorityTodo(missingFields, qualityGaps, validateResult);

      return {
        missingFields,
        qualityGaps,
        priorityTodo,
      };
    } catch (error: any) {
      this.logger.error(`生成改进建议失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private analyzeMissingFields(
    errors: Array<{ path: string; message: string; code: string }>,
    packType: string
  ): CountryPackSuggestImprovementsOutput['missingFields'] {
    const missingFields: CountryPackSuggestImprovementsOutput['missingFields'] = [];

    for (const error of errors) {
      if (error.code === 'MISSING_FIELD') {
        missingFields.push({
          path: error.path,
          field: error.path.split('.').pop() || error.path,
          description: error.message,
          impact: this.determineFieldImpact(error.path, packType),
        });
      }
    }

    return missingFields;
  }

  private determineFieldImpact(path: string, _packType: string): 'high' | 'medium' | 'low' {
    // 高影响字段
    const highImpactFields = ['packId', 'countryCode', 'rules', 'routeDirections'];
    if (highImpactFields.some(field => path.includes(field))) {
      return 'high';
    }

    // 中影响字段
    const mediumImpactFields = ['tags', 'checklists', 'metadata', 'seasonality'];
    if (mediumImpactFields.some(field => path.includes(field))) {
      return 'medium';
    }

    return 'low';
  }

  private analyzeQualityGaps(
    pack: ReadinessPack | ImportCountryPackDto,
    packType: string
  ): CountryPackSuggestImprovementsOutput['qualityGaps'] {
    const gaps: CountryPackSuggestImprovementsOutput['qualityGaps'] = [];

    if (packType === 'readiness') {
      const readinessPack = pack as ReadinessPack;

      // 检查规则数量
      const ruleCount = readinessPack.rules?.length || 0;
      if (ruleCount < 10) {
        gaps.push({
          category: 'rules',
          issue: '规则数量偏少',
          current: ruleCount,
          recommended: 15,
          impact: 'medium',
        });
      }

      // 检查规则类别覆盖（基于实际的 ReadinessCategory 类型）
      const ruleCategories = new Set(readinessPack.rules?.map(r => String(r.category)) || []);
      const expectedCategories: string[] = [
        'entry_transit',
        'gear_packing',
        'health_insurance',
        'logistics',
        'safety_hazards',
      ];
      const missingCategories = expectedCategories.filter((cat: string) => !ruleCategories.has(cat));
      if (missingCategories.length > 0) {
        gaps.push({
          category: 'rule_coverage',
          issue: `缺少以下规则类别：${missingCategories.join(', ')}`,
          current: ruleCategories.size,
          recommended: expectedCategories.length,
          impact: 'high',
        });
      }

      // 检查清单数量
      const checklistCount = readinessPack.checklists?.length || 0;
      if (checklistCount < 3) {
        gaps.push({
          category: 'checklists',
          issue: '清单数量不足',
          current: checklistCount,
          recommended: 5,
          impact: 'medium',
        });
      }
    } else if (packType === 'routeDirection') {
      const routePack = pack as ImportCountryPackDto;

      // 检查路线方向数量
      const routeCount = routePack.routeDirections?.length || 0;
      if (routeCount < 3) {
        gaps.push({
          category: 'route_directions',
          issue: '路线方向数量偏少',
          current: routeCount,
          recommended: 5,
          impact: 'medium',
        });
      }

      // 检查标签覆盖
      const allTags = new Set<string>();
      routePack.routeDirections?.forEach(rd => {
        rd.tags?.forEach(tag => allTags.add(tag));
      });
      if (allTags.size < 5) {
        gaps.push({
          category: 'tag_diversity',
          issue: '标签多样性不足',
          current: allTags.size,
          recommended: 10,
          impact: 'low',
        });
      }

      // 检查季节覆盖
      // TODO: 分析 seasonality 字段的完整性
    }

    return gaps;
  }

  private generatePriorityTodo(
    missingFields: CountryPackSuggestImprovementsOutput['missingFields'],
    qualityGaps: CountryPackSuggestImprovementsOutput['qualityGaps'],
    validateResult: any
  ): CountryPackSuggestImprovementsOutput['priorityTodo'] {
    const todos: CountryPackSuggestImprovementsOutput['priorityTodo'] = [];

    // 1. 高影响缺失字段
    const highImpactMissing = missingFields.filter(m => m.impact === 'high');
    if (highImpactMissing.length > 0) {
      todos.push({
        task: `补充高影响缺失字段：${highImpactMissing.map(m => m.field).join(', ')}`,
        priority: 'high',
        estimatedEffort: '1-2 小时',
        impact: '这些字段是 Pack 的核心，缺失会导致验证失败',
        actionableSteps: highImpactMissing.map(m => `添加 ${m.path} 字段`),
      });
    }

    // 2. 质量缺口改进
    const highImpactGaps = qualityGaps.filter(g => g.impact === 'high');
    if (highImpactGaps.length > 0) {
      for (const gap of highImpactGaps) {
        todos.push({
          task: `改进 ${gap.category}：${gap.issue}`,
          priority: 'high',
          estimatedEffort: '2-4 小时',
          impact: gap.issue,
          actionableSteps: [
            `当前值：${gap.current}`,
            `建议值：${gap.recommended}`,
            `制定计划逐步补充`,
          ],
        });
      }
    }

    // 3. 中影响改进
    const mediumImpactItems = [
      ...missingFields.filter(m => m.impact === 'medium'),
      ...qualityGaps.filter(g => g.impact === 'medium'),
    ];
    if (mediumImpactItems.length > 0) {
      todos.push({
        task: '完善中等优先级字段和质量',
        priority: 'medium',
        estimatedEffort: '3-5 小时',
        impact: '提升 Pack 的完整性和可用性',
        actionableSteps: mediumImpactItems.map(item => {
          if ('field' in item) {
            return `补充 ${item.field} 字段`;
          } else {
            return `改进 ${item.category}`;
          }
        }),
      });
    }

    // 4. 解决验证错误
    if (validateResult.errors.length > 0) {
      todos.push({
        task: `解决 ${validateResult.errors.length} 个验证错误`,
        priority: 'high',
        estimatedEffort: '根据错误数量而定',
        impact: '确保 Pack 通过验证，可以正常使用',
        actionableSteps: [
          '逐个检查验证错误',
          '修复格式和必需字段问题',
          '重新运行验证',
        ],
      });
    }

    return todos.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }
}

