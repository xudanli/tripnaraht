import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreateSilentVoteDto,
  CreateSilentVoteFromCompareDto,
  SubmitSilentVoteBallotDto,
} from '../dto/silent-vote.dto';
import type {
  SilentVoteBallotRecord,
  SilentVoteDetail,
  SilentVoteOption,
  SilentVoteRecord,
} from '../types/silent-vote.types';
import { TripSilentVoteAccessService } from './trip-silent-vote-access.service';
import { mapSilentVoteRow, parseSilentVoteOptions } from '../utils/silent-vote.mapper.util';
import { buildSilentVoteAggregate, clampIntensity } from '../utils/silent-vote-aggregate.util';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';

@Injectable()
export class TripSilentVoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TripSilentVoteAccessService,
  ) {}

  async listVotes(tripId: string, userId: string): Promise<SilentVoteDetail[]> {
    await this.access.assertTripMember(tripId, userId);
    const rows = await this.prisma.tripSilentVote.findMany({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
    });
    const eligibleCount = await this.access.countEligibleMembers(tripId);
    return Promise.all(
      rows.map((row) => this.toDetail(row, userId, eligibleCount)),
    );
  }

  async getVote(tripId: string, voteId: string, userId: string): Promise<SilentVoteDetail> {
    await this.access.assertTripMember(tripId, userId);
    const row = await this.requireVote(tripId, voteId);
    const eligibleCount = await this.access.countEligibleMembers(tripId);
    return this.toDetail(row, userId, eligibleCount);
  }

  async createVote(
    tripId: string,
    userId: string,
    dto: CreateSilentVoteDto,
  ): Promise<SilentVoteDetail> {
    await this.access.assertTripMember(tripId, userId);
    const options = this.normalizeOptions(dto.options);
    const row = await this.prisma.tripSilentVote.create({
      data: {
        tripId,
        createdBy: userId,
        title: dto.title,
        question: dto.question,
        status: dto.autoOpen ? 'open' : 'draft',
        options: toInputJsonValue(options),
      },
    });
    const eligibleCount = await this.access.countEligibleMembers(tripId);
    return this.toDetail(row, userId, eligibleCount);
  }

  async createFromCompare(
    tripId: string,
    userId: string,
    dto: CreateSilentVoteFromCompareDto,
  ): Promise<SilentVoteDetail> {
    await this.access.assertTripMember(tripId, userId);
    const plans = await this.prisma.planningPlan.findMany({
      where: { tripId, id: { in: dto.planIds } },
    });
    if (plans.length !== dto.planIds.length) {
      const found = new Set(plans.map((p) => p.id));
      const missing = dto.planIds.filter((id) => !found.has(id));
      throw new NotFoundException(`方案不存在或不属于该行程: ${missing.join(', ')}`);
    }

    const planById = new Map(plans.map((p) => [p.id, p]));
    const options: SilentVoteOption[] = dto.planIds.map((planId, index) => {
      const plan = planById.get(planId)!;
      return {
        id: `opt-${planId.slice(0, 8)}`,
        label: this.extractPlanLabel(plan, index),
        planId,
      };
    });

    return this.createVote(tripId, userId, {
      title: dto.title ?? '方案选择',
      question: dto.question,
      options,
      autoOpen: dto.autoOpen ?? true,
    });
  }

  async openVote(tripId: string, voteId: string, userId: string): Promise<SilentVoteDetail> {
    const row = await this.requireVote(tripId, voteId);
    await this.access.assertCanManageVote(tripId, userId, row.createdBy);
    if (row.status === 'closed') {
      throw new BadRequestException('已关闭的投票无法重新开放');
    }
    const updated = await this.prisma.tripSilentVote.update({
      where: { id: voteId },
      data: { status: 'open' },
    });
    const eligibleCount = await this.access.countEligibleMembers(tripId);
    return this.toDetail(updated, userId, eligibleCount);
  }

  async closeVote(tripId: string, voteId: string, userId: string): Promise<SilentVoteDetail> {
    const row = await this.requireVote(tripId, voteId);
    await this.access.assertCanManageVote(tripId, userId, row.createdBy);
    if (row.status === 'closed') {
      const eligibleCount = await this.access.countEligibleMembers(tripId);
      return this.toDetail(row, userId, eligibleCount);
    }
    const updated = await this.prisma.tripSilentVote.update({
      where: { id: voteId },
      data: { status: 'closed', closedAt: new Date() },
    });
    const eligibleCount = await this.access.countEligibleMembers(tripId);
    return this.toDetail(updated, userId, eligibleCount);
  }

  async submitBallot(
    tripId: string,
    voteId: string,
    userId: string,
    dto: SubmitSilentVoteBallotDto,
  ): Promise<SilentVoteBallotRecord> {
    await this.access.assertTripMember(tripId, userId);
    const row = await this.requireVote(tripId, voteId);
    if (row.status !== 'open') {
      throw new BadRequestException('投票未开放，无法提交选票');
    }
    if (row.closesAt && row.closesAt.getTime() < Date.now()) {
      throw new BadRequestException('投票已截止');
    }

    const options = parseSilentVoteOptions(row.options);
    if (!options.some((o) => o.id === dto.optionId)) {
      throw new BadRequestException(`无效选项 ${dto.optionId}`);
    }

    const intensity = clampIntensity(dto.intensity);
    const ballot = await this.prisma.tripSilentVoteBallot.upsert({
      where: { voteId_userId: { voteId, userId } },
      create: {
        voteId,
        userId,
        optionId: dto.optionId,
        intensity,
      },
      update: {
        optionId: dto.optionId,
        intensity,
      },
    });

    return {
      optionId: ballot.optionId,
      intensity: ballot.intensity,
      submittedAt: ballot.submittedAt.toISOString(),
      updatedAt: ballot.updatedAt.toISOString(),
    };
  }

  async getMyBallot(
    tripId: string,
    voteId: string,
    userId: string,
  ): Promise<{ submitted: boolean; ballot?: SilentVoteBallotRecord }> {
    await this.access.assertTripMember(tripId, userId);
    await this.requireVote(tripId, voteId);
    const ballot = await this.prisma.tripSilentVoteBallot.findUnique({
      where: { voteId_userId: { voteId, userId } },
    });
    if (!ballot) {
      return { submitted: false };
    }
    return {
      submitted: true,
      ballot: {
        optionId: ballot.optionId,
        intensity: ballot.intensity,
        submittedAt: ballot.submittedAt.toISOString(),
        updatedAt: ballot.updatedAt.toISOString(),
      },
    };
  }

  private normalizeOptions(
    input: CreateSilentVoteDto['options'],
  ): SilentVoteOption[] {
    const seen = new Set<string>();
    return input.map((opt, index) => {
      let id = opt.id?.trim() || `opt-${index + 1}`;
      while (seen.has(id)) {
        id = `opt-${randomUUID().slice(0, 8)}`;
      }
      seen.add(id);
      return {
        id,
        label: opt.label.trim(),
        planId: opt.planId,
        summaryRef: opt.summaryRef,
      };
    });
  }

  private extractPlanLabel(
    plan: { summary: unknown; planState: unknown },
    index: number,
  ): string {
    const summary = plan.summary as { nameCN?: string; name?: string } | null;
    if (summary?.nameCN) return summary.nameCN;
    if (summary?.name) return summary.name;
    const planState = plan.planState as { nameCN?: string; name?: string } | null;
    if (planState?.nameCN) return planState.nameCN;
    if (planState?.name) return planState.name;
    return `方案 ${String.fromCharCode(65 + index)}`;
  }

  private async requireVote(tripId: string, voteId: string) {
    const row = await this.prisma.tripSilentVote.findFirst({
      where: { id: voteId, tripId },
    });
    if (!row) {
      throw new NotFoundException(`投票 ${voteId} 不存在`);
    }
    return row;
  }

  private async toDetail(
    row: { id: string; tripId: string; status: string; options: unknown },
    userId: string,
    eligibleCount: number,
  ): Promise<SilentVoteDetail> {
    const record = mapSilentVoteRow(row as Parameters<typeof mapSilentVoteRow>[0]);
    const ballots = await this.prisma.tripSilentVoteBallot.findMany({
      where: { voteId: record.id },
      select: { optionId: true, intensity: true },
    });
    const myBallot = await this.prisma.tripSilentVoteBallot.findUnique({
      where: { voteId_userId: { voteId: record.id, userId } },
    });

    const aggregate = buildSilentVoteAggregate({
      voteId: record.id,
      status: record.status,
      options: record.options,
      ballots,
      eligibleCount,
    });

    return {
      ...record,
      aggregate,
      myBallotSubmitted: !!myBallot,
    };
  }
}
