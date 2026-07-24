import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RouteDirectionsService } from '../route-directions/route-directions.service';
import {
  buildActiveTripDecisionReplayView,
  buildRouteTemplateTripBackflowPreview,
} from './engine/active-trip-decision-replay.engine';
import {
  appendBackflowExampleToTemplateMetadata,
  buildBackflowExampleRecord,
  readTripBackflowCommit,
  resolveCatalogEntry,
} from './engine/route-template-backflow.engine';
import type {
  ActiveTripDecisionReplayView,
  RouteTemplateBackflowCommitResultView,
  RouteTemplateBackflowExampleRecord,
  RouteTemplateTripBackflowPreview,
} from './types/active-trip-decision-replay.types';
import { CollabFlywheelAuditService } from './observability/collaborative-flywheel-audit.service';

@Injectable()
export class ActiveTripDecisionReplayService {
  private readonly logger = new Logger(ActiveTripDecisionReplayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routeDirections: RouteDirectionsService,
    @Optional() private readonly collabFlywheelAudit?: CollabFlywheelAuditService,
  ) {}

  async getDecisionReplay(userId: string, tripId: string): Promise<ActiveTripDecisionReplayView> {
    const trip = await this.loadTripForCollaborator(userId, tripId);
    const crewUserIds = await this.listCrewUserIds(tripId);

    const replay = buildActiveTripDecisionReplayView({
      tripId,
      metadata: trip.metadata,
      crewUserIds,
    });

    const flywheelAuditReport =
      (await this.collabFlywheelAudit?.resolveFlywheelAuditReportForReplay({
        tripId,
        replay,
        metadata: trip.metadata,
        source: 'decision_replay_api',
      })) ?? null;

    return {
      ...replay,
      flywheelAuditReport,
    };
  }

  async previewTemplateBackflow(
    userId: string,
    tripId: string,
  ): Promise<RouteTemplateTripBackflowPreview> {
    const trip = await this.loadTripForCollaborator(userId, tripId);
    const crewUserIds = await this.listCrewUserIds(tripId);

    const preview = buildRouteTemplateTripBackflowPreview({
      metadata: trip.metadata,
      crewUserIds,
    });

    if (!preview) {
      throw new NotFoundException('该行程无 Match Square 路线模板绑定，无法生成回流预览');
    }

    return preview;
  }

  async commitTemplateBackflow(
    userId: string,
    tripId: string,
    input?: { note?: string; skipIfExists?: boolean },
  ): Promise<RouteTemplateBackflowCommitResultView> {
    await this.assertCaptain(userId, tripId);

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, metadata: true },
    });
    if (!trip) {
      throw new NotFoundException('行程不存在');
    }

    const existingCommit = readTripBackflowCommit(trip.metadata);
    if (existingCommit) {
      if (input?.skipIfExists) {
        const template = await this.prisma.routeTemplate.findUnique({
          where: { id: existingCommit.routeTemplateId },
        });
        if (!template) {
          throw new NotFoundException('已提交但模板不存在');
        }
        const preview = await this.previewTemplateBackflow(userId, tripId);
        let example = readBackflowExampleFromTemplate(template.metadata, existingCommit.exampleId);
        if (!example) {
          const replay = buildActiveTripDecisionReplayView({
            tripId,
            metadata: trip.metadata,
            crewUserIds: await this.listCrewUserIds(tripId),
          });
          example = {
            ...buildBackflowExampleRecord({
              preview,
              catalogId: preview.catalogId ?? '',
              flywheelMetrics: replay.flywheelMetrics,
              timelineEventCount: replay.timeline.length,
              at: existingCommit.committedAt,
            }),
            exampleId: existingCommit.exampleId,
          };
        }
        return {
          tripId,
          routeTemplateId: template.id,
          routeTemplateUuid: template.uuid,
          catalogId: preview.catalogId ?? '',
          example,
          preview,
          alreadyCommitted: true,
        };
      }
      throw new BadRequestException('该行程已向路线模板回流过范例');
    }

    const crewUserIds = await this.listCrewUserIds(tripId);
    const preview = buildRouteTemplateTripBackflowPreview({
      metadata: trip.metadata,
      crewUserIds,
    });
    if (!preview?.catalogId) {
      throw new NotFoundException('该行程无 Match Square 路线模板绑定');
    }

    const catalog = resolveCatalogEntry(preview.catalogId);
    if (!catalog) {
      throw new BadRequestException(`未知 catalogId: ${preview.catalogId}`);
    }

    const routeDirection = await this.prisma.routeDirection.findFirst({
      where: { name: catalog.routeDirectionName },
      select: { id: true },
    });
    if (!routeDirection) {
      throw new NotFoundException(`路线方向 ${catalog.routeDirectionName} 未入库`);
    }

    let template = await this.routeDirections.findRouteTemplateByDirectionAndDuration(
      routeDirection.id,
      catalog.durationDays,
    );
    if (!template) {
      const templates = await this.routeDirections.findRouteTemplates({
        routeDirectionId: routeDirection.id,
        isActive: true,
        limit: 1,
      });
      template = templates[0] ?? null;
    }
    if (!template) {
      throw new NotFoundException('未找到可回流的 RouteTemplate DB 记录');
    }

    const replay = buildActiveTripDecisionReplayView({
      tripId,
      metadata: trip.metadata,
      crewUserIds,
    });

    const example = buildBackflowExampleRecord({
      preview,
      catalogId: preview.catalogId,
      flywheelMetrics: replay.flywheelMetrics,
      timelineEventCount: replay.timeline.length,
      note: input?.note ?? null,
    });

    const templateMetadata = appendBackflowExampleToTemplateMetadata(template.metadata, example);

    await this.prisma.$transaction(async (tx) => {
      await tx.routeTemplate.update({
        where: { id: template.id },
        data: {
          metadata: templateMetadata as object,
          updatedAt: new Date(),
        },
      });

      const prevMeta =
        trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
          ? (trip.metadata as Record<string, unknown>)
          : {};

      await tx.trip.update({
        where: { id: tripId },
        data: {
          metadata: {
            ...prevMeta,
            matchSquareTemplateBackflowCommit: {
              committedAt: example.committedAt,
              routeTemplateId: template.id,
              routeTemplateUuid: template.uuid,
              catalogId: preview.catalogId,
              exampleId: example.exampleId,
            },
          },
          updatedAt: new Date(),
        },
      });
    });

    this.logger.log(
      `Template backflow committed trip=${tripId} template=${template.id} example=${example.exampleId}`,
    );

    return {
      tripId,
      routeTemplateId: template.id,
      routeTemplateUuid: template.uuid,
      catalogId: preview.catalogId,
      example,
      preview,
      alreadyCommitted: false,
    };
  }

  private async assertCaptain(userId: string, tripId: string): Promise<void> {
    const collaborator = await this.prisma.tripCollaborator.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    if (!collaborator) {
      throw new ForbiddenException('您不是该行程协作者');
    }
    if (collaborator.role !== 'OWNER') {
      throw new ForbiddenException('仅队长可向路线模板提交回流范例');
    }
  }

  private async loadTripForCollaborator(userId: string, tripId: string) {
    const collaborator = await this.prisma.tripCollaborator.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    if (!collaborator) {
      throw new ForbiddenException('您不是该行程协作者');
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, metadata: true },
    });
    if (!trip) {
      throw new NotFoundException('行程不存在');
    }
    return trip;
  }

  private async listCrewUserIds(tripId: string): Promise<string[]> {
    const rows = await this.prisma.tripCollaborator.findMany({
      where: { tripId },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }
}

function readBackflowExampleFromTemplate(
  metadata: unknown,
  exampleId: string,
): RouteTemplateBackflowExampleRecord | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>).matchSquareBackflow_v1;
  if (!raw || typeof raw !== 'object') return null;
  const examples = (raw as { examples?: unknown[] }).examples;
  if (!Array.isArray(examples)) return null;
  return (
    (examples as RouteTemplateBackflowExampleRecord[]).find((e) => e.exampleId === exampleId) ??
    null
  );
}
