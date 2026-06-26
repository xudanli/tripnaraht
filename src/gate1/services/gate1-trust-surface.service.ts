import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Gate1GuardService } from './gate1-support.services';
import { Gate1ParticipantService } from './gate1-participant.service';
import type { Gate1TrustSurface } from '../types/gate1-trust-surface.types';
import {
  buildCandidateTrustCard,
  buildDecisionTrustCard,
  buildPlanBTrustCard,
  summarizeTrustCards,
} from '../utils/gate1-trust-surface.builder';
import { sanitizeTrustSurfaceForParticipant } from '../utils/gate1-trust-surface.participant.util';
import {
  buildFulfillmentInputFromReadinessFindings,
  runGate1FulfillmentCausalAnalysis,
} from '../../trips/causal-runtime/domains/gate1-fulfillment-causal.engine';

@Injectable()
export class Gate1TrustSurfaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: Gate1GuardService,
    private readonly participants: Gate1ParticipantService,
  ) {}

  async getTrustSurface(projectId: string): Promise<Gate1TrustSurface> {
    await this.guard.requireProject(projectId);

    const [candidates, planBs, decision, project, latestReadiness] = await Promise.all([
      this.prisma.gate1CandidateStrategy.findMany({
        where: { projectId, status: 'PUBLISHED' },
        orderBy: [{ version: 'asc' }, { label: 'asc' }],
      }),
      this.prisma.gate1PlanB.findMany({
        where: { projectId, status: 'PUBLISHED' },
        orderBy: [{ version: 'asc' }, { label: 'asc' }],
      }),
      this.prisma.gate1AdvisorDecision.findFirst({
        where: { projectId },
        orderBy: { submittedAt: 'desc' },
        include: {
          selectedCandidate: {
            select: { id: true, label: true, strategySummary: true },
          },
        },
      }),
      this.prisma.gate1Project.findUnique({
        where: { id: projectId },
        select: { startDate: true },
      }),
      this.prisma.gate1ReadinessReport.findFirst({
        where: { projectId, status: 'PUBLISHED' },
        orderBy: { version: 'desc' },
        include: {
          findings: {
            where: { closedAt: null },
            orderBy: { sortOrder: 'asc' },
          },
        },
      }),
    ]);

    const daysToDeparture =
      project?.startDate != null
        ? Math.ceil(
            (project.startDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
          )
        : undefined;

    const fulfillmentAssessment = runGate1FulfillmentCausalAnalysis(
      buildFulfillmentInputFromReadinessFindings(
        (latestReadiness?.findings ?? []).map((f) => ({
          status: f.status,
          dimension: f.dimension,
          title: f.title,
          dueAt: f.dueAt,
          responsibleParty: f.responsibleParty,
        })),
        { daysToDeparture },
      ),
    );

    const cards = [
      ...candidates.map((c) => buildCandidateTrustCard(c, candidates)),
      ...planBs.map((p) => buildPlanBTrustCard(p, fulfillmentAssessment)),
      ...(decision ? [buildDecisionTrustCard(decision, candidates)] : []),
    ];

    return {
      projectId,
      schemaVersion: 1,
      cards,
      summary: summarizeTrustCards(cards),
    };
  }

  async getParticipantTrustSurface(inviteToken: string): Promise<Gate1TrustSurface> {
    const participant = await this.participants.resolveByToken(inviteToken);
    const surface = await this.getTrustSurface(participant.projectId);
    return sanitizeTrustSurfaceForParticipant(surface);
  }
}
