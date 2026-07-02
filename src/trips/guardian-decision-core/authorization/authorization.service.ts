/**
 * PR-E — L2 authorization (user confirmation before effective plan switch).
 */

import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { Rfc001DecisionRecord } from '../contracts/decision-record.types';
import { Rfc001DecisionLedgerStoreService } from '../persistence/rfc001-decision-ledger.store';
import { DecisionWorkspaceService } from '../workspace/decision-workspace.service';
import { Rfc001PlanVersionService } from '../plan-version/plan-version.service';
import type { PlanVersion } from '../contracts/plan-version.types';
import {
  candidateHasNonOverridableBlock,
} from '../policy/write-permission.guard';
import { ORIGINAL_CANDIDATE_ID } from '../adapters/repair-candidate.adapter';
import { PrismaService } from '../../../prisma/prisma.service';
import { stampExecutionLock } from '../execution/rfc001-execution-lock.util';
import { isRfc001ItineraryMaterializeEnabled } from '../config/rfc001-iceland.config';
import { Rfc001DecisionSemanticsProjectorService } from '../read-model/rfc001-decision-semantics-projector.service';
import { assertRecordExecutableForAuthorize } from '../cutover/cutover-reconciliation.util';

export interface AuthorizeDecisionInput {
  tripId: string;
  decisionId: string;
  choice?: string;
}

export interface AuthorizeDecisionResult {
  record: Rfc001DecisionRecord;
  planVersion: PlanVersion;
}

@Injectable()
export class Rfc001AuthorizationService {
  constructor(
    private readonly ledgerStore: Rfc001DecisionLedgerStoreService,
    private readonly workspaceService: DecisionWorkspaceService,
    private readonly planVersionService: Rfc001PlanVersionService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly v15Projector?: Rfc001DecisionSemanticsProjectorService,
  ) {}

  async authorize(input: AuthorizeDecisionInput): Promise<AuthorizeDecisionResult> {
    const record = await this.ledgerStore.getDecision(input.tripId, input.decisionId);
    if (!record) {
      throw new NotFoundException(`Decision ${input.decisionId} not found`);
    }
    assertRecordExecutableForAuthorize(record);
    if (record.recordStatus !== 'PROPOSED') {
      throw new BadRequestException(
        `Decision ${input.decisionId} is ${record.recordStatus}; expected PROPOSED`,
      );
    }
    if (record.authorizationRequirement.level !== 'L2') {
      throw new BadRequestException('Only L2 decisions require authorize in this slice');
    }

    const candidateId = input.choice ?? record.selectedCandidateId;
    if (!candidateId) {
      throw new BadRequestException('choice or selectedCandidateId required');
    }

    const workspace = await this.workspaceService.get(input.tripId, record.workspaceId);
    if (!workspace) {
      throw new NotFoundException(`Workspace ${record.workspaceId} not found`);
    }

    if (candidateHasNonOverridableBlock(workspace, candidateId)) {
      throw new BadRequestException(
        `Candidate ${candidateId} has non-overridable BLOCK`,
      );
    }

    const now = new Date().toISOString();
    let finalAction = record.finalAction;
    if (candidateId === ORIGINAL_CANDIDATE_ID) {
      finalAction = 'ALLOW';
    } else if (finalAction === 'DEFER_TO_HUMAN' || finalAction === 'ALLOW') {
      finalAction = 'REPLACE';
    }

    const updated: Rfc001DecisionRecord = {
      ...record,
      selectedCandidateId: candidateId,
      finalAction,
      recordStatus: 'AUTHORIZED',
      decidedAt: now,
    };
    await this.ledgerStore.upsertDecision(input.tripId, updated);

    if (this.v15Projector?.isEnabled()) {
      await this.v15Projector.upsertFromRfcRecord({
        tripId: input.tripId,
        record: updated,
      });
    }

    const planVersion = await this.planVersionService.rebindToCandidate({
      tripId: input.tripId,
      decisionId: input.decisionId,
      workspace,
      candidateId,
    });

    if (
      isRfc001ItineraryMaterializeEnabled() &&
      this.prisma &&
      candidateId !== ORIGINAL_CANDIDATE_ID
    ) {
      await stampExecutionLock(this.prisma, input.tripId, input.decisionId);
    }

    return { record: updated, planVersion };
  }
}
