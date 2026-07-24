/**
 * Slice 4 Internal Dual-Read — read-only side-by-side queue vs Attention Primary projection.
 * Does NOT replace decision-queue, enable Primary SSO, or send notifications.
 */

import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { UnifiedDecisionProblemReadModelService } from '../../../decision-runtime/gateway/services/unified-decision-problem-read-model.service';
import type { CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import {
  isAttentionInternalDualReadEnabled,
  isTripEligibleForAttentionInternalDualRead,
  isUserEligibleForAttentionInternalDualRead,
  ATTENTION_INTERNAL_DUAL_READ_SCHEMA_ID,
} from '../config/attention-internal-dual-read.config';
import {
  isAttentionOrchestrationPrimarySsoEnabled,
  isAttentionOrchestrationShadowEnabled,
} from '../config/rfc002-canonical.config';
import type { AttentionInternalDualReadResponse } from '../contracts/attention-orchestration.types';
import { AttentionOrchestrationShadowRunnerService } from './attention-orchestration-shadow-runner.service';
import { buildAttentionInternalDualReadComparison } from './attention-internal-dual-read-comparison.util';

@Injectable()
export class AttentionInternalDualReadService {
  private readonly logger = new Logger(AttentionInternalDualReadService.name);

  constructor(
    private readonly shadowRunner: AttentionOrchestrationShadowRunnerService,
    private readonly readModel: UnifiedDecisionProblemReadModelService,
  ) {}

  assertEligible(tripId: string, user?: CurrentUserPayload): void {
    if (!isAttentionInternalDualReadEnabled()) {
      throw new ForbiddenException('ATTENTION_INTERNAL_DUAL_READ_DISABLED');
    }
    if (!isAttentionOrchestrationShadowEnabled()) {
      throw new ForbiddenException('ATTENTION_ROOT_CAUSE_ORCHESTRATION disabled');
    }
    if (isAttentionOrchestrationPrimarySsoEnabled()) {
      throw new ForbiddenException(
        'ATTENTION_ROOT_CAUSE_PRIMARY_SSO must remain OFF during Internal Dual-Read',
      );
    }
    if (!isTripEligibleForAttentionInternalDualRead(tripId)) {
      throw new ForbiddenException('trip_not_on_attention_internal_dual_read_allowlist');
    }
    if (!isUserEligibleForAttentionInternalDualRead(user)) {
      throw new ForbiddenException('user_not_eligible_for_attention_internal_dual_read');
    }
  }

  async getDualRead(
    tripId: string,
    user?: CurrentUserPayload,
  ): Promise<AttentionInternalDualReadResponse> {
    this.assertEligible(tripId, user);

    const generatedAt = new Date().toISOString();
    const rows = await this.readModel.collectRows(tripId);
    const projection = this.shadowRunner.projectFromRows({
      tripId,
      rows,
      source: 'READ_MODEL',
      runAt: generatedAt,
    });

    const currentQueueItems = projection.legacyVisible.map((item) => ({
      problemId: item.problemId,
      semanticKey: item.semanticKey,
      title: item.title,
      workflowStatus: item.workflowStatus,
      enforcement: rows.find((row) => row.problemId === item.problemId)?.enforcement,
    }));

    const comparison = buildAttentionInternalDualReadComparison({
      currentQueueItems,
      attentionPrimaryItems: projection.shadowPrimaryItems,
      shadowClusters: projection.shadowClusters,
      inputProblems: projection.inputProblems,
    });

    this.logger.debug(
      `Internal dual-read trip=${tripId} current=${comparison.currentVisibleCount} attention=${comparison.attentionVisibleCount} reduction=${comparison.reductionCount}`,
    );

    return {
      schemaId: ATTENTION_INTERNAL_DUAL_READ_SCHEMA_ID,
      phase: 'INTERNAL_DUAL_READ',
      tripId,
      generatedAt,
      primarySsoEnabled: false,
      notificationsEnabled: false,
      currentQueueItems,
      attentionPrimaryItems: projection.shadowPrimaryItems,
      comparison,
      shadowVerdict: projection.comparison.verdict,
      shadowVerdictReason: projection.comparison.reason,
    };
  }
}
