/**
 * 团队协商上下文加载器
 *
 * 当协商请求只传 tripId 时，根据 tripId 从数据库加载行程并构建
 * 最小可用的 RoutePlanDraft 与 WorldModelContext，供 negotiateAsTeam 使用。
 */

import { Injectable, Logger } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { RoutePlanDraft, RouteSegment, WorldModelContext } from '../../shared/world-model.types';
import { PhysicalRealityModel } from '../../models/physical-reality.model';
import { createHumanCapabilityModelFromProfile } from '../../models/human-capability.model';
import type { RouteDirectionWithPhilosophy } from '../../shared/world-model.types';

export interface LoadedNegotiateContext {
  plan: RoutePlanDraft;
  world: WorldModelContext;
}

interface ItineraryItemWithPlace {
  Place?: { nameCN?: string; nameEN?: string; metadata?: unknown } | null;
}

interface TripDayWithItems {
  id: string;
  date: Date;
  ItineraryItem: Array<ItineraryItemWithPlace | null>;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

@Injectable()
export class NegotiateContextLoaderService {
  private readonly logger = new Logger(NegotiateContextLoaderService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 根据 tripId 加载行程并构建 plan + world。
   * 若行程不存在或无法构建，抛出 BadRequestException。
   */
  async loadPlanAndWorld(tripId: string): Promise<LoadedNegotiateContext> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          orderBy: { date: 'asc' },
          include: {
            ItineraryItem: {
              orderBy: [{ startTime: 'asc' }, { order: 'asc' }],
              include: { Place: true },
            },
          },
        },
      },
    });

    if (!trip) {
      throw new BadRequestException(`无法根据 tripId 加载行程：行程 ${tripId} 不存在`);
    }

    // 与 TripsService 详情接口对齐：DB 中坐标常在 PostGIS `location`，而 JSON metadata 未必含 coordinates。
    // `computeSegmentMetrics` 依赖 metadata.coordinates，因此在构建 plan 前补齐，避免 distanceKm 恒为 0。
    await this.enrichPlaceCoordinatesFromPostgis(trip);

    const metadata = (trip.metadata ?? {}) as Record<string, unknown>;
    const routeDirectionId =
      typeof metadata.routeDirectionId === 'string'
        ? metadata.routeDirectionId
        : metadata.routeDirectionId != null
          ? String(metadata.routeDirectionId)
          : 'default';
    const countryCode =
      typeof metadata.countryCode === 'string'
        ? metadata.countryCode
        : inferCountryCode(trip.destination);

    const plan = this.buildPlanFromTrip(tripId, routeDirectionId, trip.TripDay as TripDayWithItems[]);
    const world = await this.buildWorldWithRouteDirection(countryCode, routeDirectionId);

    const totalKm = plan.segments.reduce((s, seg) => s + (seg.distanceKm || 0), 0);
    this.logger.debug(
      `[NegotiateContextLoader] 已为 tripId=${tripId} 构建 plan(segments=${plan.segments.length}, totalKm=${totalKm.toFixed(1)}) + world`,
    );
    return { plan, world };
  }

  /**
   * 为缺少 `metadata.coordinates` 的 Place 从 PostGIS geography 批量注入坐标（仅内存，不写回 DB）。
   */
  private async enrichPlaceCoordinatesFromPostgis(trip: {
    TripDay?: Array<{
      ItineraryItem?: Array<{
        Place?: { id?: number; metadata?: unknown } | null;
      } | null>;
    }>;
  }): Promise<void> {
    const missingIds = new Set<number>();
    for (const day of trip.TripDay ?? []) {
      for (const item of day.ItineraryItem ?? []) {
        const p = item?.Place;
        if (!p) continue;
        const pid = p.id;
        if (typeof pid !== 'number' || !Number.isFinite(pid)) continue;
        const meta = ((p.metadata as Record<string, unknown> | null | undefined) ?? {}) as Record<string, unknown>;
        const c = meta.coordinates as { lat?: unknown; lng?: unknown } | undefined;
        const ok =
          c &&
          typeof c.lat === 'number' &&
          typeof c.lng === 'number' &&
          Number.isFinite(c.lat) &&
          Number.isFinite(c.lng);
        if (!ok) missingIds.add(pid);
      }
    }
    const ids = [...missingIds].filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return;

    try {
      const rows = await this.prisma.$queryRaw<Array<{ id: number; lat: unknown; lng: unknown }>>`
        SELECT
          id,
          ST_Y(location::geometry) as lat,
          ST_X(location::geometry) as lng
        FROM "Place"
        WHERE id = ANY(${ids}::int[]) AND location IS NOT NULL
      `;
      const coordMap = new Map<number, { lat: number; lng: number }>();
      for (const r of rows ?? []) {
        if (typeof r?.id !== 'number') continue;
        const lat = Number((r as { lat: unknown }).lat);
        const lng = Number((r as { lng: unknown }).lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          coordMap.set(r.id, { lat, lng });
        }
      }
      for (const day of trip.TripDay ?? []) {
        for (const item of day.ItineraryItem ?? []) {
          const p = item?.Place as { id?: number; metadata?: unknown } | null | undefined;
          if (!p || typeof p.id !== 'number') continue;
          const coords = coordMap.get(p.id);
          if (!coords) continue;
          const meta = ((p.metadata as Record<string, unknown> | null | undefined) ?? {}) as Record<string, unknown>;
          const c = meta.coordinates as { lat?: number; lng?: number } | undefined;
          if (
            c &&
            typeof c.lat === 'number' &&
            typeof c.lng === 'number' &&
            Number.isFinite(c.lat) &&
            Number.isFinite(c.lng)
          ) {
            continue;
          }
          (p as { metadata?: unknown }).metadata = { ...meta, coordinates: coords };
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.debug(`[NegotiateContextLoader] PostGIS 坐标补齐失败: ${msg}`);
    }
  }

  private buildPlanFromTrip(
    tripId: string,
    routeDirectionId: string,
    days: TripDayWithItems[],
  ): RoutePlanDraft {
    const segments: RouteSegment[] = days.map((day, index) => {
      const items = (day.ItineraryItem ?? []).filter((it): it is NonNullable<typeof it> => it != null);
      const { distanceKm, ascentM } = this.computeSegmentMetrics(items);
      const activityNames = this.extractActivityNames(items);
      return {
        segmentId: day.id,
        dayIndex: index + 1,
        distanceKm,
        ascentM,
        slopePct: distanceKm > 0 ? (ascentM / (distanceKm * 1000)) * 100 : 0,
        metadata: activityNames.length > 0 ? { activityNames } : undefined,
      };
    });

    if (segments.length === 0) {
      segments.push({
        segmentId: `placeholder-${tripId}`,
        dayIndex: 1,
        distanceKm: 0,
        ascentM: 0,
        slopePct: 0,
      });
    }

    return {
      tripId,
      routeDirectionId,
      segments,
    };
  }

  /**
   * 从行程项提取活动名称（用于优化建议展示具体活动）
   */
  private extractActivityNames(items: ItineraryItemWithPlace[]): string[] {
    const names = new Set<string>();
    for (const item of items || []) {
      const place = item?.Place;
      if (!place) continue;
      const name = (place.nameCN || place.nameEN || '').trim();
      if (name && !names.has(name)) names.add(name);
    }
    return [...names];
  }

  /**
   * 从行程项坐标计算当日 distanceKm 与 ascentM
   */
  private computeSegmentMetrics(
    items: Array<{ Place?: { metadata?: unknown } | null } | null>,
  ): { distanceKm: number; ascentM: number } {
    const coords = (items || [])
      .filter((i): i is { Place: { metadata?: unknown } } => !!i?.Place?.metadata)
      .map((i) => {
        const m = (i.Place!.metadata as Record<string, unknown>) || {};
        const c = m.coordinates as { lat?: number; lng?: number } | undefined;
        return c && typeof c.lat === 'number' && typeof c.lng === 'number' ? { lat: c.lat, lng: c.lng } : null;
      })
      .filter((c): c is { lat: number; lng: number } => c != null);

    if (coords.length < 2) return { distanceKm: 0, ascentM: 0 };

    let distanceKm = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      distanceKm += haversineKm(coords[i].lat, coords[i].lng, coords[i + 1].lat, coords[i + 1].lng);
    }

    return { distanceKm, ascentM: 0 };
  }

  /**
   * 构建 world，优先从 DB 拉取完整 RouteDirection（含 metadata.road_type 等）用于驾驶时间估算
   */
  private async buildWorldWithRouteDirection(countryCode: string, routeDirectionId: string): Promise<WorldModelContext> {
    const physical: PhysicalRealityModel = {
      demEvidence: [],
      roadStates: [],
      hazardZones: [],
      ferryStates: [],
      countryCode,
      month: new Date().getMonth() + 1,
    };

    const human = createHumanCapabilityModelFromProfile('negotiate-default', {
      pace: 'normal',
      fitness: 'medium',
      riskTolerance: 'medium',
      highAltitudeExperience: 'none',
    });

    let routeDirection: RouteDirectionWithPhilosophy;

    try {
      const db = await this.prisma.routeDirection.findFirst({
        where: { uuid: routeDirectionId },
      });
      if (db) {
        const meta = (db.metadata ?? {}) as Record<string, unknown>;
        routeDirection = {
          id: String(db.uuid ?? db.id),
          countryCode: db.countryCode,
          name: db.name ?? 'Default',
          nameCN: db.nameCN ?? db.name ?? '默认',
          nameEN: db.nameEN ?? db.name,
          description: db.description ?? undefined,
          tags: db.tags ?? [],
          regions: (db.regions ?? []) as string[],
          entryHubs: (db.entryHubs ?? []) as string[],
          seasonality: db.seasonality as RouteDirectionWithPhilosophy['seasonality'],
          constraints: db.constraints as RouteDirectionWithPhilosophy['constraints'],
          riskProfile: db.riskProfile as RouteDirectionWithPhilosophy['riskProfile'],
          philosophy: (meta.philosophy ?? '') as string,
          metadata: meta,
        };
        this.logger.debug(
          `[NegotiateContextLoader] 已加载完整 RouteDirection uuid=${routeDirectionId}（含 metadata）`,
        );
      } else {
        routeDirection = this.buildMinimalRouteDirection(countryCode, routeDirectionId);
      }
    } catch (e) {
      this.logger.debug(
        `[NegotiateContextLoader] 无法加载 RouteDirection uuid=${routeDirectionId}，使用最小化: ${(e as Error).message}`,
      );
      routeDirection = this.buildMinimalRouteDirection(countryCode, routeDirectionId);
    }

    return {
      physical,
      human,
      routeDirection,
    };
  }

  private buildMinimalRouteDirection(countryCode: string, routeDirectionId: string): RouteDirectionWithPhilosophy {
    return {
      id: routeDirectionId,
      countryCode,
      name: 'Default',
      nameCN: '默认',
      nameEN: 'Default',
      tags: [],
      philosophy: '',
    };
  }
}

function inferCountryCode(destination: string): string {
  const s = (destination || '').trim();
  if (s.length === 2 && /^[A-Za-z]{2}$/.test(s)) {
    return s.toUpperCase();
  }
  return 'IS';
}
