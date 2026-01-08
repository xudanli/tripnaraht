// src/skills/country-pack/country-pack-new-skeleton.skill.ts
/**
 * skill.countryPack.newSkeleton
 * 
 * 输入：{ countryCode, countryName, packType }
 * 输出：{ skeleton, template }
 * 
 * 创建国家 Pack 骨架，支持两种类型：
 * - ReadinessPack: 准备度检查 Pack
 * - RouteDirectionPack: 路线方向 Pack
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ReadinessPack, SeasonType, ReadinessCategory } from '../../trips/readiness/types/readiness-pack.types';
import { ImportCountryPackDto } from '../../route-directions/dto/import-country-pack.dto';

export interface CountryPackNewSkeletonInput extends SkillInput {
  /** 国家代码（ISO 3166-1 alpha-2） */
  countryCode: string;
  /** 国家名称 */
  countryName: string;
  /** 国家中文名称（可选） */
  countryNameCN?: string;
  /** Pack 类型 */
  packType: 'readiness' | 'routeDirection';
  /** 区域列表（可选，用于 RouteDirection） */
  regions?: string[];
  /** 支持的季节（可选，用于 ReadinessPack） */
  supportedSeasons?: SeasonType[];
}

export interface CountryPackNewSkeletonOutput extends SkillOutput {
  /** 生成的骨架 */
  skeleton: ReadinessPack | ImportCountryPackDto;
  /** 模板说明 */
  template: {
    type: string;
    description: string;
    requiredFields: string[];
    optionalFields: string[];
  };
}

@Injectable()
export class CountryPackNewSkeletonSkill implements Skill<CountryPackNewSkeletonInput, CountryPackNewSkeletonOutput> {
  private readonly logger = new Logger(CountryPackNewSkeletonSkill.name);

  metadata = {
    name: 'countryPack.newSkeleton',
    description: '创建国家 Pack 骨架，支持 ReadinessPack 和 RouteDirectionPack 两种类型',
    version: '1.0.0',
    category: 'countryPack' as const,
  };

  async execute(input: CountryPackNewSkeletonInput): Promise<CountryPackNewSkeletonOutput> {
    this.logger.debug(`执行 countryPack.newSkeleton: country=${input.countryCode}, type=${input.packType}`);

    if (input.packType === 'readiness') {
      return this.createReadinessPackSkeleton(input);
    } else {
      return this.createRouteDirectionPackSkeleton(input);
    }
  }

  /**
   * 创建 ReadinessPack 骨架
   */
  private createReadinessPackSkeleton(
    input: CountryPackNewSkeletonInput
  ): CountryPackNewSkeletonOutput {
    const now = new Date().toISOString();
    const packId = `pack.${input.countryCode.toLowerCase()}.${input.countryCode.toLowerCase()}`;
    const destinationId = `${input.countryCode}-${input.countryName.toUpperCase().replace(/\s+/g, '_')}`;

    const skeleton: ReadinessPack = {
      packId,
      destinationId,
      displayName: {
        en: input.countryName,
        zh: input.countryNameCN || input.countryName,
      },
      version: '1.0.0',
      lastReviewedAt: now,
      geo: {
        countryCode: input.countryCode,
        region: input.countryCode,
        city: input.countryName,
      },
      supportedSeasons: input.supportedSeasons || ['summer', 'winter', 'shoulder'],
      rules: [
        // 1. Entry & Transit（入境与过境）
        {
          id: `rule.${input.countryCode.toLowerCase()}.entry_transit`,
          category: 'entry_transit' as ReadinessCategory,
          severity: 'medium' as const,
          when: {
            eq: { path: 'itinerary.countries', value: [input.countryCode] },
          },
          then: {
            level: 'should' as const,
            message: {
              en: `Check entry requirements for ${input.countryName}`,
              zh: `检查 ${input.countryNameCN || input.countryName} 的入境要求`,
            },
          },
        },
        // 2. Gear & Packing（装备与穿搭）
        {
          id: `rule.${input.countryCode.toLowerCase()}.gear_packing`,
          category: 'gear_packing' as ReadinessCategory,
          severity: 'medium' as const,
          when: {
            eq: { path: 'itinerary.countries', value: [input.countryCode] },
          },
          then: {
            level: 'should' as const,
            message: {
              en: `Prepare appropriate gear for ${input.countryName} based on season and activities`,
              zh: `根据季节和活动准备适合 ${input.countryNameCN || input.countryName} 的装备`,
            },
          },
        },
        // 3. Health & Insurance（医疗与保险）
        {
          id: `rule.${input.countryCode.toLowerCase()}.health_insurance`,
          category: 'health_insurance' as ReadinessCategory,
          severity: 'high' as const,
          when: {
            eq: { path: 'itinerary.countries', value: [input.countryCode] },
          },
          then: {
            level: 'must' as const,
            message: {
              en: `Ensure travel health insurance covers ${input.countryName}`,
              zh: `确保旅行健康保险覆盖 ${input.countryNameCN || input.countryName}`,
            },
          },
        },
        // 4. Logistics（物流与后勤）
        {
          id: `rule.${input.countryCode.toLowerCase()}.logistics`,
          category: 'logistics' as ReadinessCategory,
          severity: 'medium' as const,
          when: {
            eq: { path: 'itinerary.countries', value: [input.countryCode] },
          },
          then: {
            level: 'should' as const,
            message: {
              en: `Plan logistics for ${input.countryName} (transportation, currency, connectivity)`,
              zh: `规划 ${input.countryNameCN || input.countryName} 的物流（交通、货币、通讯）`,
            },
          },
        },
        // 5. Safety & Hazards（安全与风险）
        {
          id: `rule.${input.countryCode.toLowerCase()}.safety_hazards`,
          category: 'safety_hazards' as ReadinessCategory,
          severity: 'high' as const,
          when: {
            eq: { path: 'itinerary.countries', value: [input.countryCode] },
          },
          then: {
            level: 'should' as const,
            message: {
              en: `Review safety hazards and risks in ${input.countryName}`,
              zh: `了解 ${input.countryNameCN || input.countryName} 的安全风险和危险`,
            },
          },
        },
      ],
      checklists: [
        {
          id: `checklist.${input.countryCode.toLowerCase()}.documents`,
          category: 'entry_transit',
          items: [
            {
              en: 'Passport and travel documents',
              zh: '护照和旅行证件',
            },
            {
              en: 'Visa or entry permit (if required)',
              zh: '签证或入境许可（如需要）',
            },
          ],
        },
        {
          id: `checklist.${input.countryCode.toLowerCase()}.gear`,
          category: 'gear_packing',
          items: [
            {
              en: 'Weather-appropriate clothing',
              zh: '适合天气的衣物',
            },
            {
              en: 'Essential travel gear',
              zh: '基本旅行装备',
            },
          ],
        },
        {
          id: `checklist.${input.countryCode.toLowerCase()}.health`,
          category: 'health_insurance',
          items: [
            {
              en: 'Travel health insurance',
              zh: '旅行健康保险',
            },
            {
              en: 'Prescription medications',
              zh: '处方药',
            },
          ],
        },
        {
          id: `checklist.${input.countryCode.toLowerCase()}.logistics`,
          category: 'logistics',
          items: [
            {
              en: 'Local currency or payment method',
              zh: '当地货币或支付方式',
            },
            {
              en: 'Transportation arrangements',
              zh: '交通安排',
            },
          ],
        },
        {
          id: `checklist.${input.countryCode.toLowerCase()}.safety`,
          category: 'safety_hazards',
          items: [
            {
              en: 'Emergency contacts',
              zh: '紧急联系人',
            },
            {
              en: 'Safety guidelines and local regulations',
              zh: '安全指南和当地法规',
            },
          ],
        },
      ],
      hazards: [],
      sources: [],
    };

    return {
      skeleton,
      template: {
        type: 'ReadinessPack',
        description: '准备度检查 Pack，用于生成行前准备清单',
        requiredFields: [
          'packId',
          'destinationId',
          'displayName',
          'version',
          'lastReviewedAt',
          'geo',
          'supportedSeasons',
          'rules',
          'checklists',
        ],
        optionalFields: ['hazards', 'sources'],
      },
    };
  }

  /**
   * 创建 RouteDirectionPack 骨架
   */
  private createRouteDirectionPackSkeleton(
    input: CountryPackNewSkeletonInput
  ): CountryPackNewSkeletonOutput {
    const skeleton: ImportCountryPackDto = {
      countryCode: input.countryCode,
      countryName: input.countryName,
      countryNameCN: input.countryNameCN,
      routeDirections: [
        {
          name: `${input.countryCode}_EXAMPLE_ROUTE`,
          nameCN: `${input.countryNameCN || input.countryName}示例路线`,
          nameEN: `${input.countryName} Example Route`,
          description: `示例路线方向，请根据实际情况修改`,
          countryCode: input.countryCode,
          tags: ['example'],
          regions: input.regions || [],
          entryHubs: [],
          seasonality: {
            bestMonths: [6, 7, 8, 9],
            avoidMonths: [12, 1, 2],
          },
          constraints: {
            soft: {
              maxDailyAscentM: 500,
              maxElevationM: 2000,
            },
          },
          riskProfile: {
            altitudeSickness: false,
            roadClosure: false,
          },
        },
      ],
      regions: input.regions || [],
    };

    return {
      skeleton,
      template: {
        type: 'RouteDirectionPack',
        description: '路线方向 Pack，用于定义国家级的路线方向资产',
        requiredFields: [
          'countryCode',
          'countryName',
          'routeDirections',
        ],
        optionalFields: ['countryNameCN', 'regions', 'policy'],
      },
    };
  }
}

