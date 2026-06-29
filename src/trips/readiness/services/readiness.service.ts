// src/trips/readiness/services/readiness.service.ts

/**
 * Readiness Service - 准备度检查主服务
 * 
 * 整合规则引擎、编译器，提供统一的准备度检查接口
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReadinessPack } from '../types/readiness-pack.types';
import { TripContext } from '../types/trip-context.types';
import { ReadinessCheckResult, ReadinessDisclaimer, ReadinessFinding } from '../types/readiness-findings.types';
import { TrustMetricsService } from './trust-metrics.service';
import { ReadinessChecker } from '../engine/readiness-checker';
import { FactsToReadinessCompiler } from '../compilers/facts-to-readiness.compiler';
import { prismaRowToCountryFacts } from '../../../countries/country-profile-v2.mapper';
import { findCountryProfileCompat } from '../../../countries/country-profile-compat.util';
import { ReadinessToConstraintsCompiler } from '../compilers/readiness-to-constraints.compiler';
import { PackStorageService } from '../storage/pack-storage.service';
import { mergeReadinessFindings } from '../utils/readiness-pack-overlay.util';
import { TripWorldState } from '../../decision/world-model';
import { GeoFactsService } from './geo-facts.service';
import { logThrottledDebug } from '../../../common/utils/throttled-debug-log.util';

// 辅助函数：日期计算
function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class ReadinessService {
  private readonly logger = new Logger(ReadinessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly readinessChecker: ReadinessChecker,
    private readonly factsCompiler: FactsToReadinessCompiler,
    private readonly constraintsCompiler: ReadinessToConstraintsCompiler,
    private readonly packStorage: PackStorageService,
    private readonly geoFactsService?: GeoFactsService, // 可选，如果未注入则不使用地理特征
    @Optional() private readonly trustMetricsService?: TrustMetricsService // 可选，信任指标服务
  ) {}

  /**
   * 从 World State 提取 Trip Context
   */
  extractTripContext(state: TripWorldState): TripContext {
    const destination = state.context.destination;
    const startDate = state.context.startDate;
    const endDate = startDate
      ? addDays(startDate, state.context.durationDays - 1)
      : undefined;

    const activitySet = new Set<string>();
    
    for (const date in state.candidatesByDate) {
      const candidates = state.candidatesByDate[date];
      for (const candidate of candidates) {
        // 根据 candidate 的类型和名称推断活动类型
        if (candidate.type === 'tour') {
          activitySet.add('tour');
        }
        if (candidate.type === 'nature') {
          activitySet.add('hiking');
        }
        if (candidate.type === 'sightseeing') {
          activitySet.add('sightseeing');
        }
        // 从名称推断特殊活动
        const name = (candidate.name.en || candidate.name.zh || '').toLowerCase();
        if (name.includes('snowmobile') || name.includes('雪地摩托')) {
          activitySet.add('snowmobile');
        }
        if (name.includes('dog') && (name.includes('sled') || name.includes('拉'))) {
          activitySet.add('dog_sled');
        }
        if (name.includes('boat') || name.includes('船')) {
          activitySet.add('boat_tour');
        }
        if (name.includes('hiking') || name.includes('徒步')) {
          activitySet.add('hiking');
        }
        if (name.includes('wildlife') || name.includes('野生动物')) {
          activitySet.add('wildlife');
        }
        if (name.includes('ice') && name.includes('cave')) {
          activitySet.add('ice_cave');
        }
      }
    }

    // 推断季节（简化版，实际应该根据日期和地理位置计算）
    let season: string | undefined;
    if (startDate) {
      const month = new Date(startDate + 'T00:00:00Z').getUTCMonth() + 1;
      if (month >= 12 || month <= 2) {
        season = 'winter';
      } else if (month >= 6 && month <= 8) {
        season = 'summer';
      } else {
        season = 'shoulder';
      }
    }

    // 检查是否有紧密行程（简化判断）
    const isTightSchedule = state.context.durationDays <= 3;
    const hasTightConnections = false; // 需要从交通信息中判断

    return {
      traveler: {
        nationality: 'CN', // 默认，实际应该从用户画像获取
        budgetLevel: state.context.budget?.style || 'medium',
        riskTolerance: state.context.preferences.riskTolerance || 'medium',
        relianceOnPhone: true, // 默认值
      },
      trip: {
        startDate,
        endDate,
      },
      itinerary: {
        countries: [destination],
        activities: Array.from(activitySet).length > 0 ? Array.from(activitySet) : undefined,
        season,
        isTightSchedule,
        hasTightConnections,
      },
    };
  }

  /**
   * 生成免责声明
   */
  private generateDisclaimer(
    findings: ReadinessFinding[],
    lang: 'en' | 'zh' = 'en'
  ): ReadinessDisclaimer {
    const dataSources: string[] = [];
    const userActionRequired: string[] = [];

    // 收集数据来源和最后更新时间
    for (const finding of findings) {
      dataSources.push(finding.packId);
      if (finding.packVersion) {
        // 尝试从pack中获取lastReviewedAt
        // 这里简化处理，实际应该从pack对象中获取
      }
    }

    // 检查是否有blocker或must级别的签证/保险相关项
    for (const finding of findings) {
      for (const item of [...finding.blockers, ...finding.must]) {
        if (item.category === 'entry_transit') {
          if (lang === 'zh') {
            userActionRequired.push('签证要求');
          } else {
            userActionRequired.push('Visa requirements');
          }
        }
        if (item.category === 'health_insurance') {
          if (lang === 'zh') {
            userActionRequired.push('保险覆盖范围');
          } else {
            userActionRequired.push('Insurance coverage');
          }
        }
      }
    }

    // 去重
    const uniqueUserActions = Array.from(new Set(userActionRequired));

    const message = lang === 'zh'
      ? '本检查结果仅供参考，实际要求以官方机构（如大使馆、移民局、旅游局）的最新政策为准。建议在出发前再次确认关键信息（如签证、保险、健康证明等）。'
      : 'This readiness check result is for reference only. Actual requirements are subject to the latest policies from official authorities (e.g., embassies, immigration offices, tourism boards). Please reconfirm critical information (e.g., visas, insurance, health certificates) before departure.';

    return {
      message,
      dataSources: dataSources.length > 0 ? dataSources : undefined,
      userActionRequired: uniqueUserActions.length > 0 ? uniqueUserActions : undefined,
    };
  }

  /**
   * 检查准备度（从 Pack 文件）
   */
  async checkFromPacks(
    packs: ReadinessPack[],
    context: TripContext,
    lang: 'en' | 'zh' = 'en'
  ): Promise<ReadinessCheckResult> {
    const result = await this.readinessChecker.checkMultipleDestinations(packs, context, lang);
    return {
      ...result,
      disclaimer: this.generateDisclaimer(result.findings, lang),
    };
  }

  /**
   * 检查准备度（从 Pack ID 列表加载）
   */
  async checkFromPackIds(
    packIds: string[],
    context: TripContext
  ): Promise<ReadinessCheckResult> {
    const packs: ReadinessPack[] = [];
    
    for (const id of packIds) {
      const pack = await this.packStorage.loadPack(id);
      if (pack) {
        packs.push(pack);
      }
    }
    
    if (packs.length === 0) {
      this.logger.warn(`No packs loaded from ids: ${packIds.join(', ')}`);
    }

    return this.readinessChecker.checkMultipleDestinations(packs, context);
  }

  /**
   * 检查准备度（自动从目的地加载 Pack，支持地理特征增强）
   */
  async checkFromDestination(
    destinationId: string,
    context: TripContext,
    options?: {
      enhanceWithGeo?: boolean; // 是否使用地理特征增强上下文
      geoLat?: number; // 地理坐标（用于查询地理特征）
      geoLng?: number;
      lang?: 'en' | 'zh'; // 目标语言（默认 'en'）
    }
  ): Promise<ReadinessCheckResult> {
    // 如果启用了地理特征增强且有坐标，则获取地理特征
    let enhancedContext = context;
    if (options?.enhanceWithGeo && options?.geoLat && options?.geoLng && this.geoFactsService) {
      try {
        const geoFeatures = await this.geoFactsService.getGeoFeaturesForPoint(
          options.geoLat,
          options.geoLng
        );
        
        // 将地理特征添加到上下文
        enhancedContext = {
          ...context,
          geo: {
            rivers: {
              nearRiver: geoFeatures.rivers.nearRiver,
              nearestRiverDistanceM: geoFeatures.rivers.nearestRiverDistanceM ?? undefined,
              riverCrossingCount: geoFeatures.rivers.riverCrossingCount,
              riverDensityScore: geoFeatures.rivers.riverDensityScore,
            },
            mountains: {
              inMountain: geoFeatures.mountains.inMountain,
              mountainElevationAvg: geoFeatures.mountains.mountainElevationAvg ?? undefined,
              terrainComplexity: geoFeatures.terrainComplexity,
            },
            roads: {
              nearRoad: geoFeatures.roads.nearRoad,
              roadDensityScore: geoFeatures.roads.roadDensityScore,
            },
            coastlines: {
              nearCoastline: geoFeatures.coastlines.nearCoastline,
              isCoastalArea: geoFeatures.coastlines.isCoastalArea,
            },
            pois: {
              topPickupPoints: geoFeatures.pois.topPickupPoints.map(p => ({
                category: p.category,
                score: p.score,
              })),
              hasHarbour: geoFeatures.pois.hasHarbour,
              trailAccessPoints: geoFeatures.pois.trailAccessPoints.map(t => ({
                poi_id: t.trailheadId,
                category: 'TRAILHEAD',
              })),
              hasEVCharger: geoFeatures.pois.supply?.hasEVCharger || false,
              hasFerryTerminal: geoFeatures.pois.topPickupPoints.some(
                p => p.category === 'FERRY_TERMINAL' || p.category === 'PIER_DOCK'
              ),
            },
            // 西藏特有特征
            altitude_m: geoFeatures.pois.xizang?.avgAltitudeM ?? undefined,
            fuelDensity: geoFeatures.pois.xizang?.fuelDensity ?? undefined,
            checkpointCount: geoFeatures.pois.xizang?.checkpointCount ?? undefined,
            mountainPassCount: geoFeatures.pois.xizang?.mountainPassCount ?? undefined,
            oxygenStationCount: geoFeatures.pois.xizang?.oxygenStationCount ?? undefined,
            latitude: options.geoLat,
          },
        };
      } catch (error) {
        this.logger.warn(`Failed to enhance context with geo features: ${error}`);
        // 如果获取地理特征失败，继续使用原始上下文
      }
    }
    
    const lang = options?.lang || 'en';
    
    // ========== 多级匹配策略 ==========
    
    // 1. 精确 destinationId 匹配
    let pack = await this.packStorage.findPackByDestination(destinationId);
    if (pack) {
      this.logger.debug(`Found pack by exact destinationId: ${destinationId} -> ${pack.packId}`);
      const result = await this.readinessChecker.checkMultipleDestinations([pack], enhancedContext, lang);
      
      // 计算信任指标（如果服务可用）
      let trustMetrics;
      if (this.trustMetricsService) {
        try {
          const tempResult: ReadinessCheckResult = {
            ...result,
            disclaimer: this.generateDisclaimer(result.findings, lang),
          };
          trustMetrics = this.trustMetricsService.calculateTrustMetrics(tempResult, lang);
        } catch (error) {
          this.logger.warn(`计算信任指标失败: ${error}`);
        }
      }

      return {
        ...result,
        disclaimer: this.generateDisclaimer(result.findings, lang),
        trustMetrics,
      };
    }

    // 2. 解析 destinationId，提取城市和地区信息
    const parts = destinationId.split('-');
    const countryCode = parts[0];
    const cityOrRegion = parts.slice(1).join('-');

    // 3. 城市名称匹配（如果 destinationId 包含城市信息）
    if (cityOrRegion) {
      // 尝试直接匹配城市名（不区分大小写）
      pack = await this.packStorage.findPackByCity(cityOrRegion, countryCode);
      if (pack) {
        this.logger.debug(`Found pack by city: ${cityOrRegion} -> ${pack.packId}`);
        const result = await this.readinessChecker.checkMultipleDestinations([pack], enhancedContext, lang);
        
        // 计算信任指标（如果服务可用）
        let trustMetrics;
        if (this.trustMetricsService) {
          try {
            const tempResult: ReadinessCheckResult = {
              ...result,
              disclaimer: this.generateDisclaimer(result.findings, lang),
            };
            trustMetrics = this.trustMetricsService.calculateTrustMetrics(tempResult, lang);
          } catch (error) {
            this.logger.warn(`计算信任指标失败: ${error}`);
          }
        }

        return {
          ...result,
          disclaimer: this.generateDisclaimer(result.findings, lang),
          trustMetrics,
        };
      }

      // 尝试匹配城市名的变体（例如 "ROVANIEMI" vs "Rovaniemi"）
      const cityNameVariants = [
        cityOrRegion,
        cityOrRegion.charAt(0).toUpperCase() + cityOrRegion.slice(1).toLowerCase(),
        cityOrRegion.toLowerCase(),
        cityOrRegion.toUpperCase(),
      ];

      for (const variant of cityNameVariants) {
        pack = await this.packStorage.findPackByCity(variant, countryCode);
        if (pack) {
          this.logger.debug(`Found pack by city variant: ${variant} -> ${pack.packId}`);
          const result = await this.readinessChecker.checkMultipleDestinations([pack], enhancedContext, lang);
          
          // 计算信任指标（如果服务可用）
          let trustMetrics;
          if (this.trustMetricsService) {
            try {
              const tempResult: ReadinessCheckResult = {
                ...result,
                disclaimer: this.generateDisclaimer(result.findings, lang),
              };
              trustMetrics = this.trustMetricsService.calculateTrustMetrics(tempResult, lang);
            } catch (error) {
              this.logger.warn(`计算信任指标失败: ${error}`);
            }
          }

          return {
            ...result,
            disclaimer: this.generateDisclaimer(result.findings, lang),
            trustMetrics,
          };
        }
      }
    }

    // 4. Region 匹配（如果 destinationId 包含 region 信息）
    if (cityOrRegion) {
      const regionPacks = await this.packStorage.findPacksByRegion(cityOrRegion);
      if (regionPacks.length > 0) {
        this.logger.debug(`Found ${regionPacks.length} pack(s) by region: ${cityOrRegion}`);
        const result = await this.readinessChecker.checkMultipleDestinations(regionPacks, enhancedContext, lang);
        
        // 计算信任指标（如果服务可用）
        let trustMetrics;
        if (this.trustMetricsService) {
          try {
            const tempResult: ReadinessCheckResult = {
              ...result,
              disclaimer: this.generateDisclaimer(result.findings, lang),
            };
            trustMetrics = this.trustMetricsService.calculateTrustMetrics(tempResult, lang);
          } catch (error) {
            this.logger.warn(`计算信任指标失败: ${error}`);
          }
        }

        return {
          ...result,
          disclaimer: this.generateDisclaimer(result.findings, lang),
          trustMetrics,
        };
      }

      // 尝试 region 名称的变体
      const regionVariants = [
        cityOrRegion,
        cityOrRegion.charAt(0).toUpperCase() + cityOrRegion.slice(1).toLowerCase(),
        cityOrRegion.toLowerCase(),
        cityOrRegion.toUpperCase(),
      ];

      for (const variant of regionVariants) {
        const variantPacks = await this.packStorage.findPacksByRegion(variant);
        if (variantPacks.length > 0) {
          this.logger.debug(`Found ${variantPacks.length} pack(s) by region variant: ${variant}`);
          const result = await this.readinessChecker.checkMultipleDestinations(variantPacks, enhancedContext, lang);
          return {
            ...result,
            disclaimer: this.generateDisclaimer(result.findings, lang),
          };
        }
      }
    }

    // 5. 坐标匹配（如果提供了坐标）
    if (options?.geoLat && options?.geoLng) {
      pack = await this.packStorage.findNearestPack(
        options.geoLat,
        options.geoLng,
        50 // 50km 阈值
      );
      if (pack) {
        this.logger.debug(`Found pack by coordinates: (${options.geoLat}, ${options.geoLng}) -> ${pack.packId}`);
        const result = await this.readinessChecker.checkMultipleDestinations([pack], enhancedContext, lang);
        return {
          ...result,
          disclaimer: this.generateDisclaimer(result.findings, lang),
        };
      }
    }

    // 6. 国家代码匹配（降级策略）
    if (countryCode) {
      const packs = await this.packStorage.findPacksByCountry(countryCode);
      if (packs.length > 0) {
        logThrottledDebug(
          this.logger,
          `readiness:pack:country:${countryCode}`,
          `Found ${packs.length} pack(s) by country: ${countryCode} (strict derivation)`,
        );
        const result = await this.checkPacksWithCountryDerivation(
          packs,
          countryCode,
          enhancedContext,
          lang,
        );
        return this.finalizeCheckResult(result, lang);
      }
    }

    // 7. 无 ReadinessPack 时回退 CountryProfile V2 事实层
    if (countryCode && /^[A-Za-z]{2}$/.test(countryCode)) {
      this.logger.debug(
        `No pack for destination ${destinationId}; falling back to CountryProfile facts: ${countryCode}`,
      );
      return this.checkFromCountryFacts([countryCode.toUpperCase()], enhancedContext, lang);
    }

    this.logger.warn(`No pack found for destination: ${destinationId}`);
    return {
      findings: [],
      summary: {
        totalBlockers: 0,
        totalMust: 0,
        totalShould: 0,
        totalOptional: 0,
        totalRisks: 0,
      },
      disclaimer: this.generateDisclaimer([], lang),
    };
  }

  /**
   * Phase 3: Profile-derived Findings + Pack overlay (dynamic `when` only).
   */
  async checkCountryStrictDerivation(
    countryCode: string,
    packs: ReadinessPack[],
    context: TripContext,
    lang: 'en' | 'zh' = 'en',
  ): Promise<ReadinessCheckResult> {
    const iso = countryCode.toUpperCase();
    const factsResult = await this.checkFromCountryFacts([iso], context, lang);
    let merged = factsResult.findings.find((f) => f.destinationId === iso) ?? factsResult.findings[0];

    if (!merged && packs.length === 0) {
      return {
        findings: [],
        summary: {
          totalBlockers: 0,
          totalMust: 0,
          totalShould: 0,
          totalOptional: 0,
          totalRisks: 0,
        },
        disclaimer: this.generateDisclaimer([], lang),
      };
    }

    if (!merged) {
      return this.checkFromPacks(packs, context, lang);
    }

    for (const pack of packs) {
      const overlay = this.readinessChecker.checkPackOverlay(pack, context, lang);
      merged = mergeReadinessFindings(merged, overlay);
    }

    const findings = [merged];
    const summary = {
      totalBlockers: findings.reduce((sum, f) => sum + f.blockers.length, 0),
      totalMust: findings.reduce((sum, f) => sum + f.must.length, 0),
      totalShould: findings.reduce((sum, f) => sum + f.should.length, 0),
      totalOptional: findings.reduce((sum, f) => sum + f.optional.length, 0),
      totalRisks: findings.reduce((sum, f) => sum + f.risks.length, 0),
    };

    return {
      findings,
      summary,
      disclaimer: this.generateDisclaimer(findings, lang),
    };
  }

  /**
   * Merged finding for Context blocks (Strict Derivation).
   */
  async getMergedCountryFinding(
    countryCode: string,
    context: TripContext,
    pack?: ReadinessPack | null,
  ): Promise<ReadinessFinding | null> {
    const packs = pack ? [pack] : [];
    const result = await this.checkCountryStrictDerivation(
      countryCode,
      packs as ReadinessPack[],
      context,
    );
    return result.findings[0] ?? null;
  }

  private async checkPacksWithCountryDerivation(
    packs: ReadinessPack[],
    countryCode: string | undefined,
    context: TripContext,
    lang: 'en' | 'zh',
  ): Promise<ReadinessCheckResult> {
    if (countryCode && /^[A-Za-z]{2}$/.test(countryCode)) {
      return this.checkCountryStrictDerivation(countryCode, packs, context, lang);
    }
    return this.checkFromPacks(packs, context, lang);
  }

  private finalizeCheckResult(
    result: ReadinessCheckResult,
    lang: 'en' | 'zh',
  ): Promise<ReadinessCheckResult> {
    let trustMetrics;
    if (this.trustMetricsService) {
      try {
        const tempResult: ReadinessCheckResult = {
          ...result,
          disclaimer: this.generateDisclaimer(result.findings, lang),
        };
        trustMetrics = this.trustMetricsService.calculateTrustMetrics(tempResult, lang);
      } catch (error) {
        this.logger.warn(`计算信任指标失败: ${error}`);
      }
    }
    return Promise.resolve({
      ...result,
      disclaimer: this.generateDisclaimer(result.findings, lang),
      trustMetrics,
    });
  }

  /**
   * 检查准备度（从国家事实）
   */
  async checkFromCountryFacts(
    countryCodes: string[],
    context: TripContext,
    lang: 'en' | 'zh' = 'en'
  ): Promise<ReadinessCheckResult> {
    const findings: any[] = [];

    for (const countryCode of countryCodes) {
      const profile = await findCountryProfileCompat(
        this.prisma,
        countryCode.toUpperCase(),
      );

      if (!profile) {
        this.logger.warn(`Country profile not found: ${countryCode}`);
        continue;
      }

      const facts = prismaRowToCountryFacts(profile);
      const finding = this.factsCompiler.compile(facts, context);
      findings.push(finding);
    }

    const summary = {
      totalBlockers: findings.reduce((sum, f) => sum + f.blockers.length, 0),
      totalMust: findings.reduce((sum, f) => sum + f.must.length, 0),
      totalShould: findings.reduce((sum, f) => sum + f.should.length, 0),
      totalOptional: findings.reduce((sum, f) => sum + f.optional.length, 0),
      totalRisks: findings.reduce((sum, f) => sum + f.risks.length, 0),
    };

    return {
      findings,
      summary,
      disclaimer: this.generateDisclaimer(findings, lang),
    };
  }

  /**
   * 检查准备度（混合：Pack + Facts）
   */
  async check(
    packs: ReadinessPack[],
    countryCodes: string[],
    context: TripContext,
    lang: 'en' | 'zh' = 'en'
  ): Promise<ReadinessCheckResult> {
    const isoCodes = countryCodes
      .map((c) => c.toUpperCase())
      .filter((c) => /^[A-Z]{2}$/.test(c));

    if (isoCodes.length === 1) {
      return this.checkCountryStrictDerivation(isoCodes[0], packs, context, lang);
    }

    const findings: ReadinessFinding[] = [];
    for (const iso of isoCodes) {
      const r = await this.checkCountryStrictDerivation(iso, [], context, lang);
      if (r.findings[0]) findings.push(r.findings[0]);
    }
    if (packs.length > 0) {
      const packOnly = await this.checkFromPacks(packs, context, lang);
      for (const pf of packOnly.findings) {
        const idx = findings.findIndex((f) => f.destinationId === pf.destinationId);
        if (idx >= 0) {
          findings[idx] = mergeReadinessFindings(findings[idx], pf);
        } else {
          findings.push(pf);
        }
      }
    }

    const summary = {
      totalBlockers: findings.reduce((sum, f) => sum + f.blockers.length, 0),
      totalMust: findings.reduce((sum, f) => sum + f.must.length, 0),
      totalShould: findings.reduce((sum, f) => sum + f.should.length, 0),
      totalOptional: findings.reduce((sum, f) => sum + f.optional.length, 0),
      totalRisks: findings.reduce((sum, f) => sum + f.risks.length, 0),
    };

    return this.finalizeCheckResult({ findings, summary }, lang);
  }

  /**
   * 获取准备度约束（用于决策层）
   */
  async getConstraints(
    result: ReadinessCheckResult
  ): Promise<ReturnType<ReadinessToConstraintsCompiler['compile']>> {
    return this.constraintsCompiler.compile(result);
  }

  /**
   * 获取准备任务列表（用于 Action Planner）
   */
  async getTasks(
    result: ReadinessCheckResult
  ): Promise<ReturnType<ReadinessToConstraintsCompiler['extractTasks']>> {
    return this.constraintsCompiler.extractTasks(result);
  }

  /**
   * P2: 获取目的地的地理特征
   * 用于自动增强能力包评估参数
   */
  async getGeoFactsForDestination(destinationId: string): Promise<TripContext['geo'] | null> {
    // 目的地默认坐标映射（可扩展）
    const destinationCoords: Record<string, { lat: number; lng: number }> = {
      'IS': { lat: 64.9631, lng: -19.0208 }, // 冰岛中心点
      'CN-XZ': { lat: 29.6500, lng: 91.1000 }, // 西藏拉萨
      'NO': { lat: 60.4720, lng: 8.4689 }, // 挪威
      'NZ': { lat: -40.9006, lng: 174.8860 }, // 新西兰
    };

    const coords = destinationCoords[destinationId];
    if (!coords || !this.geoFactsService) {
      return null;
    }

    try {
      const geoFeatures = await this.geoFactsService.getGeoFeaturesForPoint(
        coords.lat,
        coords.lng,
        {
          densityBufferKm: 50,
          poiRadiusKm: 100,
        }
      );

      return {
        latitude: coords.lat,
        longitude: coords.lng,
        rivers: {
          ...geoFeatures.rivers,
          nearestRiverDistanceM: geoFeatures.rivers.nearestRiverDistanceM ?? undefined,
        },
        mountains: {
          ...geoFeatures.mountains,
          mountainElevationAvg: geoFeatures.mountains.mountainElevationAvg ?? undefined,
        },
        roads: geoFeatures.roads,
        coastlines: geoFeatures.coastlines,
        pois: geoFeatures.pois as any,
      };
    } catch (error) {
      this.logger.warn(`Failed to get geo facts for ${destinationId}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 映射准备度类别到三人格（用于决策日志）
   * 
   * 映射规则：
   * - safety_hazards, entry_transit, health_insurance → ABU (Gatekeeper)
   * - gear_packing, activities_bookings → DR_DRE (Pace)
   * - logistics → NEPTUNE (LocalInsight)
   */
  mapCategoryToPersona(category: string): 'ABU' | 'DR_DRE' | 'NEPTUNE' {
    switch (category) {
      case 'safety_critical':
      case 'safety_hazards':
      case 'entry_transit':
      case 'health_insurance':
        return 'ABU';
      case 'gear_packing':
      case 'activities_bookings':
        return 'DR_DRE';
      case 'logistics':
      case 'logistics_critical':
        return 'NEPTUNE';
      default:
        return 'ABU'; // 默认映射到 ABU
    }
  }

  /**
   * 从 ReadinessCheckResult 生成决策日志条目
   * 
   * 用于集成到三人格系统的决策日志中
   */
  generateDecisionLogEntries(
    result: ReadinessCheckResult,
    requestId: string
  ): Array<{
    request_id: string;
    step: 'GATE_EVAL';
    actor: 'Gatekeeper';
    inputs_summary: string;
    outputs_summary: string;
    evidence_refs: string[];
    timestamp: string;
    metadata?: Record<string, any>;
  }> {
    const entries: any[] = [];
    const timestamp = new Date().toISOString();

    for (const finding of result.findings) {
      // 处理 blocker
      for (const blocker of finding.blockers) {
        const explanation = typeof blocker.message === 'string' 
          ? blocker.message 
          : (blocker.message as any)?.zh || (blocker.message as any)?.en || '';
        
        entries.push({
          request_id: requestId,
          step: 'GATE_EVAL' as const,
          actor: 'Gatekeeper' as const,
          inputs_summary: `准备度检查：规则 ${blocker.id} (${blocker.category})`,
          outputs_summary: `BLOCK: ${explanation.substring(0, 100)}${explanation.length > 100 ? '...' : ''}`,
          evidence_refs: blocker.evidence?.map((e: any) => e.sourceId) || [],
          timestamp,
          metadata: {
            ruleId: blocker.id,
            category: blocker.category,
            severity: blocker.severity,
            level: blocker.level,
            userDecision: (blocker as any).userDecision, // 如果有用户决策（类型断言）
          },
        });
      }

      // 处理 must
      for (const must of finding.must) {
        const explanation = typeof must.message === 'string'
          ? must.message
          : (must.message as any)?.zh || (must.message as any)?.en || '';
        
        entries.push({
          request_id: requestId,
          step: 'GATE_EVAL' as const,
          actor: 'Gatekeeper' as const,
          inputs_summary: `准备度检查：规则 ${must.id} (${must.category})`,
          outputs_summary: `ADJUST: ${explanation.substring(0, 100)}${explanation.length > 100 ? '...' : ''}`,
          evidence_refs: must.evidence?.map((e: any) => e.sourceId) || [],
          timestamp,
          metadata: {
            ruleId: must.id,
            category: must.category,
            severity: must.severity,
            level: must.level,
            userDecision: (must as any).userDecision, // 如果有用户决策（类型断言）
          },
        });
      }
    }

    return entries;
  }
}

