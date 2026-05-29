import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  HIKING_DETAIL_OVERRIDE_SOURCE,
  HikingDetailOverrideV1,
  LOGISTICS_PATCH_KEYS,
  PREP_PATCH_KEYS,
  RISK_PATCH_KEYS,
  type HikingDetailOverrideResponse,
} from '../../route-directions/types/hiking-detail-override.types';
import {
  deepMergeOverride,
  extractHikingDetailOverride,
  mergeRouteDirectionMetadata,
} from '../utils/hiking-detail-override-merge.util';
import { HikingTrailDetailService } from './hiking-trail-detail.service';
import type { HikingTrailDetail } from '../../route-directions/types/hiking-trail-detail.types';
import { buildPrepFromHikingDetail } from '../../hiking-plans/utils/hike-plan-prep-builder.util';
import type { HikePlanPrepState } from '../../hiking-plans/types/hike-plan.types';

@Injectable()
export class HikingDetailOverrideService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trailDetail: HikingTrailDetailService,
  ) {}

  async getOverride(routeDirectionId: number): Promise<HikingDetailOverrideResponse> {
    const rd = await this.loadRouteDirection(routeDirectionId);
    const ov = extractHikingDetailOverride(rd.metadata);
    return this.toResponse(routeDirectionId, ov);
  }

  async putOverride(
    routeDirectionId: number,
    body: HikingDetailOverrideV1,
    source?: string,
  ): Promise<HikingDetailOverrideResponse> {
    const rd = await this.loadRouteDirection(routeDirectionId);
    this.assertHikingRoute(rd);

    const next: HikingDetailOverrideV1 = {
      ...body,
      source: source ?? body.source ?? HIKING_DETAIL_OVERRIDE_SOURCE,
      updatedAt: new Date().toISOString(),
    };

    await this.persistOverride(routeDirectionId, rd.metadata, next);
    return this.toResponse(routeDirectionId, next);
  }

  async patchRisk(
    routeDirectionId: number,
    body: Pick<HikingDetailOverrideV1, 'riskMatrix' | 'hardGates' | 'emergency'>,
  ): Promise<HikingDetailOverrideResponse> {
    return this.patchPartial(routeDirectionId, body, RISK_PATCH_KEYS);
  }

  async patchLogistics(
    routeDirectionId: number,
    body: Pick<
      HikingDetailOverrideV1,
      'access' | 'supplyPois' | 'shelters' | 'timeWindow'
    >,
  ): Promise<HikingDetailOverrideResponse> {
    return this.patchPartial(routeDirectionId, body, LOGISTICS_PATCH_KEYS);
  }

  async patchAlternatives(
    routeDirectionId: number,
    body: Pick<HikingDetailOverrideV1, 'alternatives'>,
  ): Promise<HikingDetailOverrideResponse> {
    return this.patchPartial(routeDirectionId, body, ['alternatives']);
  }

  /** 运营可配 — 准备清单 + 许可模板 */
  async patchPrep(
    routeDirectionId: number,
    body: Pick<HikingDetailOverrideV1, 'checklistTemplates' | 'permits'>,
  ): Promise<HikingDetailOverrideResponse> {
    return this.patchPartial(routeDirectionId, body, PREP_PATCH_KEYS);
  }

  async deletePrepBlock(routeDirectionId: number): Promise<HikingDetailOverrideResponse> {
    const rd = await this.loadRouteDirection(routeDirectionId);
    const ov = extractHikingDetailOverride(rd.metadata);
    delete ov.checklistTemplates;
    delete ov.permits;
    ov.updatedAt = new Date().toISOString();
    await this.persistOverride(routeDirectionId, rd.metadata, ov);
    return this.toResponse(routeDirectionId, ov);
  }

  /** 预览合并后的 HikePlan prep 模板（不落库） */
  async previewPrepTemplate(
    routeDirectionId: number,
    body?: HikingDetailOverrideV1,
    longestHike?: number,
  ): Promise<HikePlanPrepState> {
    const { hikingDetail } = await this.previewMergedDetail(
      routeDirectionId,
      body ?? {},
      longestHike,
    );
    return buildPrepFromHikingDetail(hikingDetail);
  }

  async deleteOverride(routeDirectionId: number): Promise<HikingDetailOverrideResponse> {
    const rd = await this.loadRouteDirection(routeDirectionId);
    const meta = { ...((rd.metadata as Record<string, unknown>) ?? {}) };
    delete meta.hikingDetailOverride;
    await this.prisma.routeDirection.update({
      where: { id: routeDirectionId },
      data: { metadata: meta as object, updatedAt: new Date() },
    });
    return this.toResponse(routeDirectionId, {});
  }

  async deleteRiskBlock(routeDirectionId: number): Promise<HikingDetailOverrideResponse> {
    const rd = await this.loadRouteDirection(routeDirectionId);
    const ov = extractHikingDetailOverride(rd.metadata);
    delete ov.riskMatrix;
    delete ov.hardGates;
    delete ov.emergency;
    ov.updatedAt = new Date().toISOString();
    await this.persistOverride(routeDirectionId, rd.metadata, ov);
    return this.toResponse(routeDirectionId, ov);
  }

  async deleteLogisticsBlock(routeDirectionId: number): Promise<HikingDetailOverrideResponse> {
    const rd = await this.loadRouteDirection(routeDirectionId);
    const ov = extractHikingDetailOverride(rd.metadata);
    delete ov.access;
    delete ov.supplyPois;
    delete ov.shelters;
    delete ov.timeWindow;
    ov.updatedAt = new Date().toISOString();
    await this.persistOverride(routeDirectionId, rd.metadata, ov);
    return this.toResponse(routeDirectionId, ov);
  }

  async previewMergedDetail(
    routeDirectionId: number,
    body: HikingDetailOverrideV1,
    longestHike?: number,
  ): Promise<{ hikingDetail: HikingTrailDetail | null; hikingDetailOverride: HikingDetailOverrideV1 }> {
    const rd = await this.loadRouteDirection(routeDirectionId);
    const mergedMeta = mergeRouteDirectionMetadata(
      rd.metadata as Record<string, unknown>,
      { hikingDetailOverride: deepMergeOverride(extractHikingDetailOverride(rd.metadata), body) },
    );
    const hikingDetail = await this.trailDetail.build(
      { ...rd, metadata: mergedMeta },
      { longestHike: longestHike as 0 | 1 | 2 | 3 | 4 | undefined },
    );
    return {
      hikingDetail,
      hikingDetailOverride: extractHikingDetailOverride(mergedMeta),
    };
  }

  private async patchPartial(
    routeDirectionId: number,
    body: Partial<HikingDetailOverrideV1>,
    allowedKeys: readonly string[],
  ): Promise<HikingDetailOverrideResponse> {
    const rd = await this.loadRouteDirection(routeDirectionId);
    this.assertHikingRoute(rd);

    const prev = extractHikingDetailOverride(rd.metadata);
    const patch: HikingDetailOverrideV1 = {};
    for (const key of allowedKeys) {
      if ((body as Record<string, unknown>)[key] !== undefined) {
        (patch as Record<string, unknown>)[key] = (body as Record<string, unknown>)[key];
      }
    }
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('PATCH body must include at least one allowed field');
    }

    const next = deepMergeOverride(prev, {
      ...patch,
      source: HIKING_DETAIL_OVERRIDE_SOURCE,
      updatedAt: new Date().toISOString(),
    });
    await this.persistOverride(routeDirectionId, rd.metadata, next);
    return this.toResponse(routeDirectionId, next);
  }

  private async persistOverride(
    routeDirectionId: number,
    existingMetadata: unknown,
    override: HikingDetailOverrideV1,
  ) {
    const meta = mergeRouteDirectionMetadata(
      (existingMetadata as Record<string, unknown>) ?? {},
      { hikingDetailOverride: override },
    );
    await this.prisma.routeDirection.update({
      where: { id: routeDirectionId },
      data: { metadata: meta as object, updatedAt: new Date() },
    });
  }

  private async loadRouteDirection(id: number) {
    const rd = await this.prisma.routeDirection.findUnique({ where: { id } });
    if (!rd) {
      throw new NotFoundException(`Route direction with ID ${id} not found`);
    }
    return rd;
  }

  private assertHikingRoute(rd: { name: string; tags: string[] }) {
    if (!this.trailDetail.isHikingRoute({ name: rd.name, tags: rd.tags })) {
      throw new BadRequestException(
        'Route direction must include hiking tag (徒步) to use hikingDetailOverride',
      );
    }
  }

  private toResponse(
    routeDirectionId: number,
    ov: HikingDetailOverrideV1,
  ): HikingDetailOverrideResponse {
    return {
      routeDirectionId,
      hikingDetailOverride: ov,
      updatedAt: ov.updatedAt ?? null,
      source: ov.source ?? null,
    };
  }
}
