// src/trips/readiness/compilers/facts-to-readiness.compiler.ts

/**
 * Facts to Readiness Compiler
 * 
 * 将 CountryProfile 中的事实数据自动转换为 Readiness Findings
 * 这是一个确定性的编译器，不依赖 LLM
 */

import { Injectable } from '@nestjs/common';
import { ReadinessFinding, ReadinessFindingItem } from '../types/readiness-findings.types';
import { TripContext } from '../types/trip-context.types';
import { getCountryPack } from '../config/country-pack.config';
import type {
  CountryProfileV2Compliance,
  CountryProfileV2EntryRequirements,
  CountryProfileV2TimeBoundaries,
  CountryProfileV2TravelCulture,
} from '../../../countries/types/country-profile-v2.types';

// CountryFacts 接口定义
export interface CountryFacts {
  isoCode: string;
  nameCN: string;
  nameEN?: string;
  currencyCode?: string;
  currencyName?: string;
  paymentType?: 'CASH_HEAVY' | 'BALANCED' | 'DIGITAL_ONLY';
  paymentInfo?: {
    tipping?: string;
    cash_preparation?: string;
    atm_network?: string;
    wallet_apps?: string;
  };
  powerInfo?: {
    voltage?: number;
    frequency?: number;
    plugTypes?: string[];
    note?: string;
  };
  emergency?: {
    police?: string;
    fire?: string;
    medical?: string;
    note?: string;
  };
  visaForCN?: {
    status?: string;
    statusCN?: string;
    requirement?: string;
    requirementCN?: string;
    allowedStay?: string;
    allowedStayCN?: string;
  };
  exchangeRateToCNY?: number;
  exchangeRateToUSD?: number;
  /** CountryProfile V2 扩展字段（与 prismaRowToCountryFacts 对齐） */
  schemaVersion?: number;
  entryRequirements?: CountryProfileV2EntryRequirements;
  complianceInfo?: CountryProfileV2Compliance;
  timeBoundaries?: CountryProfileV2TimeBoundaries;
  travelCulture?: CountryProfileV2TravelCulture;
}

@Injectable()
export class FactsToReadinessCompiler {
  /**
   * 从国家事实生成 Readiness Findings
   */
  compile(facts: CountryFacts, context: TripContext): ReadinessFinding {
    const items: ReadinessFindingItem[] = [];

    // 1. 入境与过境（Entry & Transit）
    items.push(...this.compileEntryTransit(facts, context));

    // 2. 物流与后勤（Logistics）
    items.push(...this.compileLogistics(facts, context));

    // 3. 安全与风险（Safety & Hazards）- 紧急电话
    items.push(...this.compileSafety(facts, context));

    items.push(...this.compileHikingTerrainAndGear(facts, context));

    // 分类
    const blockers: ReadinessFindingItem[] = [];
    const must: ReadinessFindingItem[] = [];
    const should: ReadinessFindingItem[] = [];
    const optional: ReadinessFindingItem[] = [];

    for (const item of items) {
      if (item.level === 'blocker') {
        blockers.push(item);
      } else if (item.level === 'must') {
        must.push(item);
      } else if (item.level === 'should') {
        should.push(item);
      } else if (item.level === 'optional') {
        optional.push(item);
      }
    }

    return {
      destinationId: facts.isoCode,
      packId: `facts.${facts.isoCode.toLowerCase()}`,
      packVersion: '1.0.0',
      blockers,
      must,
      should,
      optional,
      risks: [],
    };
  }

  /**
   * 编译入境与过境规则
   */
  private compileEntryTransit(
    facts: CountryFacts,
    context: TripContext
  ): ReadinessFindingItem[] {
    const items: ReadinessFindingItem[] = [];

    // 签证规则（仅对中国护照）
    if (facts.visaForCN && context.traveler.nationality === 'CN') {
      const visa = facts.visaForCN;
      
      if (visa.status === 'VISA_REQUIRED' || visa.status === 'EVISA' || visa.status === 'VOA') {
        items.push({
          id: `fact.${facts.isoCode}.entry.visa`,
          category: 'entry_transit',
          severity: 'high',
          level: 'must',
          message: `前往 ${facts.nameCN} 需要${visa.statusCN || visa.status}。${visa.requirementCN || visa.requirement || ''}`,
          tasks: [
            {
              title: `办理${visa.statusCN || visa.status}`,
              dueOffsetDays: -45, // 建议提前45天
              tags: ['visa'],
            },
          ],
        });
      } else if (visa.status === 'VISA_FREE') {
        items.push({
          id: `fact.${facts.isoCode}.entry.visa-free`,
          category: 'entry_transit',
          severity: 'low',
          level: 'optional',
          message: `${facts.nameCN} 对中国护照免签，停留期：${visa.allowedStayCN || visa.allowedStay || '请查询最新政策'}`,
        });
      }
    }

    return items;
  }

  /**
   * 编译物流与后勤规则
   */
  private compileLogistics(
    facts: CountryFacts,
    context: TripContext
  ): ReadinessFindingItem[] {
    const items: ReadinessFindingItem[] = [];

    // 电源/插头规则
    if (facts.powerInfo?.plugTypes && facts.powerInfo.plugTypes.length > 0) {
      // 假设用户使用中国插头（A/C型），需要检查是否需要转换插头
      const chinaPlugTypes = ['A', 'C', 'I']; // 中国常用插头类型
      const needsAdapter = !facts.powerInfo.plugTypes.some(pt =>
        chinaPlugTypes.includes(pt)
      );

      if (needsAdapter) {
        items.push({
          id: `fact.${facts.isoCode}.logistics.power-adapter`,
          category: 'logistics',
          severity: 'medium',
          level: 'must',
          message: `${facts.nameCN} 使用 ${facts.powerInfo.plugTypes.join('/')} 型插头，需要准备转换插头。电压：${facts.powerInfo.voltage || '未知'}V，频率：${facts.powerInfo.frequency || '未知'}Hz`,
          tasks: [
            {
              title: '准备转换插头',
              dueOffsetDays: -7,
              tags: ['gear', 'logistics'],
            },
          ],
        });
      }
    }

    // 支付规则
    if (facts.paymentType === 'CASH_HEAVY') {
      items.push({
        id: `fact.${facts.isoCode}.logistics.cash`,
        category: 'logistics',
        severity: 'medium',
        level: 'should',
        message: `${facts.nameCN} 现金使用较多，建议提前准备现金。${facts.paymentInfo?.cash_preparation || ''}`,
        tasks: [
          {
            title: '准备现金或了解 ATM 网络',
            dueOffsetDays: -3,
            tags: ['logistics', 'payment'],
          },
        ],
      });
    }

    // 小费规则
    if (facts.paymentInfo?.tipping) {
      items.push({
        id: `fact.${facts.isoCode}.logistics.tipping`,
        category: 'logistics',
        severity: 'low',
        level: 'optional',
        message: `${facts.nameCN} 小费习惯：${facts.paymentInfo.tipping}`,
      });
    }

    // 货币/汇率规则
    if (facts.currencyCode && context.traveler.nationality === 'CN' && facts.exchangeRateToCNY) {
      items.push({
        id: `fact.${facts.isoCode}.logistics.currency`,
        category: 'logistics',
        severity: 'low',
        level: 'optional',
        message: `${facts.nameCN} 使用 ${facts.currencyName || facts.currencyCode}，汇率参考：1 ${facts.currencyCode} ≈ ${facts.exchangeRateToCNY.toFixed(4)} CNY`,
      });
    }

    return items;
  }

  /**
   * 编译安全规则（紧急电话）
   */
  private compileSafety(
    facts: CountryFacts,
    _context: TripContext
  ): ReadinessFindingItem[] {
    const items: ReadinessFindingItem[] = [];

    if (facts.emergency) {
      const emergency = facts.emergency;
      const numbers: string[] = [];
      
      if (emergency.police) numbers.push(`报警：${emergency.police}`);
      if (emergency.fire) numbers.push(`火警：${emergency.fire}`);
      if (emergency.medical) numbers.push(`医疗：${emergency.medical}`);

      if (numbers.length > 0) {
        items.push({
          id: `fact.${facts.isoCode}.safety.emergency`,
          category: 'safety_hazards',
          severity: 'medium',
          level: 'should',
          message: `${facts.nameCN} 紧急电话：${numbers.join('，')}${emergency.note ? `（${emergency.note}）` : ''}`,
          tasks: [
            {
              title: '保存紧急电话号码',
              dueOffsetDays: -1,
              tags: ['safety'],
            },
          ],
        });
      }
    }

    return items;
  }

  /**
   * 徒步标签行程：合并地形阈值 + 装备核对（与 country-pack terrain 策略对齐）
   */
  compileHikingTerrainAndGear(
    facts: CountryFacts,
    context: TripContext,
  ): ReadinessFindingItem[] {
    const acts = context.itinerary?.activities ?? [];
    const hasHiking = acts.some((a) =>
      /hik|trek|trail|徒步/i.test(a),
    );
    if (!hasHiking) return [];

    const pack = getCountryPack(facts.isoCode);
    const items: ReadinessFindingItem[] = [];
    const thresholds = pack.riskThresholds ?? {};

    if (thresholds.bigAscentDayM != null) {
      items.push({
        id: `fact.${facts.isoCode}.hiking.big-ascent-day`,
        category: 'safety_hazards',
        severity: 'high',
        level: 'must',
        message: `${facts.nameCN} 徒步：建议单日爬升不超过 ${thresholds.bigAscentDayM}m（超出需拆分日程或降低负重）`,
        tasks: [
          {
            title: '核对每日爬升与体能问卷',
            dueOffsetDays: -14,
            tags: ['hiking', 'fitness'],
          },
        ],
      });
    }

    if (thresholds.rapidAscentM != null) {
      items.push({
        id: `fact.${facts.isoCode}.hiking.rapid-ascent`,
        category: 'safety_hazards',
        severity: 'medium',
        level: 'must',
        message: `${facts.nameCN} 徒步：快速爬升阈值 ${thresholds.rapidAscentM}m/日，高海拔行程需留适应日`,
      });
    }

    items.push({
      id: `fact.${facts.isoCode}.hiking.gear-check`,
      category: 'logistics',
      severity: 'medium',
      level: 'must',
      message: `${facts.nameCN} 多日徒步：确认防水装备、导航设备、应急通讯与补给计划`,
      tasks: [
        {
          title: '完成徒步装备核对清单',
          dueOffsetDays: -7,
          tags: ['gear', 'hiking'],
        },
      ],
    });

    return items;
  }
}

