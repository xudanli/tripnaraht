// src/railpass/services/eligibility-engine.service.ts

/**
 * Pass 合规引擎 (Eligibility & Compliance Engine)
 * 
 * 根据用户居住国、旅行国家集合判断应该使用 Eurail 还是 Interrail
 * 并检查合规约束（尤其是 Interrail 的居住国 outbound/inbound 规则）
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  PassFamily,
  EligibilityResult,
  ISODate,
} from '../interfaces/railpass.interface';

/**
 * 欧洲国家代码列表（用于判断是否在欧洲）
 * ISO 3166-1 alpha-2
 */
const EUROPE_COUNTRIES = new Set([
  'AL', 'AD', 'AT', 'BY', 'BE', 'BA', 'BG', 'HR', 'CY', 'CZ', 'DK',
  'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'XK', 'LV',
  'LI', 'LT', 'LU', 'MT', 'MD', 'MC', 'ME', 'NL', 'MK', 'NO', 'PL',
  'PT', 'RO', 'RU', 'SM', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH', 'UA',
  'GB', 'VA',
]);

@Injectable()
export class EligibilityEngineService {
  private readonly logger = new Logger(EligibilityEngineService.name);

  /**
   * 检查合规性
   * 
   * @param residencyCountry 用户居住国（ISO 3166-1 alpha-2）
   * @param travelCountries 旅行国家集合
   * @param isCrossResidencyCountry 是否跨居住国
   * @param departureDate 出行日期
   * @returns 合规检查结果
   */
  checkEligibility(args: {
    residencyCountry: string;
    travelCountries: string[];
    isCrossResidencyCountry?: boolean;
    departureDate: ISODate;
  }): EligibilityResult {
    const { residencyCountry, travelCountries, isCrossResidencyCountry, departureDate } = args;

    // 判断 Pass Family
    const recommendedPassFamily = this.determinePassFamily(residencyCountry);

    const constraints: string[] = [];
    const warnings: string[] = [];

    // Eurail 规则：非欧洲居住者
    if (recommendedPassFamily === 'EURAIL') {
      constraints.push('必须购买 Eurail Pass（非欧洲居住者）');
      constraints.push('可在欧洲 33 个国家使用');
    }

    // Interrail 规则：欧洲居住者
    if (recommendedPassFamily === 'INTERRAIL') {
      constraints.push('必须购买 Interrail Pass（欧洲居住者）');
      constraints.push('可在除居住国外的欧洲国家使用');

      // Interrail 居住国限制规则
      if (isCrossResidencyCountry || travelCountries.includes(residencyCountry)) {
        const homeCountryRules = this.checkInterrailHomeCountryRules({
          residencyCountry,
          travelCountries,
        });

        if (homeCountryRules) {
          if (!homeCountryRules.outboundAllowed || !homeCountryRules.inboundAllowed) {
            warnings.push(`Interrail 在居住国 ${residencyCountry} 仅允许 outbound 和 inbound 各一次`);
          }

          return {
            eligible: homeCountryRules.outboundAllowed && homeCountryRules.inboundAllowed,
            recommendedPassFamily,
            constraints,
            warnings,
            homeCountryRules,
          };
        }
      } else {
        // 不在居住国旅行，无需检查居住国规则
        constraints.push('不在居住国旅行，无居住国使用限制');
      }
    }

    return {
      eligible: true,
      recommendedPassFamily,
      constraints,
      warnings,
    };
  }

  /**
   * 确定 Pass Family
   * 
   * 规则：
   * - 如果居住国在欧洲 → Interrail
   * - 如果居住国不在欧洲 → Eurail
   */
  private determinePassFamily(residencyCountry: string): PassFamily {
    // 判断是否在欧洲（使用 ISO 3166-1 alpha-2 代码）
    const isEuropeanResident = EUROPE_COUNTRIES.has(residencyCountry.toUpperCase());

    return isEuropeanResident ? 'INTERRAIL' : 'EURAIL';
  }

  /**
   * 检查 Interrail 居住国规则
   * 
   * 规则：
   * - Interrail 在居住国只能使用两次：outbound（去边境/机场/港口）+ inbound（从边境/机场/港口回来）
   * - 这两次必须在同一个 Travel Day 内完成居住国境内的多段列车衔接
   * - 这两次消耗 Pass 的 Travel Day（不是额外送的）
   */
  private checkInterrailHomeCountryRules(args: {
    residencyCountry: string;
    travelCountries: string[];
  }): EligibilityResult['homeCountryRules'] | null {
    const { residencyCountry, travelCountries } = args;

    // 如果不在居住国旅行，无需检查
    if (!travelCountries.includes(residencyCountry)) {
      return null;
    }

    // Interrail 居住国限制：outbound 和 inbound 各允许 1 次
    const maxAllowed = 1;

    return {
      outboundAllowed: true, // 初始状态，允许 outbound
      inboundAllowed: true,  // 初始状态，允许 inbound
      outboundUsed: 0,       // 初始状态，未使用
      inboundUsed: 0,        // 初始状态，未使用
      maxAllowed,
      explanation: `Interrail 在居住国 ${residencyCountry} 仅允许使用两次：outbound（出境）和 inbound（入境）各一次，且必须在同一个 Travel Day 内完成。这两次会消耗 Pass 的 Travel Day。`,
    };
  }

  /**
   * 验证已使用的居住国次数（用于已有行程的合规检查）
   */
  validateHomeCountryUsage(args: {
    passFamily: PassFamily;
    residencyCountry: string;
    outboundUsed: number;
    inboundUsed: number;
  }): {
    valid: boolean;
    violations: string[];
  } {
    const { passFamily, residencyCountry, outboundUsed, inboundUsed } = args;

    if (passFamily !== 'INTERRAIL') {
      // Eurail 无居住国限制
      return { valid: true, violations: [] };
    }

    const violations: string[] = [];

    if (outboundUsed > 1) {
      violations.push(`Interrail 在居住国 ${residencyCountry} 的 outbound 使用次数超过限制（已用 ${outboundUsed}，最多 1 次）`);
    }

    if (inboundUsed > 1) {
      violations.push(`Interrail 在居住国 ${residencyCountry} 的 inbound 使用次数超过限制（已用 ${inboundUsed}，最多 1 次）`);
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }
}
