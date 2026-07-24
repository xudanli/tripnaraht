import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import { AgentService } from '../../../agent/services/agent.service';
import {
  RELAXATION_CONSTRAINT_WRITE_SCHEMA,
  RELAXATION_WRITABLE_PERSIST_ACTION_IDS,
  resolveRelaxationConstraintPatch,
} from '../../../agent/utils/relaxation-constraint-write.util';
import {
  dualWriteLegacyTotals,
  parseBudgetConfig,
  resolveBudgetIntent,
} from '../../budget-os/utils/budget-config.util';
import { bumpConstraintsVersion, getConstraintsVersion } from '../utils/constraints-metadata.util';
import { ConstraintsSummaryService } from './constraints-summary.service';
import type {
  ApplyRelaxationBodyDto,
  ApplyRelaxationRecalcSummary,
  ApplyRelaxationResponse,
  AppliedRelaxationRecord,
} from '../types/apply-relaxation.types';

const WRITABLE_ACTION_IDS = RELAXATION_WRITABLE_PERSIST_ACTION_IDS;

@Injectable()
export class ApplyRelaxationConstraintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly constraintsSummary: ConstraintsSummaryService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async applyRelaxation(
    tripId: string,
    userId: string,
    body: ApplyRelaxationBodyDto,
  ): Promise<ApplyRelaxationResponse> {
    const actionIds = [...new Set((body.actionIds ?? []).map((id) => String(id).trim()).filter(Boolean))];
    if (actionIds.length === 0) {
      throw new BadRequestException({
        code: 'RELAXATION_ACTION_REQUIRED',
        message: '至少选择一个 actionId',
      });
    }

    const unsupported = actionIds.filter((id) => !WRITABLE_ACTION_IDS.has(id));
    if (unsupported.length > 0) {
      throw new BadRequestException({
        code: 'RELAXATION_ACTION_UNSUPPORTED',
        message: `以下 actionId 不支持持久化写入：${unsupported.join(', ')}`,
        unsupported,
      });
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { TripDay: { orderBy: { date: 'asc' } } },
    });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);

    const currentVersion = getConstraintsVersion(trip.metadata);
    if (
      body.constraintsVersion != null &&
      body.constraintsVersion !== currentVersion
    ) {
      throw new ConflictException({
        code: 'CONSTRAINTS_STALE',
        message: `约束已变更（当前 version=${currentVersion}）`,
        currentVersion,
      });
    }

    let budgetConfig = parseBudgetConfig(trip.budgetConfig);
    let pacingConfig =
      trip.pacingConfig && typeof trip.pacingConfig === 'object'
        ? ({ ...(trip.pacingConfig as Record<string, unknown>) } as Record<string, unknown>)
        : ({} as Record<string, unknown>);
    let metadata =
      trip.metadata && typeof trip.metadata === 'object'
        ? ({ ...(trip.metadata as Record<string, unknown>) } as Record<string, unknown>)
        : ({} as Record<string, unknown>);

    let endDate = trip.endDate;
    const applied: AppliedRelaxationRecord[] = [];

    for (const actionId of actionIds) {
      const patch = resolveRelaxationConstraintPatch(actionId);
      if (!patch) continue;

      applied.push({
        actionId,
        constraintIds: patch.constraintIds,
        schema: RELAXATION_CONSTRAINT_WRITE_SCHEMA,
      });

      if (actionId === 'upgrade_vehicle_to_4wd') {
        const agentPlan = (metadata.agent_plan_constraints as Record<string, unknown> | undefined) ?? {};
        metadata.agent_plan_constraints = { ...agentPlan, vehicle_type: '4WD' };
        pacingConfig.vehicleType = '4WD';
        pacingConfig.transport = pacingConfig.transport ?? 'car';
      }

      if (actionId === 'relax_pace_to_conservative') {
        pacingConfig.pacingMode = 'conservative';
        pacingConfig.pacing_mode = 'conservative';
        const agentPlan = (metadata.agent_plan_constraints as Record<string, unknown> | undefined) ?? {};
        metadata.agent_plan_constraints = { ...agentPlan, pacing_mode: 'conservative' };
      }

      if (actionId === 'relax_budget_by_10pct') {
        const intent = resolveBudgetIntent(budgetConfig);
        if (intent?.total != null && intent.total > 0) {
          const newTotal = Math.ceil(intent.total * 1.1);
          budgetConfig = dualWriteLegacyTotals(budgetConfig, {
            ...intent,
            total: newTotal,
          });
        }
      }

      if (actionId === 'increase_days_by_1') {
        endDate = DateTime.fromJSDate(endDate).plus({ days: 1 }).toJSDate();
      }

      if (actionId === 'reduce_scope') {
        endDate = DateTime.fromJSDate(endDate).minus({ days: 1 }).toJSDate();
        if (endDate < trip.startDate) {
          endDate = trip.startDate;
        }
      }

      if (actionId === 'drop_one_must_include_poi') {
        const agentPlan = (metadata.agent_plan_constraints as Record<string, unknown> | undefined) ?? {};
        const must = Array.isArray(agentPlan.must_include_poi_ids)
          ? [...(agentPlan.must_include_poi_ids as string[])]
          : [];
        const constraints = (metadata.constraints as { mustPlaces?: string[] } | undefined) ?? {};
        const mustPlaces = Array.isArray(constraints.mustPlaces) ? [...constraints.mustPlaces] : [];

        if (must.length > 0) {
          must.pop();
          metadata.agent_plan_constraints = { ...agentPlan, must_include_poi_ids: must };
        } else if (mustPlaces.length > 0) {
          mustPlaces.pop();
          metadata.constraints = { ...constraints, mustPlaces };
        }
      }
    }

    metadata = bumpConstraintsVersion(metadata);
    metadata.last_relaxation_applied = {
      at: new Date().toISOString(),
      by: userId,
      actionIds,
      source: body.source ?? 'relaxation_bar',
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.trip.update({
        where: { id: tripId },
        data: {
          budgetConfig: budgetConfig as object,
          pacingConfig: pacingConfig as object,
          metadata: metadata as object,
          endDate,
          updatedAt: new Date(),
        },
      });

      if (actionIds.includes('increase_days_by_1')) {
        const lastDay = trip.TripDay[trip.TripDay.length - 1];
        const newDayDate = lastDay
          ? DateTime.fromJSDate(lastDay.date).plus({ days: 1 }).toJSDate()
          : endDate;
        await tx.tripDay.create({
          data: {
            id: randomUUID(),
            tripId,
            date: newDayDate,
          },
        });
      }

      if (actionIds.includes('reduce_scope') && trip.TripDay.length > 1) {
        const lastDay = trip.TripDay[trip.TripDay.length - 1];
        if (lastDay) {
          await tx.tripDay.delete({ where: { id: lastDay.id } });
        }
      }
    });

    const summary = await this.constraintsSummary.getSummary(tripId);

    let recalc: ApplyRelaxationRecalcSummary | undefined;
    if (body.recalc === true) {
      recalc = await this.triggerRouteAndRunRecalc(tripId, userId, actionIds);
    }

    return {
      tripId,
      constraintsVersion: summary.constraintsVersion,
      applied,
      summary,
      recalcRecommended: true,
      ...(recalc ? { recalc } : {}),
    };
  }

  private async triggerRouteAndRunRecalc(
    tripId: string,
    userId: string,
    actionIds: string[],
  ): Promise<ApplyRelaxationRecalcSummary | undefined> {
    const agentSvc = this.moduleRef.get(AgentService, { strict: false });
    if (!agentSvc) return undefined;

    const requestId = `relax-recalc-${randomUUID()}`;
    try {
      const response = await agentSvc.routeAndRun({
        request_id: requestId,
        user_id: userId,
        trip_id: tripId,
        message: '',
        clarification_answers: [
          {
            questionId: 'gate_eval_relax_constraints',
            value: actionIds,
          },
        ],
        options: {
          use_claude_orchestration: true,
          allow_partial: true,
          max_seconds: 45,
        },
      } as Parameters<AgentService['routeAndRun']>[0]);

      const payload = response.result?.payload as Record<string, unknown> | undefined;
      const comparison = payload?.comparison as { options?: unknown[] } | undefined;
      const hasRelaxation =
        Array.isArray(payload?.relaxation_suggestions) && (payload!.relaxation_suggestions as unknown[]).length > 0;

      return {
        request_id: requestId,
        status: response.result?.status,
        has_comparison: (comparison?.options?.length ?? 0) >= 2,
        relaxation_cleared: !hasRelaxation,
      };
    } catch {
      return {
        request_id: requestId,
        has_comparison: false,
        relaxation_cleared: false,
      };
    }
  }
}
