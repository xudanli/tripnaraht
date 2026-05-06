import { BadRequestException, Body, Controller, Get, InternalServerErrorException, Param, Patch, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { successResponse } from '../../common/dto/standard-response.dto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MapSnapshotDto,
  PoiDto,
  SegmentDto,
  UpdatePoiDto,
  UpdateSegmentDto,
  ValidatePoiTimeWindowsDto,
  ValidateSegmentFeasibilityDto,
} from '../dto/spatial-domain-admin.dto';
import { computeSegmentFeasibilityViolations, isPoiOpenAt } from '../../domain/ontology/validator/segment-feasibility.util';

type PoiRecord = PoiDto & { updatedAt: string };
type SegmentRecord = SegmentDto & { updatedAt: string };

@ApiTags('Admin - Spatial Domain')
@Controller('admin/spatial-domain')
@Public()
export class SpatialDomainAdminController {
  private readonly pois = new Map<string, PoiRecord>();
  private readonly segments = new Map<string, SegmentRecord>();
  private readonly allowInMemoryFallback = process.env.SPATIAL_DOMAIN_ALLOW_INMEMORY_FALLBACK === 'true';
  private publishedVersion = 0;
  private lastSnapshotAt: string | null = null;
  constructor(private readonly prisma: PrismaService) {}

  @Get('pois')
  @ApiOperation({ summary: '获取 POI 列表' })
  async getPois() {
    const rows = await this.listPois();
    return successResponse(rows);
  }

  @Get('pois/:id')
  @ApiOperation({ summary: '按 id 获取 POI' })
  @ApiParam({ name: 'id', type: String })
  async getPoiById(@Param('id') id: string) {
    return successResponse(await this.getPoi(id));
  }

  @Post('pois')
  @ApiOperation({ summary: '创建 POI' })
  @ApiBody({ type: PoiDto })
  async createPoi(@Body() dto: PoiDto) {
    this.validateTimeWindows(dto.time_windows);
    const now = new Date().toISOString();
    const row: PoiRecord = { ...dto, updatedAt: now };
    await this.upsertPoi(row);
    return successResponse(row);
  }

  @Patch('pois/:id')
  @ApiOperation({ summary: '更新 POI' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: UpdatePoiDto })
  async patchPoi(@Param('id') id: string, @Body() dto: UpdatePoiDto) {
    const cur = await this.getPoi(id);
    if (!cur) throw new BadRequestException(`POI not found: ${id}`);
    if (dto.time_windows) this.validateTimeWindows(dto.time_windows);
    const row: PoiRecord = { ...cur, ...dto, updatedAt: new Date().toISOString() };
    await this.upsertPoi(row);
    return successResponse(row);
  }

  @Post('pois/:id/time-windows/validate')
  @ApiOperation({ summary: '校验 POI 时间窗可用性' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: ValidatePoiTimeWindowsDto })
  async validatePoiTimeWindows(@Param('id') id: string, @Body() dto: ValidatePoiTimeWindowsDto) {
    const poi = await this.getPoi(id);
    if (!poi) throw new BadRequestException(`POI not found: ${id}`);
    const at = new Date(dto.at);
    if (Number.isNaN(at.getTime())) throw new BadRequestException('Invalid datetime');
    const isOpen = isPoiOpenAt(poi, at);
    return successResponse({
      poiId: id,
      at: dto.at,
      isOpen,
      reason: isOpen ? 'OPEN' : 'POI_CLOSED_AT_ETA',
    });
  }

  @Get('segments')
  @ApiOperation({ summary: '获取 Segment 列表' })
  async getSegments() {
    const rows = await this.listSegments();
    return successResponse(rows);
  }

  @Get('segments/:id')
  @ApiOperation({ summary: '按 id 获取 Segment' })
  @ApiParam({ name: 'id', type: String })
  async getSegmentById(@Param('id') id: string) {
    return successResponse(await this.getSegment(id));
  }

  @Post('segments')
  @ApiOperation({ summary: '创建 Segment' })
  @ApiBody({ type: SegmentDto })
  async createSegment(@Body() dto: SegmentDto) {
    await this.ensurePoiRef(dto.from_poi_id);
    await this.ensurePoiRef(dto.to_poi_id);
    const now = new Date().toISOString();
    const row: SegmentRecord = { ...dto, updatedAt: now };
    await this.upsertSegment(row);
    return successResponse(row);
  }

  @Patch('segments/:id')
  @ApiOperation({ summary: '更新 Segment' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: UpdateSegmentDto })
  async patchSegment(@Param('id') id: string, @Body() dto: UpdateSegmentDto) {
    const cur = await this.getSegment(id);
    if (!cur) throw new BadRequestException(`Segment not found: ${id}`);
    if (dto.from_poi_id) await this.ensurePoiRef(dto.from_poi_id);
    if (dto.to_poi_id) await this.ensurePoiRef(dto.to_poi_id);
    const row: SegmentRecord = { ...cur, ...dto, updatedAt: new Date().toISOString() };
    await this.upsertSegment(row);
    return successResponse(row);
  }

  @Post('segments/:id/validate-feasibility')
  @ApiOperation({ summary: '校验 Segment 在进入时刻的可行性' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: ValidateSegmentFeasibilityDto })
  async validateSegmentFeasibility(@Param('id') id: string, @Body() dto: ValidateSegmentFeasibilityDto) {
    const seg = await this.getSegment(id);
    if (!seg) throw new BadRequestException(`Segment not found: ${id}`);
    const enterAt = new Date(dto.enterAt);
    if (Number.isNaN(enterAt.getTime())) throw new BadRequestException('Invalid datetime');
    const toPoi = await this.getPoi(seg.to_poi_id);
    const { violations, facts } = computeSegmentFeasibilityViolations({
      segment: seg,
      toPoi,
      enterAt,
      vehicleType: dto.vehicleType,
    });

    return successResponse({
      segmentId: id,
      enterAt: dto.enterAt,
      feasible: violations.length === 0,
      violations,
      facts,
    });
  }

  @Post('map/snapshot')
  @ApiOperation({ summary: '生成空间图快照' })
  @ApiBody({ type: MapSnapshotDto })
  async createMapSnapshot(@Body() dto: MapSnapshotDto) {
    this.lastSnapshotAt = new Date().toISOString();
    const poiCount = (await this.listPois()).length;
    const segmentCount = (await this.listSegments()).length;
    return successResponse({
      snapshotAt: this.lastSnapshotAt,
      poiCount,
      segmentCount,
      note: dto.note ?? null,
    });
  }

  @Post('map/publish')
  @ApiOperation({ summary: '发布空间图配置' })
  async publishMap() {
    this.publishedVersion += 1;
    const poiCount = (await this.listPois()).length;
    const segmentCount = (await this.listSegments()).length;
    return successResponse({
      publishedVersion: this.publishedVersion,
      publishedAt: new Date().toISOString(),
      poiCount,
      segmentCount,
    });
  }

  @Post('map/reload')
  @ApiOperation({ summary: '重载空间图配置（最小实现）' })
  reloadMap() {
    return successResponse({
      ok: true,
      publishedVersion: this.publishedVersion,
      lastSnapshotAt: this.lastSnapshotAt,
      reloadedAt: new Date().toISOString(),
    });
  }

  private async ensurePoiRef(poiId: string): Promise<void> {
    const exists = await this.getPoi(poiId);
    if (!exists) {
      throw new BadRequestException(`POI not found: ${poiId}`);
    }
  }

  private async listPois(): Promise<PoiRecord[]> {
    try {
      const rows = await (this.prisma as any).spatialDomainPoi.findMany({ orderBy: { updatedAt: 'desc' } });
      return rows.map((x: any) => this.fromPoiDb(x));
    } catch (error) {
      if (this.allowInMemoryFallback) return Array.from(this.pois.values());
      throw new InternalServerErrorException(`Spatial POI query failed: ${this.formatError(error)}`);
    }
  }

  private async getPoi(id: string): Promise<PoiRecord | null> {
    try {
      const row = await (this.prisma as any).spatialDomainPoi.findUnique({ where: { id } });
      return row ? this.fromPoiDb(row) : null;
    } catch (error) {
      if (this.allowInMemoryFallback) return this.pois.get(id) ?? null;
      throw new InternalServerErrorException(`Spatial POI read failed: ${this.formatError(error)}`);
    }
  }

  private async upsertPoi(row: PoiRecord): Promise<void> {
    try {
      await (this.prisma as any).spatialDomainPoi.upsert({
        where: { id: row.id },
        update: {
          name: row.name,
          coordinates: row.coordinates as any,
          timeWindows: (row.time_windows ?? []) as any,
          rules: (row.rules ?? []) as any,
          capacityLimit: row.capacity_limit ?? null,
          closed: row.closed ?? false,
        },
        create: {
          id: row.id,
          name: row.name,
          coordinates: row.coordinates as any,
          timeWindows: (row.time_windows ?? []) as any,
          rules: (row.rules ?? []) as any,
          capacityLimit: row.capacity_limit ?? null,
          closed: row.closed ?? false,
        },
      });
    } catch (error) {
      if (this.allowInMemoryFallback) {
        this.pois.set(row.id, row);
        return;
      }
      throw new InternalServerErrorException(`Spatial POI write failed: ${this.formatError(error)}`);
    }
  }

  private fromPoiDb(row: any): PoiRecord {
    return {
      id: String(row.id),
      name: String(row.name),
      coordinates: (row.coordinates ?? { lat: 0, lng: 0 }) as any,
      time_windows: Array.isArray(row.timeWindows) ? row.timeWindows : [],
      rules: Array.isArray(row.rules) ? row.rules : [],
      capacity_limit: row.capacityLimit ?? undefined,
      closed: Boolean(row.closed),
      updatedAt: new Date(row.updatedAt ?? Date.now()).toISOString(),
    };
  }

  private async listSegments(): Promise<SegmentRecord[]> {
    try {
      const rows = await (this.prisma as any).spatialDomainSegment.findMany({ orderBy: { updatedAt: 'desc' } });
      return rows.map((x: any) => this.fromSegmentDb(x));
    } catch (error) {
      if (this.allowInMemoryFallback) return Array.from(this.segments.values());
      throw new InternalServerErrorException(`Spatial Segment query failed: ${this.formatError(error)}`);
    }
  }

  private async getSegment(id: string): Promise<SegmentRecord | null> {
    try {
      const row = await (this.prisma as any).spatialDomainSegment.findUnique({ where: { id } });
      return row ? this.fromSegmentDb(row) : null;
    } catch (error) {
      if (this.allowInMemoryFallback) return this.segments.get(id) ?? null;
      throw new InternalServerErrorException(`Spatial Segment read failed: ${this.formatError(error)}`);
    }
  }

  private async upsertSegment(row: SegmentRecord): Promise<void> {
    try {
      await (this.prisma as any).spatialDomainSegment.upsert({
        where: { id: row.id },
        update: {
          fromPoiId: row.from_poi_id,
          toPoiId: row.to_poi_id,
          segmentType: row.segment_type,
          gradient: (row.gradient ?? {}) as any,
          roadCondition: (row.road_condition ?? {}) as any,
          seasonalClosures: (row.seasonal_closures ?? []) as any,
          rules: (row.rules ?? []) as any,
          evidence: (row.evidence ?? {}) as any,
        },
        create: {
          id: row.id,
          fromPoiId: row.from_poi_id,
          toPoiId: row.to_poi_id,
          segmentType: row.segment_type,
          gradient: (row.gradient ?? {}) as any,
          roadCondition: (row.road_condition ?? {}) as any,
          seasonalClosures: (row.seasonal_closures ?? []) as any,
          rules: (row.rules ?? []) as any,
          evidence: (row.evidence ?? {}) as any,
        },
      });
    } catch (error) {
      if (this.allowInMemoryFallback) {
        this.segments.set(row.id, row);
        return;
      }
      throw new InternalServerErrorException(`Spatial Segment write failed: ${this.formatError(error)}`);
    }
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  private fromSegmentDb(row: any): SegmentRecord {
    return {
      id: String(row.id),
      from_poi_id: String(row.fromPoiId),
      to_poi_id: String(row.toPoiId),
      segment_type: row.segmentType,
      gradient: (row.gradient ?? undefined) as any,
      road_condition: (row.roadCondition ?? undefined) as any,
      seasonal_closures: Array.isArray(row.seasonalClosures) ? row.seasonalClosures : [],
      rules: Array.isArray(row.rules) ? row.rules : [],
      evidence: (row.evidence ?? undefined) as any,
      updatedAt: new Date(row.updatedAt ?? Date.now()).toISOString(),
    };
  }

  private validateTimeWindows(windows?: PoiDto['time_windows']): void {
    if (!windows) return;
    for (const w of windows) {
      if (!this.isValidHm(w.open) || !this.isValidHm(w.close)) {
        throw new BadRequestException('Invalid time window format, expected HH:mm');
      }
    }
  }

  private isValidHm(value: string): boolean {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  }

}
