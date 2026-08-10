import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ErrorCode } from '../../../common/dto/standard-response.dto';
import {
  getPackingTemplate,
  listPackingTemplates,
} from '../data/packing-templates.data';
import { resolveReadinessClaimItem } from '../data/readiness-claim.catalog';
import type {
  CreateMyPackingListItemDto,
  CreateTeamTaskDto,
  FromPackingTemplateDto,
  FromReadinessDto,
  RemindTeamTasksDto,
  UpdateMyPackingListItemDto,
  UpdateTeamTaskDto,
} from '../dto/team-tasks.dto';
import { teamTasksRemindBus } from '../ports/team-tasks-remind.bus';
import { teamTasksChangedBus } from '../ports/team-tasks-changed.bus';
import type {
  FromPackingPersonalResult,
  FromPackingTemplateResult,
  FromReadinessResult,
  MyPackingListData,
  MyPackingListItem,
  PackingTemplateDetail,
  PackingTemplateSummary,
  RemindTeamTasksResult,
  TeamTask,
  TeamTaskListData,
  TeamTaskListScope,
  TeamTaskSource,
  TeamTaskStatus,
} from '../types/team-tasks.types';
import { TeamTasksAccessService } from './team-tasks-access.service';
import { TeamTasksMembersService } from './team-tasks-members.service';
import {
  computeTeamTaskStats,
  isMineRelevant,
  sortTeamTasks,
} from '../utils/team-tasks.util';

const SCHEMA_ID = 'tripnara.team_tasks.client@v1' as const;
const MY_PACKING_SCHEMA = 'tripnara.my_packing_list.client@v1' as const;
const ACTIVE_STATUSES: TeamTaskStatus[] = ['open', 'claimed', 'done'];
const DEFAULT_REMIND_MESSAGE =
  '请尽快完成分配给你的团队任务，方便行程按时推进。';
const REMIND_COOLDOWN_MS = 24 * 60 * 60 * 1000;

type TaskRow = {
  id: string;
  tripId: string;
  title: string;
  notes: string | null;
  status: string;
  assigneeMemberId: string | null;
  assigneeName: string | null;
  dueAt: Date | null;
  dueLabel: string | null;
  systemImage: string | null;
  sourceType: string;
  sourceRefId: string | null;
  sourceLabelZh: string | null;
  createdByMemberId: string;
  completedAt: Date | null;
  updatedAt: Date;
};

@Injectable()
export class TeamTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TeamTasksAccessService,
    private readonly members: TeamTasksMembersService,
  ) {}

  async listTasks(
    tripId: string,
    userId: string,
    scope: TeamTaskListScope = 'all',
    filters?: { sourceType?: string; refId?: string },
  ): Promise<TeamTaskListData> {
    await this.access.assertTripMember(tripId, userId);

    const rows = await this.prisma.tripTeamTask.findMany({
      where: {
        tripId,
        status: { in: ACTIVE_STATUSES },
        ...(filters?.sourceType
          ? { sourceType: filters.sourceType.trim() }
          : {}),
        ...(filters?.refId ? { sourceRefId: filters.refId.trim() } : {}),
      },
    });

    // stats always full-trip (uncancelled), independent of scope/source filters
    const allForStats = filters?.sourceType || filters?.refId
      ? await this.prisma.tripTeamTask.findMany({
          where: { tripId, status: { in: ACTIVE_STATUSES } },
        })
      : rows;

    const stats = computeTeamTaskStats(allForStats, userId);
    let filtered = rows;
    if (scope === 'mine') {
      filtered = rows.filter((r) => isMineRelevant(r, userId));
    } else if (scope === 'open') {
      filtered = rows.filter((r) => r.status === 'open');
    }

    const tasks = sortTeamTasks(filtered, userId).map((r) => this.mapTask(r));
    return { schemaId: SCHEMA_ID, stats, tasks };
  }

  /**
   * @returns reused=true when idempotent hit on itinerary_item (or same source key)
   */
  async createTask(
    tripId: string,
    userId: string,
    dto: CreateTeamTaskDto,
  ): Promise<{ task: TeamTask; created: boolean }> {
    await this.access.assertTripMember(tripId, userId);
    const title = dto.title?.trim();
    if (!title) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: '标题不能为空',
      });
    }

    const assigneeMemberId =
      dto.assigneeMemberId === undefined || dto.assigneeMemberId === null
        ? null
        : dto.assigneeMemberId.trim() || null;

    let assigneeName: string | null = null;
    if (assigneeMemberId) {
      await this.assertValidAssignee(tripId, assigneeMemberId);
      assigneeName = await this.members.resolveDisplayName(
        tripId,
        assigneeMemberId,
      );
    }

    const dueAt = this.parseDueAt(dto.dueAt);
    const sourceType = (dto.source?.type?.trim() || 'manual').slice(0, 64);
    const sourceRefId = dto.source?.refId?.trim() || null;
    const sourceLabelZh = dto.source?.labelZh?.trim() || null;

    if (sourceType === 'itinerary_item') {
      if (!sourceRefId) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'itinerary_item 须提供 source.refId（itineraryItemId）',
        });
      }
      await this.assertItineraryItemInTrip(tripId, sourceRefId);
    }

    // Idempotent create for sourced tasks with refId
    if (sourceRefId && sourceType !== 'manual') {
      const existing = await this.prisma.tripTeamTask.findFirst({
        where: {
          tripId,
          sourceType,
          sourceRefId,
          status: { in: ['open', 'claimed'] },
        },
      });
      if (existing) {
        return { task: this.mapTask(existing), created: false };
      }
    }

    const status: TeamTaskStatus = assigneeMemberId ? 'claimed' : 'open';

    const row = await this.prisma.tripTeamTask.create({
      data: {
        tripId,
        title,
        notes: dto.notes?.trim() || null,
        status,
        assigneeMemberId,
        assigneeName,
        dueAt,
        sourceType,
        sourceRefId,
        sourceLabelZh,
        createdByMemberId: userId,
      },
    });

    this.emitChanged(tripId);
    return { task: this.mapTask(row), created: true };
  }

  async claimTask(
    tripId: string,
    taskId: string,
    userId: string,
  ): Promise<TeamTask> {
    await this.access.assertTripMember(tripId, userId);
    const existing = await this.requireTask(tripId, taskId);

    if (existing.status !== 'open') {
      if (
        existing.status === 'claimed' &&
        existing.assigneeMemberId &&
        existing.assigneeMemberId !== userId
      ) {
        throw new ConflictException({
          code: ErrorCode.TASK_ALREADY_CLAIMED,
          message: '该任务已被其他成员领取',
        });
      }
      throw new ConflictException({
        code: ErrorCode.TASK_INVALID_TRANSITION,
        message: '仅待认领任务可领取',
      });
    }

    if (existing.assigneeMemberId && existing.assigneeMemberId !== userId) {
      throw new ConflictException({
        code: ErrorCode.TASK_ALREADY_CLAIMED,
        message: '该任务已被其他成员领取',
      });
    }

    const assigneeName = await this.members.resolveDisplayName(tripId, userId);
    const row = await this.prisma.tripTeamTask.update({
      where: { id: taskId },
      data: {
        status: 'claimed',
        assigneeMemberId: userId,
        assigneeName,
      },
    });
    this.emitChanged(tripId);
    return this.mapTask(row);
  }

  async completeTask(
    tripId: string,
    taskId: string,
    userId: string,
  ): Promise<TeamTask> {
    await this.access.assertTripMember(tripId, userId);
    const existing = await this.requireTask(tripId, taskId);

    if (existing.status !== 'claimed') {
      throw new ConflictException({
        code: ErrorCode.TASK_INVALID_TRANSITION,
        message: '仅进行中任务可标记完成',
      });
    }

    const isAssignee = existing.assigneeMemberId === userId;
    const isOwner = await this.access.isOwner(tripId, userId);
    if (!isAssignee && !isOwner) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅负责人或行程 Owner 可标记完成',
      });
    }

    const row = await this.prisma.tripTeamTask.update({
      where: { id: taskId },
      data: {
        status: 'done',
        completedAt: new Date(),
      },
    });
    // Does NOT touch itinerary bookingStatus (P2 client syncs separately)
    this.emitChanged(tripId);
    return this.mapTask(row);
  }

  async reopenTask(
    tripId: string,
    taskId: string,
    userId: string,
  ): Promise<TeamTask> {
    await this.access.assertTripMember(tripId, userId);
    const existing = await this.requireTask(tripId, taskId);

    if (existing.status !== 'done') {
      throw new ConflictException({
        code: ErrorCode.TASK_INVALID_TRANSITION,
        message: '仅已完成任务可重新打开',
      });
    }

    const isAssignee = existing.assigneeMemberId === userId;
    const isOwner = await this.access.isOwner(tripId, userId);
    const isCreator = existing.createdByMemberId === userId;
    if (!isAssignee && !isOwner && !isCreator) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: '仅负责人、创建人或行程 Owner 可重新打开',
      });
    }

    let assigneeMemberId = existing.assigneeMemberId;
    let assigneeName = existing.assigneeName;
    if (!assigneeMemberId) {
      assigneeMemberId = userId;
      assigneeName = await this.members.resolveDisplayName(tripId, userId);
    }

    const row = await this.prisma.tripTeamTask.update({
      where: { id: taskId },
      data: {
        status: 'claimed',
        completedAt: null,
        assigneeMemberId,
        assigneeName,
      },
    });
    // Does NOT roll back itinerary bookingStatus
    this.emitChanged(tripId);
    return this.mapTask(row);
  }

  async updateTask(
    tripId: string,
    taskId: string,
    userId: string,
    dto: UpdateTeamTaskDto,
  ): Promise<TeamTask> {
    await this.access.assertTripMember(tripId, userId);
    const existing = await this.requireTask(tripId, taskId);
    await this.assertCanEdit(tripId, userId, existing);

    if (existing.status === 'cancelled') {
      throw new ConflictException({
        code: ErrorCode.TASK_INVALID_TRANSITION,
        message: '已取消任务不可编辑',
      });
    }

    const data: Prisma.TripTeamTaskUpdateInput = {};

    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (!title) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: '标题不能为空',
        });
      }
      data.title = title;
    }

    if (dto.notes !== undefined) {
      data.notes = dto.notes?.trim() || null;
    }

    if (dto.dueAt !== undefined) {
      data.dueAt = this.parseDueAt(dto.dueAt);
    }

    if (dto.assigneeMemberId !== undefined) {
      const nextAssignee =
        dto.assigneeMemberId === null || dto.assigneeMemberId === ''
          ? null
          : dto.assigneeMemberId.trim();

      if (nextAssignee) {
        await this.assertValidAssignee(tripId, nextAssignee);
        data.assigneeMemberId = nextAssignee;
        data.assigneeName = await this.members.resolveDisplayName(
          tripId,
          nextAssignee,
        );
        if (existing.status !== 'done') {
          data.status = 'claimed';
        }
      } else {
        data.assigneeMemberId = null;
        data.assigneeName = null;
        if (existing.status !== 'done') {
          data.status = 'open';
        }
      }
    }

    const row = await this.prisma.tripTeamTask.update({
      where: { id: taskId },
      data,
    });
    this.emitChanged(tripId);
    return this.mapTask(row);
  }

  async deleteTask(
    tripId: string,
    taskId: string,
    userId: string,
  ): Promise<TeamTask | null> {
    await this.access.assertTripMember(tripId, userId);
    const existing = await this.requireTask(tripId, taskId, true);
    if (existing.status === 'cancelled') {
      return this.mapTask(existing);
    }

    await this.assertCanDelete(tripId, userId, existing);

    const row = await this.prisma.tripTeamTask.update({
      where: { id: taskId },
      data: { status: 'cancelled' },
    });
    // Soft-cancel only; does NOT touch itinerary bookingStatus
    this.emitChanged(tripId);
    return this.mapTask(row);
  }

  async listTemplates(
    tripId: string,
    userId: string,
  ): Promise<{ templates: PackingTemplateSummary[] }> {
    await this.access.assertTripMember(tripId, userId);
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { destination: true },
    });
    return {
      templates: listPackingTemplates(trip?.destination ?? null),
    };
  }

  async getTemplate(
    tripId: string,
    userId: string,
    templateId: string,
  ): Promise<PackingTemplateDetail> {
    await this.access.assertTripMember(tripId, userId);
    const detail = getPackingTemplate(templateId);
    if (!detail) {
      throw new NotFoundException({
        code: ErrorCode.TEMPLATE_NOT_FOUND,
        message: `模板 ${templateId} 不存在`,
      });
    }
    return detail;
  }

  async createFromPackingTemplate(
    tripId: string,
    userId: string,
    dto: FromPackingTemplateDto,
  ): Promise<FromPackingTemplateResult | FromPackingPersonalResult> {
    await this.access.assertTripMember(tripId, userId);

    const mode = dto.mode ?? 'team_tasks';
    const template = getPackingTemplate(dto.templateId);
    if (!template) {
      throw new NotFoundException({
        code: ErrorCode.TEMPLATE_NOT_FOUND,
        message: `模板 ${dto.templateId} 不存在`,
      });
    }

    const include = new Set(dto.includeItemIds ?? []);
    if (include.size === 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: '请至少选择一项打包条目',
      });
    }

    const selected = template.items.filter((i) => include.has(i.id));
    if (selected.length === 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: '所选条目不在该模板中',
      });
    }

    if (mode === 'personal_checklist') {
      return this.createPersonalFromTemplate(
        tripId,
        userId,
        dto.templateId,
        selected,
      );
    }

    let defaultAssignee: string | null =
      dto.defaultAssigneeMemberId === undefined ||
      dto.defaultAssigneeMemberId === null
        ? null
        : dto.defaultAssigneeMemberId.trim() || null;
    let defaultName: string | null = null;
    if (defaultAssignee) {
      await this.assertValidAssignee(tripId, defaultAssignee);
      defaultName = await this.members.resolveDisplayName(
        tripId,
        defaultAssignee,
      );
    }

    const existing = await this.prisma.tripTeamTask.findMany({
      where: {
        tripId,
        sourceType: 'packing_template',
        sourceRefId: { in: selected.map((i) => i.id) },
        status: { in: ['open', 'claimed'] },
      },
      select: { sourceRefId: true },
    });
    const existingRefs = new Set(
      existing.map((e) => e.sourceRefId).filter(Boolean) as string[],
    );

    const toCreate = selected.filter((i) => !existingRefs.has(i.id));
    const skippedDuplicates = selected.length - toCreate.length;
    const status: TeamTaskStatus = defaultAssignee ? 'claimed' : 'open';
    const sourceLabelZh = `打包 · ${template.titleZh}`;

    const created = await this.prisma.$transaction(
      toCreate.map((item) =>
        this.prisma.tripTeamTask.create({
          data: {
            tripId,
            title: item.titleZh,
            status,
            assigneeMemberId: defaultAssignee,
            assigneeName: defaultName,
            sourceType: 'packing_template',
            sourceRefId: item.id,
            sourceLabelZh,
            createdByMemberId: userId,
          },
        }),
      ),
    );

    if (created.length > 0) this.emitChanged(tripId);
    return {
      createdCount: created.length,
      taskIds: created.map((r) => r.id),
      skippedDuplicates,
    };
  }

  async createFromReadiness(
    tripId: string,
    userId: string,
    dto: FromReadinessDto,
  ): Promise<FromReadinessResult> {
    await this.access.assertTripMember(tripId, userId);

    const itemIds = [
      ...new Set((dto.itemIds ?? []).map((id) => id.trim()).filter(Boolean)),
    ];
    if (itemIds.length === 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: '请至少选择一项准备项',
      });
    }

    const resolved = itemIds.map((id) => resolveReadinessClaimItem(id));
    const existing = await this.prisma.tripTeamTask.findMany({
      where: {
        tripId,
        sourceType: 'readiness',
        sourceRefId: { in: resolved.map((r) => r.refId) },
        status: { in: ['open', 'claimed'] },
      },
      select: { sourceRefId: true },
    });
    const existingRefs = new Set(
      existing.map((e) => e.sourceRefId).filter(Boolean) as string[],
    );

    const toCreate = resolved.filter((r) => !existingRefs.has(r.refId));
    const assigneeName = await this.members.resolveDisplayName(tripId, userId);

    const created = await this.prisma.$transaction(
      toCreate.map((item) =>
        this.prisma.tripTeamTask.create({
          data: {
            tripId,
            title: item.titleZh,
            status: 'claimed',
            assigneeMemberId: userId,
            assigneeName,
            systemImage: item.systemImage ?? null,
            sourceType: 'readiness',
            sourceRefId: item.refId,
            sourceLabelZh: item.labelZh,
            createdByMemberId: userId,
          },
        }),
      ),
    );

    if (created.length > 0) this.emitChanged(tripId);
    return {
      createdCount: created.length,
      taskIds: created.map((r) => r.id),
      skippedDuplicates: resolved.length - toCreate.length,
    };
  }

  async remindMembers(
    tripId: string,
    userId: string,
    dto: RemindTeamTasksDto,
  ): Promise<RemindTeamTasksResult> {
    await this.access.assertTripMember(tripId, userId);

    const memberIds = [
      ...new Set((dto.memberIds ?? []).map((id) => id.trim()).filter(Boolean)),
    ].filter((id) => id !== userId);

    if (memberIds.length === 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: '请选择要提醒的成员',
      });
    }

    const memberMap = await this.members.getMemberMap(tripId);
    if (memberMap.size > 0) {
      for (const mid of memberIds) {
        if (!memberMap.has(mid)) {
          throw new BadRequestException({
            code: ErrorCode.VALIDATION_ERROR,
            message: `成员 ${mid} 不属于该行程`,
          });
        }
      }
    }

    const allowRemindAgain = dto.allowRemindAgain !== false;
    let targets = memberIds;
    let skippedRecentlyReminded = 0;

    if (!allowRemindAgain) {
      const since = new Date(Date.now() - REMIND_COOLDOWN_MS);
      const recent = await this.prisma.tripTeamTaskRemind.findMany({
        where: {
          tripId,
          toMemberId: { in: memberIds },
          createdAt: { gte: since },
        },
        select: { toMemberId: true },
      });
      const recently = new Set(recent.map((r) => r.toMemberId));
      targets = memberIds.filter((id) => !recently.has(id));
      skippedRecentlyReminded = memberIds.length - targets.length;
    }

    const message = dto.message?.trim() || DEFAULT_REMIND_MESSAGE;

    if (targets.length > 0) {
      await this.prisma.tripTeamTaskRemind.createMany({
        data: targets.map((toMemberId) => ({
          tripId,
          fromMemberId: userId,
          toMemberId,
          message,
        })),
      });

      teamTasksRemindBus.emit({
        tripId,
        fromMemberId: userId,
        memberIds: targets,
        message,
        sendAppPush: dto.sendAppPush !== false,
      });
    }

    return {
      notifiedCount: targets.length,
      ...(skippedRecentlyReminded > 0 ? { skippedRecentlyReminded } : {}),
    };
  }

  async getMyPackingList(
    tripId: string,
    userId: string,
  ): Promise<MyPackingListData> {
    await this.access.assertTripMember(tripId, userId);
    const rows = await this.prisma.tripMyPackingListItem.findMany({
      where: { tripId, userId },
      orderBy: [{ categoryZh: 'asc' }, { createdAt: 'asc' }],
    });
    const items = rows.map((r) => this.mapPackingItem(r));
    const checked = items.filter((i) => i.checked).length;
    return {
      schemaId: MY_PACKING_SCHEMA,
      stats: { total: items.length, checked },
      items,
    };
  }

  async createMyPackingListItem(
    tripId: string,
    userId: string,
    dto: CreateMyPackingListItemDto,
  ): Promise<MyPackingListItem> {
    await this.access.assertTripMember(tripId, userId);
    const titleZh = dto.titleZh?.trim();
    if (!titleZh) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: '标题不能为空',
      });
    }

    const row = await this.prisma.tripMyPackingListItem.create({
      data: {
        tripId,
        userId,
        titleZh,
        categoryZh: dto.categoryZh?.trim() || null,
        checked: false,
        sourceType: 'manual',
        sourceRefId: null,
        templateId: null,
      },
    });
    return this.mapPackingItem(row);
  }

  async updateMyPackingListItem(
    tripId: string,
    userId: string,
    itemId: string,
    dto: UpdateMyPackingListItemDto,
  ): Promise<MyPackingListItem> {
    await this.access.assertTripMember(tripId, userId);
    const existing = await this.prisma.tripMyPackingListItem.findFirst({
      where: { id: itemId, tripId, userId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: `打包项 ${itemId} 不存在`,
      });
    }

    if (dto.checked === undefined) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: '请提供 checked',
      });
    }

    const row = await this.prisma.tripMyPackingListItem.update({
      where: { id: itemId },
      data: { checked: dto.checked },
    });
    return this.mapPackingItem(row);
  }

  async deleteMyPackingListItem(
    tripId: string,
    userId: string,
    itemId: string,
  ): Promise<{ deleted: true; itemId: string }> {
    await this.access.assertTripMember(tripId, userId);
    const existing = await this.prisma.tripMyPackingListItem.findFirst({
      where: { id: itemId, tripId, userId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: `打包项 ${itemId} 不存在`,
      });
    }

    await this.prisma.tripMyPackingListItem.delete({ where: { id: itemId } });
    return { deleted: true, itemId };
  }

  private async createPersonalFromTemplate(
    tripId: string,
    userId: string,
    templateId: string,
    selected: Array<{ id: string; titleZh: string; categoryZh: string }>,
  ): Promise<FromPackingPersonalResult> {
    const existing = await this.prisma.tripMyPackingListItem.findMany({
      where: {
        tripId,
        userId,
        sourceType: 'packing_template',
        sourceRefId: { in: selected.map((i) => i.id) },
      },
      select: { sourceRefId: true },
    });
    const existingRefs = new Set(
      existing.map((e) => e.sourceRefId).filter(Boolean) as string[],
    );
    const toCreate = selected.filter((i) => !existingRefs.has(i.id));

    const created = await this.prisma.$transaction(
      toCreate.map((item) =>
        this.prisma.tripMyPackingListItem.create({
          data: {
            tripId,
            userId,
            titleZh: item.titleZh,
            categoryZh: item.categoryZh,
            checked: false,
            sourceType: 'packing_template',
            sourceRefId: item.id,
            templateId,
          },
        }),
      ),
    );

    return {
      createdCount: created.length,
      itemIds: created.map((r) => r.id),
      skippedDuplicates: selected.length - toCreate.length,
    };
  }

  private mapPackingItem(row: {
    id: string;
    titleZh: string;
    categoryZh: string | null;
    checked: boolean;
    sourceType: string | null;
    sourceRefId: string | null;
    templateId: string | null;
    updatedAt: Date;
  }): MyPackingListItem {
    return {
      id: row.id,
      titleZh: row.titleZh,
      categoryZh: row.categoryZh,
      checked: row.checked,
      source: row.sourceType
        ? {
            type: row.sourceType,
            ...(row.sourceRefId ? { refId: row.sourceRefId } : {}),
            ...(row.templateId ? { templateId: row.templateId } : {}),
          }
        : null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async requireTask(
    tripId: string,
    taskId: string,
    allowCancelled = false,
  ): Promise<TaskRow> {
    const row = await this.prisma.tripTeamTask.findFirst({
      where: {
        id: taskId,
        tripId,
        ...(allowCancelled ? {} : { status: { not: 'cancelled' } }),
      },
    });
    if (!row || (!allowCancelled && row.status === 'cancelled')) {
      throw new NotFoundException({
        code: ErrorCode.TASK_NOT_FOUND,
        message: `任务 ${taskId} 不存在`,
      });
    }
    return row;
  }

  private async assertValidAssignee(
    tripId: string,
    memberId: string,
  ): Promise<void> {
    const map = await this.members.getMemberMap(tripId);
    if (map.size > 0 && !map.has(memberId)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: '负责人须为行程成员',
      });
    }
  }

  private async assertCanEdit(
    tripId: string,
    userId: string,
    task: TaskRow,
  ): Promise<void> {
    if (await this.access.isOwner(tripId, userId)) return;
    if (task.createdByMemberId === userId) return;
    if (task.assigneeMemberId === userId) return;
    throw new ForbiddenException({
      code: ErrorCode.FORBIDDEN,
      message: '仅 Owner、创建人或当前负责人可编辑',
    });
  }

  private async assertCanDelete(
    tripId: string,
    userId: string,
    task: TaskRow,
  ): Promise<void> {
    if (await this.access.isOwner(tripId, userId)) return;
    if (task.createdByMemberId === userId) return;
    if (task.assigneeMemberId === userId) return;
    throw new ForbiddenException({
      code: ErrorCode.FORBIDDEN,
      message: '仅 Owner、创建人或当前负责人可删除',
    });
  }

  private async assertItineraryItemInTrip(
    tripId: string,
    itemId: string,
  ): Promise<void> {
    const item = await this.prisma.itineraryItem.findFirst({
      where: {
        id: itemId,
        TripDay: { tripId },
      },
      select: { id: true },
    });
    if (!item) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'source.refId 须为属于本行程的 itineraryItemId',
      });
    }
  }

  private emitChanged(tripId: string): void {
    teamTasksChangedBus.emit({
      tripId,
      contextVersion: Date.now(),
    });
  }

  private parseDueAt(raw?: string | null): Date | null {
    if (raw === undefined || raw === null || raw === '') return null;
    const s = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const d = new Date(`${s}T00:00:00.000Z`);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: '非法 dueAt',
        });
      }
      return d;
    }
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: '非法 dueAt',
      });
    }
    return d;
  }

  private mapTask(row: TaskRow): TeamTask {
    const source: TeamTaskSource = {
      // Pass through persisted type as-is (incl. itinerary_item / unknown)
      type: row.sourceType,
      ...(row.sourceRefId ? { refId: row.sourceRefId } : {}),
      ...(row.sourceLabelZh ? { labelZh: row.sourceLabelZh } : {}),
    };

    return {
      id: row.id,
      title: row.title,
      notes: row.notes,
      status: row.status as TeamTaskStatus,
      assigneeMemberId: row.assigneeMemberId,
      assigneeName: row.assigneeName,
      dueAt: row.dueAt ? row.dueAt.toISOString() : null,
      dueLabel: row.dueLabel,
      systemImage: row.systemImage,
      source,
      createdByMemberId: row.createdByMemberId,
      updatedAt: row.updatedAt.toISOString(),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    };
  }
}
