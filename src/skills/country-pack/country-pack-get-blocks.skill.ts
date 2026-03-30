// src/skills/country-pack/country-pack-get-blocks.skill.ts
/**
 * tripnara.countryPack.getBlocks
 * 
 * P1: 按主题获取国家包块
 * 
 * CountryPack 不要全注入，按"主题块"拆：
 * - Visa / Drone / RoadRules / Money / Safety / WeatherWindows / LocalTransport / BookingNorms
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { ContextBlock } from '../../agent/context-engine/types/context-package.types';
import { getCountryPack } from '../../trips/readiness/config/country-pack.config';
import { PackStorageService } from '../../trips/readiness/storage/pack-storage.service';

export interface CountryPackGetBlocksInput extends SkillInput {
  /** Pack ID 或国家代码 */
  packId: string; // 可以是 countryCode 或 readinessPackId
  
  /** 需要的主题块 */
  topics: Array<
    | 'VISA'
    | 'DRONE'
    | 'ROAD_RULES'
    | 'MONEY'
    | 'SAFETY'
    | 'WEATHER_WINDOWS'
    | 'LOCAL_TRANSPORT'
    | 'BOOKING_NORMS'
  >;
  
  /** 规划阶段（用于筛选相关性） */
  phase?: string;
}

export interface CountryPackGetBlocksOutput extends SkillOutput {
  /** 获取到的块列表 */
  blocks: ContextBlock[];
  
  /** 缺失的主题 */
  missingTopics: string[];
  
  /** Pack 元数据 */
  packMetadata: {
    packId: string;
    countryCode: string;
    countryName: string;
    version?: string;
  };
}

@Injectable()
export class CountryPackGetBlocksSkill implements Skill<CountryPackGetBlocksInput, CountryPackGetBlocksOutput> {
  private readonly logger = new Logger(CountryPackGetBlocksSkill.name);

  metadata = {
    name: 'countryPack.getBlocks',
    description: '按主题获取国家包块：根据 topics 从 CountryPack 中提取 Visa/Drone/RoadRules/Money/Safety/WeatherWindows/LocalTransport/BookingNorms 等主题块',
    version: '1.0.0',
    category: 'countryPack' as const,
  };

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly packStorage?: PackStorageService,
  ) {}

  /** 将可能是 string 或 {en,zh} 对象的值转为可搜索字符串，避免 toLowerCase is not a function */
  private toSearchStr(v: any): string {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    return (v?.en ?? v?.zh ?? '') as string;
  }

  /**
   * 当 PackStorageService 未注入时，用 Prisma 直接按 countryCode 查询 ReadinessPack
   */
  private async findPacksByCountryFallback(countryCode: string): Promise<any[]> {
    if (!this.prisma) return [];
    try {
      const records = await this.prisma.readinessPack.findMany({
        where: { countryCode: countryCode.toUpperCase(), isActive: true },
        orderBy: { updatedAt: 'desc' },
      });
      return records.map((r) => r.packData as any);
    } catch (err: any) {
      this.logger.warn(`findPacksByCountryFallback(${countryCode}) failed: ${err?.message}`);
      return [];
    }
  }

  async execute(input: CountryPackGetBlocksInput): Promise<CountryPackGetBlocksOutput> {
    this.logger.debug(
      `执行 countryPack.getBlocks: packId=${input.packId}, topics=${input.topics.join(', ')}`,
    );

    const blocks: ContextBlock[] = [];
    const missingTopics: string[] = [];

    try {
      // 1. 判断 packId 是 countryCode 还是 readinessPackId
      let countryCode: string = input.packId;
      let countryName: string = '';
      let packData: any = null;

      // 尝试从 ReadinessPack 获取（需 Prisma）
      if (this.prisma) {
        try {
          const readinessPack = await this.prisma.readinessPack.findFirst({
            where: { packId: input.packId, isActive: true },
          });

          // 当 packId 为 2 字母国家代码（如 IS）且未找到时，按 countryCode 查找
          if (!readinessPack && /^[A-Za-z]{2}$/.test(input.packId)) {
            const packRecords = this.packStorage
              ? await this.packStorage.findPacksByCountry(input.packId.toUpperCase())
              : await this.findPacksByCountryFallback(input.packId.toUpperCase());
            if (packRecords.length > 0) {
              const pack = packRecords[0] as any;
              countryCode = pack.geo?.countryCode || input.packId.toUpperCase();
              countryName = typeof pack.displayName === 'string' ? pack.displayName : pack.displayName?.en || pack.displayName?.zh || countryCode;
              packData = pack;
              const countryPackConfig = getCountryPack(countryCode);
              if (countryPackConfig?.riskThresholds && !packData.riskThresholds) {
                packData = { ...packData, riskThresholds: countryPackConfig.riskThresholds };
              }
            }
          }

          if (readinessPack) {
            countryCode = readinessPack.countryCode;
            countryName = readinessPack.displayName;
            packData = readinessPack.packData as any;
            const countryPackConfig = getCountryPack(countryCode);
            if (countryPackConfig?.riskThresholds && !packData.riskThresholds) {
              packData = { ...packData, riskThresholds: countryPackConfig.riskThresholds };
            }
          } else if (!packData) {
            const countryPack = getCountryPack(input.packId);
            countryCode = input.packId;
            countryName = countryPack.countryName;
            packData = countryPack;
          }
        } catch (error) {
          countryCode = input.packId;
          const countryPack = getCountryPack(countryCode);
          countryName = countryPack.countryName;
          packData = countryPack;
        }
      } else {
        // 直接作为 countryCode 处理
        countryCode = input.packId;
        const countryPack = getCountryPack(countryCode);
        countryName = countryPack.countryName;
        packData = countryPack;
      }

      // 2. 为每个主题提取块
      for (const topic of input.topics) {
        const block = this.extractTopicBlock(topic, packData, countryCode, countryName);
        if (block) {
          // P0: 添加证据溯源
          const blockWithEvidence = this.addEvidenceToBlock(block, packData, countryCode);
          blocks.push(blockWithEvidence);
        } else {
          missingTopics.push(topic);
        }
      }

      return {
        blocks,
        missingTopics,
        packMetadata: {
          packId: input.packId,
          countryCode,
          countryName,
        },
      };
    } catch (error: any) {
      this.logger.error(`获取国家包块失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 为 ContextBlock 添加证据溯源（P0）
   */
  private addEvidenceToBlock(
    block: ContextBlock,
    packData: any,
    countryCode: string,
    additionalMetadata?: Record<string, any>,
  ): ContextBlock {
    const lastReviewedAt = packData.lastReviewedAt || new Date().toISOString();
    
    return {
      ...block,
      evidence: [
        {
          source: `CountryPack:${countryCode}`,
          verifiedAt: lastReviewedAt,
          confidence: 0.9,
          metadata: {
            packVersion: packData.version,
            ...additionalMetadata,
          },
        },
      ],
      dataSource: 'PACK' as const,
      lastVerifiedAt: lastReviewedAt,
    };
  }

  /**
   * 提取主题块
   */
  private extractTopicBlock(
    topic: CountryPackGetBlocksInput['topics'][0],
    packData: any,
    countryCode: string,
    countryName: string,
  ): ContextBlock | null {
    switch (topic) {
      case 'VISA':
        return this.extractVisaBlock(packData, countryCode, countryName);
      case 'DRONE':
        return this.extractDroneBlock(packData, countryCode, countryName);
      case 'ROAD_RULES':
        return this.extractRoadRulesBlock(packData, countryCode, countryName);
      case 'MONEY':
        return this.extractMoneyBlock(packData, countryCode, countryName);
      case 'SAFETY':
        return this.extractSafetyBlock(packData, countryCode, countryName);
      case 'WEATHER_WINDOWS':
        return this.extractWeatherWindowsBlock(packData, countryCode, countryName);
      case 'LOCAL_TRANSPORT':
        return this.extractLocalTransportBlock(packData, countryCode, countryName);
      case 'BOOKING_NORMS':
        return this.extractBookingNormsBlock(packData, countryCode, countryName);
      default:
        return null;
    }
  }

  /**
   * 提取签证块（从 ReadinessPack 完整提取）
   */
  private extractVisaBlock(packData: any, countryCode: string, countryName: string): ContextBlock | null {
    const visaRules = packData.rules?.filter((rule: any) => {
      const msg = this.toSearchStr(rule.then?.message);
      return (
        rule.category === 'entry_transit' ||
        this.toSearchStr(rule.id).toLowerCase().includes('visa') ||
        msg.toLowerCase().includes('visa') ||
        rule.then?.tasks?.some((task: any) => task.tags?.includes('visa'))
      );
    }) || [];

    if (visaRules.length === 0) {
      return null; // 没有签证相关信息，返回 null
    }

    // 构建签证信息文本
    const visaMessages = visaRules
      .map((rule: any) => {
        const message = typeof rule.then?.message === 'string' 
          ? rule.then.message 
          : rule.then?.message?.en || rule.then?.message?.zh || '';
        return `- ${message}`;
      })
      .join('\n');

    const visaTasks = visaRules
      .flatMap((rule: any) => rule.then?.tasks || [])
      .filter((task: any) => task.tags?.includes('visa'))
      .map((task: any) => {
        const title = typeof task.title === 'string' ? task.title : task.title?.en || task.title?.zh || '';
        return `  • ${title}${task.dueOffsetDays ? ` (提前 ${Math.abs(task.dueOffsetDays)} 天)` : ''}`;
      })
      .join('\n');

    const text = `${countryName} 签证要求:\n${visaMessages}${visaTasks ? `\n\n需要完成的任务:\n${visaTasks}` : ''}`;

    return {
      key: `COUNTRY_VISA_${countryCode}`,
      type: 'COUNTRY_VISA',
      text,
      priority: 80,
      visibility: 'public',
      provenance: {
        source: 'pack',
        identifier: `countryPack:${countryCode}`,
        version: packData.version,
        timestamp: packData.lastReviewedAt || new Date().toISOString(),
      },
      data: {
        rules: visaRules.map((rule: any) => ({
          id: rule.id,
          category: rule.category,
          severity: rule.severity,
          message: rule.then?.message,
        })),
      },
    };
  }

  /**
   * 提取无人机规则块（从 ReadinessPack 完整提取）
   */
  private extractDroneBlock(packData: any, countryCode: string, countryName: string): ContextBlock | null {
    // 查找包含 'drone' 关键词的规则和清单
    const droneRules = packData.rules?.filter((rule: any) =>
      this.toSearchStr(rule.id).toLowerCase().includes('drone') ||
      this.toSearchStr(rule.then?.message).toLowerCase().includes('drone') ||
      rule.when?.containsAny?.values?.some((v: string) => this.toSearchStr(v).toLowerCase().includes('drone')) ||
      rule.then?.tasks?.some((task: any) =>
        this.toSearchStr(task.title).toLowerCase().includes('drone') ||
        task.tags?.includes('drone'),
      ),
    ) || [];

    const droneChecklists = packData.checklists?.filter((checklist: any) =>
      checklist.items?.some((item: string | any) => {
        const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
        return itemText.toLowerCase().includes('drone');
      })
    ) || [];

    if (droneRules.length === 0 && droneChecklists.length === 0) {
      return null; // 没有无人机相关信息
    }

    // 构建无人机规则文本
    const rulesText = droneRules
      .map((rule: any) => {
        const message = typeof rule.then?.message === 'string' 
          ? rule.then.message 
          : rule.then?.message?.en || rule.then?.message?.zh || '';
        return `- ${message}`;
      })
      .join('\n');

    const checklistText = droneChecklists
      .flatMap((checklist: any) => checklist.items || [])
      .filter((item: string | any) => {
        const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
        return itemText.toLowerCase().includes('drone');
      })
      .map((item: string | any) => {
        const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
        return `  • ${itemText}`;
      })
      .join('\n');

    const text = `${countryName} 无人机规则:\n${rulesText}${checklistText ? `\n\n检查清单:\n${checklistText}` : ''}`;

    return {
      key: `COUNTRY_DRONE_${countryCode}`,
      type: 'COUNTRY_DRONE',
      text,
      priority: 70,
      visibility: 'public',
      provenance: {
        source: 'pack',
        identifier: `countryPack:${countryCode}`,
        version: packData.version,
        timestamp: packData.lastReviewedAt || new Date().toISOString(),
      },
      data: {
        rules: droneRules.map((rule: any) => ({
          id: rule.id,
          category: rule.category,
          severity: rule.severity,
        })),
      },
    };
  }

  /**
   * 提取道路规则块（从 ReadinessPack 和 CountryPack 配置提取）
   */
  private extractRoadRulesBlock(packData: any, countryCode: string, countryName: string): ContextBlock | null {
    // 1. 从 CountryPack 配置中提取风险阈值（如果存在）
    const riskThresholds = packData.riskThresholds;
    
    // 2. 从 ReadinessPack 的 rules 中提取 safety_hazards 和 terrain 相关的规则
    const roadRules = packData.rules?.filter((rule: any) => {
      const id = this.toSearchStr(rule.id).toLowerCase();
      return (
        rule.category === 'safety_hazards' ||
        id.includes('road') ||
        id.includes('terrain') ||
        id.includes('f-road') ||
        id.includes('driving')
      );
    }) || [];

    const terrainHazards = packData.hazards?.filter((hazard: any) => 
      hazard.type === 'terrain' || hazard.type === 'weather_extreme'
    ) || [];

    // 构建道路规则文本
    const parts: string[] = [];

    if (riskThresholds) {
      parts.push(`道路规则阈值:`);
      if (riskThresholds.highAltitudeM) {
        parts.push(`  高海拔阈值: ${riskThresholds.highAltitudeM}m`);
      }
      if (riskThresholds.steepSlopePct) {
        parts.push(`  陡坡阈值: ${riskThresholds.steepSlopePct}%`);
      }
      if (riskThresholds.rapidAscentM) {
        parts.push(`  快速爬升阈值: ${riskThresholds.rapidAscentM}m`);
      }
      if (riskThresholds.bigAscentDayM) {
        parts.push(`  单日最大爬升: ${riskThresholds.bigAscentDayM}m`);
      }
    }

    if (roadRules.length > 0) {
      parts.push(`\n道路安全规则:`);
      roadRules.forEach((rule: any) => {
        const message = typeof rule.then?.message === 'string' 
          ? rule.then.message 
          : rule.then?.message?.en || rule.then?.message?.zh || '';
        parts.push(`  - ${message}`);
      });
    }

    if (terrainHazards.length > 0) {
      parts.push(`\n地形风险:`);
      terrainHazards.forEach((hazard: any) => {
        const summary = typeof hazard.summary === 'string' 
          ? hazard.summary 
          : hazard.summary?.en || hazard.summary?.zh || '';
        parts.push(`  - ${summary} (严重程度: ${hazard.severity})`);
      });
    }

    if (parts.length === 0 && !riskThresholds) {
      return null; // 没有道路规则相关信息
    }

    const text = `${countryName} 道路规则:\n${parts.join('\n')}`;

    return {
      key: `COUNTRY_ROAD_RULES_${countryCode}`,
      type: 'COUNTRY_ROAD_RULES',
      text,
      priority: 85,
      visibility: 'public',
      provenance: {
        source: 'pack',
        identifier: `countryPack:${countryCode}`,
        version: packData.version,
        timestamp: packData.lastReviewedAt || new Date().toISOString(),
      },
      data: {
        riskThresholds,
        rules: roadRules.map((rule: any) => ({
          id: rule.id,
          category: rule.category,
          severity: rule.severity,
        })),
        hazards: terrainHazards.map((hazard: any) => ({
          type: hazard.type,
          severity: hazard.severity,
        })),
      },
    };
  }

  /**
   * 提取货币块（从 ReadinessPack 提取）
   */
  private extractMoneyBlock(packData: any, countryCode: string, countryName: string): ContextBlock | null {
    // 从 logistics 相关的规则和清单中提取货币/支付信息
    const moneyRules = packData.rules?.filter((rule: any) => {
      const id = this.toSearchStr(rule.id).toLowerCase();
      const msg = this.toSearchStr(rule.then?.message).toLowerCase();
      return (
        rule.category === 'logistics' ||
        id.includes('money') ||
        id.includes('currency') ||
        id.includes('payment') ||
        id.includes('cash') ||
        msg.includes('currency') ||
        msg.includes('payment')
      );
    }) || [];

    const moneyChecklists = packData.checklists?.filter((checklist: any) =>
      checklist.category === 'logistics' ||
      checklist.items?.some((item: string | any) => {
        const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
        return itemText.toLowerCase().match(/(currency|payment|cash|money|atm|credit card)/i);
      })
    ) || [];

    if (moneyRules.length === 0 && moneyChecklists.length === 0) {
      return null; // 没有货币相关信息
    }

    const rulesText = moneyRules
      .map((rule: any) => {
        const message = typeof rule.then?.message === 'string' 
          ? rule.then.message 
          : rule.then?.message?.en || rule.then?.message?.zh || '';
        return `- ${message}`;
      })
      .join('\n');

    const checklistText = moneyChecklists
      .flatMap((checklist: any) => checklist.items || [])
      .filter((item: string | any) => {
        const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
        return itemText.toLowerCase().match(/(currency|payment|cash|money|atm|credit card)/i);
      })
      .map((item: string | any) => {
        const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
        return `  • ${itemText}`;
      })
      .join('\n');

    const text = `${countryName} 货币和支付习惯:\n${rulesText}${checklistText ? `\n\n支付相关检查:\n${checklistText}` : ''}`;

    return {
      key: `COUNTRY_MONEY_${countryCode}`,
      type: 'COUNTRY_MONEY',
      text,
      priority: 60,
      visibility: 'public',
      provenance: {
        source: 'pack',
        identifier: `countryPack:${countryCode}`,
        version: packData.version,
        timestamp: packData.lastReviewedAt || new Date().toISOString(),
      },
    };
  }

  /**
   * 提取安全信息块（从 ReadinessPack 完整提取）
   */
  private extractSafetyBlock(packData: any, countryCode: string, countryName: string): ContextBlock | null {
    // 从 safety_hazards 类别的规则和 hazards 中提取安全信息
    const safetyRules = packData.rules?.filter((rule: any) => 
      rule.category === 'safety_hazards'
    ) || [];

    const hazards = packData.hazards || [];

    if (safetyRules.length === 0 && hazards.length === 0) {
      return null; // 没有安全信息
    }

    const rulesText = safetyRules
      .map((rule: any) => {
        const message = typeof rule.then?.message === 'string' 
          ? rule.then.message 
          : rule.then?.message?.en || rule.then?.message?.zh || '';
        const severity = rule.severity === 'high' ? '⚠️' : rule.severity === 'medium' ? '⚡' : '';
        return `${severity} ${message} (${rule.severity})`;
      })
      .join('\n');

    const hazardsText = hazards
      .map((hazard: any) => {
        const summary = typeof hazard.summary === 'string' 
          ? hazard.summary 
          : hazard.summary?.en || hazard.summary?.zh || '';
        const mitigations = hazard.mitigations?.map((m: string | any) => {
          const mText = typeof m === 'string' ? m : m.en || m.zh || '';
          return `    - ${mText}`;
        }).join('\n') || '';
        const severity = hazard.severity === 'high' ? '⚠️' : hazard.severity === 'medium' ? '⚡' : '';
        return `${severity} ${hazard.type}: ${summary}${mitigations ? `\n  缓解措施:\n${mitigations}` : ''}`;
      })
      .join('\n\n');

    const text = `${countryName} 安全信息:\n${rulesText}${hazardsText ? `\n\n风险提示:\n${hazardsText}` : ''}`;

    return {
      key: `COUNTRY_SAFETY_${countryCode}`,
      type: 'COUNTRY_SAFETY',
      text,
      priority: 90,
      visibility: 'public',
      provenance: {
        source: 'pack',
        identifier: `countryPack:${countryCode}`,
        version: packData.version,
        timestamp: packData.lastReviewedAt || new Date().toISOString(),
      },
      data: {
        rulesCount: safetyRules.length,
        hazardsCount: hazards.length,
        highSeverityCount: [...safetyRules, ...hazards].filter((r: any) => r.severity === 'high').length,
      },
    };
  }

  /**
   * 提取天气窗口块
   */
  private extractWeatherWindowsBlock(packData: any, countryCode: string, countryName: string): ContextBlock | null {
    return {
      key: `COUNTRY_WEATHER_${countryCode}`,
      type: 'COUNTRY_WEATHER',
      text: `${countryName} 天气窗口（待完善）`,
      priority: 75,
      visibility: 'public',
      provenance: {
        source: 'pack',
        identifier: `countryPack:${countryCode}`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * 提取当地交通块（从 ReadinessPack 提取）
   */
  private extractLocalTransportBlock(packData: any, countryCode: string, countryName: string): ContextBlock | null {
    // 从 logistics 相关的规则和清单中提取交通信息
    const transportRules = packData.rules?.filter((rule: any) => {
      const id = this.toSearchStr(rule.id).toLowerCase();
      const msg = this.toSearchStr(rule.then?.message).toLowerCase();
      return (
        rule.category === 'logistics' ||
        id.includes('transport') ||
        id.includes('bus') ||
        id.includes('taxi') ||
        id.includes('car') ||
        id.includes('ferry') ||
        /(transport|bus|taxi|car|ferry|public transport)/i.test(msg)
      );
    }) || [];

    const transportChecklists = packData.checklists?.filter((checklist: any) =>
      checklist.category === 'logistics' ||
      checklist.items?.some((item: string | any) => {
        const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
        return itemText.toLowerCase().match(/(transport|bus|taxi|car|ferry|public transport|rental)/i);
      })
    ) || [];

    if (transportRules.length === 0 && transportChecklists.length === 0) {
      return null; // 没有交通相关信息
    }

    const rulesText = transportRules
      .map((rule: any) => {
        const message = typeof rule.then?.message === 'string' 
          ? rule.then.message 
          : rule.then?.message?.en || rule.then?.message?.zh || '';
        return `- ${message}`;
      })
      .join('\n');

    const checklistText = transportChecklists
      .flatMap((checklist: any) => checklist.items || [])
      .filter((item: string | any) => {
        const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
        return itemText.toLowerCase().match(/(transport|bus|taxi|car|ferry|public transport|rental)/i);
      })
      .map((item: string | any) => {
        const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
        return `  • ${itemText}`;
      })
      .join('\n');

    const text = `${countryName} 当地交通:\n${rulesText}${checklistText ? `\n\n交通相关检查:\n${checklistText}` : ''}`;

    return {
      key: `COUNTRY_TRANSPORT_${countryCode}`,
      type: 'COUNTRY_TRANSPORT',
      text,
      priority: 65,
      visibility: 'public',
      provenance: {
        source: 'pack',
        identifier: `countryPack:${countryCode}`,
        version: packData.version,
        timestamp: packData.lastReviewedAt || new Date().toISOString(),
      },
    };
  }

  /**
   * 提取预订规范块（从 ReadinessPack 提取）
   */
  private extractBookingNormsBlock(packData: any, countryCode: string, countryName: string): ContextBlock | null {
    // 从 activities_bookings 类别的规则和清单中提取预订信息
    const bookingRules = packData.rules?.filter((rule: any) => {
      const id = this.toSearchStr(rule.id).toLowerCase();
      return (
        rule.category === 'activities_bookings' ||
        id.includes('booking') ||
        id.includes('reservation') ||
        rule.then?.tasks?.some((task: any) => task.tags?.includes('booking'))
      );
    }) || [];

    const bookingChecklists = packData.checklists?.filter((checklist: any) =>
      checklist.category === 'activities_bookings' ||
      checklist.items?.some((item: string | any) => {
        const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
        return itemText.toLowerCase().match(/(booking|reservation|book|advance)/i);
      })
    ) || [];

    if (bookingRules.length === 0 && bookingChecklists.length === 0) {
      return null; // 没有预订相关信息
    }

    // 提取预订任务（包含提前天数信息）
    const bookingTasks = bookingRules
      .flatMap((rule: any) => rule.then?.tasks || [])
      .filter((task: any) =>
        task.tags?.includes('booking') ||
        this.toSearchStr(task.title).toLowerCase().includes('book') ||
        this.toSearchStr(task.title).toLowerCase().includes('reservation'),
      )
      .map((task: any) => {
        const title = typeof task.title === 'string' ? task.title : task.title?.en || task.title?.zh || '';
        const dueText = task.dueOffsetDays 
          ? ` (提前 ${Math.abs(task.dueOffsetDays)} 天)` 
          : '';
        return `  • ${title}${dueText}`;
      })
      .join('\n');

    const rulesText = bookingRules
      .map((rule: any) => {
        const message = typeof rule.then?.message === 'string' 
          ? rule.then.message 
          : rule.then?.message?.en || rule.then?.message?.zh || '';
        return `- ${message}`;
      })
      .join('\n');

    const checklistText = bookingChecklists
      .flatMap((checklist: any) => checklist.items || [])
      .filter((item: string | any) => {
        const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
        return itemText.toLowerCase().match(/(booking|reservation|book|advance)/i);
      })
      .map((item: string | any) => {
        const itemText = typeof item === 'string' ? item : item.en || item.zh || '';
        return `  • ${itemText}`;
      })
      .join('\n');

    const parts = [rulesText];
    if (bookingTasks) parts.push(`\n预订任务:\n${bookingTasks}`);
    if (checklistText) parts.push(`\n预订检查清单:\n${checklistText}`);

    const text = `${countryName} 预订规范:\n${parts.join('\n')}`;

    return {
      key: `COUNTRY_BOOKING_${countryCode}`,
      type: 'COUNTRY_BOOKING',
      text,
      priority: 60,
      visibility: 'public',
      provenance: {
        source: 'pack',
        identifier: `countryPack:${countryCode}`,
        version: packData.version,
        timestamp: packData.lastReviewedAt || new Date().toISOString(),
      },
      data: {
        rulesCount: bookingRules.length,
        tasksCount: bookingRules.flatMap((r: any) => r.then?.tasks || []).length,
      },
    };
  }
}