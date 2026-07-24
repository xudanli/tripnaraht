import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionProblemCollectorService } from '../../decision-semantics/collectors/decision-problem.collector';
import type { DecisionProblemDetail } from '../../decision-semantics/types/decision-semantics.types';
import { TripResponsibilityOwnersService } from './trip-responsibility-owners.service';
import type {
  MemberConfirmInboxItemDto,
  MemberConfirmInboxResponseDto,
  MemberConfirmPhase,
  MemberConfirmScope,
  MemberConfirmStatus,
} from '../dto/member-confirm-inbox.dto';

const MEMBER_VISIBLE_SCOPES = new Set<MemberConfirmScope>([
  'AFFECTED_MEMBERS',
  'PAYER_AND_MEMBERS',
  'ALL_MEMBERS',
  'PAYER',
]);

@Injectable()
export class MemberConfirmInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownersService: TripResponsibilityOwnersService,
    @Optional()
    private readonly problemCollector?: DecisionProblemCollectorService,
  ) {}

  async getInboxByInviteCode(
    code: string,
    userId: string,
  ): Promise<MemberConfirmInboxResponseDto> {
    const invite = await this.prisma.tripMemberInvite.findUnique({
      where: { inviteCode: code },
      select: {
        tripId: true,
        status: true,
        acceptedByUserId: true,
      },
    });
    if (!invite) {
      throw new NotFoundException('邀请不存在');
    }
    if (invite.status !== 'ACCEPTED' || invite.acceptedByUserId !== userId) {
      throw new ForbiddenException('请先接受邀请');
    }

    return this.getInboxForTrip(invite.tripId, userId);
  }

  async getInboxForTrip(
    tripId: string,
    userId: string,
  ): Promise<MemberConfirmInboxResponseDto> {
    await this.assertTripMember(tripId, userId);

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { status: true },
    });
    if (!trip) {
      throw new NotFoundException('行程不存在');
    }

    const ownersSnapshot = await this.ownersService.getOwnersSnapshot(tripId);
    const isPayer = ownersSnapshot.owners.paymentApprover?.userId === userId;

    const problems = await this.collectProblems(tripId);
    const items: MemberConfirmInboxItemDto[] = [];

    for (const problem of problems) {
      const item = this.toInboxItem(problem, trip.status ?? 'PLANNING');
      if (!MEMBER_VISIBLE_SCOPES.has(item.confirmScope)) {
        continue;
      }
      const visible = await this.isVisibleToMember(
        item,
        userId,
        isPayer,
        problem,
        tripId,
      );
      if (visible) {
        items.push(item);
      }
    }

    return { items };
  }

  private async collectProblems(tripId: string): Promise<DecisionProblemDetail[]> {
    if (!this.problemCollector) {
      return [];
    }
    try {
      const collected = await this.problemCollector.collect(tripId);
      return collected.items;
    } catch {
      return [];
    }
  }

  private toInboxItem(
    problem: DecisionProblemDetail,
    tripStatus: string,
  ): MemberConfirmInboxItemDto {
    const confirmScope = this.mapConfirmScope(problem);
    const phase = this.mapPhase(problem, tripStatus);
    const status = this.mapStatus(problem.status);

    return {
      id: problem.id,
      title: problem.title,
      summary: problem.description,
      confirmScope,
      phase,
      status,
      actionHref: `/dashboard/trips/${problem.tripId}/decisions/${problem.id}`,
    };
  }

  private mapConfirmScope(problem: DecisionProblemDetail): MemberConfirmScope {
    const approver = problem.authority?.requiredApprover;
    const mode = problem.authority?.executionMode;
    const domain = problem.authority?.decisionDomain;

    if (mode === 'AUTO_WITH_NOTIFICATION' && approver === 'SYSTEM') {
      return 'AI_AUTO';
    }
    if (domain === 'BUDGET' || problem.type === 'RESOURCE_CONFLICT') {
      return approver === 'ALL_MEMBERS' ? 'PAYER_AND_MEMBERS' : 'PAYER';
    }
    if (approver === 'AFFECTED_MEMBERS') {
      return 'AFFECTED_MEMBERS';
    }
    if (approver === 'ALL_MEMBERS') {
      return 'ALL_MEMBERS';
    }
    if (approver === 'TRIP_OWNER' || approver === 'DOMAIN_LEADER') {
      return 'ADVISOR_DIRECT';
    }
    return 'ADVISOR_DIRECT';
  }

  private mapPhase(
    problem: DecisionProblemDetail,
    tripStatus: string,
  ): MemberConfirmPhase {
    if (tripStatus === 'COMPLETED') {
      return 'completion';
    }
    if (tripStatus === 'TRAVELING' || tripStatus === 'IN_PROGRESS') {
      return 'execution';
    }
    if (problem.detectedBy === 'EXECUTION_MONITOR') {
      return 'execution';
    }
    return 'planning';
  }

  private mapStatus(status: string): MemberConfirmStatus {
    if (status === 'DISMISSED') return 'DISMISSED';
    if (status === 'RESOLVED' || status === 'DECIDED') return 'COMPLETED';
    return 'PENDING';
  }

  private async isVisibleToMember(
    item: MemberConfirmInboxItemDto,
    userId: string,
    isPayer: boolean,
    problem: DecisionProblemDetail,
    tripId: string,
  ): Promise<boolean> {
    if (item.confirmScope === 'ALL_MEMBERS') {
      return true;
    }
    if (item.confirmScope === 'PAYER') {
      return isPayer;
    }
    if (item.confirmScope === 'PAYER_AND_MEMBERS') {
      return isPayer || (await this.isAffectedMember(problem, userId, tripId));
    }
    if (item.confirmScope === 'AFFECTED_MEMBERS') {
      return this.isAffectedMember(problem, userId, tripId);
    }
    return false;
  }

  private async isAffectedMember(
    problem: DecisionProblemDetail,
    userId: string,
    tripId: string,
  ): Promise<boolean> {
    const impacts = problem.affectedScope.flatMap(
      (scope) => scope.memberImpacts ?? [],
    );
    if (impacts.length === 0) {
      return true;
    }

    const collaboratorIds = impacts.map((impact) => impact.memberId);
    const collaborators = await this.prisma.tripCollaborator.findMany({
      where: { tripId, id: { in: collaboratorIds } },
      select: { id: true, userId: true },
    });
    const affectedUserIds = new Set<string>([
      ...collaborators.map((c) => c.userId),
      ...collaboratorIds,
    ]);
    return affectedUserIds.has(userId);
  }

  private async assertTripMember(tripId: string, userId: string): Promise<void> {
    if (userId === 'anonymous-dev-user') {
      return;
    }

    const collaborator = await this.prisma.tripCollaborator.findUnique({
      where: { tripId_userId: { tripId, userId } },
      select: { id: true },
    });
    if (collaborator) {
      return;
    }

    throw new ForbiddenException('无权访问该行程');
  }
}
