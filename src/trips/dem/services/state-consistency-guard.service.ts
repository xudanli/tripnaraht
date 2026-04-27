/**
 * StateConsistencyGuard / TerrainAudit — Kernel 前「地形审计」
 *
 * CGUS 依赖 segments.ascentM 等抽象地形特征。若上游未写爬升而仅有坐标与距离，
 * 决策核会退化为「平原生物」。本守卫在 OPTIMIZE / AutoRepair 前按需触发 **Shadow
 * Elevation**：走 `DEMElevationService` 多级 Fallback + `DEMEffortMetadataService`
 * 按日 polyline 回填 `ascentM` / `slopePct`，并写入 `metadata.avgElevationM` 供
 * 生理/时间余量非线性使用。
 */

import { Injectable, Logger } from '@nestjs/common';
import type { RoutePlanDraft, RouteSegment } from '../../decision/shared/world-model.types';
import { DEMElevationService } from './dem-elevation.service';
import { DEMEffortMetadataService, type RoutePoint } from './dem-effort-metadata.service';

function parseCoord(raw: unknown): { lat: number; lng: number } | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.lat === 'number' && typeof o.lng === 'number') {
    return { lat: o.lat, lng: o.lng };
  }
  if (typeof o.latitude === 'number' && typeof o.longitude === 'number') {
    return { lat: o.latitude, lng: o.longitude };
  }
  if (o.type === 'Point' && Array.isArray(o.coordinates)) {
    const arr = o.coordinates as number[];
    if (arr.length >= 2 && typeof arr[0] === 'number' && typeof arr[1] === 'number') {
      return { lat: arr[1], lng: arr[0] };
    }
  }
  return null;
}

@Injectable()
export class StateConsistencyGuardService {
  private readonly logger = new Logger(StateConsistencyGuardService.name);

  constructor(
    private readonly demElevation: DEMElevationService,
    private readonly demEffort: DEMEffortMetadataService,
  ) {}

  /** 对外叙事名：与 `enrichRoutePlanDraftIfNeeded` 同义 */
  runTerrainAudit(plan: RoutePlanDraft): Promise<{ plan: RoutePlanDraft; patched: boolean }> {
    return this.enrichRoutePlanDraftIfNeeded(plan);
  }

  /**
   * TerrainAudit：凡当日有 ≥2 个可解析坐标且存在「有距离无爬升」的 segment，即调用 DEM 回填；
   * 不限冰岛（冰岛仍走 DEM 内高精度表）。单点日可尝试首末段起终点拼成 2 点 shadow polyline。
   */
  async enrichRoutePlanDraftIfNeeded(plan: RoutePlanDraft): Promise<{ plan: RoutePlanDraft; patched: boolean }> {
    if (!plan?.segments?.length) {
      return { plan, patched: false };
    }

    const byDay = new Map<number, RouteSegment[]>();
    for (const s of plan.segments) {
      const d = s.dayIndex ?? 0;
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d)!.push(s);
    }

    const newSegments = plan.segments.map((s) => ({ ...s }));
    let patched = false;

    for (const [, segs] of byDay) {
      const needsPatch = segs.some((s) => {
        const a = Number(s.ascentM);
        const km = Number(s.distanceKm) || 0;
        return km > 0.01 && (!Number.isFinite(a) || a <= 0);
      });
      if (!needsPatch) continue;

      let deduped = this.buildDayPolylinePoints(segs);
      if (deduped.length < 2) {
        deduped = this.buildShadowTwoPointPolyline(segs);
      }
      if (deduped.length < 2) continue;

      const anyIceland = deduped.some((p) => this.demElevation.isInIcelandBounds(p.lat, p.lng));

      try {
        const effort = await this.demEffort.calculateEffortMetadata(deduped, {
          activityType: 'driving',
          includeElevationProfile: false,
        });
        const totalAscent = Math.max(0, effort.totalAscent ?? 0);
        const maxSlope = Math.max(0, effort.maxSlope ?? 0);
        const avgEl = Number.isFinite(effort.avgElevation) ? effort.avgElevation : undefined;
        const totalKm = segs.reduce((sum, s) => sum + (Number(s.distanceKm) || 0), 0);

        for (const seg of segs) {
          const idx = newSegments.findIndex((x) => x.segmentId === seg.segmentId);
          if (idx === -1) continue;
          const km = Number(newSegments[idx].distanceKm) || 0;
          const share = totalKm > 1e-6 ? km / totalKm : 1 / Math.max(1, segs.length);
          newSegments[idx] = {
            ...newSegments[idx],
            ascentM: Math.round(totalAscent * share),
            slopePct: maxSlope > 0 ? maxSlope : newSegments[idx].slopePct,
            metadata: {
              ...(newSegments[idx].metadata ?? {}),
              ...(avgEl !== undefined ? { avgElevationM: avgEl } : {}),
              terrainAuditSource: 'dem-effort-shadow',
              terrainAuditIceland: anyIceland,
            },
          };
          patched = true;
        }
        this.logger.debug(
          `[TerrainAudit] DEM backfill day: ascent=${totalAscent}m maxSlope=${maxSlope}% segments=${segs.length} iceland=${anyIceland}`,
        );
      } catch (e) {
        this.logger.warn(`[TerrainAudit] DEM backfill skipped: ${(e as Error)?.message}`);
      }
    }

    return { plan: { ...plan, segments: newSegments }, patched };
  }

  /** 按 segment 顺序收集起点坐标（去重） */
  private buildDayPolylinePoints(segs: RouteSegment[]): RoutePoint[] {
    const points: RoutePoint[] = [];
    for (const seg of segs) {
      const meta = seg.metadata ?? {};
      const c = parseCoord(meta.startLocation) ?? parseCoord(meta.coordinates);
      if (c) points.push({ lat: c.lat, lng: c.lng });
    }
    const deduped: RoutePoint[] = [];
    for (const p of points) {
      const prev = deduped[deduped.length - 1];
      if (!prev || prev.lat !== p.lat || prev.lng !== p.lng) deduped.push(p);
    }
    return deduped;
  }

  /**
   * 点不足 2 个时：用当日首段起点 + 末段起点（或末段 endLocation）构造极轻 shadow polyline，
   * 仍触发 DEM 多级查询（非距离回退）。
   */
  private buildShadowTwoPointPolyline(segs: RouteSegment[]): RoutePoint[] {
    if (segs.length === 0) return [];
    const firstMeta = segs[0].metadata ?? {};
    const lastMeta = segs[segs.length - 1].metadata ?? {};
    const a = parseCoord(firstMeta.startLocation) ?? parseCoord(firstMeta.coordinates);
    const b =
      parseCoord(lastMeta.endLocation) ??
      parseCoord(lastMeta.startLocation) ??
      parseCoord(lastMeta.coordinates);
    if (!a || !b) return [];
    if (a.lat === b.lat && a.lng === b.lng) return [];
    return [a, b];
  }
}
