import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PlaceCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConstraintSolverAccessService } from '../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { TripContextSnapshotAssemblerService } from '../../decision-runtime/snapshot/trip-context-snapshot.assembler.service';
import { ArrangeItineraryItemsService } from '../../trips/arrange-itinerary/services/arrange-itinerary-items.service';
import { ItemType } from '../../itinerary-items/dto/create-itinerary-item.dto';
import { loadPlaceCoordinatesBatch } from '../../trips/attraction-explore/utils/attraction-explore-place-coordinates.util';
import { computeMobileContextVersion } from '../utils/mobile-execution.util';
import { TripContextChangeNotifierService } from '../ws/trip-context-change-notifier.service';
import type {
  AddSpatialLocationBodyDto,
  InsertSpatialCandidateBodyDto,
  MobileSpatialCandidateDetailDto,
  MobileSpatialRoadRisksDto,
  MobileSpatialRouteDto,
  MobileSpatialSearchDto,
  MobileSpatialWriteResultDto,
} from '../dto/mobile-planning.types';
import {
  focusDayCentroidFromDays,
  isValidInsertionOptionId,
  projectCandidateDetail,
  projectSpatialRoadRisks,
  projectSpatialRouteViewData,
  projectSpatialSearchItems,
  resolveSlotTimeFromInsertionOption,
  type SpatialRouteCandidateFact,
  type SpatialRouteDayFact,
  type SpatialRouteRiskFact,
} from '../utils/spatial-route.projection.util';

type Snapshot = Awaited<ReturnType<TripContextSnapshotAssemblerService['assemble']>> | null;

@Injectable()
export class MobileSpatialRouteService {
  private readonly idempotency = new Map<
    string,
    { bodyHash: string; response: MobileSpatialWriteResultDto }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ConstraintSolverAccessService,
    private readonly snapshotAssembler: TripContextSnapshotAssemblerService,
    private readonly arrangeItems: ArrangeItineraryItemsService,
    private readonly contextNotifier: TripContextChangeNotifierService,
  ) {}

  /**
   * GET /api/mobile/trips/:tripId/spatial-route
   */
  async getSpatialRoute(
    tripId: string,
    userId: string,
    opts?: { dayIndex?: number },
  ): Promise<MobileSpatialRouteDto> {
    await this.access.assertTripMember(tripId, userId);
    const ctx = await this.loadSpatialContext(tripId, { candidateLimit: 20 });
    const focusDayIndex = this.normalizeDayIndex(opts?.dayIndex);
    return projectSpatialRouteViewData({
      tripName: ctx.tripName,
      destinationLabel: ctx.destination,
      focusDayIndex,
      days: ctx.days,
      candidates: ctx.candidates,
      risks: ctx.risks,
      contextVersion: ctx.contextVersion,
      planVersion: ctx.planVersion,
    });
  }

  /**
   * GET /api/mobile/trips/:tripId/planning/spatial/search
   */
  async searchSpatialPois(
    tripId: string,
    userId: string,
    opts: {
      q?: string;
      dayIndex?: number;
      lat?: number;
      lng?: number;
      limit?: number;
    },
  ): Promise<MobileSpatialSearchDto> {
    await this.access.assertTripMember(tripId, userId);
    const focusDayIndex = this.normalizeDayIndex(opts.dayIndex);
    const ctx = await this.loadSpatialContext(tripId, {
      candidateLimit: 50,
      searchQuery: opts.q,
      includeCatalogSearch: Boolean(opts.q?.trim()),
    });

    let focusCenter = focusDayCentroidFromDays(ctx.days, focusDayIndex);
    if (
      opts.lat != null &&
      opts.lng != null &&
      Number.isFinite(opts.lat) &&
      Number.isFinite(opts.lng)
    ) {
      focusCenter = { lat: opts.lat, lng: opts.lng };
    }

    return {
      items: projectSpatialSearchItems({
        candidates: ctx.candidates,
        focusCenter,
        focusDayNumber: focusDayIndex,
        limit: opts.limit,
      }),
      contextVersion: ctx.contextVersion,
      planVersion: ctx.planVersion,
    };
  }

  /**
   * GET /api/mobile/trips/:tripId/planning/spatial/candidates/:poiId
   */
  async getSpatialCandidate(
    tripId: string,
    userId: string,
    poiId: string,
    opts?: { dayIndex?: number },
  ): Promise<MobileSpatialCandidateDetailDto> {
    await this.access.assertTripMember(tripId, userId);
    const focusDayIndex = this.normalizeDayIndex(opts?.dayIndex);
    const ctx = await this.loadSpatialContext(tripId, { candidateLimit: 50 });
    const candidate =
      ctx.candidates.find((c) => c.id === poiId) ??
      ctx.candidates.find((c) => String(c.placeId) === poiId);
    if (!candidate) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `候选 POI ${poiId} 不存在`,
      });
    }
    const focusCenter = focusDayCentroidFromDays(ctx.days, focusDayIndex);
    const detail = projectCandidateDetail(candidate, focusCenter, focusDayIndex);
    return {
      ...detail,
      poiId: candidate.id,
      placeId: candidate.placeId,
      contextVersion: ctx.contextVersion,
      planVersion: ctx.planVersion,
    };
  }

  /**
   * GET /api/mobile/trips/:tripId/planning/spatial/road-risks
   */
  async getRoadRisks(tripId: string, userId: string): Promise<MobileSpatialRoadRisksDto> {
    await this.access.assertTripMember(tripId, userId);
    const ctx = await this.loadSpatialContext(tripId, { candidateLimit: 0 });
    return projectSpatialRoadRisks({
      risks: ctx.risks,
      contextVersion: ctx.contextVersion,
      planVersion: ctx.planVersion,
    });
  }

  /**
   * POST /api/mobile/trips/:tripId/planning/spatial/candidates/:poiId/insert
   */
  async insertSpatialCandidate(
    tripId: string,
    userId: string,
    poiId: string,
    body: InsertSpatialCandidateBodyDto,
    opts: { ifMatch?: number; idempotencyKey?: string },
  ): Promise<MobileSpatialWriteResultDto> {
    await this.access.assertTripMember(tripId, userId);
    this.assertWriteHeaders(opts);

    const bodyHash = this.hashBody({ poiId, ...body });
    const cached = this.lookupIdempotency(tripId, 'insert', opts.idempotencyKey!, bodyHash);
    if (cached) return cached;

    await this.assertIfMatch(tripId, opts.ifMatch!);

    const dayIndex = this.normalizeDayIndex(body.dayIndex);
    if (!isValidInsertionOptionId(body.insertionOptionId, dayIndex)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `非法 insertionOptionId: ${body.insertionOptionId}`,
      });
    }

    const candidate = await this.prisma.tripAttractionExploreCandidate.findFirst({
      where: {
        tripId,
        OR: [{ id: poiId }, { placeId: Number.isFinite(Number(poiId)) ? Number(poiId) : -1 }],
      },
      select: { id: true, placeId: true },
    });
    if (!candidate) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `候选 POI ${poiId} 不存在`,
      });
    }

    const startTime = resolveSlotTimeFromInsertionOption(
      body.insertionOptionId,
      body.slotTime,
    );

    let mutation;
    try {
      mutation = await this.arrangeItems.placeCandidate({
        tripId,
        userId,
        candidateId: candidate.id,
        body: {
          dayIndex,
          startTime,
          insertMode: 'append',
          removeFromCandidates: true,
        },
      });
    } catch (e) {
      if (e instanceof BadRequestException) {
        const msg = e.message || '';
        if (/日程天|dayIndex|超出/.test(msg)) {
          throw new BadRequestException({
            code: 'NO_TRIP_DAYS',
            message: msg,
          });
        }
      }
      throw e;
    }

    const itemId =
      mutation.itineraryItem && typeof mutation.itineraryItem === 'object'
        ? String((mutation.itineraryItem as { id?: string }).id ?? '')
        : undefined;

    const versions = await this.bumpVersionsAndNotify(tripId);
    const result: MobileSpatialWriteResultDto = {
      itineraryItemId: itemId || undefined,
      placeId: candidate.placeId,
      dayIndex,
      contextVersion: versions.contextVersion,
      planVersion: versions.planVersion,
      refreshSpatialRoute: true,
    };
    this.saveIdempotency(tripId, 'insert', opts.idempotencyKey!, bodyHash, result);
    return result;
  }

  /**
   * POST /api/mobile/trips/:tripId/planning/spatial/locations
   */
  async addSpatialLocation(
    tripId: string,
    userId: string,
    body: AddSpatialLocationBodyDto,
    opts: { ifMatch?: number; idempotencyKey?: string },
  ): Promise<MobileSpatialWriteResultDto> {
    await this.access.assertTripMember(tripId, userId);
    this.assertWriteHeaders(opts);

    const bodyHash = this.hashBody(body);
    const cached = this.lookupIdempotency(tripId, 'location', opts.idempotencyKey!, bodyHash);
    if (cached) return cached;

    await this.assertIfMatch(tripId, opts.ifMatch!);

    if (!Number.isFinite(body.lat) || !Number.isFinite(body.lng)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'lat / lng 必填且为有效数字',
      });
    }
    if (!body.title?.trim()) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'title 必填',
      });
    }

    const dayIndex = this.normalizeDayIndex(body.dayIndex);
    const placeId = await this.resolveOrCreatePlace({
      placeId: body.placeId,
      title: body.title.trim(),
      lat: body.lat,
      lng: body.lng,
    });

    let mutation;
    try {
      mutation = await this.arrangeItems.createItem({
        tripId,
        userId,
        body: {
          dayIndex,
          placeId,
          type: ItemType.ACTIVITY,
          startTime: '11:00',
          endTime: '12:30',
          note: `[空间路线] ${body.title.trim()}`,
          placeName: body.title.trim(),
          insertMode: 'append',
          forceCreate: true,
        },
      });
    } catch (e) {
      if (e instanceof BadRequestException) {
        const msg = e.message || '';
        if (/日程天|dayIndex|超出/.test(msg)) {
          throw new BadRequestException({
            code: 'NO_TRIP_DAYS',
            message: msg,
          });
        }
      }
      throw e;
    }

    const itemId =
      mutation.itineraryItem && typeof mutation.itineraryItem === 'object'
        ? String((mutation.itineraryItem as { id?: string }).id ?? '')
        : undefined;

    const versions = await this.bumpVersionsAndNotify(tripId);
    const result: MobileSpatialWriteResultDto = {
      itineraryItemId: itemId || undefined,
      placeId,
      dayIndex,
      contextVersion: versions.contextVersion,
      planVersion: versions.planVersion,
      refreshSpatialRoute: true,
    };
    this.saveIdempotency(tripId, 'location', opts.idempotencyKey!, bodyHash, result);
    return result;
  }

  private assertWriteHeaders(opts: { ifMatch?: number; idempotencyKey?: string }) {
    if (opts.ifMatch == null || !Number.isFinite(opts.ifMatch)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '写操作需要 If-Match: <contextVersion>',
      });
    }
    if (!opts.idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '写操作需要 Idempotency-Key',
      });
    }
  }

  private async assertIfMatch(tripId: string, ifMatch: number) {
    const versions = await this.resolveVersions(tripId);
    if (versions.contextVersion !== ifMatch) {
      throw new ConflictException({
        code: 'CONTEXT_VERSION_CONFLICT',
        message: 'contextVersion 已过期，请刷新后重试',
        currentContextVersion: versions.contextVersion,
      });
    }
  }

  private async bumpVersionsAndNotify(tripId: string): Promise<{
    contextVersion: number;
    planVersion: number;
  }> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true, updatedAt: true },
    });
    const metadata =
      trip?.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
        ? { ...(trip.metadata as Record<string, unknown>) }
        : {};
    const prevPlan = Number(metadata.spatialPlanVersion ?? 0);
    const spatialPlanVersion = (Number.isFinite(prevPlan) ? prevPlan : 0) + 1;
    metadata.spatialPlanVersion = spatialPlanVersion;

    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        updatedAt: new Date(),
        metadata: metadata as object,
      },
      select: { updatedAt: true },
    });

    const snapshot = await this.snapshotAssembler.assemble(tripId).catch(() => null);
    const constraintsVersion = snapshot?.bindings?.constraintsVersion ?? 0;
    const planVersion = Math.max(constraintsVersion, spatialPlanVersion);
    const contextVersion = computeMobileContextVersion({
      constraintsVersion,
      tripUpdatedAt: updated.updatedAt,
      effectivePlanVersionId: snapshot?.effectivePlan?.versionId,
    });

    this.contextNotifier.notifyTripContextChanged({
      tripId,
      contextVersion,
      planVersion,
      changedSections: ['plan'],
    });

    return { contextVersion, planVersion };
  }

  private async resolveVersions(tripId: string): Promise<{
    contextVersion: number;
    planVersion: number;
  }> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { updatedAt: true, metadata: true },
    });
    if (!trip) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: `行程 ${tripId} 不存在` });
    }
    const snapshot = await this.snapshotAssembler.assemble(tripId).catch(() => null);
    const constraintsVersion = snapshot?.bindings?.constraintsVersion ?? 0;
    const meta =
      trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
        ? (trip.metadata as Record<string, unknown>)
        : {};
    const spatialPlanVersion = Number(meta.spatialPlanVersion ?? 0);
    return {
      contextVersion: computeMobileContextVersion({
        constraintsVersion,
        tripUpdatedAt: trip.updatedAt,
        effectivePlanVersionId: snapshot?.effectivePlan?.versionId,
      }),
      planVersion: Math.max(constraintsVersion, Number.isFinite(spatialPlanVersion) ? spatialPlanVersion : 0),
    };
  }

  private async resolveOrCreatePlace(input: {
    placeId?: string | number;
    title: string;
    lat: number;
    lng: number;
  }): Promise<number> {
    if (input.placeId != null && String(input.placeId).trim() !== '') {
      const id = Number(input.placeId);
      if (Number.isFinite(id)) {
        const existing = await this.prisma.place.findUnique({
          where: { id },
          select: { id: true },
        });
        if (existing) return existing.id;
      }
    }

    const place = await this.prisma.place.create({
      data: {
        uuid: randomUUID(),
        nameCN: input.title,
        nameEN: input.title,
        category: PlaceCategory.ATTRACTION,
        metadata: {
          lat: input.lat,
          lng: input.lng,
          coordinates: [input.lng, input.lat],
          source: 'mobile-spatial-route',
        },
        dataSource: 'mobile_spatial_custom',
        updatedAt: new Date(),
      },
      select: { id: true },
    });

    await this.prisma.$executeRaw`
      UPDATE "Place"
      SET location = ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)
      WHERE id = ${place.id}
    `;

    return place.id;
  }

  private normalizeDayIndex(dayIndex?: number): number {
    if (dayIndex == null || !Number.isFinite(dayIndex)) return 1;
    return Math.max(1, Math.floor(dayIndex));
  }

  private hashBody(body: unknown): string {
    return createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex');
  }

  private lookupIdempotency(
    tripId: string,
    op: string,
    key: string,
    bodyHash: string,
  ): MobileSpatialWriteResultDto | null {
    const storeKey = `${op}:${tripId}:${key}`;
    const existing = this.idempotency.get(storeKey);
    if (!existing) return null;
    if (existing.bodyHash !== bodyHash) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'Idempotency-Key 已用于不同请求体',
      });
    }
    return existing.response;
  }

  private saveIdempotency(
    tripId: string,
    op: string,
    key: string,
    bodyHash: string,
    response: MobileSpatialWriteResultDto,
  ) {
    this.idempotency.set(`${op}:${tripId}:${key}`, { bodyHash, response });
  }

  private async loadSpatialContext(
    tripId: string,
    opts: {
      candidateLimit: number;
      searchQuery?: string;
      includeCatalogSearch?: boolean;
    },
  ): Promise<{
    tripName: string;
    destination: string;
    days: SpatialRouteDayFact[];
    candidates: SpatialRouteCandidateFact[];
    risks: SpatialRouteRiskFact[];
    contextVersion: number;
    planVersion: number;
  }> {
    const [tripRow, candidateRows, snapshot, versions] = await Promise.all([
      this.prisma.trip.findUnique({
        where: { id: tripId },
        select: {
          id: true,
          name: true,
          destination: true,
          metadata: true,
          updatedAt: true,
          TripDay: {
            orderBy: { date: 'asc' },
            include: {
              ItineraryItem: {
                include: { Place: true },
                orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
              },
            },
          },
        },
      }),
      opts.candidateLimit > 0
        ? this.prisma.tripAttractionExploreCandidate.findMany({
            where: { tripId },
            include: { Place: true },
            orderBy: { sortOrder: 'asc' },
            take: Math.max(opts.candidateLimit, 20),
          })
        : Promise.resolve([]),
      this.snapshotAssembler.assemble(tripId).catch(() => null),
      this.resolveVersions(tripId),
    ]);

    if (!tripRow) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: `行程 ${tripId} 不存在` });
    }

    let candidatesSource = candidateRows;
    const q = opts.searchQuery?.trim();
    if (q) {
      const lowered = q.toLowerCase();
      candidatesSource = candidateRows.filter((row) => {
        const cn = row.Place?.nameCN?.toLowerCase() ?? '';
        const en = row.Place?.nameEN?.toLowerCase() ?? '';
        return cn.includes(lowered) || en.includes(lowered);
      });
    }

    const placeIds: number[] = [];
    for (const day of tripRow.TripDay) {
      for (const item of day.ItineraryItem) {
        if (item.placeId) placeIds.push(item.placeId);
      }
    }
    for (const row of candidatesSource) {
      placeIds.push(row.placeId);
    }

    const catalogFacts: SpatialRouteCandidateFact[] = [];
    if (opts.includeCatalogSearch && q) {
      const catalog = await this.prisma.place.findMany({
        where: {
          OR: [
            { nameCN: { contains: q, mode: 'insensitive' } },
            { nameEN: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 15,
        select: {
          id: true,
          nameCN: true,
          nameEN: true,
          category: true,
        },
      });
      const seen = new Set(candidatesSource.map((c) => c.placeId));
      for (const place of catalog) {
        if (seen.has(place.id)) continue;
        catalogFacts.push({
          id: `place-${place.id}`,
          placeId: place.id,
          title: place.nameCN?.trim() || place.nameEN?.trim() || '地点',
          region: tripRow.destination ?? undefined,
          category: place.category,
          priority: 'interested',
          coords: null,
        });
        seen.add(place.id);
        placeIds.push(place.id);
      }
    }

    const coordsMap = await loadPlaceCoordinatesBatch(this.prisma, placeIds);

    for (const fact of catalogFacts) {
      fact.coords = coordsMap.get(fact.placeId) ?? null;
    }

    const dayThemes = this.resolveDayThemes(tripRow.metadata);
    const days: SpatialRouteDayFact[] = tripRow.TripDay.map((day, index) => {
      const dayNumber = index + 1;
      const theme = dayThemes[dayNumber] ?? dayThemes[String(dayNumber)];
      const pois = day.ItineraryItem.map((item) => {
        const title =
          item.Place?.nameCN?.trim() ||
          item.Place?.nameEN?.trim() ||
          '未命名地点';
        return {
          itemId: item.id,
          placeId: item.placeId,
          title,
          category: item.Place?.category ?? String(item.type ?? ''),
          coords: item.placeId ? coordsMap.get(item.placeId) ?? null : null,
        };
      });
      const label =
        (typeof theme === 'string' && theme.trim()) ||
        pois.find((p) => p.title)?.title ||
        `Day ${dayNumber}`;
      return { id: day.id, dayNumber, label, pois };
    });

    const candidates: SpatialRouteCandidateFact[] = [
      ...candidatesSource.map((row) => ({
        id: row.id,
        placeId: row.placeId,
        title: row.Place?.nameCN?.trim() || row.Place?.nameEN?.trim() || '候选地点',
        region: tripRow.destination ?? undefined,
        category: row.Place?.category ?? null,
        priority: row.priority,
        coords: coordsMap.get(row.placeId) ?? null,
      })),
      ...catalogFacts,
    ];

    return {
      tripName: tripRow.name ?? '',
      destination: tripRow.destination ?? '',
      days,
      candidates,
      risks: this.extractPlanningRiskFacts(snapshot),
      contextVersion: versions.contextVersion,
      planVersion: versions.planVersion,
    };
  }

  private resolveDayThemes(metadata: unknown): Record<string | number, string> {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
    const dayThemes = (metadata as { dayThemes?: unknown }).dayThemes;
    if (!dayThemes || typeof dayThemes !== 'object' || Array.isArray(dayThemes)) return {};
    return dayThemes as Record<string | number, string>;
  }

  private extractPlanningRiskFacts(snapshot: Snapshot): SpatialRouteRiskFact[] {
    if (!snapshot) return [];
    const facts = snapshot.tripOntologyFacts;
    if (!Array.isArray(facts) || facts.length === 0) return [];

    const risks: SpatialRouteRiskFact[] = [];
    for (const fact of facts.slice(0, 16)) {
      const predicate = String(fact.predicate ?? '').toLowerCase();
      const isRoadRelated =
        predicate.includes('road') ||
        predicate.includes('closure') ||
        predicate.includes('hazard') ||
        predicate.includes('weather');
      if (!isRoadRelated) continue;

      const value =
        fact.value && typeof fact.value === 'object'
          ? (fact.value as Record<string, unknown>)
          : {};
      const label =
        String(value.label ?? value.title ?? value.message ?? fact.predicate ?? '').trim() ||
        '道路风险';
      const status = String(value.status ?? value.state ?? '').trim() || '关注';
      const riskLevel =
        String(value.riskLevel ?? value.severity ?? value.level ?? '').trim() || 'medium';
      const roadName = String(value.roadName ?? value.road ?? fact.subjectId ?? '').trim();

      let coords: SpatialRouteRiskFact['coords'] = null;
      const geom = fact.scope?.geometry;
      if (geom && typeof geom === 'object') {
        const g = geom as { lat?: unknown; lng?: unknown; coordinates?: unknown };
        if (g.lat != null && g.lng != null) {
          const lat = Number(g.lat);
          const lng = Number(g.lng);
          if (Number.isFinite(lat) && Number.isFinite(lng)) coords = { lat, lng };
        } else if (Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
          const lng = Number(g.coordinates[0]);
          const lat = Number(g.coordinates[1]);
          if (Number.isFinite(lat) && Number.isFinite(lng)) coords = { lat, lng };
        }
      }

      risks.push({
        id: String(fact.factId ?? `risk-${risks.length + 1}`),
        label,
        roadName,
        status,
        riskLevel,
        impactRange: String(value.impactRange ?? value.impact ?? value.affected ?? '').trim(),
        updatedAt: String(fact.observedAt ?? '').trim(),
        coords,
      });
      if (risks.length >= 8) break;
    }
    return risks;
  }
}
