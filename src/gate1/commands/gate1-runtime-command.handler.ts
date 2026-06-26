import {
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  Gate1CandidateService,
  Gate1ConflictService,
} from '../services/gate1-output.services';
import { Gate1DecisionService } from '../services/gate1-decision.service';
import { Gate1ReadinessService } from '../services/gate1-readiness.service';
import { Gate1PlanBService } from '../services/gate1-plan-b.service';
import { Gate1OutcomeService } from '../services/gate1-outcome.service';
import { Gate1ParticipantService } from '../services/gate1-participant.service';
import { Gate1PrivacyService } from '../services/gate1-privacy.service';
import {
  Gate1RuntimeCommand,
  Gate1RuntimeCommandType,
} from '../../decision-runtime/commands/gate1-runtime-command.types';
import { Gate1RuntimeEventService } from '../../decision-runtime/services/gate1-runtime-event.service';

/**
 * Unified command entry for Gate1 → Decision Runtime hot paths (Tier 2.1).
 * HTTP/API response shapes unchanged — delegates to existing Gate1 services.
 * Rejected client errors (4xx) emit COMMAND_REJECTED to Event Store (fail-open).
 */
@Injectable()
export class Gate1RuntimeCommandHandler {
  private readonly logger = new Logger(Gate1RuntimeCommandHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly decisions: Gate1DecisionService,
    private readonly conflicts: Gate1ConflictService,
    private readonly candidates: Gate1CandidateService,
    private readonly readiness: Gate1ReadinessService,
    private readonly planB: Gate1PlanBService,
    private readonly outcomes: Gate1OutcomeService,
    private readonly participants: Gate1ParticipantService,
    private readonly privacy: Gate1PrivacyService,
    private readonly runtimeEvents: Gate1RuntimeEventService,
  ) {}

  async execute<T = unknown>(command: Gate1RuntimeCommand): Promise<T> {
    this.logger.debug(`[RuntimeCommand] ${command.type}`);
    try {
      switch (command.type) {
        case Gate1RuntimeCommandType.RECORD_DECISION:
          return (await this.decisions.submit(
            command.projectId,
            command.actorId,
            command.dto,
          )) as T;

        case Gate1RuntimeCommandType.PUBLISH_CONFLICT:
          return (await this.conflicts.publish(
            command.projectId,
            command.version,
            command.actorId,
            command.dto,
          )) as T;

        case Gate1RuntimeCommandType.PUBLISH_CANDIDATE:
          return (await this.candidates.publish(
            command.projectId,
            command.candidateId,
            command.actorId,
            command.dto,
          )) as T;

        case Gate1RuntimeCommandType.PUBLISH_PLAN_B:
          return (await this.planB.publish(
            command.projectId,
            command.planBId,
            command.actorId,
            command.dto,
          )) as T;

        case Gate1RuntimeCommandType.PUBLISH_READINESS:
          return (await this.readiness.publish(
            command.projectId,
            command.version,
            command.actorId,
            command.dto,
          )) as T;

        case Gate1RuntimeCommandType.RECORD_OUTCOME:
          return (await this.outcomes.submitOutcome(
            command.projectId,
            command.actorId,
            command.dto,
          )) as T;

        case Gate1RuntimeCommandType.RECORD_PARTICIPANT_CONSENT:
          return (await this.participants.recordConsent(
            command.inviteToken,
            command.dto,
          )) as T;

        case Gate1RuntimeCommandType.SAVE_PARTICIPANT_PREFERENCES:
          return (await this.participants.savePreferences(
            command.inviteToken,
            command.dto,
          )) as T;

        case Gate1RuntimeCommandType.REVIEW_SANITIZED_CONSTRAINT:
          return (await this.privacy.reviewSanitized(
            command.projectId,
            command.constraintId,
            command.actorId,
            command.dto,
          )) as T;

        case Gate1RuntimeCommandType.RECORD_CONFLICT_FEEDBACK:
          return (await this.conflicts.recordFeedback(
            command.findingId,
            command.dto,
            command.actorId,
          )) as T;

        case Gate1RuntimeCommandType.RECORD_CONFLICT_ACTION:
          return (await this.conflicts.recordFindingAction(
            command.findingId,
            command.actorId,
            command.dto,
          )) as T;

        case Gate1RuntimeCommandType.UPSERT_READINESS_DRAFT:
          return (await this.readiness.upsertDraft(
            command.projectId,
            command.actorId,
            command.dto,
          )) as T;

        case Gate1RuntimeCommandType.RECORD_READINESS_FEEDBACK:
          return (await this.readiness.recordFeedback(
            command.findingId,
            command.dto,
            command.actorId,
          )) as T;

        case Gate1RuntimeCommandType.RECORD_READINESS_ACTION:
          return (await this.readiness.recordFindingAction(
            command.findingId,
            command.actorId,
            command.dto,
          )) as T;

        default: {
          const exhaustive: never = command;
          throw new Error(
            `Unknown runtime command: ${(exhaustive as Gate1RuntimeCommand).type}`,
          );
        }
      }
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500) {
        void this.recordRejection(command, error);
      }
      throw error;
    }
  }

  private async recordRejection(
    command: Gate1RuntimeCommand,
    error: HttpException,
  ): Promise<void> {
    try {
      const projectId = await this.resolveProjectId(command);
      if (!projectId) return;

      const actorId = 'actorId' in command ? command.actorId : undefined;
      await this.runtimeEvents.commandRejected({
        projectId,
        commandType: command.type,
        actorId,
        statusCode: error.getStatus(),
        reason: this.extractHttpMessage(error),
      });
    } catch (emitError: unknown) {
      const message =
        emitError instanceof Error ? emitError.message : String(emitError);
      this.logger.warn(`[RuntimeCommand] Failed to record rejection: ${message}`);
    }
  }

  private async resolveProjectId(
    command: Gate1RuntimeCommand,
  ): Promise<string | null> {
    if ('projectId' in command) {
      return command.projectId;
    }
    if ('inviteToken' in command) {
      const participant = await this.prisma.gate1Participant.findUnique({
        where: { inviteToken: command.inviteToken },
        select: { projectId: true },
      });
      return participant?.projectId ?? null;
    }
    if ('findingId' in command) {
      const conflict = await this.prisma.gate1ConflictFinding.findUnique({
        where: { id: command.findingId },
        select: { report: { select: { projectId: true } } },
      });
      if (conflict) return conflict.report.projectId;

      const readiness = await this.prisma.gate1ReadinessFinding.findUnique({
        where: { id: command.findingId },
        select: { report: { select: { projectId: true } } },
      });
      return readiness?.report.projectId ?? null;
    }
    return null;
  }

  private extractHttpMessage(error: HttpException): string {
    const response = error.getResponse();
    if (typeof response === 'string') return response;
    if (typeof response === 'object' && response !== null) {
      const msg = (response as { message?: string | string[] }).message;
      if (Array.isArray(msg)) return msg.join('; ');
      if (typeof msg === 'string') return msg;
    }
    return error.message;
  }
}
