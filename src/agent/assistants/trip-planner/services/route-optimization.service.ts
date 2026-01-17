// src/agent/assistants/trip-planner/services/route-optimization.service.ts
/**
 * 路线优化服务
 * 
 * 集成现有 Skills：
 * - itinerary.verify - 行程验证
 * - transport.search - 交通搜索
 * 
 * 职责：
 * - 硬门控检查（不可行直接拒绝）
 * - 软评分（可调优）
 * - 替代方案生成
 * - 可解释证据输出
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { 
  RouteOptimizationEvidence, 
  RouteOptimizationRequest,
  RouteOptimizationMetrics,
  HardGateResult,
  SoftScoreResult,
  RouteAlternative,
  DataTimestamp,
  NextStepAction,
} from '../interfaces/route-optimization.interface';
import { TripContext, TripDayContext, TripItemContext } from '../interfaces/trip-planner.interface';
import { ItineraryVerifySkill, ItineraryVerifyOutput } from '../../../../skills/itinerary/itinerary-verify.skill';
import { TransportSearchSkill, TransportSearchOutput } from '../../../../skills/transport/transport-search.skill';
import { OpeningHoursGetSkill, OpeningHoursGetOutput } from '../../../../skills/places/opening-hours-get.skill';
import { DemGetProfileSkill, DemGetProfileOutput } from '../../../../skills/dem/dem-get-profile.skill';
import { GeoCheckHazardZonesSkill, GeoCheckHazardZonesOutput } from '../../../../skills/geo/geo-check-hazard-zones.skill';
import { Itinerary, ItineraryDay, ItineraryItem } from '../../../interfaces/trip-plan.interface';

/**
 * 交通验证结果
 */
interface TransportVerificationResult {
  origin: string;
  destination: string;
  isReachable: boolean;
  bestOption?: {
    mode: string;
    duration_minutes: number;
    distance_meters?: number;
  };
  allOptions: Array<{
    mode: string;
    duration_minutes: number;
  }>;
  error?: string;
}

/**
 * 开放时间验证结果
 */
interface OpeningHoursVerificationResult {
  poiId: string;
  poiName: string;
  hasOpeningHours: boolean;
  openingHours?: string;
  isOpenNow?: boolean;
  plannedTime?: string;
  isConflict: boolean;
  conflictDetail?: string;
}

@Injectable()
export class RouteOptimizationService {
  private readonly logger = new Logger(RouteOptimizationService.name);

  // 城市坐标（用于距离计算）
  private readonly CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
    '北京': { lat: 39.9042, lng: 116.4074 },
    '上海': { lat: 31.2304, lng: 121.4737 },
    '广州': { lat: 23.1291, lng: 113.2644 },
    '深圳': { lat: 22.5431, lng: 114.0579 },
    '杭州': { lat: 30.2741, lng: 120.1551 },
    '南京': { lat: 32.0603, lng: 118.7969 },
    '苏州': { lat: 31.2989, lng: 120.5853 },
    '成都': { lat: 30.5728, lng: 104.0668 },
    '重庆': { lat: 29.4316, lng: 106.9123 },
    '武汉': { lat: 30.5928, lng: 114.3055 },
    '西安': { lat: 34.3416, lng: 108.9398 },
    '天津': { lat: 39.3434, lng: 117.3616 },
    '东京': { lat: 35.6762, lng: 139.6503 },
    '大阪': { lat: 34.6937, lng: 135.5023 },
    '京都': { lat: 35.0116, lng: 135.7681 },
  };

  // 地标 → 城市映射
  private readonly LANDMARK_CITY_MAP: Record<string, string> = {
    '故宫': '北京', '天安门': '北京', '长城': '北京', '颐和园': '北京',
    '外滩': '上海', '东方明珠': '上海', '豫园': '上海',
    '西湖': '杭州', '灵隐寺': '杭州', '雷峰塔': '杭州', '梦想小镇': '杭州',
    '夫子庙': '南京', '中山陵': '南京',
    '东京塔': '东京', '浅草寺': '东京', '秋叶原': '东京',
    '大阪城': '大阪', '道顿堀': '大阪',
    '清水寺': '京都', '伏见稻荷': '京都', '金阁寺': '京都',
  };

  constructor(
    @Optional() private readonly itineraryVerifySkill?: ItineraryVerifySkill,
    @Optional() private readonly transportSearchSkill?: TransportSearchSkill,
    @Optional() private readonly openingHoursSkill?: OpeningHoursGetSkill,
    @Optional() private readonly demGetProfileSkill?: DemGetProfileSkill,
    @Optional() private readonly geoCheckHazardZonesSkill?: GeoCheckHazardZonesSkill,
  ) {
    this.logger.log('[RouteOptimizationService] 初始化完成');
    this.logger.debug(`Skills 注入状态: ItineraryVerify=${!!itineraryVerifySkill}, TransportSearch=${!!transportSearchSkill}, OpeningHours=${!!openingHoursSkill}, DemGetProfile=${!!demGetProfileSkill}, GeoCheckHazardZones=${!!geoCheckHazardZonesSkill}`);
  }

  /**
   * 优化路线并生成证据
   */
  async optimizeRoute(
    ctx: TripContext,
    request?: RouteOptimizationRequest,
  ): Promise<RouteOptimizationEvidence> {
    const startTime = Date.now();
    const evidenceId = `route_evidence_${uuidv4().slice(0, 8)}`;

    this.logger.debug(`[路线优化] 开始优化: tripId=${ctx.tripId}`);

    // 保存 ctx 和 request 用于后续查找活动名称和权重配置
    this.currentContext = ctx;
    this.currentRequest = request;

    // 🆕 0. 收集 DEM 数据（如果可用）
    let demData: DemGetProfileOutput | undefined;
    if (this.demGetProfileSkill) {
      try {
        const polyline = this.extractPolylineFromContext(ctx);
        if (polyline.length >= 2) {
          demData = await this.demGetProfileSkill.execute({
            polyline,
            samples: 100,
          });
          this.logger.debug(`[路线优化] DEM 数据获取成功: 累计爬升=${demData.cumulativeAscent}m, 最大坡度=${demData.maxSlope}%`);
        }
      } catch (error) {
        this.logger.warn(`[路线优化] DEM 数据获取失败: ${error}`);
      }
    }

    // 1. 收集硬门控结果
    const hardGates = await this.evaluateHardGates(ctx);

    // 2. 计算软评分（使用 DEM 数据）
    const softScores = this.calculateSoftScores(ctx, demData);

    // 3. 提取关键特征
    const keyFeatures = this.extractKeyFeatures(ctx, hardGates);

    // 4. 调用 itinerary.verify skill（如果可用）
    let rawVerification: RouteOptimizationEvidence['raw_verification'];
    if (this.itineraryVerifySkill) {
      try {
        const itinerary = this.convertToItinerary(ctx);
        const verifyResult = await this.itineraryVerifySkill.execute({
          itinerary,
          research_data: {},
        });
        rawVerification = {
          verified: verifyResult.verified,
          issues: verifyResult.issues,
          summary: verifyResult.summary,
        };

        // 合并 itinerary.verify 的问题到硬门控（会去重）
        this.mergeVerificationIssues(hardGates, verifyResult, ctx);
      } catch (error) {
        this.logger.warn(`[路线优化] itinerary.verify 调用失败: ${error}`);
      }
    }

    // 5. 🆕 去重和合并相同的问题
    const deduplicatedGates = this.deduplicateHardGates(hardGates);

    // 6. 🆕 生成候选路线（如果需要，多策略、多次采样）
    let candidateRoutes: RouteOptimizationEvidence['candidate_routes'];
    if (request?.generate_candidate_routes) {
      candidateRoutes = await this.generateCandidateRoutes(ctx, request, demData);
    }

    // 7. 生成替代方案（如果需要）
    const alternatives = request?.generate_alternatives !== false
      ? this.generateAlternatives(ctx, deduplicatedGates, softScores)
      : [];

    // 8. 生成结论
    const conclusion = this.generateConclusion(deduplicatedGates, softScores);

    // 9. 确定下一步
    const nextSteps = this.determineNextSteps(conclusion, alternatives);

    const processingTime = Date.now() - startTime;

    // 构建证据
    const evidence: RouteOptimizationEvidence = {
      evidence_id: evidenceId,
      generated_at: new Date().toISOString(),
      trip_id: ctx.tripId,
      conclusion,
      hard_gates: deduplicatedGates, // 使用去重后的结果
      soft_scores: softScores,
      key_features: keyFeatures,
      alternatives,
      candidate_routes: candidateRoutes,
      data_timestamps: this.generateDataTimestamps(),
      next_steps: nextSteps,
      raw_verification: rawVerification,
    };

    // 记录指标
    this.trackMetrics(evidence, processingTime);

    this.logger.debug(`[路线优化] 完成: evidenceId=${evidenceId}, approved=${conclusion.route_approved}`);

    // 清理临时上下文
    this.currentContext = undefined;
    this.currentRequest = undefined;

    return evidence;
  }

  // 临时存储当前上下文（用于查找活动名称）
  private currentContext?: TripContext;
  
  // 临时存储当前请求（用于权重配置）
  private currentRequest?: RouteOptimizationRequest;

  /**
   * 评估硬门控规则
   */
  private async evaluateHardGates(ctx: TripContext): Promise<HardGateResult[]> {
    const results: HardGateResult[] = [];

    for (const day of ctx.days) {
      // 1. 检测时间冲突
      const timeConflicts = this.detectTimeConflicts(day);
      results.push(...timeConflicts);

      // 2. 检测地理不可能（跨城市距离过远）
      const geoIssues = this.detectGeoImpossible(day, ctx);
      results.push(...geoIssues);

      // 3. 检测换乘时间不足
      const transferIssues = this.detectTransferBufferIssues(day);
      results.push(...transferIssues);

      // 4. 🆕 调用 transport.search 验证可达性
      const transportIssues = await this.verifyTransportReachability(day);
      results.push(...transportIssues);

      // 5. 🆕 调用 opening_hours.get 验证开放时间
      const openingHoursIssues = await this.verifyOpeningHours(day);
      results.push(...openingHoursIssues);
    }

    // 6. 🆕 检测安全风险（危险区域）
    const safetyIssues = await this.checkSafetyHazards(ctx);
    results.push(...safetyIssues);

    // 7. 检测数据缺失
    const missingData = this.detectMissingData(ctx);
    results.push(...missingData);

    return results;
  }

  /**
   * 🆕 调用 transport.search 验证可达性
   */
  private async verifyTransportReachability(day: TripDayContext): Promise<HardGateResult[]> {
    const results: HardGateResult[] = [];

    if (!this.transportSearchSkill) {
      this.logger.debug('[路线优化] TransportSearchSkill 未注入，跳过可达性验证');
      return results;
    }

    // 获取有位置信息的行程项
    const itemsWithLocation = day.items.filter(item => item.location).sort((a, b) => {
      return this.parseTimeToMinutes(a.startTime || '00:00') - this.parseTimeToMinutes(b.startTime || '00:00');
    });

    if (itemsWithLocation.length < 2) {
      return results;
    }

    // 验证相邻景点之间的交通
    for (let i = 0; i < itemsWithLocation.length - 1; i++) {
      const current = itemsWithLocation[i];
      const next = itemsWithLocation[i + 1];

      if (!current.location || !next.location) continue;

      try {
        const transportResult = await this.transportSearchSkill.execute({
          origin: { lat: current.location.lat, lng: current.location.lng },
          destination: { lat: next.location.lat, lng: next.location.lng },
          mode: 'mixed',
        });

        const nameCurrent = this.getItemName(current);
        const nameNext = this.getItemName(next);
        const itemIdCurrent = current.itemId || '';
        const itemIdNext = next.itemId || '';

        // 检查是否有可用的交通方式
        if (!transportResult.options || transportResult.options.length === 0) {
          results.push({
            rule: 'REACHABILITY',
            result: 'FAIL',
            severity: 'ERROR',
            detail: `第${day.dayNumber}天「${nameCurrent}」→「${nameNext}」无可用交通方式`,
            suggestion: '请检查两个地点之间是否有公共交通或其他交通方式',
            day: day.dayNumber,
            item_id: itemIdNext, // 目标项
            affected_items: [itemIdCurrent, itemIdNext].filter(id => id),
            evidence_ref: transportResult.evidence_id,
          });
        } else {
          // 检查最快交通时间是否超过预留时间
          const bestOption = transportResult.best_option;
          if (bestOption) {
            const currentEndTime = current.endTime 
              ? this.parseTimeToMinutes(current.endTime)
              : this.parseTimeToMinutes(current.startTime || '00:00') + (current.duration || 60);
            const nextStartTime = this.parseTimeToMinutes(next.startTime || '00:00');
            const availableGap = nextStartTime - currentEndTime;

            if (bestOption.duration_minutes > availableGap) {
              results.push({
                rule: 'TRANSFER_BUFFER',
                result: availableGap < bestOption.duration_minutes * 0.8 ? 'FAIL' : 'PASS',
                severity: availableGap < bestOption.duration_minutes * 0.5 ? 'ERROR' : 'WARNING',
                detail: `第${day.dayNumber}天「${nameCurrent}」→「${nameNext}」：最快交通需要 ${bestOption.duration_minutes} 分钟（${bestOption.mode}），但只预留了 ${availableGap} 分钟`,
                suggestion: `建议将「${nameNext}」推迟 ${bestOption.duration_minutes - availableGap + 15} 分钟开始`,
                day: day.dayNumber,
                item_id: itemIdNext, // 需要调整时间的项
                affected_items: [itemIdCurrent, itemIdNext].filter(id => id),
                evidence_ref: transportResult.evidence_id,
              });
            } else {
              this.logger.debug(`[路线优化] 第${day.dayNumber}天 ${nameCurrent} → ${nameNext} 可达，最快 ${bestOption.duration_minutes} 分钟（${bestOption.mode}）`);
            }
          }
        }
      } catch (error: any) {
        this.logger.warn(`[路线优化] 交通验证失败: ${error?.message}`);
        const nameCurrent = this.getItemName(current);
        const nameNext = this.getItemName(next);
        const itemIdCurrent = current.itemId || '';
        const itemIdNext = next.itemId || '';
        
        // 不将错误作为硬门控失败，而是作为数据缺失
        results.push({
          rule: 'DATA_MISSING',
          result: 'PASS',
          severity: 'WARNING',
          detail: `第${day.dayNumber}天「${nameCurrent}」→「${nameNext}」交通数据获取失败`,
          suggestion: '建议手动确认交通方式',
          day: day.dayNumber,
          item_id: itemIdNext,
          affected_items: [itemIdCurrent, itemIdNext].filter(id => id),
        });
      }
    }

    return results;
  }

  /**
   * 🆕 调用 opening_hours.get 验证开放时间
   */
  private async verifyOpeningHours(day: TripDayContext): Promise<HardGateResult[]> {
    const results: HardGateResult[] = [];

    if (!this.openingHoursSkill) {
      this.logger.debug('[路线优化] OpeningHoursGetSkill 未注入，跳过开放时间验证');
      return results;
    }

    // 收集所有有 POI ID 的行程项
    const poiItems = day.items.filter(item => item.poiId);
    if (poiItems.length === 0) {
      return results;
    }

    try {
      const poiIds = poiItems.map(item => item.poiId!);
      const openingHoursResult = await this.openingHoursSkill.execute({
        poi_ids: poiIds,
      });

      // 检查每个 POI 的开放时间
      for (const item of poiItems) {
        const hoursInfo = openingHoursResult.opening_hours.find(h => h.poi_id === item.poiId);
        const itemName = this.getItemName(item);
        const itemId = item.itemId || '';
        
        if (!hoursInfo || !hoursInfo.opening_hours) {
          // 没有开放时间数据，警告
          results.push({
            rule: 'OPENING_HOURS',
            result: 'PASS',
            severity: 'WARNING',
            detail: `第${day.dayNumber}天「${itemName}」缺少开放时间数据`,
            suggestion: '请确认该地点在计划时间是否开放',
            day: day.dayNumber,
            item_id: itemId,
            affected_items: itemId ? [itemId] : undefined,
          });
          continue;
        }

        // 如果有 is_open_now 信息且为 false，需要进一步检查
        if (hoursInfo.is_open_now === false) {
          // 注意：is_open_now 是当前时间是否开放，不能直接用于判断计划时间
          // 这里只作为参考信息
          this.logger.debug(`[路线优化] 第${day.dayNumber}天「${itemName}」当前可能未营业`);
        }

        // 如果有具体的开放时间字符串，可以进行更精确的验证
        if (typeof hoursInfo.opening_hours === 'string') {
          const plannedTime = item.startTime;
          if (plannedTime) {
            // 简化检查：如果开放时间包含"休息"或"关闭"
            const hoursStr = hoursInfo.opening_hours.toLowerCase();
            if (hoursStr.includes('休息') || hoursStr.includes('关闭') || hoursStr.includes('closed')) {
              results.push({
                rule: 'OPENING_HOURS',
                result: 'FAIL',
                severity: 'ERROR',
                detail: `第${day.dayNumber}天「${itemName}」在 ${day.date} 可能不开放`,
                suggestion: `开放时间：${hoursInfo.opening_hours}`,
                day: day.dayNumber,
                item_id: itemId,
                affected_items: itemId ? [itemId] : undefined,
                evidence_ref: hoursInfo.evidence_id,
              });
            }
          }
        }
      }
    } catch (error: any) {
      this.logger.warn(`[路线优化] 开放时间验证失败: ${error?.message}`);
    }

    return results;
  }

  /**
   * 检测时间冲突
   */
  private detectTimeConflicts(day: TripDayContext): HardGateResult[] {
    const results: HardGateResult[] = [];
    const items = day.items.filter(item => item.startTime).sort((a, b) => {
      return this.parseTimeToMinutes(a.startTime!) - this.parseTimeToMinutes(b.startTime!);
    });

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const itemA = items[i];
        const itemB = items[j];

        const startA = this.parseTimeToMinutes(itemA.startTime!);
        const endA = itemA.endTime 
          ? this.parseTimeToMinutes(itemA.endTime)
          : startA + (itemA.duration || 60);
        
        const startB = this.parseTimeToMinutes(itemB.startTime!);
        const endB = itemB.endTime 
          ? this.parseTimeToMinutes(itemB.endTime)
          : startB + (itemB.duration || 60);

        // 检查重叠
        if (!(endA <= startB || endB <= startA)) {
          const overlapMinutes = Math.min(endA, endB) - Math.max(startA, startB);
          
          const nameA = this.getItemName(itemA);
          const nameB = this.getItemName(itemB);
          const itemIdA = itemA.itemId || '';
          const itemIdB = itemB.itemId || '';
          
          results.push({
            rule: 'TIME_CONFLICT',
            result: 'FAIL',
            severity: 'ERROR',
            detail: `第${day.dayNumber}天「${nameA}」与「${nameB}」时间重叠 ${overlapMinutes} 分钟`,
            suggestion: `建议调整其中一个活动的时间，或移除冲突的活动`,
            day: day.dayNumber,
            item_id: itemIdA, // 主要冲突项
            affected_items: [itemIdA, itemIdB].filter(id => id), // 所有相关项
          });
        }
      }
    }

    return results;
  }

  /**
   * 检测地理不可能（跨城市距离过远）
   */
  private detectGeoImpossible(day: TripDayContext, ctx: TripContext): HardGateResult[] {
    const results: HardGateResult[] = [];
    const citiesInDay = new Map<string, string[]>();

    // 收集当天涉及的城市
    for (const item of day.items) {
      const city = this.detectCityForItem(item);
      if (city) {
        if (!citiesInDay.has(city)) {
          citiesInDay.set(city, []);
        }
        citiesInDay.get(city)!.push(this.getItemName(item));
      }
    }

    // 检查城市间距离
    const cities = Array.from(citiesInDay.keys());
    const mainCity = (ctx.destinationName || ctx.destination || '').match(
      /(北京|上海|广州|深圳|杭州|南京|苏州|成都|重庆|武汉|西安|天津|东京|大阪|京都)/
    )?.[1];

    for (let i = 0; i < cities.length; i++) {
      for (let j = i + 1; j < cities.length; j++) {
        const city1 = cities[i];
        const city2 = cities[j];
        const distance = this.calculateCityDistance(city1, city2);

        if (distance > 500) {
          const severity = distance > 1000 ? 'ERROR' : 'WARNING';
          const wrongCity = mainCity && city1 !== mainCity ? city1 : city2;
          const wrongItems = citiesInDay.get(wrongCity) || [];
          
          // 找到属于错误城市的行程项 ID
          const wrongItemIds: string[] = [];
          for (const item of day.items) {
            const itemCity = this.detectCityForItem(item);
            if (itemCity === wrongCity) {
              if (item.itemId) {
                wrongItemIds.push(item.itemId);
              }
            }
          }

          results.push({
            rule: 'GEO_IMPOSSIBLE',
            result: distance > 1000 ? 'FAIL' : 'PASS',
            severity,
            detail: `第${day.dayNumber}天同时包含 ${city1} 和 ${city2} 的景点，相距约 ${Math.round(distance)} 公里`,
            suggestion: distance > 1000 
              ? `建议立即删除「${wrongItems.join('、')}」，这是${wrongCity}的景点，无法在同一天完成`
              : `建议将不同城市的景点安排到不同天`,
            day: day.dayNumber,
            item_id: wrongItemIds[0] || undefined, // 第一个错误项
            affected_items: wrongItemIds, // 所有错误城市的项
          });
        }
      }
    }

    return results;
  }

  /**
   * 检测换乘时间不足
   */
  private detectTransferBufferIssues(day: TripDayContext): HardGateResult[] {
    const results: HardGateResult[] = [];
    const items = day.items.filter(item => item.startTime && item.location).sort((a, b) => {
      return this.parseTimeToMinutes(a.startTime!) - this.parseTimeToMinutes(b.startTime!);
    });

    for (let i = 0; i < items.length - 1; i++) {
      const current = items[i];
      const next = items[i + 1];

      if (current.location && next.location) {
        const distance = this.calculateDistance(
          current.location.lat, current.location.lng,
          next.location.lat, next.location.lng
        );

        // 估算需要的交通时间（每10km约15分钟）
        const estimatedTravelTime = Math.max(15, distance * 1.5);

        const currentEndTime = current.endTime 
          ? this.parseTimeToMinutes(current.endTime)
          : this.parseTimeToMinutes(current.startTime!) + (current.duration || 60);
        const nextStartTime = this.parseTimeToMinutes(next.startTime!);
        const gap = nextStartTime - currentEndTime;

        if (gap < estimatedTravelTime && distance > 5) {
          const nameCurrent = this.getItemName(current);
          const nameNext = this.getItemName(next);
          const itemIdCurrent = current.itemId || '';
          const itemIdNext = next.itemId || '';
          
          results.push({
            rule: 'TRANSFER_BUFFER',
            result: gap < 15 ? 'FAIL' : 'PASS',
            severity: gap < 15 ? 'ERROR' : 'WARNING',
            detail: `第${day.dayNumber}天「${nameCurrent}」到「${nameNext}」距离 ${Math.round(distance)}km，但只预留了 ${gap} 分钟`,
            suggestion: `建议至少预留 ${Math.round(estimatedTravelTime)} 分钟的交通时间`,
            day: day.dayNumber,
            item_id: itemIdNext, // 下一个项（需要调整时间的项）
            affected_items: [itemIdCurrent, itemIdNext].filter(id => id),
          });
        }
      }
    }

    return results;
  }

  /**
   * 检测数据缺失
   */
  /**
   * 🆕 检测数据缺失（保守策略）
   * 
   * 策略：
   * - 关键数据缺失 → 直接拒绝（FAIL）
   * - 部分数据缺失 → 警告用户（WARNING）
   * - 数据质量低 → 根据质量分数决定
   */
  private detectMissingData(ctx: TripContext): HardGateResult[] {
    const results: HardGateResult[] = [];
    const criticalFields: string[] = [];
    const partialFields: string[] = [];

    // 🆕 关键数据检查（缺失直接拒绝）
    if (!ctx.startDate) criticalFields.push('startDate');
    if (!ctx.endDate) criticalFields.push('endDate');
    if (!ctx.destination && !ctx.destinationName) criticalFields.push('destination');
    if (!ctx.days || ctx.days.length === 0) criticalFields.push('days');

    // 🆕 部分数据检查（缺失警告）
    for (const day of ctx.days) {
      if (!day.date) {
        partialFields.push(`day${day.dayNumber}.date`);
      }

      // 检查景点数据完整性
      const itemsWithoutTime = day.items.filter(item => !item.startTime);
      if (itemsWithoutTime.length > day.items.length * 0.5) {
        partialFields.push(`day${day.dayNumber}.items.startTime`);
      }

      // 检查位置信息
      const itemsWithoutLocation = day.items.filter(item => !item.location);
      if (itemsWithoutLocation.length > day.items.length * 0.7) {
        partialFields.push(`day${day.dayNumber}.items.location`);
      }
    }

    // 🆕 关键数据缺失 → 直接拒绝
    if (criticalFields.length > 0) {
      results.push({
        rule: 'DATA_MISSING',
        result: 'FAIL',
        severity: 'ERROR',
        detail: `缺少关键数据，无法生成可靠路线: ${criticalFields.join(', ')}`,
        suggestion: '请补充完整的行程数据（起始日期、结束日期、目的地）',
      });
    }

    // 🆕 部分数据缺失 → 警告用户
    if (partialFields.length > 0 && criticalFields.length === 0) {
      results.push({
        rule: 'DATA_MISSING',
        result: 'PASS',
        severity: 'WARNING',
        detail: `部分数据缺失，生成的路线可能需要用户确认: ${partialFields.join(', ')}`,
        suggestion: '建议补充完整的行程数据以获得更准确的优化建议',
      });
    }

    // 🆕 数据质量评分
    const qualityScore = this.calculateDataQualityScore(ctx, criticalFields, partialFields);
    if (qualityScore < 0.5 && criticalFields.length === 0) {
      results.push({
        rule: 'DATA_MISSING',
        result: 'PASS',
        severity: 'WARNING',
        detail: `数据质量较低（质量分数: ${(qualityScore * 100).toFixed(0)}%），建议补充数据`,
        suggestion: '建议补充完整的行程数据以获得更准确的优化建议',
      });
    }

    return results;
  }

  /**
   * 🆕 计算数据质量分数（0-1）
   */
  private calculateDataQualityScore(
    ctx: TripContext,
    criticalFields: string[],
    partialFields: string[]
  ): number {
    let score = 1.0;

    // 关键数据缺失 → 分数为 0
    if (criticalFields.length > 0) {
      return 0;
    }

    // 部分数据缺失 → 扣分
    const totalFields = ctx.days.length * 3; // 每天：date, items.startTime, items.location
    const missingRatio = partialFields.length / Math.max(totalFields, 1);
    score -= missingRatio * 0.5; // 最多扣 50%

    // 检查数据完整性
    let totalItems = 0;
    let itemsWithCompleteData = 0;

    for (const day of ctx.days) {
      for (const item of day.items) {
        totalItems++;
        if (item.startTime && item.location && item.name) {
          itemsWithCompleteData++;
        }
      }
    }

    if (totalItems > 0) {
      const completenessRatio = itemsWithCompleteData / totalItems;
      score = score * 0.5 + completenessRatio * 0.5; // 数据完整性占 50%
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * 计算软评分
   */
  private calculateSoftScores(
    ctx: TripContext,
    demData?: DemGetProfileOutput
  ): RouteOptimizationEvidence['soft_scores'] {
    // 疲劳评分（使用 DEM 数据）
    const fatigueScore = this.calculateFatigueScore(ctx, demData);
    
    // 节奏评分
    const paceScore = this.calculatePaceScore(ctx);
    
    // 体验评分
    const experienceScore = this.calculateExperienceScore(ctx);
    
    // 效率评分
    const efficiencyScore = this.calculateEfficiencyScore(ctx);

    // 加权总分
    const weights = { fatigue: 0.3, pace: 0.25, experience: 0.25, efficiency: 0.2 };
    const overall = 
      fatigueScore.score * weights.fatigue +
      paceScore.score * weights.pace +
      experienceScore.score * weights.experience +
      efficiencyScore.score * weights.efficiency;

    return {
      fatigue: fatigueScore,
      pace: paceScore,
      experience: experienceScore,
      efficiency: efficiencyScore,
      overall: Math.round(overall),
    };
  }

  private calculateFatigueScore(
    ctx: TripContext,
    demData?: DemGetProfileOutput
  ): SoftScoreResult {
    let totalScore = 100;
    const issues: string[] = [];

    // 🆕 基于 DEM 数据计算疲劳评分（优化版：使用科学的加权计算）
    if (demData) {
      const fatigueFromDEM = this.calculateFatigueFromDEM(demData, ctx);
      totalScore = fatigueFromDEM.score;
      issues.push(...fatigueFromDEM.issues);
    } else {
      // 降级：基于活动时长计算疲劳
      const fatigueFromDuration = this.calculateFatigueFromDuration(ctx);
      totalScore = fatigueFromDuration.score;
      issues.push(...fatigueFromDuration.issues);
    }

    return {
      dimension: 'FATIGUE',
      score: Math.max(0, Math.round(totalScore)),
      threshold: 70,
      exceeded: totalScore < 70,
      weight: 0.3,
      detail: issues.length > 0 ? issues.join('；') : '活动强度适中',
      suggestion: totalScore < 70 ? '建议减少每日活动数量或缩短活动时间，或选择更平缓的路线' : undefined,
    };
  }

  /**
   * 🆕 基于 DEM 数据计算疲劳评分（科学的加权计算）
   */
  private calculateFatigueFromDEM(
    demData: DemGetProfileOutput,
    ctx: TripContext
  ): { score: number; issues: string[] } {
    const issues: string[] = [];
    let fatigueScore = 100; // 起始分数

    const cumulativeAscent = demData.cumulativeAscent || 0;
    const maxSlope = demData.maxSlope || 0;
    const fatigueIndex = demData.fatigueIndex || 0;

    // 权重配置
    const cumulativeAscentWeight = 0.4;
    const maxSlopeWeight = 0.3;
    const fatigueIndexWeight = 0.3;

    // 归一化累计爬升（假设最大1000m为满分，超过1000m开始扣分）
    const normalizedAscent = Math.min(cumulativeAscent / 1000, 1);
    const ascentPenalty = normalizedAscent > 0.5 
      ? (normalizedAscent - 0.5) * 2 * 30 // 超过500m开始扣分，最多扣30分
      : 0;
    
    if (cumulativeAscent > 500) {
      issues.push(`累计爬升 ${cumulativeAscent.toFixed(0)}m`);
    }

    // 归一化最大坡度（假设最大15%为满分，超过15%开始扣分）
    const normalizedSlope = Math.min(maxSlope / 15, 1);
    const slopePenalty = normalizedSlope > 0.67 
      ? (normalizedSlope - 0.67) * 3 * 20 // 超过10%开始扣分，最多扣20分
      : 0;
    
    if (maxSlope > 10) {
      issues.push(`最大坡度 ${maxSlope.toFixed(1)}%`);
    }

    // 归一化疲劳指数（0-100，假设70为满分，超过70开始扣分）
    const normalizedFatigue = Math.min(fatigueIndex / 70, 1);
    const fatiguePenalty = normalizedFatigue > 0.71 
      ? (normalizedFatigue - 0.71) * 3.45 * 25 // 超过50开始扣分，最多扣25分
      : 0;
    
    if (fatigueIndex > 50) {
      issues.push(`疲劳指数 ${fatigueIndex.toFixed(0)}`);
    }

    // 加权计算疲劳评分（分数越高，疲劳越大）
    const weightedFatiguePenalty = 
      ascentPenalty * cumulativeAscentWeight +
      slopePenalty * maxSlopeWeight +
      fatiguePenalty * fatigueIndexWeight;

    fatigueScore = Math.max(0, 100 - weightedFatiguePenalty);

    // 结合活动时长的疲劳评分
    const durationFatigue = this.calculateDurationFatigue(ctx);
    fatigueScore = Math.min(fatigueScore, durationFatigue.score);
    if (durationFatigue.issues.length > 0) {
      issues.push(...durationFatigue.issues);
    }

    return {
      score: fatigueScore,
      issues,
    };
  }

  /**
   * 🆕 基于活动时长计算疲劳评分（降级方案）
   */
  private calculateFatigueFromDuration(ctx: TripContext): { score: number; issues: string[] } {
    const issues: string[] = [];
    let fatigueScore = 100;

    for (const day of ctx.days) {
      const totalDuration = day.items.reduce((sum, item) => sum + (item.duration || 60), 0);
      
      // 超过10小时扣分
      if (totalDuration > 600) {
        const penalty = Math.min(30, (totalDuration - 600) / 10);
        fatigueScore -= penalty;
        issues.push(`第${day.dayNumber}天活动时长 ${Math.round(totalDuration / 60)} 小时`);
      }

      // 活动数量过多扣分
      if (day.items.length > 6) {
        const penalty = (day.items.length - 6) * 5;
        fatigueScore -= penalty;
        if (!issues.some(i => i.includes(`第${day.dayNumber}天`))) {
          issues.push(`第${day.dayNumber}天活动数量 ${day.items.length} 个`);
        }
      }
    }

    return {
      score: Math.max(0, fatigueScore),
      issues,
    };
  }

  /**
   * 🆕 计算活动时长相关的疲劳评分
   */
  private calculateDurationFatigue(ctx: TripContext): { score: number; issues: string[] } {
    const issues: string[] = [];
    let fatigueScore = 100;

    for (const day of ctx.days) {
      const totalDuration = day.items.reduce((sum, item) => sum + (item.duration || 60), 0);
      
      // 超过10小时扣分
      if (totalDuration > 600) {
        const penalty = Math.min(30, (totalDuration - 600) / 10);
        fatigueScore -= penalty;
        issues.push(`第${day.dayNumber}天活动时长 ${Math.round(totalDuration / 60)} 小时`);
      }

      // 活动数量过多扣分
      if (day.items.length > 6) {
        const penalty = (day.items.length - 6) * 5;
        fatigueScore -= penalty;
        if (!issues.some(i => i.includes(`第${day.dayNumber}天`))) {
          issues.push(`第${day.dayNumber}天活动数量 ${day.items.length} 个`);
        }
      }
    }

    return {
      score: Math.max(0, fatigueScore),
      issues,
    };
  }

  private calculatePaceScore(ctx: TripContext): SoftScoreResult {
    let score = 100;
    const issues: string[] = [];

    for (const day of ctx.days) {
      // 检查活动分布是否均匀
      const morningItems = day.items.filter(item => {
        const time = this.parseTimeToMinutes(item.startTime || '12:00');
        return time < 720; // 12:00 之前
      });
      const afternoonItems = day.items.filter(item => {
        const time = this.parseTimeToMinutes(item.startTime || '12:00');
        return time >= 720 && time < 1080; // 12:00-18:00
      });

      // 如果上午或下午没有活动，扣分
      if (morningItems.length === 0 && day.items.length > 2) {
        score -= 10;
      }
      if (afternoonItems.length === 0 && day.items.length > 2) {
        score -= 10;
      }

      // 检查是否有用餐安排
      const hasMeal = day.items.some(item => 
        item.type === 'RESTAURANT' || 
        item.name?.includes('餐') ||
        item.name?.includes('食')
      );
      if (!hasMeal && day.items.length > 3) {
        score -= 15;
        issues.push(`第${day.dayNumber}天未安排用餐`);
      }
    }

    return {
      dimension: 'PACE',
      score: Math.max(0, score),
      threshold: 70,
      exceeded: score < 70,
      weight: 0.25,
      detail: issues.length > 0 ? issues.join('；') : '节奏安排合理',
      suggestion: score < 70 ? '建议添加用餐和休息时间，均匀分配活动' : undefined,
    };
  }

  private calculateExperienceScore(ctx: TripContext): SoftScoreResult {
    let score = 80; // 基础分
    
    // 景点数量合理性
    const avgActivities = ctx.days.reduce((sum, d) => sum + d.items.length, 0) / ctx.days.length;
    if (avgActivities >= 3 && avgActivities <= 5) {
      score += 10;
    }

    // 有主题的天数
    const daysWithTheme = ctx.days.filter(d => d.theme).length;
    score += daysWithTheme / ctx.days.length * 10;

    return {
      dimension: 'EXPERIENCE',
      score: Math.min(100, score),
      threshold: 70,
      exceeded: score < 70,
      weight: 0.25,
      detail: `平均每天 ${avgActivities.toFixed(1)} 个活动`,
    };
  }

  private calculateEfficiencyScore(ctx: TripContext): SoftScoreResult {
    // 基于完成度计算效率
    const completeness = ctx.completeness || 0;
    
    return {
      dimension: 'EFFICIENCY',
      score: Math.round(completeness),
      threshold: 60,
      exceeded: completeness < 60,
      weight: 0.2,
      detail: `行程完成度 ${completeness}%`,
      suggestion: completeness < 60 ? '建议继续完善行程细节' : undefined,
    };
  }

  /**
   * 提取关键特征
   */
  private extractKeyFeatures(
    ctx: TripContext, 
    hardGates: HardGateResult[]
  ): RouteOptimizationEvidence['key_features'] {
    const citiesInvolved = new Set<string>();
    let maxDailyDistance = 0;
    let maxDailyActivityMinutes = 0;
    const crossCitySegments: RouteOptimizationEvidence['key_features']['cross_city_segments'] = [];

    for (const day of ctx.days) {
      let dailyDistance = 0;
      let dailyActivityMinutes = 0;
      const dayCities = new Set<string>();

      for (const item of day.items) {
        dailyActivityMinutes += item.duration || 60;
        
        const city = this.detectCityForItem(item);
        if (city) {
          citiesInvolved.add(city);
          dayCities.add(city);
        }
      }

      maxDailyActivityMinutes = Math.max(maxDailyActivityMinutes, dailyActivityMinutes);

      // 记录跨城市段
      const daysCitiesArr = Array.from(dayCities);
      if (daysCitiesArr.length > 1) {
        for (let i = 0; i < daysCitiesArr.length - 1; i++) {
          const distance = this.calculateCityDistance(daysCitiesArr[i], daysCitiesArr[i + 1]);
          if (distance > 100) {
            crossCitySegments.push({
              day: day.dayNumber,
              from_city: daysCitiesArr[i],
              to_city: daysCitiesArr[i + 1],
              distance_km: Math.round(distance),
              estimated_travel_minutes: Math.round(distance / 5), // 简化估算
            });
          }
        }
      }
    }

    // 🆕 检测夜间段
    const nightSegments = this.detectNightSegments(ctx);

    // 🆕 检测无救援段
    const noRescueSegments = this.detectNoRescueSegments(ctx);

    return {
      total_days: ctx.durationDays,
      total_activities: ctx.days.reduce((sum, d) => sum + d.items.length, 0),
      cities_involved: Array.from(citiesInvolved),
      max_daily_distance_km: maxDailyDistance,
      max_daily_activity_minutes: maxDailyActivityMinutes,
      cross_city_segments: crossCitySegments.length > 0 ? crossCitySegments : undefined,
      night_segments: nightSegments.length > 0 ? nightSegments : undefined,
      no_rescue_segments: noRescueSegments.length > 0 ? noRescueSegments : undefined,
      time_conflicts: hardGates.filter(g => g.rule === 'TIME_CONFLICT').length,
      missing_data: hardGates.filter(g => g.rule === 'DATA_MISSING').map(g => g.detail),
    };
  }

  /**
   * 生成替代方案
   */
  private generateAlternatives(
    ctx: TripContext,
    hardGates: HardGateResult[],
    softScores: RouteOptimizationEvidence['soft_scores']
  ): RouteAlternative[] {
    const alternatives: RouteAlternative[] = [];
    let priorityCounter = 1;

    // 根据硬门控失败生成替代方案
    for (const gate of hardGates) {
      if (gate.result === 'FAIL') {
        switch (gate.rule) {
          case 'TIME_CONFLICT':
            alternatives.push({
              id: `alt_${uuidv4().slice(0, 8)}`,
              strategy: 'ADJUST_TIME',
              priority: priorityCounter++,
              description: `调整时间解决冲突: ${gate.detail}`,
              impact: {
                time_change_minutes: 30,
              },
              confidence: 0.9,
            });
            break;

          case 'GEO_IMPOSSIBLE':
            alternatives.push({
              id: `alt_${uuidv4().slice(0, 8)}`,
              strategy: 'REMOVE_POI',
              priority: priorityCounter++,
              description: `移除不属于本次行程的景点`,
              impact: {
                removed_items: gate.affected_items,
              },
              confidence: 0.95,
            });
            alternatives.push({
              id: `alt_${uuidv4().slice(0, 8)}`,
              strategy: 'CHANGE_DAY',
              priority: priorityCounter++,
              description: `将跨城市景点移到单独的一天`,
              impact: {},
              confidence: 0.7,
            });
            break;

          case 'TRANSFER_BUFFER':
            alternatives.push({
              id: `alt_${uuidv4().slice(0, 8)}`,
              strategy: 'ADD_BUFFER',
              priority: priorityCounter++,
              description: `增加换乘缓冲时间`,
              impact: {
                time_change_minutes: 30,
              },
              confidence: 0.85,
            });
            break;
        }
      }
    }

    // 根据软评分生成建议
    if (softScores.fatigue.exceeded) {
      alternatives.push({
        id: `alt_${uuidv4().slice(0, 8)}`,
        strategy: 'REMOVE_POI',
        priority: priorityCounter++,
        description: '减少活动数量以降低疲劳度',
        impact: {},
        confidence: 0.7,
      });
    }

    return alternatives.slice(0, 5); // 最多返回5个替代方案
  }

  /**
   * 生成结论
   */
  private generateConclusion(
    hardGates: HardGateResult[],
    softScores: RouteOptimizationEvidence['soft_scores']
  ): RouteOptimizationEvidence['conclusion'] {
    const failedGates = hardGates.filter(g => g.result === 'FAIL');
    const errorGates = hardGates.filter(g => g.severity === 'ERROR');

    const routeApproved = failedGates.length === 0;
    const adjustmentRequired = errorGates.length > 0 || softScores.overall < 60;

    // 计算可执行性评分
    let executabilityScore = 100;
    executabilityScore -= failedGates.length * 20;
    executabilityScore -= (100 - softScores.overall) * 0.3;
    executabilityScore = Math.max(0, Math.min(100, executabilityScore));

    return {
      route_approved: routeApproved,
      rejection_reasons: failedGates.map(g => g.detail),
      adjustment_required: adjustmentRequired,
      executability_score: Math.round(executabilityScore),
      confidence: routeApproved ? 0.9 : 0.7,
    };
  }

  /**
   * 确定下一步
   */
  private determineNextSteps(
    conclusion: RouteOptimizationEvidence['conclusion'],
    alternatives: RouteAlternative[]
  ): NextStepAction[] {
    const steps: NextStepAction[] = [];

    if (conclusion.route_approved && !conclusion.adjustment_required) {
      steps.push({
        action: 'APPLY',
        message: '行程可执行，可以直接使用',
        requires_user_confirmation: false,
      });
    } else if (conclusion.adjustment_required && alternatives.length > 0) {
      steps.push({
        action: 'AUTO_FIX',
        alternative_id: alternatives[0].id,
        message: `建议应用: ${alternatives[0].description}`,
        requires_user_confirmation: true,
      });
      
      if (alternatives.length > 1) {
        steps.push({
          action: 'CONFIRM',
          message: `还有 ${alternatives.length - 1} 个替代方案可选`,
          requires_user_confirmation: true,
        });
      }
    } else {
      steps.push({
        action: 'REJECT',
        message: conclusion.rejection_reasons?.join('；') || '行程存在问题',
        requires_user_confirmation: false,
      });
    }

    return steps;
  }

  /**
   * 合并 itinerary.verify 的问题（去重 TIME_WINDOW_OVERLAP 和 TIME_CONFLICT）
   */
  private mergeVerificationIssues(
    hardGates: HardGateResult[],
    verifyResult: ItineraryVerifyOutput,
    ctx: TripContext
  ): void {
    for (const issue of verifyResult.issues) {
      const issueDay = issue.day ? parseInt(issue.day.split('-')[2] || '0', 10) : undefined;
      
      // TIME_WINDOW_OVERLAP 和 TIME_CONFLICT 是同一个问题，只保留一个
      if (issue.type === 'TIME_WINDOW_OVERLAP') {
        // 🆕 改进：检查是否已经有 TIME_CONFLICT 规则覆盖了这个问题
        // 通过比较消息中的活动名称来匹配（支持多种格式）
        const extractActivityNames = (text: string): string[] => {
          const names: string[] = [];
          
          // 格式1: 「A」与「B」
          const format1 = text.match(/「([^」]+)」/g) || [];
          format1.forEach(a => {
            const name = a.replace(/「|」/g, '').trim();
            if (name && name.length > 0) {
              names.push(name);
            }
          });
          
          // 格式2: 时间窗重叠：A 和 B
          const format2Match = text.match(/时间窗重叠[：:]\s*([^和]+)\s+和\s+([^的]+)/);
          if (format2Match && format2Match.length >= 3) {
            const name1 = format2Match[1].trim();
            const name2 = format2Match[2].trim();
            if (name1 && name1.length > 0 && !name1.includes('时间窗重叠')) {
              names.push(name1);
            }
            if (name2 && name2.length > 0 && !name2.includes('时间窗重叠')) {
              names.push(name2);
            }
          }
          
          return names;
        };
        
        const issueNames = extractActivityNames(issue.message);
        const issueNamesSet = new Set(issueNames);
        const issueNamesSorted = [...issueNamesSet].sort();
        
        // 🆕 调试日志
        this.logger.debug(`[去重] TIME_WINDOW_OVERLAP 问题: ${issue.message}`);
        this.logger.debug(`[去重] 提取的活动名称: ${JSON.stringify(issueNamesSorted)}`);
        
        const hasTimeConflict = hardGates.some(g => {
          if (g.rule !== 'TIME_CONFLICT') return false;
          if (g.day !== issueDay) return false;
          
          // 提取消息中的活动名称进行比较
          const gNames = extractActivityNames(g.detail);
          const gNamesSet = new Set(gNames);
          const gNamesSorted = [...gNamesSet].sort();
          
          // 🆕 调试日志
          this.logger.debug(`[去重] 比较 TIME_CONFLICT: ${g.detail}`);
          this.logger.debug(`[去重] 提取的活动名称: ${JSON.stringify(gNamesSorted)}`);
          
          // 如果都包含相同的活动名称（至少2个），认为是同一个问题
          if (gNamesSet.size >= 2 && issueNamesSet.size >= 2) {
            // 检查是否是相同的活动对（顺序无关，忽略空格）
            if (gNamesSet.size === 2 && issueNamesSet.size === 2) {
              if (gNamesSorted[0] === issueNamesSorted[0] && 
                  gNamesSorted[1] === issueNamesSorted[1]) {
                this.logger.debug(`[去重] ✅ 匹配成功: 相同的活动对`);
                return true;
              }
            }
            
            // 或者检查是否有至少2个相同的活动名称
            const commonNames = [...gNamesSet].filter(name => issueNamesSet.has(name));
            if (commonNames.length >= 2) {
              this.logger.debug(`[去重] ✅ 匹配成功: ${commonNames.length} 个共同活动`);
              return true;
            }
          }
          
          // 或者检查 affected_items 是否匹配
          if (g.affected_items && g.affected_items.length > 0 && issue.item_id) {
            if (g.affected_items.includes(issue.item_id)) {
              this.logger.debug(`[去重] ✅ 匹配成功: affected_items 包含 issue.item_id`);
              return true;
            }
          }
          
          return false;
        });
        
        if (hasTimeConflict) {
          // 跳过，因为 TIME_CONFLICT 已经覆盖了
          continue;
        }
      }

      // 🆕 改进：检查是否已经存在相同的问题（通过 affected_items 和 day 匹配）
      const issueRule = this.mapIssueTypeToRule(issue.type);
      
      // 对于 TIME_CONFLICT 类型，需要提取消息中的两个活动 ID
      let issueItemIds: string[] = [];
      if (issueRule === 'TIME_CONFLICT' && issue.message) {
        // 从消息中提取活动 ID（可能是 "活动 xxx" 格式或真实名称）
        // 尝试从上下文查找对应的 itemId
        const activityPattern = /「([^」]+)」/g;
        const matches = issue.message.matchAll(activityPattern);
        for (const match of matches) {
          const activityName = match[1];
          // 如果看起来像 "活动 xxx"，提取 ID
          if (activityName.startsWith('活动 ')) {
            const shortId = activityName.replace('活动 ', '');
            // 从上下文查找对应的 itemId
            for (const day of ctx.days) {
              const foundItem = day.items.find(i => {
                const itemId = i.itemId || '';
                const itemShortId = itemId.length > 8 ? itemId.slice(-6) : itemId;
                return itemShortId === shortId;
              });
              if (foundItem && foundItem.itemId) {
                issueItemIds.push(foundItem.itemId);
                break;
              }
            }
          } else {
            // 如果是真实名称，从上下文查找对应的 itemId
            for (const day of ctx.days) {
              const foundItem = day.items.find(i => {
                const itemName = i.name || '';
                return itemName === activityName || itemName.includes(activityName);
              });
              if (foundItem && foundItem.itemId) {
                issueItemIds.push(foundItem.itemId);
                break;
              }
            }
          }
        }
      } else if (issue.item_id) {
        issueItemIds = [issue.item_id];
      }
      
      // 🆕 改进：通过比较消息中的活动名称来判断是否重复（支持多种格式）
      const exists = hardGates.some(g => {
        // 规则类型必须匹配（TIME_WINDOW_OVERLAP 映射为 TIME_CONFLICT）
        if (g.rule !== issueRule) return false;
        
        // 天数必须匹配
        if (g.day !== issueDay) return false;
        
        // 🆕 提取消息中的活动名称（支持多种格式）
        // 格式1: 「A」与「B」（来自 detectTimeConflicts）
        // 格式2: 时间窗重叠：A 和 B 的时间窗重叠（来自 itinerary.verify）
        const extractActivityNames = (text: string): string[] => {
          const names: string[] = [];
          
          // 格式1: 「A」与「B」
          const format1 = text.match(/「([^」]+)」/g) || [];
          format1.forEach(a => names.push(a.replace(/「|」/g, '').trim()));
          
          // 格式2: A 和 B（在"时间窗重叠："之后）
          const format2Match = text.match(/时间窗重叠[：:]\s*([^和]+)\s+和\s+([^的]+)/);
          if (format2Match && format2Match.length >= 3) {
            names.push(format2Match[1].trim());
            names.push(format2Match[2].trim());
          }
          
          return names.filter(n => n && n.length > 0 && !n.includes('时间窗重叠'));
        };
        
        const gNames = extractActivityNames(g.detail);
        const issueNames = extractActivityNames(issue.message);
        
        // 去重并排序
        const gNamesSet = new Set(gNames);
        const issueNamesSet = new Set(issueNames);
        
        // 如果都包含相同的活动名称（至少2个），认为是同一个问题
        if (gNamesSet.size >= 2 && issueNamesSet.size >= 2) {
          const commonNames = [...gNamesSet].filter(name => issueNamesSet.has(name));
          if (commonNames.length >= 2) {
            return true;
          }
          
          // 或者检查是否是相同的活动对（顺序无关）
          if (gNamesSet.size === 2 && issueNamesSet.size === 2) {
            const gArray = [...gNamesSet].sort();
            const issueArray = [...issueNamesSet].sort();
            if (gArray[0] === issueArray[0] && gArray[1] === issueArray[1]) {
              return true;
            }
          }
        }
        
        // 或者检查 affected_items 是否匹配
        const gItems = g.affected_items || (g.item_id ? [g.item_id] : []);
        if (gItems.length > 0 && issueItemIds.length > 0) {
          const gItemsSet = new Set(gItems);
          const issueItemsSet = new Set(issueItemIds);
          const intersection = [...gItemsSet].filter(id => issueItemsSet.has(id));
          if (intersection.length >= 2) {
            return true;
          }
        }
        
        return false;
      });

      if (!exists) {
        // 改进消息中的活动名称
        let improvedMessage = issue.message;
        
        // 🆕 提取消息中所有的 "活动 xxx" 模式并替换
        const activityPattern = /活动\s*([a-f0-9]{6})/gi;
        const matches = improvedMessage.matchAll(activityPattern);
        
        for (const match of matches) {
          const shortId = match[1];
          // 尝试从上下文查找对应的 itemId
          for (const day of ctx.days) {
            const foundItem = day.items.find(i => {
              const itemId = i.itemId || '';
              const itemShortId = itemId.length > 8 ? itemId.slice(-6) : itemId;
              return itemShortId === shortId;
            });
            
            if (foundItem && foundItem.name && foundItem.name.trim() !== '') {
              // 确保找到的名称不是占位符
              if (!foundItem.name.startsWith('活动 ') && 
                  foundItem.name !== '未命名活动' && 
                  foundItem.name !== '活动（名称缺失）') {
                // 替换所有匹配的 "活动 xxx" 为真实名称
                improvedMessage = improvedMessage.replace(
                  new RegExp(`活动\\s*${shortId}`, 'gi'),
                  foundItem.name
                );
              }
            }
          }
        }

        hardGates.push({
          rule: this.mapIssueTypeToRule(issue.type),
          result: issue.severity === 'ERROR' ? 'FAIL' : 'PASS',
          severity: issue.severity as 'ERROR' | 'WARNING',
          detail: improvedMessage,
          suggestion: issue.suggestion,
          item_id: issue.item_id,
          affected_items: issue.item_id ? [issue.item_id] : undefined,
          day: issue.day ? parseInt(issue.day.split('-')[2] || '0', 10) : undefined,
        });
      }
    }
  }

  /**
   * 🆕 去重和合并相同的问题（改进版：通过活动名称匹配）
   */
  private deduplicateHardGates(hardGates: HardGateResult[]): HardGateResult[] {
    const seen = new Set<string>();
    const deduplicated: HardGateResult[] = [];

    for (const gate of hardGates) {
      // 生成唯一键：规则类型 + 天数 + 涉及的 item_id（排序后）
      const affectedItems = gate.affected_items || (gate.item_id ? [gate.item_id] : []);
      const sortedItems = [...affectedItems].sort();
      
      // 🆕 改进：对于 TIME_CONFLICT，也提取活动名称作为键的一部分
      let normalizedKey: string;
      if (gate.rule === 'TIME_CONFLICT') {
        // 提取消息中的活动名称
        const activities = gate.detail.match(/「([^」]+)」/g) || [];
        const activityNames = activities.map(a => a.replace(/「|」/g, '').trim()).sort();
        
        // 如果有活动名称，使用名称作为键；否则使用 item_id
        if (activityNames.length >= 2) {
          normalizedKey = `TIME_CONFLICT_${gate.day || 0}_${activityNames.join(',')}`;
        } else {
          normalizedKey = `TIME_CONFLICT_${gate.day || 0}_${sortedItems.join(',')}`;
        }
      } else {
        normalizedKey = `${gate.rule}_${gate.day || 0}_${sortedItems.join(',')}`;
      }

      if (!seen.has(normalizedKey)) {
        seen.add(normalizedKey);
        deduplicated.push(gate);
      } else {
        // 如果已存在，合并 severity（取更严重的）
        const existingIndex = deduplicated.findIndex(g => {
          const existingItems = g.affected_items || (g.item_id ? [g.item_id] : []);
          const existingSorted = [...existingItems].sort();
          
          if (g.rule === 'TIME_CONFLICT') {
            // 提取活动名称进行比较
            const existingActivities = g.detail.match(/「([^」]+)」/g) || [];
            const existingNames = existingActivities.map(a => a.replace(/「|」/g, '').trim()).sort();
            
            const gateActivities = gate.detail.match(/「([^」]+)」/g) || [];
            const gateNames = gateActivities.map(a => a.replace(/「|」/g, '').trim()).sort();
            
            if (existingNames.length >= 2 && gateNames.length >= 2) {
              // 比较活动名称集合是否相同
              const existingSet = new Set(existingNames);
              const gateSet = new Set(gateNames);
              if (existingSet.size === gateSet.size && [...existingSet].every(name => gateSet.has(name))) {
                return g.day === gate.day;
              }
            }
            
            // 回退到 item_id 比较
            let existingKey: string;
            if (existingNames.length >= 2) {
              existingKey = `TIME_CONFLICT_${g.day || 0}_${existingNames.join(',')}`;
            } else {
              existingKey = `TIME_CONFLICT_${g.day || 0}_${existingSorted.join(',')}`;
            }
            return existingKey === normalizedKey;
          } else {
            const existingKey = `${g.rule}_${g.day || 0}_${existingSorted.join(',')}`;
            return existingKey === normalizedKey;
          }
        });
        
        if (existingIndex >= 0) {
          const existing = deduplicated[existingIndex];
          if (gate.severity === 'ERROR' && existing.severity === 'WARNING') {
            existing.severity = 'ERROR';
            existing.result = 'FAIL';
          }
          // 如果新的 detail 更详细或包含真实名称，更新它
          if (gate.detail.length > existing.detail.length || 
              (!gate.detail.includes('活动 ') && existing.detail.includes('活动 '))) {
            existing.detail = gate.detail;
          }
        }
      }
    }

    return deduplicated;
  }

  private mapIssueTypeToRule(type: string): HardGateResult['rule'] {
    const mapping: Record<string, HardGateResult['rule']> = {
      'OPENING_HOURS_CONFLICT': 'OPENING_HOURS',
      'TRANSFER_BUFFER_INSUFFICIENT': 'TRANSFER_BUFFER',
      'REACHABILITY_ISSUE': 'REACHABILITY',
      'FATIGUE_THRESHOLD_EXCEEDED': 'SAFETY',
      'TIME_WINDOW_OVERLAP': 'TIME_CONFLICT',
    };
    return mapping[type] || 'DATA_MISSING';
  }

  /**
   * 转换为 Itinerary 格式（用于调用 itinerary.verify skill）
   */
  private convertToItinerary(ctx: TripContext): Itinerary {
    return {
      request_id: ctx.tripId,
      days: ctx.days.map(day => ({
        date: day.date,
        items: day.items.map(item => ({
          id: item.itemId,
          type: (item.type || 'POI') as ItineraryItem['type'],
          start_window: item.startTime || '',
          end_window: item.endTime || '',
          location_ref: {
            place_id: item.poiId || '',
            name: item.name,
          },
          evidence_refs: [], // 默认空数组
          verified: false,   // 默认未验证
          metadata: {
            duration_minutes: item.duration,
          },
        })),
      })),
      metadata: {
        total_days: ctx.durationDays,
      },
    };
  }

  /**
   * 生成数据时间戳
   */
  private generateDataTimestamps(): DataTimestamp[] {
    const timestamps: DataTimestamp[] = [
      {
        data_source: 'trip_context',
        retrieved_at: new Date().toISOString(),
        expiration_policy: {
          type: 'FIXED_DURATION',
          duration_hours: 24,
        },
        is_expired: false,
      },
    ];

    // 如果使用了 transport.search skill
    if (this.transportSearchSkill) {
      timestamps.push({
        data_source: 'transport.search',
        retrieved_at: new Date().toISOString(),
        expiration_policy: {
          type: 'FIXED_DURATION',
          duration_hours: 1, // 交通数据 1 小时过期
        },
        is_expired: false,
      });
    }

    // 如果使用了 opening_hours.get skill
    if (this.openingHoursSkill) {
      timestamps.push({
        data_source: 'opening_hours.get',
        retrieved_at: new Date().toISOString(),
        expiration_policy: {
          type: 'FIXED_DURATION',
          duration_hours: 24, // 开放时间数据 24 小时过期
        },
        is_expired: false,
      });
    }

    return timestamps;
  }

  /**
   * 记录指标
   */
  private trackMetrics(evidence: RouteOptimizationEvidence, processingTime: number): void {
    const metrics: RouteOptimizationMetrics = {
      request_id: evidence.evidence_id,
      executable: evidence.conclusion.route_approved,
      hard_gate_hits: evidence.hard_gates.filter(g => g.result === 'FAIL').length,
      soft_score_average: evidence.soft_scores.overall,
      alternatives_generated: evidence.alternatives.length,
      processing_time_ms: processingTime,
      data_completeness: 1 - (evidence.key_features.missing_data.length / 10),
    };

    this.logger.log(`[RouteOptimization] Metrics: ${JSON.stringify(metrics)}`);
  }

  // ========== 辅助方法 ==========

  /**
   * 获取活动名称（增强版，确保不为空）
   */
  /**
   * 获取活动名称（改进版：从上下文查找真实名称）
   */
  private getItemName(item: TripItemContext | any): string {
    // 尝试多个字段
    let name = item.name || item.placeName || item.title || item.nameCN || item.place?.name || '';
    
    // 🆕 如果名称看起来像 "活动 xxx" 格式，也尝试从上下文查找真实名称
    const itemId = item.itemId || item.id || '';
    const isPlaceholderName = name && (
      name.startsWith('活动 ') || 
      name.startsWith('活动（名称缺失）') ||
      name === '未命名活动' ||
      name === '活动（名称缺失）'
    );
    
    // 如果名称为空或者是占位符，尝试从上下文查找
    if ((!name || name.trim() === '' || isPlaceholderName) && this.currentContext && itemId) {
      // 从所有天的所有活动中查找
      for (const day of this.currentContext.days) {
        const foundItem = day.items.find(i => i.itemId === itemId);
        if (foundItem && foundItem.name && foundItem.name.trim() !== '') {
          // 确保找到的名称不是占位符
          if (!foundItem.name.startsWith('活动 ') && 
              foundItem.name !== '未命名活动' && 
              foundItem.name !== '活动（名称缺失）') {
            name = foundItem.name;
            break;
          }
        }
      }
    }
    
    // 如果仍然为空或者是占位符，使用 itemId 作为后备
    if (!name || name.trim() === '' || isPlaceholderName) {
      if (itemId) {
        // 如果 itemId 看起来像 UUID，只显示后6位
        const shortId = itemId.length > 8 ? itemId.slice(-6) : itemId;
        return `活动 ${shortId}`;
      }
      return '活动（名称缺失）'; // 与前端容错处理保持一致
    }
    
    return name;
  }

  /**
   * 获取活动名称（用于显示，如果为空则返回 itemId）
   */
  private getItemNameOrId(item: TripItemContext | any): { name: string; itemId: string } {
    const name = this.getItemName(item);
    const itemId = item.itemId || item.id || '';
    
    return { name, itemId };
  }

  /**
   * 🆕 检查安全风险（危险区域）
   */
  private async checkSafetyHazards(ctx: TripContext): Promise<HardGateResult[]> {
    const results: HardGateResult[] = [];

    if (!this.geoCheckHazardZonesSkill) {
      this.logger.debug('[路线优化] GeoCheckHazardZonesSkill 未注入，跳过安全风险检查');
      return results;
    }

    try {
      // 提取路线点
      const route = this.extractPolylineFromContext(ctx);
      if (route.length < 2) {
        return results;
      }

      // 获取国家代码（从目的地推断）
      const countryCode = this.inferCountryCode(ctx);
      if (!countryCode) {
        this.logger.debug('[路线优化] 无法推断国家代码，跳过安全风险检查');
        return results;
      }

      // 获取当前月份（用于季节性过滤）
      const currentMonth = ctx.startDate 
        ? new Date(ctx.startDate).getMonth() + 1 
        : new Date().getMonth() + 1;

      // 调用 geo.check.hazard.zones skill
      const hazardResult = await this.geoCheckHazardZonesSkill.execute({
        route,
        countryCode,
        month: currentMonth,
        minLevel: 'MEDIUM', // 只检查中等及以上风险
        bufferRadius: 1000, // 1km 缓冲
      });

      // 处理高风险区域
      if (hazardResult.riskAssessment.hasHighRisk) {
        const highRiskZones = hazardResult.hazardZones.filter(z => z.level === 'HIGH');
        results.push({
          rule: 'SAFETY',
          result: 'FAIL',
          severity: 'ERROR',
          detail: `路线经过 ${highRiskZones.length} 个高风险区域：${highRiskZones.map(z => z.type).join('、')}`,
          suggestion: '建议调整路线避开高风险区域，或选择其他时间段出行',
          evidence_ref: `hazard_zones_${hazardResult.riskAssessment.highRiskCount}`,
        });
      }

      // 处理中等风险区域（警告）
      if (hazardResult.riskAssessment.hasMediumRisk && !hazardResult.riskAssessment.hasHighRisk) {
        const mediumRiskZones = hazardResult.hazardZones.filter(z => z.level === 'MEDIUM');
        results.push({
          rule: 'SAFETY',
          result: 'PASS',
          severity: 'WARNING',
          detail: `路线经过 ${mediumRiskZones.length} 个中等风险区域：${mediumRiskZones.map(z => z.type).join('、')}`,
          suggestion: '建议关注天气和路况信息，做好安全准备',
          evidence_ref: `hazard_zones_${hazardResult.riskAssessment.mediumRiskCount}`,
        });
      }

      this.logger.debug(`[路线优化] 安全风险检查完成: 高风险=${hazardResult.riskAssessment.highRiskCount}, 中等风险=${hazardResult.riskAssessment.mediumRiskCount}`);
    } catch (error) {
      this.logger.warn(`[路线优化] 安全风险检查失败: ${error}`);
      // 不抛出错误，继续执行其他检查
    }

    return results;
  }

  /**
   * 🆕 从上下文中提取路线点（polyline）
   */
  private extractPolylineFromContext(ctx: TripContext): Array<{ lat: number; lng: number }> {
    const route: Array<{ lat: number; lng: number }> = [];

    for (const day of ctx.days) {
      for (const item of day.items) {
        if (item.location && item.location.lat && item.location.lng) {
          route.push({
            lat: item.location.lat,
            lng: item.location.lng,
          });
        }
      }
    }

    // 去重相邻的相同点
    const deduplicated: Array<{ lat: number; lng: number }> = [];
    for (let i = 0; i < route.length; i++) {
      if (i === 0 || 
          route[i].lat !== route[i - 1].lat || 
          route[i].lng !== route[i - 1].lng) {
        deduplicated.push(route[i]);
      }
    }

    return deduplicated;
  }

  /**
   * 🆕 从上下文中推断国家代码
   */
  private inferCountryCode(ctx: TripContext): string | undefined {
    // 从目的地名称推断
    const destination = ctx.destinationName || ctx.destination;
    if (typeof destination === 'string') {
      // 简单的国家代码映射
      const countryMap: Record<string, string> = {
        '中国': 'CN',
        '日本': 'JP',
        '美国': 'US',
        '英国': 'GB',
        '法国': 'FR',
        '德国': 'DE',
        '意大利': 'IT',
        '西班牙': 'ES',
        '澳大利亚': 'AU',
        '加拿大': 'CA',
        '韩国': 'KR',
        '泰国': 'TH',
        '新加坡': 'SG',
        '马来西亚': 'MY',
        '印度尼西亚': 'ID',
        '越南': 'VN',
        '菲律宾': 'PH',
      };

      for (const [name, code] of Object.entries(countryMap)) {
        if (destination.includes(name)) {
          return code;
        }
      }
    }

    // 从城市推断（如果目的地是城市）
    const cities = ctx.days.flatMap(day => day.items.map(item => item.cityName || day.city)).filter(Boolean);
    if (cities.length > 0) {
      // 简单的城市到国家映射
      const cityCountryMap: Record<string, string> = {
        '北京': 'CN', '上海': 'CN', '广州': 'CN', '深圳': 'CN', '杭州': 'CN',
        '东京': 'JP', '大阪': 'JP', '京都': 'JP',
        '纽约': 'US', '洛杉矶': 'US', '旧金山': 'US',
        '伦敦': 'GB', '巴黎': 'FR', '柏林': 'DE', '罗马': 'IT', '马德里': 'ES',
      };

      for (const city of cities) {
        if (cityCountryMap[city]) {
          return cityCountryMap[city];
        }
      }
    }

    return undefined;
  }

  private parseTimeToMinutes(time: string | Date | number): number {
    if (typeof time === 'number') return time;
    if (time instanceof Date) return time.getHours() * 60 + time.getMinutes();
    if (typeof time === 'string') {
      if (time.includes('T')) {
        const d = new Date(time);
        return d.getHours() * 60 + d.getMinutes();
      }
      const [h, m] = time.split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    }
    return 0;
  }

  private detectCityForItem(item: TripItemContext): string | null {
    if (item.cityName) return item.cityName;
    
    const name = this.getItemName(item);
    for (const [landmark, city] of Object.entries(this.LANDMARK_CITY_MAP)) {
      if (name.includes(landmark)) {
        return city;
      }
    }

    if (item.address) {
      for (const city of Object.keys(this.CITY_COORDINATES)) {
        if (item.address.includes(city)) {
          return city;
        }
      }
    }

    return null;
  }

  private calculateCityDistance(city1: string, city2: string): number {
    const coord1 = this.CITY_COORDINATES[city1];
    const coord2 = this.CITY_COORDINATES[city2];
    
    if (!coord1 || !coord2) return 0;
    
    return this.calculateDistance(coord1.lat, coord1.lng, coord2.lat, coord2.lng);
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // 地球半径（公里）
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * 
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * 🆕 检测夜间段（18:00-06:00）
   */
  private detectNightSegments(
    ctx: TripContext
  ): RouteOptimizationEvidence['key_features']['night_segments'] {
    const segments: RouteOptimizationEvidence['key_features']['night_segments'] = [];

    for (const day of ctx.days) {
      const dayDate = day.date ? new Date(day.date) : new Date(ctx.startDate);
      
      for (const item of day.items) {
        if (!item.startTime || !item.endTime) continue;

        const startTime = this.parseTimeToMinutes(item.startTime);
        const endTime = this.parseTimeToMinutes(item.endTime);

        // 检查是否跨越夜间（18:00-06:00）
        const nightStart = 18 * 60; // 18:00
        const nightEnd = 6 * 60;    // 06:00

        let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
        let isNightSegment = false;

        // 情况1: 活动在夜间开始和结束
        if (startTime >= nightStart || endTime <= nightEnd) {
          isNightSegment = true;
          riskLevel = 'HIGH';
        }
        // 情况2: 活动跨越夜间
        else if (startTime < nightStart && endTime > nightEnd) {
          isNightSegment = true;
          riskLevel = 'MEDIUM';
        }
        // 情况3: 活动在夜间部分时间
        else if ((startTime >= nightStart && startTime < 24 * 60) || 
                 (endTime > 0 && endTime <= nightEnd)) {
          isNightSegment = true;
          riskLevel = 'MEDIUM';
        }

        if (isNightSegment) {
          const startDateTime = new Date(dayDate);
          startDateTime.setHours(Math.floor(startTime / 60), startTime % 60, 0, 0);
          
          const endDateTime = new Date(dayDate);
          endDateTime.setHours(Math.floor(endTime / 60), endTime % 60, 0, 0);
          
          // 如果结束时间在第二天，调整日期
          if (endTime < startTime) {
            endDateTime.setDate(endDateTime.getDate() + 1);
          }

          segments.push({
            day: day.dayNumber,
            start: startDateTime.toISOString(),
            end: endDateTime.toISOString(),
            risk_level: riskLevel,
            description: `第${day.dayNumber}天「${this.getItemName(item)}」在夜间时段（${this.formatTime(startTime)}-${this.formatTime(endTime)}）`,
          });
        }
      }
    }

    return segments || [];
  }

  /**
   * 🆕 检测无救援段（连续活动距离救援点较远）
   * 
   * 判断标准：
   * - 连续活动距离城市中心 > 50km → HIGH
   * - 连续活动距离城市中心 > 30km → MEDIUM
   * - 连续活动距离城市中心 > 20km → LOW
   */
  private detectNoRescueSegments(
    ctx: TripContext
  ): RouteOptimizationEvidence['key_features']['no_rescue_segments'] {
    const segments: RouteOptimizationEvidence['key_features']['no_rescue_segments'] = [];

    for (const day of ctx.days) {
      const dayDate = day.date ? new Date(day.date) : new Date(ctx.startDate);
      const itemsWithLocation = day.items.filter(item => item.location && item.startTime && item.endTime);
      
      if (itemsWithLocation.length < 2) continue;

      // 检测连续偏远活动
      let segmentStart: TripItemContext | null = null;
      let segmentEnd: TripItemContext | null = null;
      let segmentDistance = 0;

      for (let i = 0; i < itemsWithLocation.length; i++) {
        const item = itemsWithLocation[i];
        const city = this.detectCityForItem(item);
        
        if (!city || !item.location) continue;

        // 计算到城市中心的距离
        const cityCenter = this.CITY_COORDINATES[city];
        if (!cityCenter) continue;

        const distanceToCity = this.calculateDistance(
          item.location.lat,
          item.location.lng,
          cityCenter.lat,
          cityCenter.lng
        );

        // 如果距离城市中心较远
        if (distanceToCity > 20) {
          if (!segmentStart) {
            segmentStart = item;
            segmentDistance = distanceToCity;
          } else {
            segmentEnd = item;
            segmentDistance = Math.max(segmentDistance, distanceToCity);
          }
        } else {
          // 如果遇到靠近城市的活动，结束当前段
          if (segmentStart && segmentEnd) {
            const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 
              segmentDistance > 50 ? 'HIGH' :
              segmentDistance > 30 ? 'MEDIUM' : 'LOW';

            const startTime = this.parseTimeToMinutes(segmentStart.startTime!);
            const endTime = this.parseTimeToMinutes(segmentEnd.endTime!);

            const startDateTime = new Date(dayDate);
            startDateTime.setHours(Math.floor(startTime / 60), startTime % 60, 0, 0);
            
            const endDateTime = new Date(dayDate);
            endDateTime.setHours(Math.floor(endTime / 60), endTime % 60, 0, 0);

            segments.push({
              day: day.dayNumber,
              start: startDateTime.toISOString(),
              end: endDateTime.toISOString(),
              distance_km: Math.round(segmentDistance),
              risk_level: riskLevel,
              description: `第${day.dayNumber}天连续活动距离城市中心 ${Math.round(segmentDistance)}km，救援支持有限`,
            });

            segmentStart = null;
            segmentEnd = null;
            segmentDistance = 0;
          }
        }
      }

      // 处理段尾
      if (segmentStart && segmentEnd) {
        const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 
          segmentDistance > 50 ? 'HIGH' :
          segmentDistance > 30 ? 'MEDIUM' : 'LOW';

        const startTime = this.parseTimeToMinutes(segmentStart.startTime!);
        const endTime = this.parseTimeToMinutes(segmentEnd.endTime!);

        const startDateTime = new Date(dayDate);
        startDateTime.setHours(Math.floor(startTime / 60), startTime % 60, 0, 0);
        
        const endDateTime = new Date(dayDate);
        endDateTime.setHours(Math.floor(endTime / 60), endTime % 60, 0, 0);

        segments.push({
          day: day.dayNumber,
          start: startDateTime.toISOString(),
          end: endDateTime.toISOString(),
          distance_km: Math.round(segmentDistance),
          risk_level: riskLevel,
          description: `第${day.dayNumber}天连续活动距离城市中心 ${Math.round(segmentDistance)}km，救援支持有限`,
        });
      }
    }

    return segments || [];
  }

  /**
   * 🆕 格式化时间为 HH:mm
   */
  private formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  /**
   * 🆕 生成候选路线（多策略、多次采样）
   * 
   * 策略：
   * - COMPACT: 紧凑型（最大化景点数量，时间紧凑）
   * - BALANCED: 均衡型（平衡舒适度和效率）
   * - RELAXED: 松弛型（优先舒适度，留足休息时间）
   */
  private async generateCandidateRoutes(
    ctx: TripContext,
    request: RouteOptimizationRequest,
    demData?: DemGetProfileOutput
  ): Promise<RouteOptimizationEvidence['candidate_routes']> {
    const config = request.candidate_route_config || {};
    const strategies = config.strategies || ['COMPACT', 'BALANCED', 'RELAXED'];
    const samplesPerStrategy = config.samples_per_strategy || 2;
    
    const routes: RouteOptimizationEvidence['candidate_routes']['routes'] = [];
    let successful = 0;
    let failed = 0;

    // 为每个策略生成候选路线
    for (const strategy of strategies) {
      for (let sample = 0; sample < samplesPerStrategy; sample++) {
        try {
          // 根据策略调整评分权重
          const strategyWeights = this.getStrategyWeights(strategy);
          
          // 重新计算软评分（使用策略权重和 DEM 数据）
          const strategySoftScores = this.calculateSoftScoresWithWeights(ctx, strategyWeights, demData);
          
          // 生成路线描述
          const description = this.generateRouteDescription(ctx, strategy, strategySoftScores);
          
          // 计算关键特征
          const keyFeatures = {
            total_duration_minutes: ctx.days.reduce((sum, day) => 
              sum + day.items.reduce((s, item) => s + (item.duration || 60), 0), 0),
            total_distance_km: 0, // 需要计算实际距离
            activity_count: ctx.days.reduce((sum, day) => sum + day.items.length, 0),
            fatigue_score: strategySoftScores.fatigue.score,
            pace_score: strategySoftScores.pace.score,
          };

          routes.push({
            id: `candidate_${strategy}_${sample}_${Date.now()}`,
            strategy: strategy as 'COMPACT' | 'BALANCED' | 'RELAXED',
            score: strategySoftScores.overall,
            description,
            key_features: keyFeatures,
          });

          successful++;
        } catch (error) {
          this.logger.warn(`[路线优化] 生成候选路线失败 (${strategy}, sample ${sample}): ${error}`);
          failed++;
        }
      }
    }

    // 选择最佳候选路线（分数最高）
    const bestRoute = routes.length > 0 
      ? routes.reduce((best, current) => current.score > best.score ? current : best)
      : undefined;

    return {
      routes,
      best_route_id: bestRoute?.id,
      statistics: {
        total_generated: routes.length,
        successful,
        failed,
      },
    };
  }

  /**
   * 🆕 获取策略权重
   */
  private getStrategyWeights(strategy: string): {
    fatigue: number;
    pace: number;
    experience: number;
    efficiency: number;
  } {
    switch (strategy) {
      case 'COMPACT':
        return { fatigue: 0.2, pace: 0.3, experience: 0.3, efficiency: 0.2 };
      case 'BALANCED':
        return { fatigue: 0.3, pace: 0.25, experience: 0.25, efficiency: 0.2 };
      case 'RELAXED':
        return { fatigue: 0.4, pace: 0.3, experience: 0.2, efficiency: 0.1 };
      default:
        return { fatigue: 0.3, pace: 0.25, experience: 0.25, efficiency: 0.2 };
    }
  }

  /**
   * 🆕 使用自定义权重计算软评分
   */
  private calculateSoftScoresWithWeights(
    ctx: TripContext,
    weights: { fatigue: number; pace: number; experience: number; efficiency: number },
    demData?: DemGetProfileOutput
  ): RouteOptimizationEvidence['soft_scores'] {
    const fatigueScore = this.calculateFatigueScore(ctx, demData);
    const paceScore = this.calculatePaceScore(ctx);
    const experienceScore = this.calculateExperienceScore(ctx);
    const efficiencyScore = this.calculateEfficiencyScore(ctx);

    // 使用自定义权重
    const overall = 
      fatigueScore.score * weights.fatigue +
      paceScore.score * weights.pace +
      experienceScore.score * weights.experience +
      efficiencyScore.score * weights.efficiency;

    return {
      fatigue: { ...fatigueScore, weight: weights.fatigue },
      pace: { ...paceScore, weight: weights.pace },
      experience: { ...experienceScore, weight: weights.experience },
      efficiency: { ...efficiencyScore, weight: weights.efficiency },
      overall: Math.round(overall),
    };
  }

  /**
   * 🆕 生成路线描述
   */
  private generateRouteDescription(
    ctx: TripContext,
    strategy: string,
    softScores: RouteOptimizationEvidence['soft_scores']
  ): string {
    const strategyNames: Record<string, string> = {
      'COMPACT': '紧凑型',
      'BALANCED': '均衡型',
      'RELAXED': '松弛型',
    };

    const strategyName = strategyNames[strategy] || strategy;
    const totalActivities = ctx.days.reduce((sum, day) => sum + day.items.length, 0);
    const avgDailyActivities = Math.round(totalActivities / ctx.durationDays);

    return `${strategyName}路线：共 ${totalActivities} 个活动，平均每天 ${avgDailyActivities} 个。` +
           `疲劳评分 ${softScores.fatigue.score}/100，节奏评分 ${softScores.pace.score}/100，` +
           `综合评分 ${softScores.overall}/100。`;
  }
}
