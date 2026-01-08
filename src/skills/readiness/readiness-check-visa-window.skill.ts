// src/skills/readiness/readiness-check-visa-window.skill.ts
/**
 * skill.readiness.checkVisaWindow
 * 
 * 用途：结合 CountryPack + 用户国籍（未来），检查签证 / 入境时间窗是否踩线。
 * 
 * 输入：tripMeta（出发国/目的国/停留时间等）
 * 输出：visaRiskLevel + recommendedLeadTime + specialRules[]
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { PackStorageService } from '../../trips/readiness/storage/pack-storage.service';

export interface ReadinessCheckVisaWindowInput extends SkillInput {
  /** 行程元数据 */
  tripMeta: {
    /** 出发国家代码 */
    departureCountryCode: string;
    /** 目的国家代码 */
    destinationCountryCode: string;
    /** 出发日期 */
    departureDate: string; // ISO date string
    /** 返回日期 */
    returnDate: string; // ISO date string
    /** 用户国籍（可选，默认 CN） */
    nationality?: string;
  };
}

export interface ReadinessCheckVisaWindowOutput extends SkillOutput {
  /** 签证风险等级 */
  visaRiskLevel: 'none' | 'low' | 'medium' | 'high';
  /** 建议提前准备时间（天数） */
  recommendedLeadTime: number;
  /** 特殊规则 */
  specialRules: Array<{
    rule: string;
    description: string;
    actionRequired: boolean;
  }>;
  /** 签证状态 */
  visaStatus?: {
    required: boolean;
    type?: 'VISA_FREE' | 'VISA_REQUIRED' | 'EVISA' | 'VOA' | 'SCHENGEN';
    allowedStay?: string;
    processingTime?: string;
  };
}

@Injectable()
export class ReadinessCheckVisaWindowSkill implements Skill<ReadinessCheckVisaWindowInput, ReadinessCheckVisaWindowOutput> {
  private readonly logger = new Logger(ReadinessCheckVisaWindowSkill.name);

  metadata = {
    name: 'readiness.checkVisaWindow',
    description: '检查签证和入境时间窗风险，提供准备建议和特殊规则',
    version: '1.0.0',
    category: 'readiness' as const,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly packStorage: PackStorageService,
  ) {}

  async execute(input: ReadinessCheckVisaWindowInput): Promise<ReadinessCheckVisaWindowOutput> {
    this.logger.debug(
      `执行 readiness.checkVisaWindow: destination=${input.tripMeta.destinationCountryCode}, ` +
      `nationality=${input.tripMeta.nationality || 'CN'}`
    );

    try {
      const { departureCountryCode, destinationCountryCode, departureDate, returnDate, nationality = 'CN' } = input.tripMeta;

      // 1. 计算停留天数
      const departure = new Date(departureDate);
      const returnDateObj = new Date(returnDate);
      const stayDays = Math.ceil((returnDateObj.getTime() - departure.getTime()) / (1000 * 60 * 60 * 24));

      // 2. 获取目的地的 Readiness Pack（如果可用）
      let visaInfo: any = null;
      try {
        const packs = await this.packStorage.findPacksByCountry(destinationCountryCode);
        const pack = packs?.[0]; // 使用第一个激活的 Pack
        if (pack?.rules) {
          // 从规则中提取签证信息
          const visaRules = pack.rules.filter((r: any) => r.category === 'entry_transit');
          if (visaRules.length > 0) {
            // 简化处理：从规则中提取签证要求
            visaInfo = this.extractVisaInfoFromRules(visaRules, nationality);
          }
        }
      } catch (error) {
        this.logger.warn(`无法获取 Readiness Pack，使用默认逻辑: ${error}`);
      }

      // 3. 判断签证要求（简化版，实际应该查询签证政策表）
      const visaStatus = this.determineVisaStatus(destinationCountryCode, nationality, stayDays, visaInfo);

      // 4. 评估风险等级
      const visaRiskLevel = this.assessRiskLevel(visaStatus, departure, stayDays);

      // 5. 计算建议准备时间
      const recommendedLeadTime = this.calculateRecommendedLeadTime(visaStatus, visaRiskLevel);

      // 6. 提取特殊规则
      const specialRules = this.extractSpecialRules(destinationCountryCode, nationality, visaStatus);

      return {
        visaRiskLevel,
        recommendedLeadTime,
        specialRules,
        visaStatus,
      };
    } catch (error: any) {
      this.logger.error(`检查签证时间窗失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private determineVisaStatus(
    destinationCountryCode: string,
    nationality: string,
    stayDays: number,
    visaInfo: any
  ): ReadinessCheckVisaWindowOutput['visaStatus'] {
    // 如果是中国护照
    if (nationality === 'CN' || nationality === 'CHN') {
      // 申根区国家
      const schengenCountries = [
        'AT', 'BE', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
        'IS', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL',
        'PT', 'SK', 'SI', 'ES', 'SE', 'CH'
      ];

      if (schengenCountries.includes(destinationCountryCode)) {
        return {
          required: true,
          type: 'SCHENGEN',
          allowedStay: '90天内180天',
          processingTime: '15-30个工作日',
        };
      }

      // 免签国家（简化版）
      const visaFreeCountries: Record<string, string> = {
        'SG': '30天',
        'MY': '30天',
        'TH': '30天',
        'JP': '15天',
        'KR': '30天',
      };

      if (visaFreeCountries[destinationCountryCode]) {
        return {
          required: false,
          type: 'VISA_FREE',
          allowedStay: visaFreeCountries[destinationCountryCode],
        };
      }

      // 电子签或落地签
      const evisaCountries: Record<string, string> = {
        'AU': '电子签',
        'NZ': '电子签',
        'TR': '电子签',
      };

      if (evisaCountries[destinationCountryCode]) {
        return {
          required: true,
          type: 'EVISA',
          processingTime: '3-7个工作日',
        };
      }
    }

    // 默认：需要签证
    return {
      required: true,
      type: 'VISA_REQUIRED',
      processingTime: '15-30个工作日',
    };
  }

  private assessRiskLevel(
    visaStatus: ReadinessCheckVisaWindowOutput['visaStatus'],
    departureDate: Date,
    stayDays: number
  ): 'none' | 'low' | 'medium' | 'high' {
    if (!visaStatus?.required) {
      return 'none';
    }

    // 计算距离出发的天数
    const daysUntilDeparture = Math.ceil((departureDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    // 解析处理时间
    const processingDays = this.parseProcessingTime(visaStatus.processingTime || '30个工作日');
    const recommendedDays = processingDays * 1.5; // 建议提前 1.5 倍处理时间

    if (daysUntilDeparture < recommendedDays * 0.5) {
      return 'high';
    } else if (daysUntilDeparture < recommendedDays) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private parseProcessingTime(timeStr: string): number {
    // 解析 "15-30个工作日" 或 "3-7个工作日"
    const match = timeStr.match(/(\d+)-?(\d+)?/);
    if (match) {
      const min = parseInt(match[1], 10);
      const max = match[2] ? parseInt(match[2], 10) : min;
      return Math.ceil((min + max) / 2);
    }
    return 30; // 默认 30 天
  }

  private calculateRecommendedLeadTime(
    visaStatus: ReadinessCheckVisaWindowOutput['visaStatus'],
    riskLevel: 'none' | 'low' | 'medium' | 'high'
  ): number {
    if (!visaStatus?.required) {
      return 0;
    }

    const processingDays = this.parseProcessingTime(visaStatus.processingTime || '30个工作日');

    // 根据风险等级调整
    switch (riskLevel) {
      case 'high':
        return Math.max(60, processingDays * 2); // 高风险：至少 60 天或 2 倍处理时间
      case 'medium':
        return Math.max(45, processingDays * 1.5); // 中风险：至少 45 天或 1.5 倍处理时间
      case 'low':
        return processingDays + 7; // 低风险：处理时间 + 7 天缓冲
      default:
        return processingDays;
    }
  }

  private extractSpecialRules(
    destinationCountryCode: string,
    nationality: string,
    visaStatus: ReadinessCheckVisaWindowOutput['visaStatus']
  ): ReadinessCheckVisaWindowOutput['specialRules'] {
    const rules: ReadinessCheckVisaWindowOutput['specialRules'] = [];

    // 申根签证特殊规则
    if (visaStatus?.type === 'SCHENGEN') {
      rules.push({
        rule: '申根签证规则',
        description: '申根签证适用于所有申根区国家，首次入境必须在签发国',
        actionRequired: true,
      });
      rules.push({
        rule: '停留时间限制',
        description: '每180天内在申根区停留不超过90天',
        actionRequired: true,
      });
    }

    // 免签但有限制
    if (visaStatus?.type === 'VISA_FREE' && visaStatus.allowedStay) {
      rules.push({
        rule: '免签停留限制',
        description: `免签停留期：${visaStatus.allowedStay}，超期需申请签证`,
        actionRequired: false,
      });
    }

    // 电子签规则
    if (visaStatus?.type === 'EVISA') {
      rules.push({
        rule: '电子签要求',
        description: '需要提前在线申请电子签证，获批后打印携带',
        actionRequired: true,
      });
    }

    return rules;
  }

  private extractVisaInfoFromRules(rules: any[], nationality: string): any {
    // 从规则中提取签证相关信息
    // 简化处理，实际应该解析规则的 when/then 条件
    for (const rule of rules) {
      if (rule.then?.message?.includes('签证') || rule.then?.message?.includes('visa')) {
        return {
          required: true,
          message: rule.then.message,
        };
      }
    }
    return null;
  }
}

