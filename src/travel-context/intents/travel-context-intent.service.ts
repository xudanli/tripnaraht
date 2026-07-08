import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { PatchExplorationConditionsDto } from '../../trips/exploration/dto/exploration-conditions.dto';
import type {
  GenerateExplorationCandidatesDto,
  PutExplorationPrinciplesDto,
  RouteSelectionDto,
} from '../../trips/exploration/dto/exploration.dto';
import { ExplorationOrchestratorService } from '../../trips/exploration/services/exploration-orchestrator.service';
import { ExplorationScenarioService } from '../../trips/exploration/services/exploration-scenario.service';
import type { TravelContextSnapshot } from '../domain/travel-context.types';
import { TravelContextSnapshotBuilderService } from '../snapshot/travel-context-snapshot-builder.service';
import { TravelContextRevisionConflictException } from './travel-context-revision-conflict.exception';
import {
  domainsChanged,
  readPayloadProblemId,
  readPayloadString,
} from './travel-context-intent.util';
import type {
  SubmitTravelContextIntentInput,
  TravelContextIntentResult,
  TravelContextIntentType,
} from './travel-context-intent.types';
import type { TravelContextDiff } from '../diff/travel-context-diff.util';
import { TravelContextDiffService } from '../diff/travel-context-diff.service';

const UNSUPPORTED_IN_PRODUCTION: TravelContextIntentType[] = [
  'CHANGE_CONTRACT_CONSTRAINT',
  'NATURAL_LANGUAGE',
  'UPDATE_INTENT',
  'APPLY_PLAN',
];

interface DispatchResult {
  result?: unknown;
  idempotentReplay?: boolean;
}

@Injectable()
export class TravelContextIntentService {
  private readonly logger = new Logger(TravelContextIntentService.name);

  constructor(
    private readonly builder: TravelContextSnapshotBuilderService,
    private readonly orchestrator: ExplorationOrchestratorService,
    private readonly scenarios: ExplorationScenarioService,
    private readonly diffService: TravelContextDiffService,
  ) {}

  async submit(
    contextId: string,
    userId: string,
    input: SubmitTravelContextIntentInput,
  ): Promise<TravelContextIntentResult> {
    const before = await this.builder.build(contextId);

    if (input.basedOnRevision !== before.meta.revision) {
      throw new TravelContextRevisionConflictException({
        expectedRevision: input.basedOnRevision,
        currentRevision: before.meta.revision,
      });
    }

    if (UNSUPPORTED_IN_PRODUCTION.includes(input.type)) {
      return this.reject(before, input.type, ['UNSUPPORTED_INTENT_TYPE']);
    }

    const scenarioId = contextId;
    let dispatch: DispatchResult;

    try {
      dispatch = await this.dispatch(userId, scenarioId, input);
    } catch (err) {
      this.logger.warn(`Intent ${input.type} failed for ${contextId}: ${String(err)}`);
      throw err;
    }

    const after = await this.builder.build(contextId);
    const changedDomains = domainsChanged(before, after);
    const revisionDelta = after.meta.revision - before.meta.revision;
    const diff =
      revisionDelta > 0
        ? await this.diffService.recordTransition(contextId, before, after, {
            intentType: input.type,
          })
        : undefined;
    const outcome =
      revisionDelta > 0 || dispatch.idempotentReplay
        ? 'APPLIED'
        : revisionDelta === 0
          ? 'NO_CHANGE'
          : 'APPLIED';

    return {
      outcome,
      intentType: input.type,
      contextId,
      previousRevision: before.meta.revision,
      revision: after.meta.revision,
      snapshotId: after.meta.snapshotId,
      stage: after.identity.stage,
      changedDomains,
      domainResult: dispatch.result,
      diff: diff ? stripDiffForResponse(diff) : undefined,
    };
  }

  private reject(
    snapshot: TravelContextSnapshot,
    intentType: TravelContextIntentType,
    reasonCodes: string[],
  ): TravelContextIntentResult {
    if (reasonCodes.includes('AUTHORITY_DENIED')) {
      throw new ForbiddenException({
        code: 'AUTHORITY_DENIED',
        message: 'Intent requires canonical runtime authority',
        details: { reasonCodes },
      });
    }
    throw new BadRequestException({
      code: reasonCodes[0] ?? 'INTENT_REJECTED',
      message: `Intent ${intentType} rejected`,
      details: { reasonCodes },
    });
  }

  private async dispatch(
    userId: string,
    scenarioId: string,
    input: SubmitTravelContextIntentInput,
  ): Promise<DispatchResult> {
    const payload = input.payload ?? {};

    switch (input.type) {
      case 'CHANGE_EXPLORATION_CONDITIONS':
        return {
          result: await this.scenarios.patchConditions(
            userId,
            scenarioId,
            payload as PatchExplorationConditionsDto,
          ),
        };

      case 'SET_PRINCIPLES':
        return {
          result: await this.orchestrator.savePrinciples(
            userId,
            scenarioId,
            payload as unknown as PutExplorationPrinciplesDto,
          ),
        };

      case 'GENERATE_CANDIDATES':
        return {
          result: await this.orchestrator.generateCandidates(userId, scenarioId, {
            idempotencyKey: input.idempotencyKey ?? readPayloadString(payload, 'idempotencyKey'),
            force: payload.force === true,
          } as GenerateExplorationCandidatesDto),
        };

      case 'SELECT_ROUTE': {
        const routeId = readPayloadString(payload, 'routeId');
        if (!routeId) {
          throw new BadRequestException({
            code: 'INVALID_INTENT_PAYLOAD',
            message: 'SELECT_ROUTE requires payload.routeId',
          });
        }
        const dto: RouteSelectionDto = {
          routeId,
          selectionReason: readPayloadString(payload, 'selectionReason') || undefined,
          prioritizedGainIds: Array.isArray(payload.prioritizedGainIds)
            ? (payload.prioritizedGainIds as string[])
            : undefined,
          acceptedSacrificeIds: Array.isArray(payload.acceptedSacrificeIds)
            ? (payload.acceptedSacrificeIds as string[])
            : undefined,
          concernText: readPayloadString(payload, 'concernText') || undefined,
        };
        return { result: await this.orchestrator.selectRoute(userId, scenarioId, dto) };
      }

      case 'MATERIALIZE_TRIP': {
        const result = await this.orchestrator.materialize(userId, scenarioId);
        return { result, idempotentReplay: result.idempotentReplay };
      }

      case 'RUN_FEASIBILITY_CHECK':
        return {
          result: await this.orchestrator.runCheck(
            userId,
            scenarioId,
            payload.async === true,
          ),
        };

      case 'ACCEPT_DECISION_OPTION': {
        const problemId = readPayloadProblemId(payload);
        const optionId = readPayloadString(payload, 'optionId');
        if (!problemId || !optionId) {
          throw new BadRequestException({
            code: 'INVALID_INTENT_PAYLOAD',
            message: 'ACCEPT_DECISION_OPTION requires payload.problemId and payload.optionId',
          });
        }
        return {
          result: await this.orchestrator.submitDecision(userId, scenarioId, problemId, {
            optionId,
            reason: readPayloadString(payload, 'reason') || undefined,
            acknowledgement: Array.isArray(payload.acknowledgement)
              ? (payload.acknowledgement as string[])
              : undefined,
          }),
        };
      }

      case 'APPLY_DECISION': {
        const problemId = readPayloadProblemId(payload);
        if (!problemId) {
          throw new BadRequestException({
            code: 'INVALID_INTENT_PAYLOAD',
            message: 'APPLY_DECISION requires payload.problemId',
          });
        }
        return { result: await this.orchestrator.applyDecision(userId, scenarioId, problemId) };
      }

      default:
        throw new BadRequestException({
          code: 'UNSUPPORTED_INTENT_TYPE',
          message: `Unsupported intent type: ${input.type}`,
        });
    }
  }
}

function stripDiffForResponse(diff: TravelContextDiff): TravelContextDiff {
  return {
    contextId: diff.contextId,
    fromRevision: diff.fromRevision,
    toRevision: diff.toRevision,
    changedDomains: diff.changedDomains,
    changes: diff.changes,
  };
}
