// src/trips/readiness/services/readiness.service.ts

/**
 * Readiness Service - 准备度检查主服务
 * 
 * 整合规则引擎、编译器，提供统一的准备度检查接口
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReadinessPack } from '../types/readiness-pack.types';
import { TripContext } from '../types/trip-context.types';
import { ReadinessCheckResult } from '../types/readiness-findings.types';
import { ReadinessChecker } from '../engine/readiness-checker';
import { FactsToReadinessCompiler } from '../compilers/facts-to-readiness.compiler';
import type { CountryFacts } from '../compilers/facts-to-readiness.compiler';
import { ReadinessToConstraintsCompiler } from '../compilers/readiness-to-constraints.compiler';
import { PackStorageService } from '../storage/pack-storage.service';
import { TripWorldState, ISODate } from '../../decision/world-model';
import { GeoFactsService, GeoFeatures } from './geo-facts.service';

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
    private readonly geoFactsService?: GeoFactsService // 可选，如果未注入则不使用地理特征
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

    // 从 activities 中提取活动类型
    const activities: string[] = [];
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
   * 检查准备度（从 Pack 文件）
   */
  async checkFromPacks(
    packs: ReadinessPack[],
    context: TripContext
  ): Promise<ReadinessCheckResult> {
    return this.readinessChecker.checkMultipleDestinations(packs, context);
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
      return this.readinessChecker.checkMultipleDestinations([pack], enhancedContext, lang);
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
        return this.readinessChecker.checkMultipleDestinations([pack], enhancedContext, lang);
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
          return this.readinessChecker.checkMultipleDestinations([pack], enhancedContext, lang);
        }
      }
    }

    // 4. Region 匹配（如果 destinationId 包含 region 信息）
    if (cityOrRegion) {
      const regionPacks = await this.packStorage.findPacksByRegion(cityOrRegion);
      if (regionPacks.length > 0) {
        this.logger.debug(`Found ${regionPacks.length} pack(s) by region: ${cityOrRegion}`);
        return this.readinessChecker.checkMultipleDestinations(regionPacks, enhancedContext, lang);
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
          return this.readinessChecker.checkMultipleDestinations(variantPacks, enhancedContext, lang);
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
        return this.readinessChecker.checkMultipleDestinations([pack], enhancedContext, lang);
      }
    }

    // 6. 国家代码匹配（降级策略）
    if (countryCode) {
      const packs = await this.packStorage.findPacksByCountry(countryCode);
      if (packs.length > 0) {
        this.logger.debug(`Found ${packs.length} pack(s) by country: ${countryCode}`);
        // 如果有多个国家级别的 packs，返回所有（让规则引擎处理）
        // 或者可以选择最通用的 pack（如果有优先级标记）
        return this.readinessChecker.checkMultipleDestinations(packs, enhancedContext, lang);
      }
    }

    // 7. 如果都没有找到，返回空结果
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
    };
  }

  /**
   * 检查准备度（从国家事实）
   */
  async checkFromCountryFacts(
    countryCodes: string[],
    context: TripContext
  ): Promise<ReadinessCheckResult> {
    const findings: any[] = [];

    for (const countryCode of countryCodes) {
      const profile = await this.prisma.countryProfile.findUnique({
        where: { isoCode: countryCode.toUpperCase() },
      });

      if (!profile) {
        this.logger.warn(`Country profile not found: ${countryCode}`);
        continue;
      }

      // 转换为 CountryFacts 格式
      const facts: CountryFacts = {
        isoCode: profile.isoCode,
        nameCN: profile.nameCN,
        nameEN: profile.nameEN || undefined,
        currencyCode: profile.currencyCode || undefined,
        currencyName: profile.currencyName || undefined,
        paymentType: profile.paymentType || undefined,
        paymentInfo: profile.paymentInfo as any,
        powerInfo: profile.powerInfo as any,
        emergency: profile.emergency as any,
        visaForCN: profile.visaForCN as any,
        exchangeRateToCNY: profile.exchangeRateToCNY || undefined,
        exchangeRateToUSD: profile.exchangeRateToUSD || undefined,
      };

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
    };
  }

  /**
   * 检查准备度（混合：Pack + Facts）
   */
  async check(
    packs: ReadinessPack[],
    countryCodes: string[],
    context: TripContext
  ): Promise<ReadinessCheckResult> {
    const packFindings = await this.checkFromPacks(packs, context);
    const factsFindings = await this.checkFromCountryFacts(countryCodes, context);

    // 合并结果
    const allFindings = [...packFindings.findings, ...factsFindings.findings];
    const summary = {
      totalBlockers: allFindings.reduce((sum, f) => sum + f.blockers.length, 0),
      totalMust: allFindings.reduce((sum, f) => sum + f.must.length, 0),
      totalShould: allFindings.reduce((sum, f) => sum + f.should.length, 0),
      totalOptional: allFindings.reduce((sum, f) => sum + f.optional.length, 0),
      totalRisks: allFindings.reduce((sum, f) => sum + f.risks.length, 0),
    };

    return {
      findings: allFindings,
      summary,
    };
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
}

