/**
 * Shared harness helpers for S4 automation closure tests.
 */

import { buildPlanVersionIdempotencyKey } from '../plan-version/plan-version.service';
import { DecisionAutomationChainService } from '../../../decision-runtime/monitoring/decision-automation-chain.service';
import { DecisionEngineGatewayService } from '../../../decision-runtime/gateway/services/decision-engine-gateway.service';
import { UnifiedDecisionProblemReadModelService } from '../../../decision-runtime/gateway/services/unified-decision-problem-read-model.service';
import { resolveRfc001ProblemSemanticKey } from '../../../decision-capabilities/problem-semantic';
import type { Rfc001AuthorizationService } from '../authorization/authorization.service';
import type { Rfc001PlanVersionApplyExecutor } from '../execution/plan-version-apply.executor';
import type { Rfc001DecisionCenterReadModelService } from '../read-model/rfc001-decision-center-read-model.service';
import type { Rfc001DecisionProblemStoreService } from '../persistence/rfc001-decision-problem.store';
import type { PrismaService } from '../../../prisma/prisma.service';

export const AUTO_EXECUTE_CONTRACT = {
  automation: {
    defaultLevel: 'AUTO_EXECUTE_CONDITIONAL',
    autoAllowed: ['weather_hazard_replan'],
    confirmationRequired: ['change_lodging', 'change_intercity_route'],
  },
};

export interface S4AutomationHarnessStack {
  readModel: Rfc001DecisionCenterReadModelService;
  problemStore: Rfc001DecisionProblemStoreService;
  authorization: Rfc001AuthorizationService;
  executor: Rfc001PlanVersionApplyExecutor;
}

export function buildS4AutomationChain(
  prisma: PrismaService,
  stack: S4AutomationHarnessStack,
): DecisionAutomationChainService {
  const readModel = {
    getProblemDetail: jest.fn(async (tripId: string, problemId: string) => {
      const view = await stack.readModel.getProblemView(tripId, problemId);
      const problem = await stack.problemStore.get(tripId, problemId);
      const semanticKey = problem
        ? resolveRfc001ProblemSemanticKey(problem)
        : undefined;
      return {
        problem: {
          semanticKey,
          semanticCapability: problem?.semanticCapability,
          enforcement:
            problem?.semanticCapability === 'ROAD_SEGMENT_UNAVAILABLE' ? 'BLOCK' : 'REQUIRE_ADJUSTMENT',
          type: problem?.type,
          triggerEventId: problem?.triggerEventId,
        },
        actions: view.options.map((option) => ({
          actionId: option.id,
          allowed: option.executable !== false,
          blockedReason: option.executable === false ? 'NOT_EXECUTABLE' : undefined,
        })),
      };
    }),
  } as unknown as UnifiedDecisionProblemReadModelService;

  const gateway = {
    submitResolution: jest.fn(
      async (
        tripId: string,
        problemId: string,
        _userId: string,
        body: { selectedActionId: string },
      ) => {
        const view = await stack.readModel.getProblemView(tripId, problemId);
        const decisionId = view.record!.decisionId;
        await stack.authorization.authorize({
          tripId,
          decisionId,
          choice: body.selectedActionId,
        });
        return { nextStep: 'APPLY' as const };
      },
    ),
    applyResolution: jest.fn(async (tripId: string, problemId: string) => {
      const view = await stack.readModel.getProblemView(tripId, problemId);
      const decisionId = view.record!.decisionId;
      const key = buildPlanVersionIdempotencyKey(tripId, decisionId);
      await stack.executor.execute({ tripId, decisionId, idempotencyKey: key });
      return { revalidation: { status: 'PASSED' } };
    }),
  } as unknown as DecisionEngineGatewayService;

  return new DecisionAutomationChainService(prisma, gateway, readModel);
}

export function tripMetadataWithAutomation(
  base: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...base,
    travelDecisionContract: AUTO_EXECUTE_CONTRACT,
  };
}
