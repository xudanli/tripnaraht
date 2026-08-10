import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';
import { RouteDirectionsService } from '../../route-directions/route-directions.service';
import { UnifiedBootstrapTripDto } from '../dto/unified-bootstrap-trip.dto';

export type BootstrapTemplateResolved = {
  id: number;
  uuid: string;
  durationDays: number;
  nameCN: string | null;
  name: string;
  classicRouteId: string | null;
};

export type BootstrapFromTemplateResult = {
  tripId: string;
  status: 'CREATED';
  source: 'ROUTE_TEMPLATE';
  routeTemplateId: number;
  templateUuid: string;
  classicRouteId: string | null;
  itemsCount: number;
  stats: {
    totalDays: number;
    totalItems: number;
    placesMatched: number;
    placesMissing: number;
  };
  generatedItems: unknown;
  warnings: string[];
  draft: null;
  draftId: null;
  simulation: null;
  decisionTrace: null;
};

@Injectable()
export class UnifiedBootstrapService {
  private readonly logger = new Logger(UnifiedBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routeDirections: RouteDirectionsService,
  ) {}

  hasTemplateIntent(body: UnifiedBootstrapTripDto): boolean {
    return Boolean(
      body.routeTemplateId ||
        (body.templateUuid && body.templateUuid.trim()) ||
        (body.classicRouteId && body.classicRouteId.trim()),
    );
  }

  async resolveTemplate(
    body: UnifiedBootstrapTripDto,
  ): Promise<BootstrapTemplateResolved> {
    const country = body.destination.toUpperCase().trim();

    if (body.routeTemplateId) {
      const t = await this.prisma.routeTemplate.findFirst({
        where: { id: body.routeTemplateId, isActive: true },
        select: {
          id: true,
          uuid: true,
          durationDays: true,
          nameCN: true,
          name: true,
          metadata: true,
          routeDirection: { select: { countryCode: true } },
        },
      });
      if (!t) {
        throw new NotFoundException(
          `Route template ${body.routeTemplateId} not found or inactive`,
        );
      }
      if (
        t.routeDirection?.countryCode &&
        t.routeDirection.countryCode.toUpperCase() !== country
      ) {
        throw new BadRequestException(
          `Template ${t.id} country ${t.routeDirection.countryCode} != destination ${country}`,
        );
      }
      return this.toResolved(t);
    }

    if (body.templateUuid?.trim()) {
      const uuid = body.templateUuid.trim();
      const t = await this.prisma.routeTemplate.findFirst({
        where: { uuid, isActive: true },
        select: {
          id: true,
          uuid: true,
          durationDays: true,
          nameCN: true,
          name: true,
          metadata: true,
          routeDirection: { select: { countryCode: true } },
        },
      });
      if (!t) {
        throw new NotFoundException(
          `Route template uuid=${uuid} not found or inactive`,
        );
      }
      if (
        t.routeDirection?.countryCode &&
        t.routeDirection.countryCode.toUpperCase() !== country
      ) {
        throw new BadRequestException(
          `Template ${t.uuid} country ${t.routeDirection.countryCode} != destination ${country}`,
        );
      }
      return this.toResolved(t);
    }

    const classicRouteId = body.classicRouteId!.trim();
    const start = DateTime.fromISO(body.startDate);
    const end = DateTime.fromISO(body.endDate);
    if (!start.isValid || !end.isValid) {
      throw new BadRequestException('Invalid startDate/endDate');
    }
    const requestedDays = Math.floor(end.diff(start, 'days').days) + 1;

    const candidates = await this.prisma.routeTemplate.findMany({
      where: {
        isActive: true,
        routeDirection: {
          countryCode: country,
          isActive: true,
        },
        OR: [
          { metadata: { path: ['classicRouteId'], equals: classicRouteId } },
          {
            routeDirection: {
              metadata: { path: ['classicRouteId'], equals: classicRouteId },
            },
          },
        ],
      },
      select: {
        id: true,
        uuid: true,
        durationDays: true,
        nameCN: true,
        name: true,
        metadata: true,
      },
      take: 20,
    });

    if (candidates.length === 0) {
      throw new NotFoundException(
        `No active template for classicRouteId=${classicRouteId} country=${country}`,
      );
    }

    candidates.sort(
      (a, b) =>
        Math.abs(a.durationDays - requestedDays) -
          Math.abs(b.durationDays - requestedDays) ||
        a.durationDays - b.durationDays,
    );
    return this.toResolved(candidates[0]);
  }

  /**
   * 模板物化分支：纠正 endDate → createTripFromTemplate → 统一响应形状。
   */
  async bootstrapFromTemplate(
    body: UnifiedBootstrapTripDto,
    userId: string,
  ): Promise<BootstrapFromTemplateResult> {
    const template = await this.resolveTemplate(body);
    const warnings: string[] = [];

    const start = DateTime.fromISO(body.startDate);
    if (!start.isValid) {
      throw new BadRequestException('Invalid startDate');
    }
    const expectedEnd = start
      .plus({ days: template.durationDays - 1 })
      .toISODate()!;
    let endDate = body.endDate;
    const actualDays =
      Math.floor(
        DateTime.fromISO(body.endDate).diff(start, 'days').days,
      ) + 1;
    if (actualDays !== template.durationDays) {
      endDate = expectedEnd;
      warnings.push(
        `endDate adjusted to ${endDate} to match template durationDays=${template.durationDays}`,
      );
      this.logger.log(
        `bootstrap template ${template.id}: endDate ${body.endDate} → ${endDate}`,
      );
    }

    const created = await this.routeDirections.createTripFromTemplate(
      template.id,
      {
        destination: body.destination.toUpperCase().trim(),
        startDate: body.startDate,
        endDate,
        totalBudget: body.totalBudget,
        currency: body.currency ?? 'CNY',
        transport: body.transport ?? 'car',
        pacePreference: body.pacePreference ?? 'BALANCED',
        name: body.name,
        travelers: body.travelers as any,
        bootstrapSource: 'trips.bootstrap',
      },
      userId,
    );

    const tripId = created?.trip?.id;
    if (!tripId) {
      throw new BadRequestException('createTripFromTemplate returned no trip id');
    }

    const stats = created.stats || {
      totalDays: template.durationDays,
      totalItems: 0,
      placesMatched: 0,
      placesMissing: 0,
    };
    if (Array.isArray(created.warnings)) {
      warnings.push(...created.warnings);
    }

    return {
      tripId,
      status: 'CREATED',
      source: 'ROUTE_TEMPLATE',
      routeTemplateId: template.id,
      templateUuid: template.uuid,
      classicRouteId: template.classicRouteId,
      itemsCount: stats.totalItems ?? 0,
      stats,
      generatedItems: created.generatedItems ?? [],
      warnings,
      draft: null,
      draftId: null,
      simulation: null,
      decisionTrace: null,
    };
  }

  private toResolved(t: {
    id: number;
    uuid: string;
    durationDays: number;
    nameCN: string | null;
    name: string;
    metadata: unknown;
  }): BootstrapTemplateResolved {
    const meta = (t.metadata || {}) as { classicRouteId?: string };
    return {
      id: t.id,
      uuid: t.uuid,
      durationDays: t.durationDays,
      nameCN: t.nameCN,
      name: t.name,
      classicRouteId:
        typeof meta.classicRouteId === 'string' ? meta.classicRouteId : null,
    };
  }
}
