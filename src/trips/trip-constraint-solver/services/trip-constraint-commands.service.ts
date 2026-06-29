import { BadRequestException, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { AgentService } from '../../../agent/services/agent.service';
import type { UpdateConstraintsCommandResponse } from '../types/trip-constraint.types';
import { snapshotConstraintsMeta } from '../utils/constraints-metadata.util';
import { ConstraintsSummaryService } from './constraints-summary.service';
import { TripConstraintRegistryService } from './trip-constraint-registry.service';
import type { PlanningConstraintsCommandDto } from '../dto/planning-commands.dto';
import type { PatchTripConstraintDto } from '../dto/trip-constraint.dto';

@Injectable()
export class TripConstraintCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: TripConstraintRegistryService,
    private readonly constraintsSummary: ConstraintsSummaryService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async execute(
    tripId: string,
    userId: string,
    body: PlanningConstraintsCommandDto,
  ): Promise<UpdateConstraintsCommandResponse> {
    if (body.command !== 'UPDATE_CONSTRAINTS') {
      throw new BadRequestException({
        code: 'UNSUPPORTED_PLANNING_COMMAND',
        message: `不支持的 command: ${body.command}`,
      });
    }

    const applied: string[] = [];
    let version = body.constraintsVersion;

    for (const change of body.changes) {
      const current = version ?? (await this.constraintsSummary.getSummary(tripId)).constraintsVersion;
      await this.registry.patch(tripId, userId, change.constraintId, {
        ...change.patch,
        constraintsVersion: current,
      } as PatchTripConstraintDto);
      applied.push(change.constraintId);
      const summary = await this.constraintsSummary.getSummary(tripId);
      version = summary.constraintsVersion;
    }

    const summary = await this.constraintsSummary.getSummary(tripId);
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const constraints = snapshotConstraintsMeta(trip?.metadata);

    let recalc: UpdateConstraintsCommandResponse['recalc'] | undefined;
    if (body.recalculate) {
      recalc = await this.triggerRecalc(tripId, userId);
    }

    return {
      tripId,
      command: 'UPDATE_CONSTRAINTS',
      applied,
      constraintsVersion: summary.constraintsVersion,
      constraints,
      summary,
      recalcRecommended: true,
      ...(recalc ? { recalc } : {}),
    };
  }

  private async triggerRecalc(
    tripId: string,
    userId: string,
  ): Promise<UpdateConstraintsCommandResponse['recalc'] | undefined> {
    const agentSvc = this.moduleRef.get(AgentService, { strict: false });
    if (!agentSvc) return undefined;

    const requestId = `constraint-recalc-${randomUUID()}`;
    try {
      const response = await agentSvc.routeAndRun({
        request_id: requestId,
        user_id: userId,
        trip_id: tripId,
        message: '约束已更新，请基于当前约束重新评估并排程。',
        options: {
          use_claude_orchestration: true,
          allow_partial: true,
          max_seconds: 45,
        },
      } as Parameters<AgentService['routeAndRun']>[0]);

      const payload = response.result?.payload as Record<string, unknown> | undefined;
      const comparison = payload?.comparison as { options?: unknown[] } | undefined;

      return {
        request_id: requestId,
        status: response.result?.status,
        has_comparison: (comparison?.options?.length ?? 0) >= 2,
      };
    } catch {
      return {
        request_id: requestId,
        has_comparison: false,
      };
    }
  }
}
