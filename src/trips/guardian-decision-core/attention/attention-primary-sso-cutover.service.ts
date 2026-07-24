/**
 * Slice 4 Phase C — load Attention Primary cutover plan for user-visible BFF projection.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { UnifiedDecisionProblemReadModelService } from '../../../decision-runtime/gateway/services/unified-decision-problem-read-model.service';
import { isTripEligibleForAttentionPrimarySsoCutover } from '../config/attention-primary-sso.config';
import { AttentionOrchestrationShadowRunnerService } from './attention-orchestration-shadow-runner.service';
import {
  buildAttentionPrimarySsoCutoverPlan,
  type AttentionPrimarySsoCutoverPlan,
} from './attention-primary-sso-cutover.util';

@Injectable()
export class AttentionPrimarySsoCutoverService {
  private readonly logger = new Logger(AttentionPrimarySsoCutoverService.name);
  private readonly planCache = new Map<
    string,
    { loadedAt: number; plan: AttentionPrimarySsoCutoverPlan }
  >();
  private static readonly CACHE_TTL_MS = 15_000;

  constructor(
    private readonly shadowRunner: AttentionOrchestrationShadowRunnerService,
    @Optional() private readonly readModel?: UnifiedDecisionProblemReadModelService,
  ) {}

  isCutoverActive(tripId: string): boolean {
    return isTripEligibleForAttentionPrimarySsoCutover(tripId);
  }

  async loadCutoverPlan(tripId: string): Promise<AttentionPrimarySsoCutoverPlan | null> {
    if (!this.isCutoverActive(tripId)) return null;
    if (!this.readModel) {
      this.logger.warn(`Primary SSO cutover skipped trip=${tripId}: read model unavailable`);
      return null;
    }

    const cached = this.planCache.get(tripId);
    if (cached && Date.now() - cached.loadedAt < AttentionPrimarySsoCutoverService.CACHE_TTL_MS) {
      return cached.plan;
    }

    const rows = await this.readModel.collectRows(tripId);
    const projection = this.shadowRunner.projectFromRows({
      tripId,
      rows,
      source: 'READ_MODEL',
    });
    const plan = buildAttentionPrimarySsoCutoverPlan(tripId, projection);
    this.planCache.set(tripId, { loadedAt: Date.now(), plan });

    this.logger.debug(
      `Primary SSO cutover trip=${tripId} visible=${plan.attentionPrimaryItems.length} suppressed=${plan.suppressedProblemIds.size}`,
    );

    return plan;
  }
}
