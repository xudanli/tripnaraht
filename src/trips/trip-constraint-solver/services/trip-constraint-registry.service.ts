import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TripWishService } from '../../wishlist/services/trip-wish.service';
import { TripBudgetIntentService } from '../../budget-os/services/trip-budget-intent.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import {
  normalizeLunchStrategy,
} from '../../../planning-policy/utils/lunch-strategy.util';
import type {
  CreateTripConstraintDto,
  DisableConstraintDto,
  ListTripConstraintsQueryDto,
  PatchTripConstraintDto,
  PreviewConstraintImpactDto,
  RepairConstraintsDto,
} from '../dto/trip-constraint.dto';
import { ConstraintsSummaryService } from './constraints-summary.service';
import { PlanningConflictsService } from './planning-conflicts.service';
import { FeasibilityReportService } from './feasibility-report.service';
import {
  bumpConstraintsVersion,
  getConstraintsVersion,
  snapshotConstraintsMeta,
} from '../utils/constraints-metadata.util';
import {
  applyMaxSegmentDistanceConstraintPatch,
} from '../utils/segment-distance-threshold.util';
import { applyMaxDailyDrivingHoursConstraintPatch, applyNoNightDriveConstraintPatch } from '../utils/daily-drive-threshold.util';
import {
  aggregateTripConstraints,
  classifyConstraintRefreshType,
  isLegacyConstraintId,
  newCustomConstraintId,
} from '../utils/trip-constraint-aggregate.util';
import { isPhase6OfficialRulePersistenceBlocked } from '../../../decision-runtime/phase6-legacy-deprecation.config';
import { isOfficialConstraintId } from '../utils/country-official-constraints.util';
import { buildStructuredConstraintImpactPreview } from '../utils/constraint-impact-preview.util';
import {
  conflictsForConstraint,
  primaryChangedConstraintId,
  simulateScopedPreview,
} from '../utils/constraint-impact-preview-scope.util';
import { buildUserFacingImpactPreview, sanitizeDayNumbers } from '../utils/constraint-impact-user-preview.util';
import { enrichPlanningConflictsWithRelatedConstraintIds } from '../utils/constraint-conflict-link.util';
import {
  applyConstraintScopePatch,
  inferCoarseScopeFromBinding,
  readConstraintExtendedValue,
  readScopeBindingFromValue,
  writeConstraintExtendedValue,
} from '../utils/constraint-scope-binding.util';
import {
  buildStoredTemplateConstraint,
  constraintIdFromTemplate,
  exportConstraintTemplateCatalog,
  getConstraintTemplate,
  isLegacyPatchOnlyTemplate,
  mergeTemplateValue,
  type ConstraintTemplateCatalogDocument,
} from '../utils/constraint-template-registry.util';
import { buildSoftConstraintCheckConflicts } from '../utils/soft-constraint-evaluation.util';
import { buildSoftScheduleEvalContext } from '../utils/soft-constraint-schedule-eval.util';
import { normalizeSoftPriorityPatch } from '../utils/soft-constraint-priority.util';
import type {
  StoredUnifiedConstraint,
  TripConstraint,
  TripConstraintCheckResponse,
  TripConstraintImpactPreviewResponse,
  TripConstraintMetadataExtension,
  TripConstraintRepairResponse,
  TripConstraintsListResponse,
} from '../types/trip-constraint.types';
import type { TravelDecisionContract } from '../types/travel-decision-contract.types';
import type { PatchTravelDecisionContractDto } from '../dto/travel-decision-contract.dto';
import {
  mergeStoredTravelDecisionContract,
  readStoredTravelDecisionContract,
} from '../utils/travel-decision-contract.builder';
import { TRIP_CONSTRAINT_LEGACY_IDS } from '../types/trip-constraint.types';
import { TripConstraintPreviewService } from './trip-constraint-preview.service';

@Injectable()
export class TripConstraintRegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly constraintsSummary: ConstraintsSummaryService,
    @Inject(forwardRef(() => PlanningConflictsService))
    private readonly planningConflicts: PlanningConflictsService,
    @Inject(forwardRef(() => FeasibilityReportService))
    private readonly feasibility: FeasibilityReportService,
    private readonly budgetIntent: TripBudgetIntentService,
    private readonly wishService: TripWishService,
    private readonly preview: TripConstraintPreviewService,
  ) {}

  async list(
    tripId: string,
    userId: string,
    query: ListTripConstraintsQueryDto,
  ): Promise<TripConstraintsListResponse> {
    const { items, meta, contract } = await this.buildList(tripId, userId);
    let filtered = items;

    if (query.type) filtered = filtered.filter((c) => c.type === query.type);
    if (query.category) filtered = filtered.filter((c) => c.category === query.category);
    if (query.status) filtered = filtered.filter((c) => c.status === query.status);
    if (query.conflictOnly === '1' || query.conflictOnly === 'true') {
      filtered = filtered.filter((c) => c.hasConflict);
    }

    return {
      meta: { ...meta, total: filtered.length },
      items: filtered,
      contract,
    };
  }

  getTemplateCatalog(filter?: { type?: 'HARD' | 'SOFT' }): ConstraintTemplateCatalogDocument {
    const catalog = exportConstraintTemplateCatalog();
    if (!filter?.type) return catalog;
    return {
      ...catalog,
      templates: catalog.templates.filter((t) => t.type === filter.type),
    };
  }

  async getSoftConstraintAdvisories(
    tripId: string,
    userId: string,
  ): Promise<import('../types/planning-conflicts.types').PlanningConflictItem[]> {
    const { items, scheduleCtx } = await this.buildList(tripId, userId);
    return buildSoftConstraintCheckConflicts(items, scheduleCtx);
  }

  async patchContract(
    tripId: string,
    userId: string,
    dto: PatchTravelDecisionContractDto,
  ): Promise<{ contract: TravelDecisionContract; constraints: ReturnType<typeof snapshotConstraintsMeta> }> {
    await this.assertVersion(tripId, dto.constraintsVersion);

    const trip = await this.requireTrip(tripId);
    const existing = readStoredTravelDecisionContract(
      (trip.metadata as Record<string, unknown>) ?? {},
    );
    const merged = mergeStoredTravelDecisionContract(existing, {
      objectives: dto.objectives,
      changeStrategy: dto.changeStrategy,
      automation: dto.automation,
      teamGovernance: dto.teamGovernance,
      automationPaused: dto.automationPaused,
      automationScope: dto.automationScope,
      resetAutomationToDefaults: dto.resetAutomationToDefaults,
    });

    const metadata = bumpConstraintsVersion({
      ...((trip.metadata as object) ?? {}),
      travelDecisionContract: merged,
    });

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(metadata) },
    });

    const { contract } = await this.buildList(tripId, userId);
    return {
      contract,
      constraints: snapshotConstraintsMeta(metadata),
    };
  }

  async create(
    tripId: string,
    userId: string,
    dto: CreateTripConstraintDto,
  ): Promise<{ constraint: TripConstraint; constraints: ReturnType<typeof snapshotConstraintsMeta> }> {
    await this.assertVersion(tripId, dto.constraintsVersion);

    if (dto.type === 'HARD' && dto.source?.type === 'AI_INFERRED') {
      throw new BadRequestException({
        code: 'AI_INFERRED_HARD_FORBIDDEN',
        message: 'AI 推断的约束不能自动设为硬约束，需用户确认后升级',
      });
    }

    if (
      isPhase6OfficialRulePersistenceBlocked() &&
      (dto.source?.type === 'OFFICIAL_RULE' || dto.type === 'EXTERNAL')
    ) {
      throw new BadRequestException({
        code: 'OFFICIAL_RULE_NOT_PERSISTED',
        message: '官方规则由 Destination Pack 只读投影，不可写入 TripConstraint 存储',
      });
    }

    const trip = await this.requireTrip(tripId);
    const ext = this.readExt(trip.metadata);

    const templateId = dto.source?.templateId;
    if (templateId) {
      if (isLegacyPatchOnlyTemplate(templateId)) {
        throw new BadRequestException({
          code: 'LEGACY_CONSTRAINT_USE_PATCH',
          message: `模板 ${templateId} 为 legacy 合成约束，请 PATCH 对应 constraintId 而非 POST 创建`,
          legacyConstraintId:
            templateId === 'no_night_drive'
              ? TRIP_CONSTRAINT_LEGACY_IDS.NO_NIGHT_DRIVE
              : templateId === 'max_daily_drive'
                ? TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE
                : templateId === 'budget_total'
                  ? TRIP_CONSTRAINT_LEGACY_IDS.BUDGET_TOTAL
                  : undefined,
        });
      }
      const def = getConstraintTemplate(templateId);
      if (!def) {
        throw new BadRequestException({
          code: 'UNKNOWN_CONSTRAINT_TEMPLATE',
          message: `未知约束模板 ${templateId}`,
        });
      }
      const stableId = constraintIdFromTemplate(templateId);
      const duplicate = (ext.unifiedConstraints ?? []).find(
        (c) => c.id === stableId || c.source.templateId === templateId,
      );
      if (duplicate) {
        throw new ConflictException({
          code: 'CONSTRAINT_TEMPLATE_ALREADY_EXISTS',
          message: `模板 ${templateId} 已添加`,
          constraintId: duplicate.id,
        });
      }

      const mergedValue = mergeTemplateValue(def, dto.value);
      const teamGovernance = (trip.metadata as Record<string, unknown>)?.travelDecisionContract;
      const scopePatch = applyConstraintScopePatch({
        prevScope: def.scope,
        prevValue: mergedValue,
        dtoScope: dto.scope ?? def.scope,
        dtoValue: dto.value,
        teamGovernance,
      });
      if (scopePatch.errors?.length) {
        throw new BadRequestException({
          code: 'INVALID_SCOPE_BINDING',
          message: scopePatch.errors[0]?.message ?? 'scopeBinding 无效',
          errors: scopePatch.errors,
        });
      }
      const resolvedScope = scopePatch.scope;
      const stored: StoredUnifiedConstraint = {
        ...buildStoredTemplateConstraint({
          def,
          dtoValue: scopePatch.value,
          dtoPriority: dto.priority,
          dtoName: dto.name,
          dtoDescription: dto.description,
          dtoCategory: dto.category,
          dtoScope: resolvedScope,
          dtoOperator: dto.operator,
          dtoType: dto.type,
          dtoAllowRelaxation: dto.allowRelaxation,
          dtoUnit: dto.unit,
          userId,
          stableId,
          sourceType: dto.source?.type,
        }),
        scope: resolvedScope,
        value: scopePatch.value,
        tolerance: dto.tolerance,
        locked: dto.locked ?? false,
        visibility: dto.visibility ?? 'TEAM',
      };

      const metadata = bumpConstraintsVersion({
        ...((trip.metadata as object) ?? {}),
        unifiedConstraints: [...(ext.unifiedConstraints ?? []), stored],
      });

      await this.prisma.trip.update({
        where: { id: tripId },
        data: { metadata: toInputJsonValue(metadata) },
      });

      const { items } = await this.buildList(tripId, userId);
      const created = items.find((c) => c.id === stored.id);
      if (!created) throw new NotFoundException('约束创建后读模型未找到');

      return {
        constraint: created,
        constraints: snapshotConstraintsMeta(metadata),
      };
    }

    if (!dto.scope || !dto.operator) {
      throw new BadRequestException({
        code: 'MISSING_SCOPE_OR_OPERATOR',
        message: '无 templateId 时 scope 与 operator 必填',
      });
    }

    if (dto.category === 'MEMBER' && dto.source?.type === 'PRIVATE_WISH') {
      const wish = await this.wishService.create(tripId, userId, {
        category: 'activities',
        text: String(dto.value ?? dto.name),
        importance: dto.priority ?? 5,
        visibility: 'private',
        inputMode: 'free_text',
      });
      const { items } = await this.buildList(tripId, userId);
      const created = items.find((c) => c.backing?.wishId === wish.id);
      return {
        constraint: created ?? items[items.length - 1],
        constraints: snapshotConstraintsMeta(trip.metadata),
      };
    }

    const stored: StoredUnifiedConstraint = {
      id: newCustomConstraintId(),
      name: dto.name,
      description: dto.description,
      category: dto.category,
      type: dto.type,
      status: dto.type === 'HARD' || dto.type === 'SOFT' ? 'ACTIVE' : 'DRAFT',
      scope: dto.scope,
      operator: dto.operator,
      value:
        dto.type === 'SOFT'
          ? normalizeSoftPriorityPatch({ priority: dto.priority, value: { custom: true, ...(dto.value as object) } })
              .value
          : dto.value,
      unit: dto.unit,
      tolerance: dto.tolerance,
      priority:
        dto.type === 'SOFT'
          ? normalizeSoftPriorityPatch({ priority: dto.priority, value: dto.value }).priority
          : dto.priority,
      allowRelaxation: dto.allowRelaxation ?? dto.type !== 'HARD',
      locked: dto.locked ?? false,
      source: dto.source ?? { type: 'USER', sourceId: userId },
      visibility: dto.visibility ?? 'TEAM',
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const metadata = bumpConstraintsVersion({
      ...((trip.metadata as object) ?? {}),
      unifiedConstraints: [...(ext.unifiedConstraints ?? []), stored],
    });

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(metadata) },
    });

    const { items } = await this.buildList(tripId, userId);
    const created = items.find((c) => c.id === stored.id);
    if (!created) throw new NotFoundException('约束创建后读模型未找到');

    return {
      constraint: created,
      constraints: snapshotConstraintsMeta(metadata),
    };
  }

  async patch(
    tripId: string,
    userId: string,
    constraintId: string,
    dto: PatchTripConstraintDto,
  ): Promise<{ constraint: TripConstraint; constraints: ReturnType<typeof snapshotConstraintsMeta> }> {
    await this.assertVersion(tripId, dto.constraintsVersion);

    if (isOfficialConstraintId(constraintId)) {
      throw new BadRequestException({
        code: 'OFFICIAL_RULE_READONLY',
        message: '目的地官方规则为只读，不可修改',
      });
    }

    const trip = await this.requireTrip(tripId);
    const ext = this.readExt(trip.metadata);

    if (dto.locked === false && ext.legacyConstraintLocks?.[constraintId]) {
      // allow unlock
    } else if (ext.legacyConstraintLocks?.[constraintId] && dto.value !== undefined) {
      throw new BadRequestException({
        code: 'CONSTRAINT_LOCKED',
        message: '该约束已锁定，请先解锁后再修改值',
      });
    }

    if (isLegacyConstraintId(constraintId)) {
      await this.patchLegacyField(tripId, trip, constraintId, dto, userId);
    } else if (constraintId.startsWith('c_wish_')) {
      throw new BadRequestException({
        code: 'WISH_CONSTRAINT_USE_WISH_API',
        message: '成员愿望约束请使用 /trips/:tripId/wishes API 修改',
      });
    } else {
      await this.patchUnifiedStore(tripId, trip, constraintId, dto, userId);
    }

    const { items } = await this.buildList(tripId, userId);
    const updated = items.find((c) => c.id === constraintId);
    if (!updated) throw new NotFoundException(`约束 ${constraintId} 不存在`);

    const refreshed = await this.prisma.trip.findUnique({ where: { id: tripId }, select: { metadata: true } });
    return {
      constraint: updated,
      constraints: snapshotConstraintsMeta(refreshed?.metadata),
    };
  }

  async remove(
    tripId: string,
    userId: string,
    constraintId: string,
    constraintsVersion?: number,
  ): Promise<{ deleted: string; constraints: ReturnType<typeof snapshotConstraintsMeta> }> {
    await this.assertVersion(tripId, constraintsVersion);

    if (isOfficialConstraintId(constraintId)) {
      throw new BadRequestException({
        code: 'OFFICIAL_RULE_READONLY',
        message: '目的地官方规则为只读，不可删除',
      });
    }

    const trip = await this.requireTrip(tripId);
    const ext = this.readExt(trip.metadata);

    if (ext.legacyConstraintLocks?.[constraintId]) {
      throw new BadRequestException({
        code: 'CONSTRAINT_LOCKED',
        message: '锁定约束不可删除，请先解锁',
      });
    }

    if (constraintId.startsWith('c_wish_')) {
      const wishId = constraintId.replace('c_wish_', '');
      await this.wishService.archive(tripId, wishId, userId);
    } else if (isLegacyConstraintId(constraintId)) {
      await this.clearLegacyField(tripId, trip, constraintId);
    } else {
      const unified = (ext.unifiedConstraints ?? []).filter((c) => c.id !== constraintId);
      if (unified.length === (ext.unifiedConstraints ?? []).length) {
        throw new NotFoundException(`约束 ${constraintId} 不存在`);
      }
      const metadata = bumpConstraintsVersion({
        ...((trip.metadata as object) ?? {}),
        unifiedConstraints: unified,
      });
      await this.prisma.trip.update({
        where: { id: tripId },
        data: { metadata: toInputJsonValue(metadata) },
      });
    }

    const refreshed = await this.prisma.trip.findUnique({ where: { id: tripId }, select: { metadata: true } });
    return {
      deleted: constraintId,
      constraints: snapshotConstraintsMeta(refreshed?.metadata),
    };
  }

  async disable(
    tripId: string,
    userId: string,
    constraintId: string,
    dto: DisableConstraintDto,
  ): Promise<{ constraintId: string; status: 'DISABLED'; constraints: ReturnType<typeof snapshotConstraintsMeta> }> {
    await this.assertVersion(tripId, dto.constraintsVersion);

    if (isOfficialConstraintId(constraintId)) {
      throw new BadRequestException({
        code: 'OFFICIAL_RULE_READONLY',
        message: '目的地官方规则为只读，不可停用',
      });
    }

    const trip = await this.requireTrip(tripId);
    const ext = this.readExt(trip.metadata);
    const disabled = new Set(ext.disabledConstraintIds ?? []);
    if (!disabled.has(constraintId)) disabled.add(constraintId);

    const metadata = bumpConstraintsVersion({
      ...((trip.metadata as object) ?? {}),
      disabledConstraintIds: [...disabled],
    });

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(metadata) },
    });

    const refreshed = await this.prisma.trip.findUnique({ where: { id: tripId }, select: { metadata: true } });
    return {
      constraintId,
      status: 'DISABLED',
      constraints: snapshotConstraintsMeta(refreshed?.metadata),
    };
  }

  async previewImpact(
    tripId: string,
    userId: string,
    dto: PreviewConstraintImpactDto,
  ): Promise<TripConstraintImpactPreviewResponse> {
    const before = await this.planningConflicts.getPlanningConflicts(tripId);
    const summary = await this.constraintsSummary.getSummary(tripId);
    const refreshType = classifyConstraintRefreshType(dto.changes);

    const assessBefore = await this.preview.captureAssessSummary(tripId);
    const feasibilityBefore = await this.preview.captureFeasibilitySnapshot(tripId);
    const tepSnapshot = await this.preview.captureTepRuleResults(tripId, {
      refresh: dto.persist === true,
    });

    let conflictsAfter: TripConstraintImpactPreviewResponse['conflictsAfter'] | undefined;
    let suggestedFollowUpLegacy:
      | { endpoint: string; body?: Record<string, unknown> }
      | undefined;
    let assessAfter: TripConstraintImpactPreviewResponse['assessAfter'];
    let feasibilityAfter: TripConstraintImpactPreviewResponse['feasibilityAfter'];
    let budgetDelta: TripConstraintImpactPreviewResponse['budgetDelta'];

    const budgetChange = (dto.changes ?? []).find((c) => c.constraintId === TRIP_CONSTRAINT_LEGACY_IDS.BUDGET_TOTAL);
    if (budgetChange?.patch?.value != null && summary.budget.total != null) {
      const newTotal = Number(budgetChange.patch.value);
      if (!Number.isNaN(newTotal)) {
        budgetDelta = {
          amount: newTotal - summary.budget.total,
          currency: summary.budget.currency,
        };
      }
    }

    let afterPersistConflicts: import('../types/planning-conflicts.types').PlanningConflictItem[] | undefined;

    if (dto.persist === true) {
      let version = summary.constraintsVersion;
      for (const ch of dto.changes) {
        await this.patch(tripId, userId, ch.constraintId, {
          ...ch.patch,
          constraintsVersion: version,
        } as PatchTripConstraintDto);
        version = (await this.constraintsSummary.getSummary(tripId)).constraintsVersion;
      }
      const after = await this.planningConflicts.getPlanningConflicts(tripId);
      afterPersistConflicts = after.conflicts;
      conflictsAfter = {
        mustHandle: after.summary.mustHandle,
        suggestAdjust: after.summary.suggestAdjust,
        pendingConfirm: after.summary.pendingConfirm,
      };
      assessAfter = await this.preview.captureAssessSummary(tripId);
      feasibilityAfter = await this.preview.captureFeasibilitySnapshot(tripId);

      if (refreshType === 'deep') {
        const dayNumber = dto.changes
          .flatMap((c) => (c.patch as { dayNumber?: number }).dayNumber)
          .find((d) => typeof d === 'number') ?? affectedDaysFromConflicts(before)[0];
        if (dayNumber != null) {
          const scopedFeasibility = await this.preview.captureFeasibilityValidateScope(
            tripId,
            dayNumber,
          );
          if (scopedFeasibility) feasibilityAfter = scopedFeasibility;
        }
      }
    } else if (refreshType === 'deep') {
      suggestedFollowUpLegacy = {
        endpoint: `/api/trips/${tripId}/feasibility-report/validate`,
        body: { forceRefreshEvidence: true },
      };
    }

    const refreshedSummary = await this.constraintsSummary.getSummary(tripId);
    const listResult = await this.buildList(tripId, userId);
    const items = Array.isArray(listResult.items) ? listResult.items : [];

    const primaryConstraintId = primaryChangedConstraintId(dto.changes ?? []);
    const tripDayCount = summary.timeRange.dayCount;
    const enrichedBefore = enrichPlanningConflictsWithRelatedConstraintIds(before.conflicts);

    const persistedScopedConflicts =
      dto.persist === true && afterPersistConflicts
        ? conflictsForConstraint(
            primaryConstraintId,
            enrichPlanningConflictsWithRelatedConstraintIds(afterPersistConflicts),
          )
        : undefined;

    const scopedPreview = simulateScopedPreview({
      constraintId: primaryConstraintId ?? dto.changes?.[0]?.constraintId ?? '',
      changes: dto.changes ?? [],
      items,
      allConflicts: enrichedBefore,
      tripDayCount,
      assessBefore,
      feasibilityBefore,
      persistedAfter: conflictsAfter,
      persistedScopedConflicts,
    });

    const structuredImpact = buildStructuredConstraintImpactPreview({
      changes: dto.changes ?? [],
      items,
      conflictsBefore: scopedPreview.scopedConflicts,
      conflictsAfter: scopedPreview.conflictsAfter,
      assessBefore,
      assessAfter,
      feasibilityBefore,
      feasibilityAfter,
      budgetDelta,
      budgetTotalBefore: summary.budget.total,
    });

    const affectedDays = sanitizeDayNumbers(
      scopedPreview.affectedDays.length
        ? scopedPreview.affectedDays
        : affectedDaysFromConflicts(before),
      tripDayCount,
    );

    const userFacing = buildUserFacingImpactPreview({
      tripId,
      tripDayCount,
      refreshType,
      persist: dto.persist === true,
      changes: dto.changes ?? [],
      items,
      conflictItems: enrichedBefore,
      conflictsBefore: scopedPreview.conflictsBefore,
      conflictsAfter: scopedPreview.conflictsAfter,
      assessBefore,
      assessAfter,
      feasibilityBefore,
      feasibilityAfter,
      structuredImpact,
      tepRuleResults: tepSnapshot?.ruleResults,
      dailyDrivePlans: tepSnapshot?.dailyDrivePlans,
      itemLabelsById: tepSnapshot?.itemLabelsById,
      evaluatedAt: tepSnapshot?.evaluatedAt,
      primaryConstraintId: primaryConstraintId ?? undefined,
      scopedPreview,
    });

    return {
      tripId,
      constraintsVersion: refreshedSummary.constraintsVersion,
      refreshType,
      affectedDays: userFacing.affectedDays.length
        ? userFacing.affectedDays.map((d) => d.dayNumber)
        : affectedDays,
      budgetDelta,
      conflictsBefore: scopedPreview.conflictsBefore,
      conflictsAfter: scopedPreview.conflictsAfter,
      assessBefore,
      assessAfter,
      feasibilityBefore,
      feasibilityAfter,
      executeabilityDelta: userFacing.executeabilityDelta,
      recommendations: userFacing.diffBullets,
      diffBullets: userFacing.diffBullets,
      userSummary: userFacing.userSummary,
      suggestedFollowUp: userFacing.suggestedFollowUp,
      scheduleDetailLevel: userFacing.scheduleDetailLevel,
      scheduleDetailUnavailableReason: userFacing.scheduleDetailUnavailableReason,
      affectedDayDetails: userFacing.affectedDayDetails,
      constraintAssessments: userFacing.constraintAssessments,
      meta: {
        ...userFacing.meta,
        debug: {
          ...userFacing.meta?.debug,
          scopedConstraintId: primaryConstraintId,
          tripLevelConflictsBefore: {
            mustHandle: before.summary.mustHandle,
            suggestAdjust: before.summary.suggestAdjust,
            pendingConfirm: before.summary.pendingConfirm,
          },
          tripLevelConflictsAfter: conflictsAfter,
          ...(suggestedFollowUpLegacy
            ? { endpoint: suggestedFollowUpLegacy.endpoint, body: suggestedFollowUpLegacy.body }
            : {}),
        },
      },
      structuredImpact: userFacing.structuredImpact,
    };
  }

  async check(tripId: string, userId: string): Promise<TripConstraintCheckResponse> {
    const data = await this.planningConflicts.getPlanningConflicts(tripId);
    const { items, contract, scheduleCtx } = await this.buildList(tripId, userId);
    const hardConflicts = enrichPlanningConflictsWithRelatedConstraintIds(data.conflicts);
    const softAdvisories = buildSoftConstraintCheckConflicts(items, scheduleCtx);
    const conflicts = [...hardConflicts, ...softAdvisories];
    const softCount = softAdvisories.length;
    return {
      tripId,
      hasConflicts: data.summary.total > 0 || softCount > 0,
      summary: {
        mustHandle: data.summary.mustHandle,
        suggestAdjust: data.summary.suggestAdjust + softCount,
        pendingConfirm: data.summary.pendingConfirm,
        total: data.summary.total + softCount,
      },
      conflicts,
      canStartExecute: data.canStartExecute,
      gateExecute: data.gateExecute,
      contractConflicts: contract.conflicts,
    };
  }

  async repair(tripId: string, dto: RepairConstraintsDto): Promise<TripConstraintRepairResponse> {
    const conflictsData = await this.planningConflicts.getPlanningConflicts(tripId);
    const enriched = enrichPlanningConflictsWithRelatedConstraintIds(conflictsData.conflicts);
    const issueId =
      dto.issueId ??
      enriched.find((c) => c.priority === 'must_handle')?.id;

    if (!issueId) {
      return { tripId, options: [] };
    }

    const matched = enriched.find((c) => c.id === issueId);
    const repair = await this.feasibility.getRepairOptions(tripId, issueId);
    return {
      tripId,
      issueId: repair.issueId ?? issueId,
      relatedConstraintIds: matched?.relatedConstraintIds,
      blockerId: repair.blockerId,
      blockerMessage: repair.blockerMessage,
      options: repair.options ?? [],
      guardianNegotiation: repair.guardianNegotiation,
      cascadeUiHints: repair.cascadeUiHints,
    };
  }

  private async buildList(tripId: string, userId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          orderBy: { date: 'asc' },
          select: {
            id: true,
            date: true,
            ItineraryItem: {
              select: {
                id: true,
                type: true,
                startTime: true,
                endTime: true,
                note: true,
                Place: {
                  select: {
                    nameCN: true,
                    nameEN: true,
                    metadata: true,
                  },
                },
              },
              orderBy: { startTime: 'asc' },
            },
          },
        },
      },
    });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);

    const [summary, planning, teamWishes] = await Promise.all([
      this.constraintsSummary.getSummary(tripId),
      this.planningConflicts.getPlanningConflicts(tripId),
      this.wishService.listTeam(tripId, userId),
    ]);

    return {
      ...aggregateTripConstraints({
        trip,
        summary,
        teamWishes,
        conflicts: planning.conflicts,
        isFeasibilityStale: planning.isStale,
        userId,
      }),
      scheduleCtx: buildSoftScheduleEvalContext(trip),
    };
  }

  private async requireTrip(tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);
    return trip;
  }

  private readExt(metadata: unknown): TripConstraintMetadataExtension {
    if (!metadata || typeof metadata !== 'object') return {};
    return metadata as TripConstraintMetadataExtension;
  }

  private async assertVersion(tripId: string, expected?: number) {
    if (expected == null) return;
    const trip = await this.requireTrip(tripId);
    const current = getConstraintsVersion(trip.metadata);
    if (current !== expected) {
      throw new ConflictException({
        code: 'CONSTRAINTS_STALE',
        message: `约束版本不匹配（当前 ${current}，请求 ${expected}）`,
        currentVersion: current,
      });
    }
  }

  private throwScopePatchErrors(errors?: { field: string; message: string }[]) {
    if (!errors?.length) return;
    throw new BadRequestException({
      code: 'INVALID_SCOPE_BINDING',
      message: errors[0]?.message ?? 'scopeBinding 无效',
      errors,
    });
  }

  private async patchLegacyField(
    tripId: string,
    trip: { destination: string; metadata: unknown; pacingConfig: unknown; budgetConfig: unknown },
    constraintId: string,
    dto: PatchTripConstraintDto,
    userId: string,
  ) {
    const metadata = { ...((trip.metadata as Record<string, unknown>) ?? {}) };
    const pacing = { ...((trip.pacingConfig as Record<string, unknown>) ?? {}) };
    let budgetConfig = trip.budgetConfig;
    let bumpMeta = false;

    if (dto.locked !== undefined) {
      const locks = { ...(this.readExt(metadata).legacyConstraintLocks ?? {}) };
      locks[constraintId] = dto.locked;
      metadata.legacyConstraintLocks = locks;
      bumpMeta = true;
    }

    switch (constraintId) {
      case TRIP_CONSTRAINT_LEGACY_IDS.BUDGET_TOTAL:
        if (dto.value != null) {
          const raw = dto.value;
          const total =
            typeof raw === 'number'
              ? raw
              : typeof raw === 'object' && raw
                ? Number(
                    (raw as Record<string, unknown>).total ??
                      (raw as Record<string, unknown>).value,
                  )
                : NaN;
          const currency =
            (typeof raw === 'object' &&
              raw &&
              typeof (raw as Record<string, unknown>).currency === 'string'
              ? String((raw as Record<string, unknown>).currency)
              : undefined) ??
            dto.unit ??
            'CNY';
          if (Number.isFinite(total)) {
            await this.budgetIntent.setIntent(tripId, {
              total,
              currency,
            });
            return;
          }
        }
        break;
      case TRIP_CONSTRAINT_LEGACY_IDS.PACING_LEVEL:
        if (dto.value != null) {
          pacing.level = dto.value;
          bumpMeta = true;
        }
        break;
      case TRIP_CONSTRAINT_LEGACY_IDS.TRANSPORT_MODE:
        if (dto.value != null) {
          pacing.travelMode = dto.value;
          bumpMeta = true;
        }
        break;
      case TRIP_CONSTRAINT_LEGACY_IDS.MUST_PLACES:
        const constraints: Record<string, unknown> = {
          ...((metadata.constraints as Record<string, unknown>) ?? {}),
        };
        if (dto.value != null) constraints.mustPlaces = dto.value;
        metadata.constraints = constraints;
        bumpMeta = true;
        break;
      case TRIP_CONSTRAINT_LEGACY_IDS.AVOID_PLACES:
        const c2: Record<string, unknown> = {
          ...((metadata.constraints as Record<string, unknown>) ?? {}),
        };
        if (dto.value != null) c2.avoidPlaces = dto.value;
        metadata.constraints = c2;
        bumpMeta = true;
        break;
      case TRIP_CONSTRAINT_LEGACY_IDS.DAILY_WALK_LIMIT:
        const c3: Record<string, unknown> = {
          ...((metadata.constraints as Record<string, unknown>) ?? {}),
        };
        if (dto.value != null) c3.dailyWalkLimit = dto.value;
        metadata.constraints = c3;
        bumpMeta = true;
        break;
      case TRIP_CONSTRAINT_LEGACY_IDS.MAX_SEGMENT_DISTANCE: {
        const c4: Record<string, unknown> = {
          ...((metadata.constraints as Record<string, unknown>) ?? {}),
        };
        let segmentChanged = false;
        if (dto.value != null || dto.scope != null) {
          const prevExt = readConstraintExtendedValue(metadata, constraintId) ?? {};
          const scopePatch = applyConstraintScopePatch({
            prevScope: { type: 'ROUTE_SEGMENT' },
            prevValue: prevExt,
            dtoScope: dto.scope,
            dtoValue: dto.value,
            teamGovernance: metadata.travelDecisionContract,
          });
          this.throwScopePatchErrors(scopePatch.errors);
          Object.assign(
            metadata,
            writeConstraintExtendedValue(metadata, constraintId, scopePatch.value),
          );
          segmentChanged = true;
        }
        if (
          applyMaxSegmentDistanceConstraintPatch(c4, {
            value: dto.value,
            tolerance: dto.tolerance,
            destination: trip.destination,
          })
        ) {
          metadata.constraints = c4;
          segmentChanged = true;
        }
        if (segmentChanged) bumpMeta = true;
        break;
      }
      case TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE: {
        const c5: Record<string, unknown> = {
          ...((metadata.constraints as Record<string, unknown>) ?? {}),
        };
        if (dto.value != null || dto.scope != null) {
          const prevExt = readConstraintExtendedValue(metadata, constraintId);
          const prevBinding = readScopeBindingFromValue(prevExt);
          const scopePatch = applyConstraintScopePatch({
            prevScope: prevBinding
              ? (inferCoarseScopeFromBinding(prevBinding) ?? { type: 'TRIP' })
              : { type: 'TRIP' },
            prevValue: prevExt ?? {},
            dtoScope: dto.scope,
            dtoValue: dto.value,
            teamGovernance: metadata.travelDecisionContract,
          });
          this.throwScopePatchErrors(scopePatch.errors);
          Object.assign(
            metadata,
            writeConstraintExtendedValue(metadata, constraintId, scopePatch.value),
          );
          if (applyMaxDailyDrivingHoursConstraintPatch(c5, scopePatch.value)) {
            metadata.constraints = c5;
          }
          bumpMeta = true;
        }
        break;
      }
      case TRIP_CONSTRAINT_LEGACY_IDS.NO_NIGHT_DRIVE: {
        const c6: Record<string, unknown> = {
          ...((metadata.constraints as Record<string, unknown>) ?? {}),
        };
        const prevCfg =
          c6.noNightDrive && typeof c6.noNightDrive === 'object'
            ? (c6.noNightDrive as Record<string, unknown>)
            : {};
        if (dto.value != null || dto.scope != null) {
          const prevBinding = readScopeBindingFromValue(prevCfg);
          const scopePatch = applyConstraintScopePatch({
            prevScope: prevBinding
              ? (inferCoarseScopeFromBinding(prevBinding) ?? { type: 'TRIP' })
              : { type: 'TRIP' },
            prevValue: prevCfg,
            dtoScope: dto.scope,
            dtoValue: dto.value,
            teamGovernance: metadata.travelDecisionContract,
          });
          this.throwScopePatchErrors(scopePatch.errors);
          if (
            applyNoNightDriveConstraintPatch(c6, {
              value: scopePatch.value,
              status: dto.status,
            })
          ) {
            metadata.constraints = c6;
            bumpMeta = true;
          }
        } else if (
          applyNoNightDriveConstraintPatch(c6, {
            value: dto.value,
            status: dto.status,
          })
        ) {
          metadata.constraints = c6;
          bumpMeta = true;
        }
        break;
      }
      case TRIP_CONSTRAINT_LEGACY_IDS.PLANNING_POLICY:
        if (dto.value != null) {
          metadata.planningPolicy = dto.value;
          bumpMeta = true;
        }
        break;
      case TRIP_CONSTRAINT_LEGACY_IDS.LUNCH_STRATEGY:
        if (dto.value != null) {
          const normalized = normalizeLunchStrategy(String(dto.value));
          if (normalized) {
            metadata.lunch_strategy = normalized;
            metadata.tripParams = {
              ...((metadata.tripParams as object) ?? {}),
              lunch_strategy: normalized,
            };
            bumpMeta = true;
          }
        }
        break;
      case TRIP_CONSTRAINT_LEGACY_IDS.TIME_RANGE:
      case TRIP_CONSTRAINT_LEGACY_IDS.TRAVELERS:
      case TRIP_CONSTRAINT_LEGACY_IDS.WORLD_FEASIBILITY:
        throw new BadRequestException({
          code: 'LEGACY_CONSTRAINT_USE_DEDICATED_API',
          message: '该约束请使用 PUT /trips/:id 或 constraints-summary 对应写接口',
        });
      default:
        break;
    }

    if (!bumpMeta) return;

    const bumped = bumpConstraintsVersion(metadata);
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        pacingConfig: toInputJsonValue(pacing),
        budgetConfig: budgetConfig ? toInputJsonValue(budgetConfig) : undefined,
        metadata: toInputJsonValue(bumped),
      },
    });
  }

  private async patchUnifiedStore(
    tripId: string,
    trip: { metadata: unknown },
    constraintId: string,
    dto: PatchTripConstraintDto,
    userId: string,
  ) {
    const ext = this.readExt(trip.metadata);
    const list = ext.unifiedConstraints ?? [];
    const idx = list.findIndex((c) => c.id === constraintId);
    if (idx < 0) throw new NotFoundException(`约束 ${constraintId} 不存在`);

    const prev = list[idx];
    const { constraintsVersion: _v, ...rest } = dto;
    const teamGovernance = (trip.metadata as Record<string, unknown>)?.travelDecisionContract;

    let mergedValue = prev.value;
    let nextScope = prev.scope;
    if (dto.value !== undefined || dto.scope !== undefined) {
      const scopePatch = applyConstraintScopePatch({
        prevScope: prev.scope,
        prevValue: prev.value,
        dtoScope: dto.scope,
        dtoValue: dto.value,
        teamGovernance,
      });
      if (scopePatch.errors?.length) {
        throw new BadRequestException({
          code: 'INVALID_SCOPE_BINDING',
          message: scopePatch.errors[0]?.message ?? 'scopeBinding 无效',
          errors: scopePatch.errors,
        });
      }
      mergedValue = scopePatch.value;
      nextScope = scopePatch.scope;
    }

    let nextPriority = dto.priority ?? prev.priority;
    if (prev.type === 'SOFT' && (dto.priority !== undefined || dto.value !== undefined)) {
      const def = prev.source.templateId ? getConstraintTemplate(prev.source.templateId) : undefined;
      const normalized = normalizeSoftPriorityPatch({
        priority: dto.priority ?? prev.priority,
        value: mergedValue,
        defaultPriority: def?.defaultPriority,
      });
      nextPriority = normalized.priority;
      mergedValue = normalized.value;
    }
    const next: StoredUnifiedConstraint = {
      ...prev,
      ...rest,
      scope: nextScope,
      value: mergedValue,
      priority: nextPriority,
      source: prev.source,
      updatedAt: new Date().toISOString(),
    };

    if (dto.type === 'HARD' && prev.source.type === 'AI_INFERRED') {
      throw new BadRequestException({
        code: 'AI_INFERRED_HARD_FORBIDDEN',
        message: 'AI 推断约束需经用户确认后才能升级为硬约束',
      });
    }

    list[idx] = next;
    const metadata = bumpConstraintsVersion({
      ...((trip.metadata as object) ?? {}),
      unifiedConstraints: list,
    });

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(metadata) },
    });
  }

  private async clearLegacyField(
    tripId: string,
    trip: { metadata: unknown; pacingConfig: unknown },
    constraintId: string,
  ) {
    const metadata = { ...((trip.metadata as Record<string, unknown>) ?? {}) };
    const pacing = { ...((trip.pacingConfig as Record<string, unknown>) ?? {}) };

    switch (constraintId) {
      case TRIP_CONSTRAINT_LEGACY_IDS.PACING_LEVEL:
        delete pacing.level;
        break;
      case TRIP_CONSTRAINT_LEGACY_IDS.TRANSPORT_MODE:
        delete pacing.travelMode;
        break;
      case TRIP_CONSTRAINT_LEGACY_IDS.MUST_PLACES:
      case TRIP_CONSTRAINT_LEGACY_IDS.AVOID_PLACES:
      case TRIP_CONSTRAINT_LEGACY_IDS.DAILY_WALK_LIMIT:
      case TRIP_CONSTRAINT_LEGACY_IDS.MAX_SEGMENT_DISTANCE:
      case TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE:
      case TRIP_CONSTRAINT_LEGACY_IDS.NO_NIGHT_DRIVE:
        const c = { ...((metadata.constraints as Record<string, unknown>) ?? {}) };
        if (constraintId === TRIP_CONSTRAINT_LEGACY_IDS.MUST_PLACES) delete c.mustPlaces;
        if (constraintId === TRIP_CONSTRAINT_LEGACY_IDS.AVOID_PLACES) delete c.avoidPlaces;
        if (constraintId === TRIP_CONSTRAINT_LEGACY_IDS.DAILY_WALK_LIMIT) delete c.dailyWalkLimit;
        if (constraintId === TRIP_CONSTRAINT_LEGACY_IDS.MAX_SEGMENT_DISTANCE) {
          delete c.maxSegmentDistanceKm;
          delete c.warnSegmentDistanceKm;
        }
        if (constraintId === TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE) {
          delete c.maxDailyDrivingHours;
          delete c.maxDailyDriveHours;
          delete c.maxDailyDriveMinutes;
          delete c.max_daily_drive_minutes;
          const ext = { ...((metadata.constraintExtendedValues as Record<string, unknown>) ?? {}) };
          delete ext[constraintId];
          metadata.constraintExtendedValues = ext;
        }
        if (constraintId === TRIP_CONSTRAINT_LEGACY_IDS.NO_NIGHT_DRIVE) {
          c.noNightDrive = { enabled: false };
        }
        metadata.constraints = c;
        break;
      case TRIP_CONSTRAINT_LEGACY_IDS.PLANNING_POLICY:
        delete metadata.planningPolicy;
        break;
      case TRIP_CONSTRAINT_LEGACY_IDS.LUNCH_STRATEGY:
        delete metadata.lunch_strategy;
        break;
      default:
        throw new BadRequestException({
          code: 'LEGACY_CONSTRAINT_CANNOT_DELETE',
          message: '该合成约束不可直接删除，请通过对应业务接口清空',
        });
    }

    const bumped = bumpConstraintsVersion(metadata);
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        pacingConfig: toInputJsonValue(pacing),
        metadata: toInputJsonValue(bumped),
      },
    });
  }
}

function affectedDaysFromConflicts(
  before: { conflicts?: import('../types/planning-conflicts.types').PlanningConflictItem[] },
): number[] {
  return [...new Set((Array.isArray(before.conflicts) ? before.conflicts : []).flatMap((c) => c.affectedDays ?? []))].sort((a, b) => a - b);
}
