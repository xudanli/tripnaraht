import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DEMEffortMetadataService } from '../../trips/dem/services/dem-effort-metadata.service';
import { getFixtureByName } from '../../route-directions/fixtures';
import type {
  RouteDirectionData,
  RoutePhilosophyField,
} from '../../route-directions/interfaces/route-direction.interface';
import type { RoutePhilosophy } from '../../route-directions/fixtures/types';
import {
  IS_LAUGAVEGUR_PHILOSOPHY,
} from '../../route-directions/fixtures/is_laugavegur.fixture';
import {
  IS_TREKKING_WILDERNESS_DAY_SKELETON,
  LAUGAVEGUR_DAY_SKELETON,
  LAUGAVEGUR_POLYLINE_POI_IDS,
  LAUGAVEGUR_ROUTE_POINTS,
  LAUGAVEGUR_SUPPLY_POI_IDS,
  ROUTE_DIRECTION_NAME,
} from '../constants/laugavegur-demo.constants';
import { LAUGAVEGUR_PERMITS } from '../constants/hiking-permits.constants';
import {
  IS_LAUGAVEGUR_HIKING_DETAIL_OVERRIDE,
  LAUGAVEGUR_RISK_MATRIX_ROWS,
} from '../constants/is-laugavegur-hiking-detail.constants';
import {
  buildDefaultPermitsForRoute,
  ensureHikingDetailPermits,
} from '../utils/hiking-detail-permits.util';
import { getHighlandPoisByIds } from '../utils/highland-poi-catalog.util';
import {
  createHumanCapabilityModelFromQuestionnaire,
  type FitnessQuestionnaireAnswers,
} from '../../trips/decision/models/human-capability.model';
import {
  applyHikingDetailOverride,
  extractHikingDetailOverride,
} from '../utils/hiking-detail-override-merge.util';
import type {
  HikingDetailDaySkeleton,
  HikingDetailElevationPoint,
  HikingDetailSupplyPoi,
  HikingDetailTerrainSummary,
  HikingListCardFields,
  HikingTrailDetail,
} from '../../route-directions/types/hiking-trail-detail.types';

export type RouteDirectionRow = {
  id?: number;
  name: string;
  nameCN?: string | null;
  nameEN?: string | null;
  countryCode?: string;
  tags?: string[];
  description?: string | null;
  seasonality?: unknown;
  constraints?: unknown;
  riskProfile?: unknown;
  entryHubs?: string[];
  metadata?: unknown;
};

@Injectable()
export class HikingTrailDetailService {
  private readonly logger = new Logger(HikingTrailDetailService.name);

  constructor(private readonly demEffort: DEMEffortMetadataService) {}

  isHikingRoute(rd: RouteDirectionRow): boolean {
    const tags = rd.tags ?? [];
    if (tags.some((t) => t === '徒步' || /hik|trek|trail/i.test(t))) return true;
    const fixture = getFixtureByName(rd.name);
    return !!fixture?.tags?.some((t) => t === '徒步' || /hik|trek|trail/i.test(t));
  }

  /** 详情页 GET /route-directions/:id — 徒步线默认附带 hikingDetail（无需 include 参数） */
  shouldIncludeDetailForRoute(rd: RouteDirectionRow, explicitInclude?: boolean): boolean {
    if (explicitInclude === true) return true;
    if (explicitInclude === false) return false;
    return this.isHikingRoute(rd);
  }

  resolveRouteDirectionName(rd: RouteDirectionRow): string {
    return rd.name;
  }

  private isLaugavegurAnchor(rd: RouteDirectionRow): boolean {
    const meta = (rd.metadata ?? {}) as Record<string, unknown>;
    return (
      rd.name === ROUTE_DIRECTION_NAME || meta.demoAnchor === 'laugavegur'
    );
  }

  async build(
    rd: RouteDirectionRow,
    options?: { longestHike?: number; useCachedProfileFallback?: boolean },
  ): Promise<HikingTrailDetail | null> {
    if (!this.isHikingRoute(rd)) return null;

    const name = this.resolveRouteDirectionName(rd);
    const fixture = getFixtureByName(name);
    const merged = this.mergeRowWithFixture(rd, fixture);

    let detail: HikingTrailDetail | null;
    if (name === ROUTE_DIRECTION_NAME || (merged.metadata as Record<string, unknown>)?.demoAnchor === 'laugavegur') {
      detail = await this.buildLaugavegurDetail(merged, options);
    } else {
      detail = await this.buildGenericHikingDetail(merged, fixture, options);
    }

    if (!detail) return null;

    let override = extractHikingDetailOverride(merged.metadata);
    if (Object.keys(override).length === 0 && this.isLaugavegurAnchor(merged)) {
      override = IS_LAUGAVEGUR_HIKING_DETAIL_OVERRIDE;
    }
    if (Object.keys(override).length > 0) {
      detail = applyHikingDetailOverride(detail, override);
    }

    return ensureHikingDetailPermits(detail, merged, fixture);
  }

  buildListCardFields(rd: RouteDirectionRow): HikingListCardFields {
    const name = rd.name;
    const fixture = getFixtureByName(name);
    const meta = (fixture?.metadata ?? rd.metadata ?? {}) as Record<string, unknown>;
    const constraints = (rd.constraints ?? fixture?.constraints ?? {}) as Record<string, unknown>;
    const soft = (constraints.soft ?? {}) as Record<string, number>;
    const totalDistanceKm =
      (meta.totalDistanceKm as number) ??
      LAUGAVEGUR_DAY_SKELETON.reduce((a, d) => a + d.distanceKm, 0);
    const totalAscentM =
      soft.maxDailyAscentM != null
        ? Number(soft.maxDailyAscentM) * ((meta.estimatedDuration as number) ?? 4)
        : LAUGAVEGUR_DAY_SKELETON.reduce((a, d) => a + d.ascentM, 0);

    const points =
      name === ROUTE_DIRECTION_NAME
        ? LAUGAVEGUR_ROUTE_POINTS
        : [{ lat: 64.15, lng: -21.94 }];
    const start = points[0];
    const entryHubs = rd.entryHubs?.length ? rd.entryHubs : fixture?.entryHubs ?? [];
    const startPointLabel =
      entryHubs[entryHubs.length - 1] ??
      entryHubs[0] ??
      rd.nameCN ??
      rd.name;

    const readinessScore = this.estimateReadinessScore(totalAscentM, totalDistanceKm);

    return {
      readinessScore,
      totalDistanceKm,
      totalAscentM,
      elevationGainM: totalAscentM,
      estimatedDays:
        (meta.estimatedDuration as number) ??
        asRoutePhilosophy(fixture?.philosophy)?.durationFlexibility?.preferredDays ??
        4,
      center: start,
      startPoint: start,
      startPointLabel,
    };
  }

  private mergeRowWithFixture(
    rd: RouteDirectionRow,
    fixture?: RouteDirectionData,
  ): RouteDirectionRow {
    if (!fixture) return rd;
    return {
      ...rd,
      nameCN: rd.nameCN ?? fixture.nameCN,
      nameEN: rd.nameEN ?? fixture.nameEN,
      countryCode: rd.countryCode ?? fixture.countryCode,
      tags: rd.tags?.length ? rd.tags : fixture.tags,
      seasonality: rd.seasonality ?? fixture.seasonality,
      constraints: rd.constraints ?? fixture.constraints,
      riskProfile: rd.riskProfile ?? fixture.riskProfile,
      entryHubs: rd.entryHubs?.length ? rd.entryHubs : fixture.entryHubs,
      metadata: { ...(fixture.metadata as object), ...(rd.metadata as object) },
    };
  }

  private async buildLaugavegurDetail(
    rd: RouteDirectionRow,
    options?: { longestHike?: number; useCachedProfileFallback?: boolean },
  ): Promise<HikingTrailDetail> {
    const longestHike = Math.min(4, Math.max(0, options?.longestHike ?? 2)) as 0 | 1 | 2 | 3 | 4;
    const { elevationProfile, terrainSummary } = await this.resolveElevationAndTerrain(
      LAUGAVEGUR_ROUTE_POINTS,
      options?.useCachedProfileFallback !== false,
    );

    const supplyPois = this.mapSupplyPois([...LAUGAVEGUR_SUPPLY_POI_IDS, ...LAUGAVEGUR_POLYLINE_POI_IDS]);
    const polyline = LAUGAVEGUR_ROUTE_POINTS.map((p) => ({ lat: p.lat, lng: p.lng }));
    const fixture = getFixtureByName(rd.name);
    const suggestedDays = this.resolveSuggestedDays(rd, fixture);
    const daySkeleton = this.buildDaySkeleton(rd, fixture, suggestedDays);
    const totalDistanceKm = daySkeleton.reduce((a, d) => a + d.distanceKm, 0);
    const totalAscentM = daySkeleton.reduce((a, d) => a + d.ascentM, 0);
    const fitnessMatch = this.buildFitnessMatch(daySkeleton, longestHike);

    const constraints = (rd.constraints ?? {}) as { soft?: { maxElevationM?: number }; hard?: Record<string, unknown> };
    const riskProfile = (rd.riskProfile ?? {}) as {
      level?: string;
      altitudeSickness?: boolean;
      roadClosure?: boolean;
    };

    return {
      summary: {
        totalDistanceKm,
        totalAscentM,
        totalDescentM: terrainSummary.cumulativeAscentM > 0 ? Math.round(totalAscentM * 0.9) : undefined,
        suggestedDays,
        estimatedTimeMin: terrainSummary.totalDistanceKm * 18,
        maxElevationM: constraints.soft?.maxElevationM ?? terrainSummary.cumulativeAscentM ?? 1120,
        minElevationM: 200,
        difficulty: riskProfile.level ?? terrainSummary.difficulty ?? 'challenging',
        readinessScore: fitnessMatch.eligible ? 72 : 58,
        loopType: 'point_to_point',
      },
      geometry: {
        polyline,
        startPoint: { lat: polyline[0].lat, lng: polyline[0].lng, nameCN: 'Landmannalaugar' },
        endPoint: {
          lat: polyline[polyline.length - 1].lat,
          lng: polyline[polyline.length - 1].lng,
          nameCN: 'Þórsmörk',
        },
      },
      daySkeleton,
      elevationProfile,
      terrainSummary,
      supplyPois,
      fitnessMatch,
      weatherRisk: {
        level: 'high',
        headlineZh: '仅在 7–8 月高地窗口期适宜穿越',
        rules: IS_LAUGAVEGUR_PHILOSOPHY.nonNegotiableRules,
      },
      segments: this.buildSegmentsFromDays(daySkeleton, supplyPois),
      riskMatrix: {
        weatherSensitivity: 'high',
        exposureLevel: 'high',
        riverCrossing: true,
        altitudeSickness: !!riskProfile.altitudeSickness,
        roadClosureRisk: !!riskProfile.roadClosure,
        signalBlackout: true,
        riskTags: ['exposure', 'river_crossing', 'weather_window', 'no_signal'],
      },
      riskMatrixRows: LAUGAVEGUR_RISK_MATRIX_ROWS,
      hardGates: [
        {
          id: 'season',
          category: 'other',
          titleZh: '开放季节',
          ruleZh: '非 7–8 月禁止进入高地步道（封路或极端危险）',
        },
        {
          id: 'wind',
          category: 'wind',
          titleZh: '风速',
          ruleZh: '超过 12 m/s 禁止暴露山脊路段',
          threshold: '>12m/s',
        },
        {
          id: 'river',
          category: 'other',
          titleZh: '融水河流',
          ruleZh: '冰川融水河流午后暴涨，涉水须选早晨窗口',
        },
      ],
      emergency: {
        rescuePhone: '112',
        registrationPointZh: 'Landmannalaugar 访客中心 / FÍ 山屋登记',
        nearestExitPoints: [
          { nameZh: 'Landmannalaugar 巴士站', lat: 63.993, lng: -19.062, distanceKm: 0 },
          { nameZh: 'Þórsmörk 河谷出口', lat: 63.68, lng: -19.48, distanceKm: 55 },
        ],
      },
      access: {
        driving: {
          parkingNameZh: 'Landmannalaugar 高地停车场',
          parkingLat: 63.993,
          parkingLng: -19.062,
          driveDurationMin: 180,
          noteZh: '需 F208 高地公路（夏季开放，建议 4x4）',
        },
        transit: {
          scheduleZh: '雷克雅未克 — Landmannalaugar 夏季巴士 08:00–10:00（班次有限）',
          seasonNoteZh: '仅 7–8 月运营',
        },
      },
      supplies: {
        waterDensity: 'medium',
        waterSources: [{ nameZh: '沿途融水溪流（需净水）', seasonal: '7–8 月' }],
      },
      shelters: this.mapShelters(supplyPois.filter((p) => p.subCategory === 'HUT')),
      timeWindows: {
        suggestedDepartTime: '07:00',
        lastReturnBusTime: '17:30',
        sunsetBufferMin: 90,
        daylightHoursNoteZh: '高地夏季日照长，但仍需预留过河与避风时间',
      },
      permits: LAUGAVEGUR_PERMITS,
      checklistTemplates: [
        {
          id: 'gear-core',
          category: 'gear',
          titleZh: '核心装备',
          items: [
            { id: 'boots', labelZh: '防水徒步靴', required: true },
            { id: 'rain', labelZh: '硬壳雨衣裤', required: true },
            { id: 'warm', labelZh: '保暖层与手套', required: true },
            { id: 'gps', labelZh: '离线地图 / GPS', required: true },
          ],
        },
        {
          id: 'safety-highland',
          category: 'safety',
          titleZh: '高地安全',
          items: [
            { id: 'river', labelZh: '过河鞋 / 绳索（视河段）', required: false },
            { id: 'comm', labelZh: '卫星通讯或结伴', required: true },
          ],
        },
      ],
      offlinePackHints: this.buildOfflinePackHints(ROUTE_DIRECTION_NAME),
      alternatives: {
        planBRoutes: [
          {
            id: 'IS_TREKKING_WILDERNESS',
            titleZh: '荒野徒步探险（泛高地）',
            summaryZh: '更长线、更野的路网组合，适合有野营经验者',
            reasonZh: '若朗格迈维卢尔山屋满员或天气不稳',
            routeDirectionName: 'IS_TREKKING_WILDERNESS',
          },
        ],
        exitPoints: [
          {
            id: 'exit-landmannalaugar',
            nameZh: '起点 Landmannalaugar 折返',
            distanceAlongTrailKm: 0,
            lat: 63.993,
            lng: -19.062,
          },
          {
            id: 'exit-thorsmork',
            nameZh: '终点 Þórsmörk 下撤',
            distanceAlongTrailKm: 55,
            lat: 63.68,
            lng: -19.48,
          },
        ],
        repairHints: [
          {
            scenario: 'weather',
            titleZh: '大风 / 暴雨',
            actionZh: '就近进入山屋或营地避风，勿强行穿越暴露山脊',
          },
          {
            scenario: 'fatigue',
            titleZh: '体能透支',
            actionZh: '将 4 日行程延长为 5 日，在中间 hut 加休整日',
          },
          {
            scenario: 'delay',
            titleZh: '过河延误',
            actionZh: '等待翌日早晨低水位窗口再过 Emstrur 融水河',
          },
        ],
      },
    };
  }

  private async buildGenericHikingDetail(
    rd: RouteDirectionRow,
    fixture: RouteDirectionData | undefined,
    options?: { longestHike?: number; useCachedProfileFallback?: boolean },
  ): Promise<HikingTrailDetail> {
    const meta = (fixture?.metadata ?? rd.metadata ?? {}) as Record<string, unknown>;
    const constraints = (rd.constraints ?? fixture?.constraints ?? {}) as {
      soft?: { maxElevationM?: number; maxDailyAscentM?: number };
    };
    const riskProfile = (rd.riskProfile ?? fixture?.riskProfile ?? {}) as {
      level?: string;
      altitudeSickness?: boolean;
      roadClosure?: boolean;
      factors?: string[];
    };
    const entryHubs = rd.entryHubs?.length ? rd.entryHubs : fixture?.entryHubs ?? [];
    const suggestedDays = this.resolveSuggestedDays(rd, fixture);
    const totalDistanceKm = (meta.totalDistanceKm as number) ?? 40;
    const daySkeleton = this.buildDaySkeleton(rd, fixture, suggestedDays);

    const polylineIds = meta.demoPolylinePoiIds as string[] | undefined;
    const supplyIds = (meta.demoSupplyPoiIds as string[] | undefined) ?? polylineIds;
    let polyline = [{ lat: 64.15, lng: -21.94 }];
    let supplyPois: HikingDetailSupplyPoi[] = [];
    if (polylineIds?.length) {
      const routePois = getHighlandPoisByIds(polylineIds);
      if (routePois.length >= 1) {
        polyline = routePois.map((p) => ({ lat: p.lat, lng: p.lng }));
        supplyPois = this.mapSupplyPois(supplyIds ?? polylineIds);
      }
    }

    const { elevationProfile, terrainSummary } = await this.resolveElevationAndTerrain(
      polyline,
      options?.useCachedProfileFallback !== false,
    );

    const longestHike = Math.min(4, Math.max(0, options?.longestHike ?? 2)) as 0 | 1 | 2 | 3 | 4;
    const fitnessMatch = this.buildFitnessMatch(daySkeleton, longestHike);
    const rules = asRoutePhilosophy(fixture?.philosophy)?.nonNegotiableRules ?? [];
    const totalAscentM = daySkeleton.reduce((a, d) => a + d.ascentM, 0);
    const huts = supplyPois.filter((p) => p.subCategory === 'HUT');

    return {
      summary: {
        totalDistanceKm,
        totalAscentM,
        suggestedDays,
        estimatedTimeMin: Math.round(totalDistanceKm * 18),
        maxElevationM: constraints.soft?.maxElevationM ?? 3000,
        difficulty: riskProfile.level ?? terrainSummary.difficulty ?? 'moderate',
        readinessScore: this.estimateReadinessScore(totalAscentM, totalDistanceKm),
        loopType: 'point_to_point',
      },
      geometry: {
        polyline,
        startPoint: {
          lat: polyline[0].lat,
          lng: polyline[0].lng,
          nameCN: entryHubs[0] ?? rd.nameCN ?? rd.name,
        },
        endPoint:
          polyline.length > 1
            ? {
                lat: polyline[polyline.length - 1].lat,
                lng: polyline[polyline.length - 1].lng,
                nameCN: entryHubs[entryHubs.length - 1] ?? rd.nameCN ?? rd.name,
              }
            : undefined,
      },
      daySkeleton,
      elevationProfile,
      terrainSummary,
      supplyPois,
      fitnessMatch,
      weatherRisk: rules.length
        ? { level: 'medium', headlineZh: '请关注季节窗口与装备要求', rules }
        : undefined,
      segments:
        supplyPois.length > 0 ? this.buildSegmentsFromDays(daySkeleton, supplyPois) : undefined,
      riskMatrix: {
        weatherSensitivity: riskProfile.roadClosure ? 'high' : 'medium',
        exposureLevel: 'medium',
        riverCrossing: (riskProfile.factors ?? []).some((f) => /river|涉水/i.test(f)),
        altitudeSickness: !!riskProfile.altitudeSickness,
        roadClosureRisk: !!riskProfile.roadClosure,
        signalBlackout: (riskProfile.factors ?? []).some((f) => /signal|信号/i.test(f)),
        riskTags: riskProfile.factors,
      },
      hardGates: rules.slice(0, 5).map((ruleZh, i) => ({
        id: `rule-${i}`,
        category: 'other' as const,
        titleZh: '行程规则',
        ruleZh,
      })),
      emergency: { rescuePhone: rd.countryCode === 'IS' ? '112' : undefined },
      access: entryHubs.length
        ? {
            transit: {
              scheduleZh: `入口枢纽：${entryHubs.join(' → ')}`,
              seasonNoteZh: (rd.seasonality as { bestMonths?: string[] })?.bestMonths?.length
                ? `适宜月份：${(rd.seasonality as { bestMonths: string[] }).bestMonths.join('、')}`
                : undefined,
            },
          }
        : undefined,
      supplies: { waterDensity: 'medium' as const },
      shelters: huts.length ? this.mapShelters(huts) : [],
      timeWindows: {},
      permits: buildDefaultPermitsForRoute(rd, fixture),
      checklistTemplates: this.buildGenericChecklistTemplates(rd),
      alternatives: { planBRoutes: [], exitPoints: [], repairHints: [] },
    };
  }

  private buildGenericChecklistTemplates(rd: RouteDirectionRow): NonNullable<
    HikingTrailDetail['checklistTemplates']
  > {
    const label = rd.nameCN ?? rd.name;
    return [
      {
        id: 'gear-essential',
        category: 'gear',
        titleZh: '核心装备',
        items: [
          { id: 'boots', labelZh: '防水徒步靴', required: true },
          { id: 'rain', labelZh: '硬壳雨衣裤', required: true },
          { id: 'layers', labelZh: '保暖分层', required: true },
        ],
      },
      {
        id: 'safety-route',
        category: 'safety',
        titleZh: `${label} 安全`,
        items: [
          { id: 'offline-map', labelZh: '离线地图 / GPS', required: true },
          { id: 'first-aid', labelZh: '急救与个人药品', required: false },
        ],
      },
    ];
  }

  private mapDaySkeleton(
    skeleton: typeof LAUGAVEGUR_DAY_SKELETON,
  ): HikingDetailDaySkeleton[] {
    return skeleton.map((d) => ({
      day: d.day,
      theme: d.titleZh,
      distanceKm: d.distanceKm,
      ascentM: d.ascentM,
      estimatedHours: Math.round(d.distanceKm * 3.5),
    }));
  }

  private mapSupplyPois(poiIds: string[]): HikingDetailSupplyPoi[] {
    return getHighlandPoisByIds(poiIds).map((p) => ({
      id: p.id,
      nameCN: p.nameCN,
      nameEN: p.nameEN,
      subCategory: p.subCategory,
      lat: p.lat,
      lng: p.lng,
      role: p.role,
      elevation_m: p.elevation_m,
      capacity: p.capacity,
      bookingRequired: p.facilities?.requiresBooking ?? p.subCategory === 'HUT',
      feeEstimate: p.subCategory === 'HUT' ? 'FÍ 山屋预订（夏季紧俏）' : undefined,
    }));
  }

  private mapShelters(
    huts: HikingDetailSupplyPoi[],
  ): NonNullable<HikingTrailDetail['shelters']> {
    return huts.map((h) => ({
      id: h.id,
      nameCN: h.nameCN,
      nameEN: h.nameEN,
      lat: h.lat,
      lng: h.lng,
      elevation_m: h.elevation_m,
      capacity: h.capacity,
      bookingRequired: h.bookingRequired ?? true,
      feeZh: h.feeEstimate,
      openSeason: '7–8 月',
    }));
  }

  /** 与 Laugavegur 同 POI 折线 / demoAnchor 的路线用真实日段，避免均分占位 */
  private sharesLaugavegurCorridor(meta: Record<string, unknown>): boolean {
    if (meta.demoAnchor === 'laugavegur' || meta.laugavegurCorridor === true) {
      return true;
    }
    const ids = meta.demoPolylinePoiIds;
    if (!Array.isArray(ids) || ids.length < 2) return false;
    const anchor = new Set(LAUGAVEGUR_POLYLINE_POI_IDS);
    return ids.filter((id) => anchor.has(id as (typeof LAUGAVEGUR_POLYLINE_POI_IDS)[number])).length >= 2;
  }

  private resolveSuggestedDays(
    rd: RouteDirectionRow,
    fixture?: RouteDirectionData,
  ): number {
    const meta = (rd.metadata ?? fixture?.metadata ?? {}) as Record<string, unknown>;
    const constraints = (rd.constraints ?? fixture?.constraints ?? {}) as {
      minDays?: number;
      maxDays?: number;
    };

    if (typeof meta.estimatedDuration === 'number' && meta.estimatedDuration > 0) {
      return Math.round(meta.estimatedDuration);
    }
    if (typeof meta.suggestedDays === 'number' && meta.suggestedDays > 0) {
      return Math.round(meta.suggestedDays);
    }
    const phil = asRoutePhilosophy(fixture?.philosophy);
    if (phil?.durationFlexibility?.preferredDays) {
      return phil.durationFlexibility.preferredDays;
    }
    if (constraints.minDays != null && constraints.maxDays != null) {
      return Math.round((constraints.minDays + constraints.maxDays) / 2);
    }
    if (constraints.maxDays != null) return constraints.maxDays;
    if (constraints.minDays != null) return constraints.minDays;
    return 4;
  }

  private buildDaySkeleton(
    rd: RouteDirectionRow,
    fixture: RouteDirectionData | undefined,
    suggestedDays: number,
  ): HikingDetailDaySkeleton[] {
    const meta = (rd.metadata ?? fixture?.metadata ?? {}) as Record<string, unknown>;
    const raw = meta.daySkeleton;
    if (Array.isArray(raw) && raw.length > 0) {
      return this.normalizeDaySkeletonRows(raw, suggestedDays);
    }

    const name = rd.name;
    if (name === ROUTE_DIRECTION_NAME) {
      const base = this.mapDaySkeleton(LAUGAVEGUR_DAY_SKELETON);
      return this.expandDaySkeleton(base, suggestedDays, rd.nameCN ?? name);
    }

    if (name === 'IS_TREKKING_WILDERNESS' || this.sharesLaugavegurCorridor(meta)) {
      const base = this.mapDaySkeleton(
        name === 'IS_TREKKING_WILDERNESS'
          ? IS_TREKKING_WILDERNESS_DAY_SKELETON
          : LAUGAVEGUR_DAY_SKELETON,
      );
      return this.expandDaySkeleton(base, suggestedDays, rd.nameCN ?? name);
    }

    const totalDistanceKm = (meta.totalDistanceKm as number) ?? 40;
    const constraints = (rd.constraints ?? fixture?.constraints ?? {}) as {
      soft?: { maxDailyAscentM?: number };
    };
    const perDayKm = totalDistanceKm / suggestedDays;
    const ascentPerDay = constraints.soft?.maxDailyAscentM ?? 500;

    return Array.from({ length: suggestedDays }, (_, i) => ({
      day: i + 1,
      theme: `${rd.nameCN ?? rd.name} 第 ${i + 1} 日`,
      distanceKm: Math.round(perDayKm * 10) / 10,
      ascentM: Math.round(ascentPerDay),
      estimatedHours: Math.round(perDayKm * 3),
    }));
  }

  private normalizeDaySkeletonRows(
    raw: unknown[],
    suggestedDays: number,
  ): HikingDetailDaySkeleton[] {
    const rows = raw
      .map((row, idx) => {
        const r = row as Record<string, unknown>;
        return {
          day: typeof r.day === 'number' ? r.day : idx + 1,
          theme: String(r.theme ?? r.titleZh ?? `第 ${idx + 1} 日`),
          distanceKm: Number(r.distanceKm ?? 0),
          ascentM: Number(r.ascentM ?? 0),
          descentM: r.descentM != null ? Number(r.descentM) : undefined,
          estimatedHours: r.estimatedHours != null ? Number(r.estimatedHours) : undefined,
        };
      })
      .filter((d) => d.distanceKm >= 0);
    if (rows.length === suggestedDays) return rows;
    if (rows.length > suggestedDays) {
      return rows.slice(0, suggestedDays).map((d, i) => ({ ...d, day: i + 1 }));
    }
    return this.expandDaySkeleton(rows, suggestedDays, '徒步');
  }

  private expandDaySkeleton(
    base: HikingDetailDaySkeleton[],
    targetDays: number,
    label: string,
  ): HikingDetailDaySkeleton[] {
    if (targetDays <= 0) return [];
    if (base.length === 0) {
      return Array.from({ length: targetDays }, (_, i) => ({
        day: i + 1,
        theme: `${label} 第 ${i + 1} 日`,
        distanceKm: 10,
        ascentM: 300,
        estimatedHours: 6,
      }));
    }

    const rows = base.slice(0, targetDays).map((d) => ({ ...d }));
    const avgDistance =
      rows.reduce((a, d) => a + d.distanceKm, 0) / rows.length || 12;
    const avgAscent = rows.reduce((a, d) => a + d.ascentM, 0) / rows.length || 200;

    while (rows.length < targetDays) {
      const n = rows.length + 1;
      rows.push({
        day: n,
        theme: `${label} 第 ${n} 日（缓冲/加休）`,
        distanceKm: Math.round(avgDistance * 0.65 * 10) / 10,
        ascentM: Math.round(avgAscent * 0.5),
        estimatedHours: Math.round(avgDistance * 2.5),
      });
    }

    return rows.map((d, i) => ({ ...d, day: i + 1 }));
  }

  private buildFitnessMatch(
    daySkeleton: HikingDetailDaySkeleton[],
    longestHike: 0 | 1 | 2 | 3 | 4,
  ) {
    const questionnaire: FitnessQuestionnaireAnswers = {
      longestHike,
      ageGroup: '30-39',
      weeklyExercise: 2,
      elevationExperience: 2,
    };
    const capability = createHumanCapabilityModelFromQuestionnaire('detail', questionnaire);
    const maxDailyAscentM = capability.maxDailyAscentM;
    const suggestedDays = daySkeleton.length;

    const dayPaceVerdict = daySkeleton.map((d) => {
      const softCap = maxDailyAscentM * 1.15;
      const hardCap = maxDailyAscentM * 1.35;
      const eligible = d.ascentM <= softCap;

      let verdict: 'pace_ok' | 'pace_tight' | 'pace_hard';
      let noteZh: string;

      if (d.ascentM > hardCap) {
        verdict = 'pace_hard';
        noteZh = `第 ${d.day} 日爬升约 ${d.ascentM}m，明显高于建议上限 ${maxDailyAscentM}m，建议加缓冲日或减轻负重`;
      } else if (!eligible || d.ascentM > maxDailyAscentM) {
        verdict = 'pace_tight';
        noteZh = `第 ${d.day} 日爬升约 ${d.ascentM}m，略超舒适区（约 ${maxDailyAscentM}m），建议放慢节奏`;
      } else {
        verdict = 'pace_ok';
        noteZh = `第 ${d.day} 日爬升约 ${d.ascentM}m，在建议范围内（上限约 ${maxDailyAscentM}m）`;
      }

      if (longestHike < suggestedDays - 1 && d.day > longestHike) {
        noteZh += `；问卷最长连续徒步 ${longestHike} 天，全行程 ${suggestedDays} 日请预留恢复`;
      }

      return {
        day: d.day,
        ascentM: d.ascentM,
        eligible,
        verdict,
        noteZh,
      };
    });

    const fitnessVerdict: 'pace_ok' | 'pace_tight' | 'pace_hard' = dayPaceVerdict.some(
      (v) => v.verdict === 'pace_hard',
    )
      ? 'pace_hard'
      : dayPaceVerdict.some((v) => v.verdict === 'pace_tight')
        ? 'pace_tight'
        : 'pace_ok';

    return {
      longestHike,
      maxDailyAscentM,
      suggestedDays,
      dayPaceVerdict,
      eligible: dayPaceVerdict.every((d) => d.eligible),
      fitnessVerdict,
    };
  }

  private buildSegmentsFromDays(
    days: HikingDetailDaySkeleton[],
    supplyPois: HikingDetailSupplyPoi[],
  ): NonNullable<HikingTrailDetail['segments']> {
    return days.map((d, idx) => {
      const hut = supplyPois.find((p) => p.subCategory === 'HUT');
      return {
        index: idx + 1,
        nameZh: d.theme,
        distanceKm: d.distanceKm,
        ascentM: d.ascentM,
        exposureLevel: 'high' as const,
        estimatedHours: d.estimatedHours,
        keyNodes: hut
          ? [
              {
                type: 'shelter' as const,
                nameZh: hut.nameCN,
                lat: hut.lat,
                lng: hut.lng,
              },
            ]
          : undefined,
      };
    });
  }

  private async resolveElevationAndTerrain(
    routePoints: Array<{ lat: number; lng: number; label?: string }>,
    useFallback: boolean,
  ): Promise<{
    elevationProfile: HikingDetailElevationPoint[];
    terrainSummary: HikingDetailTerrainSummary;
  }> {
    try {
      const effort = await this.demEffort.calculateEffortMetadata(
        routePoints.map((p) => ({ lat: p.lat, lng: p.lng })),
        { samplingInterval: 500, includeElevationProfile: true },
      );
      const profile = this.enrichElevationProfile(
        effort.elevationProfile ?? [],
        routePoints,
      );
      return {
        elevationProfile: profile,
        terrainSummary: {
          cumulativeAscentM: effort.totalAscent,
          maxSlopePct: effort.maxSlope,
          totalDistanceKm: effort.totalDistance / 1000,
          effortScore: effort.effortScore,
          difficulty: effort.difficulty,
          dataSource: 'live_dem',
        },
      };
    } catch (e) {
      this.logger.warn(`DEM detail failed: ${e}`);
      if (!useFallback) {
        return {
          elevationProfile: [],
          terrainSummary: {
            cumulativeAscentM: 0,
            maxSlopePct: 0,
            totalDistanceKm: 0,
            effortScore: 0,
            difficulty: 'unknown',
            dataSource: 'cached_fixture',
          },
        };
      }
      const cached = this.loadCachedFixture();
      const profile = this.enrichElevationProfile(
        (cached.elevationProfile ?? []).map((p) => ({
          distance: p.distance,
          elevation: p.elevation,
          slope: p.slope ?? 0,
        })),
        routePoints,
      );
      return {
        elevationProfile: profile,
        terrainSummary: {
          cumulativeAscentM: cached.cumulativeAscentM ?? 920,
          maxSlopePct: 28,
          totalDistanceKm: (cached.totalDistanceM ?? 55000) / 1000,
          effortScore: cached.fatigueIndex ?? 72,
          difficulty: 'challenging',
          dataSource: 'cached_fixture',
        },
      };
    }
  }

  private enrichElevationProfile(
    raw: Array<{ distance: number; elevation: number; slope: number }>,
    routePoints: Array<{ lat: number; lng: number }>,
  ): HikingDetailElevationPoint[] {
    let cum = 0;
    let prevElev = raw[0]?.elevation ?? 0;
    const totalRoute = raw.length > 0 ? raw[raw.length - 1].distance : 1;

    return raw.map((p, i) => {
      if (i > 0 && p.elevation > prevElev) cum += p.elevation - prevElev;
      prevElev = p.elevation;
      const t = totalRoute > 0 ? p.distance / totalRoute : 0;
      const lat = this.interpolateRouteCoord(routePoints, t, 'lat');
      const lng = this.interpolateRouteCoord(routePoints, t, 'lng');
      return {
        distance: p.distance,
        lat,
        lng,
        elevation: p.elevation,
        slope: p.slope,
        cumulativeAscent: Math.round(cum),
      };
    });
  }

  private interpolateRouteCoord(
    points: Array<{ lat: number; lng: number }>,
    t: number,
    key: 'lat' | 'lng',
  ): number {
    if (points.length === 0) return 0;
    if (points.length === 1) return points[0][key];
    const seg = t * (points.length - 1);
    const i = Math.min(Math.floor(seg), points.length - 2);
    const frac = seg - i;
    return points[i][key] + (points[i + 1][key] - points[i][key]) * frac;
  }

  private loadCachedFixture(): {
    elevationProfile?: Array<{ distance: number; elevation: number; slope?: number }>;
    cumulativeAscentM?: number;
    totalDistanceM?: number;
    fatigueIndex?: number;
  } {
    const filePath = path.join(process.cwd(), 'docs', 'DEMO_LAUGAVEGUR.json');
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      return {};
    }
  }

  private buildOfflinePackHints(routeDirectionName: string) {
    const base =
      process.env.HIKING_OFFLINE_PACK_BASE_URL ||
      process.env.PUBLIC_API_URL ||
      process.env.API_PUBLIC_URL ||
      'http://localhost:3000/api';
    const packKey = routeDirectionName.toLowerCase().replace(/_/g, '-');
    const root = base.replace(/\/$/, '');
    return {
      version: '2026.05.20',
      geojsonAvailable: true,
      tileManifestAvailable: true,
      geojsonUrl: `${root}/hiking/offline-packs/${packKey}/route.geojson`,
      tileManifestUrl: `${root}/hiking/offline-packs/${packKey}/tile-manifest.json`,
      noteZh: '调用 GET /hiking/route-directions/:id/offline-pack 获取 checksum 与 bounds',
    };
  }

  private estimateReadinessScore(totalAscentM: number, totalDistanceKm: number): number {
    const base = 85 - totalAscentM / 50 - totalDistanceKm / 3;
    return Math.max(35, Math.min(95, Math.round(base)));
  }
}

/** philosophy 字段可能是 string（旧数据）或 RoutePhilosophy 对象 */
function asRoutePhilosophy(field?: RoutePhilosophyField): RoutePhilosophy | undefined {
  if (!field || typeof field === 'string') return undefined;
  return field;
}
