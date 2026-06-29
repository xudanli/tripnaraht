import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { toInputJsonValue } from '../budget-os/utils/prisma-json.util';
import type {
  CreateJourneyMapDecisionItemDto,
  CreateJourneyMapDecisionItemResponseDto,
  JourneyMapDecisionItemDto,
} from '../dto/journey-map-decision-item.dto';
import {
  bumpConstraintsVersion,
  getConstraintsVersion,
} from '../trip-constraint-solver/utils/constraints-metadata.util';

function readDecisionItems(metadata: unknown): JourneyMapDecisionItemDto[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const raw = (metadata as { journeyMapDecisionItems?: unknown }).journeyMapDecisionItems;
  if (!Array.isArray(raw)) return [];
  return raw.filter(Boolean) as JourneyMapDecisionItemDto[];
}

@Injectable()
export class JourneyMapDecisionItemsService {
  constructor(private readonly prisma: PrismaService) {}

  listForTrip(tripId: string): Promise<JourneyMapDecisionItemDto[]> {
    return this.prisma.trip
      .findUnique({ where: { id: tripId }, select: { metadata: true } })
      .then((trip) => {
        if (!trip) throw new NotFoundException(`行程 ID ${tripId} 不存在`);
        return readDecisionItems(trip.metadata);
      });
  }

  async create(
    tripId: string,
    body: CreateJourneyMapDecisionItemDto,
    userId: string,
  ): Promise<CreateJourneyMapDecisionItemResponseDto> {
    const title = body.title?.trim();
    if (!title) {
      throw new BadRequestException('title is required');
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, metadata: true },
    });
    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const currentVersion = getConstraintsVersion(trip.metadata);
    if (body.constraintsVersion != null && body.constraintsVersion !== currentVersion) {
      throw new ConflictException({
        code: 'CONSTRAINTS_STALE',
        message: `约束已变更（当前 version=${currentVersion}）`,
        currentVersion,
      });
    }

    const item: JourneyMapDecisionItemDto = {
      id: randomUUID(),
      tripId,
      activityId: body.activityId?.trim() || undefined,
      title,
      description: body.description?.trim() || undefined,
      severity: body.severity ?? 'medium',
      status: 'open',
      source: body.source ?? 'journey_map_inspector',
      verdict: body.verdict,
      riskLabels: body.riskLabels?.filter(Boolean),
      createdAt: new Date().toISOString(),
      createdBy: userId,
    };

    const baseMeta =
      trip.metadata && typeof trip.metadata === 'object'
        ? { ...(trip.metadata as Record<string, unknown>) }
        : {};

    const journeyMapDecisionItems = [...readDecisionItems(trip.metadata), item];
    const bumped = bumpConstraintsVersion({
      ...baseMeta,
      journeyMapDecisionItems,
    });

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(bumped) },
    });

    return {
      item,
      constraintsVersion: getConstraintsVersion(bumped),
    };
  }
}
