/**
 * Causal Decision product BFF — wraps Gateway + Trace; FE must not depend on Trace internals.
 */

import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { CanonicalCausalTraceService } from '../../../causal-protocol/services/canonical-causal-trace.service';
import {
  resolveProblemIdFromDecisionId,
  toCausalDecisionProductView,
} from '../../../travel-causal-decision/api/to-causal-decision-product-view';
import type {
  ApplyCausalDecisionRequest,
  CausalDecisionListView,
  CausalDecisionOutcomeView,
  CausalDecisionProductView,
  SelectCausalDecisionRequest,
} from '../../../travel-causal-decision/api/causal-decision-product.types';
import type { CausalDecisionLifecycleStatus } from '../../../travel-causal-decision/api/causal-decision-product.types';
import { DecisionEngineGatewayService } from './decision-engine-gateway.service';
import { DecisionProblemResolutionStoreService } from '../persistence/decision-problem-resolution.store';
import type { UnifiedDecisionProblemDetailView } from '../contracts/unified-decision-ui.types';
import type { TravelCausalDecision } from '../../../travel-causal-decision';

@Injectable()
export class CausalDecisionProductService {
  constructor(
    private readonly gateway: DecisionEngineGatewayService,
    private readonly resolutionStore: DecisionProblemResolutionStoreService,
    @Optional() private readonly causalTrace?: CanonicalCausalTraceService,
  ) {}

  async list(tripId: string): Promise<CausalDecisionListView> {
    const listed = await this.gateway.listProblems(tripId);
    const items: CausalDecisionProductView[] = [];
    for (const item of listed.items ?? []) {
      const decision = item.travelCausalDecision;
      if (!decision) continue;
      items.push(
        await this.toProductView({
          tripId,
          problemId: item.problemId,
          decision,
        }),
      );
    }
    return {
      schema: 'tripnara.causal_decision_list@v1',
      tripId,
      generatedAt: new Date().toISOString(),
      items,
    };
  }

  async get(tripId: string, decisionId: string): Promise<CausalDecisionProductView> {
    const problemId = resolveProblemIdFromDecisionId(decisionId);
    const detail = await this.gateway.getProblem(tripId, problemId);
    const decision = this.extractDecision(detail);
    if (!decision) {
      throw new NotFoundException(`CAUSAL_DECISION_NOT_FOUND: ${decisionId}`);
    }
    return this.toProductView({
      tripId,
      problemId,
      decision,
    });
  }

  async select(
    tripId: string,
    decisionId: string,
    userId: string,
    body: SelectCausalDecisionRequest,
  ): Promise<CausalDecisionProductView> {
    const problemId = resolveProblemIdFromDecisionId(decisionId);
    if (!body.optionId?.trim()) {
      throw new BadRequestException('optionId is required');
    }
    const detail = await this.gateway.getProblem(tripId, problemId);
    const decision = this.extractDecision(detail);
    if (!decision) {
      throw new NotFoundException(`CAUSAL_DECISION_NOT_FOUND: ${decisionId}`);
    }

    const optionExists =
      decision.interventions.some((i) => i.optionId === body.optionId) ||
      (detail.actions ?? []).some((a) => a.actionId === body.optionId);
    if (!optionExists) {
      throw new NotFoundException(`CAUSAL_OPTION_NOT_FOUND: ${body.optionId}`);
    }

    const gatewayActionId = this.resolveGatewayActionId(detail, body.optionId);
    const causalTraceRef = detail.causalTraceRef ?? detail.problem?.causalTraceRef;

    if (gatewayActionId) {
      await this.gateway.submitResolution(tripId, problemId, userId, {
        selectedActionId: gatewayActionId,
        idempotencyKey: body.idempotencyKey,
        reason: body.reason,
        causalTraceRef,
      });
    } else if (this.causalTrace && causalTraceRef?.traceId) {
      // Product-level select when intervention is causal-only (not yet a Gateway action).
      this.causalTrace.bindSelected({
        traceId: causalTraceRef.traceId,
        optionId: body.optionId,
      });
    } else {
      throw new BadRequestException(
        'CAUSAL_OPTION_NOT_EXECUTABLE: option is not a Gateway action and no causal trace is bound',
      );
    }

    return this.get(tripId, decisionId);
  }

  async apply(
    tripId: string,
    decisionId: string,
    userId: string,
    body?: ApplyCausalDecisionRequest,
  ): Promise<CausalDecisionProductView> {
    const problemId = resolveProblemIdFromDecisionId(decisionId);
    const stored = await this.resolutionStore.getForProblem(tripId, problemId);

    if (!stored && body?.optionId) {
      await this.select(tripId, decisionId, userId, { optionId: body.optionId });
    }

    const afterSelect = await this.resolutionStore.getForProblem(tripId, problemId);
    if (!afterSelect) {
      throw new BadRequestException(
        'CAUSAL_APPLY_REQUIRES_GATEWAY_RESOLUTION: select a Gateway-executable option first',
      );
    }

    await this.gateway.applyResolution(tripId, problemId, userId);
    return this.get(tripId, decisionId);
  }

  async getOutcome(
    tripId: string,
    decisionId: string,
  ): Promise<CausalDecisionOutcomeView> {
    const view = await this.get(tripId, decisionId);
    return {
      schema: 'tripnara.causal_decision_outcome@v1',
      decisionId: view.decisionId,
      tripId: view.tripId,
      problemId: view.problemId,
      lifecycleStatus: view.lifecycleStatus,
      outcome: view.outcome,
      statusMessage: view.statusMessage,
      generatedAt: new Date().toISOString(),
    };
  }

  private extractDecision(
    detail: UnifiedDecisionProblemDetailView,
  ): TravelCausalDecision | undefined {
    return detail.travelCausalDecision ?? detail.problem?.travelCausalDecision;
  }

  private resolveGatewayActionId(
    detail: UnifiedDecisionProblemDetailView,
    optionId: string,
  ): string | undefined {
    const actions = detail.actions ?? [];
    const match = actions.find((a) => a.actionId === optionId);
    if (!match || match.allowed === false) return undefined;
    return match.actionId;
  }

  private async toProductView(input: {
    tripId: string;
    problemId: string;
    decision: TravelCausalDecision;
  }): Promise<CausalDecisionProductView> {
    const stored = await this.resolutionStore.getForProblem(
      input.tripId,
      input.problemId,
    );
    const lifecycleOverride = this.lifecycleFromResolution(
      stored?.status,
      input.decision,
    );
    return toCausalDecisionProductView({
      decision: input.decision,
      problemId: input.problemId,
      lifecycleOverride,
    });
  }

  private lifecycleFromResolution(
    status: string | undefined,
    decision: { outcome?: { reconciliation?: string; selectedOptionId?: string } },
  ): CausalDecisionLifecycleStatus | undefined {
    if (!status) return undefined;
    const rec = decision.outcome?.reconciliation;
    if (rec === 'CONFIRMED' || rec === 'PARTIAL' || rec === 'DISPROVED') {
      return 'RECONCILED';
    }
    if (status === 'APPLIED' || status === 'VERIFIED') {
      return rec === 'UNOBSERVABLE' || rec === 'PENDING' || !rec
        ? 'AWAITING_OBSERVATION'
        : 'APPLIED';
    }
    if (
      status === 'AUTHORIZED' ||
      status === 'PROPOSED' ||
      status === 'APPLYING'
    ) {
      return 'SELECTED';
    }
    return undefined;
  }
}
