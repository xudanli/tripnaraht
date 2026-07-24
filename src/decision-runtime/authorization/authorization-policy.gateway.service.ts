/**
 * Authorization Policy Gateway — unified ALLOW | ASK | DENY | DEGRADE.
 * Default off: legacy Rfc001AuthorizationService / tool gates remain authority.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  type AuthorizationPolicyInput,
  type AuthorizationPolicyResult,
  AUTHORIZATION_POLICY_RESULT_SCHEMA_ID,
} from './contracts/authorization-policy.types';
import { isAuthorizationPolicyGatewayEnabled } from './authorization-policy.config';
import { Rfc001DecisionLedgerStoreService } from '../../trips/guardian-decision-core/persistence/rfc001-decision-ledger.store';
import { DecisionWorkspaceService } from '../../trips/guardian-decision-core/workspace/decision-workspace.service';
import { candidateHasNonOverridableBlock } from '../../trips/guardian-decision-core/policy/write-permission.guard';
import { resolveAutomationPolicyFromTripMetadata } from '../../trips/trip-constraint-solver/utils/travel-decision-contract-runtime.util';
import { readStoredTravelDecisionContract } from '../../trips/trip-constraint-solver/utils/travel-decision-contract.builder';
import { evaluateDecisionAutomation } from './utils/decision-automation-policy.util';

@Injectable()
export class AuthorizationPolicyGatewayService {
  private readonly logger = new Logger(AuthorizationPolicyGatewayService.name);

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly ledgerStore?: Rfc001DecisionLedgerStoreService,
    @Optional() private readonly workspaceService?: DecisionWorkspaceService,
  ) {}

  isEnabled(): boolean {
    return isAuthorizationPolicyGatewayEnabled();
  }

  async evaluate(input: AuthorizationPolicyInput): Promise<AuthorizationPolicyResult> {
    if (!this.isEnabled()) {
      return {
        schemaId: AUTHORIZATION_POLICY_RESULT_SCHEMA_ID,
        scope: input.scope,
        outcome: 'ASK',
        reasonCodes: ['GATEWAY_DISABLED'],
        evaluatedAt: new Date().toISOString(),
        delegatedToLegacy: true,
      };
    }

    const outcome = await this.evaluateEnabled(input);
    this.logger.debug(
      `[AuthPolicy] scope=${input.scope} trip=${input.tripId} outcome=${outcome.outcome}`,
    );
    return outcome;
  }

  private async evaluateEnabled(
    input: AuthorizationPolicyInput,
  ): Promise<AuthorizationPolicyResult> {
    const reasonCodes: string[] = [];

    switch (input.scope) {
      case 'DECISION':
        return this.evaluateDecisionScope(input);

      case 'TOOL':
        if (!input.toolName) {
          return deny(input.scope, ['MISSING_TOOL_NAME']);
        }
        if (input.metadata?.toolRisk === 'high') {
          reasonCodes.push('HIGH_RISK_TOOL');
          return {
            schemaId: AUTHORIZATION_POLICY_RESULT_SCHEMA_ID,
            scope: input.scope,
            outcome: 'ASK',
            reasonCodes,
            evaluatedAt: new Date().toISOString(),
          };
        }
        return {
          schemaId: AUTHORIZATION_POLICY_RESULT_SCHEMA_ID,
          scope: input.scope,
          outcome: 'ALLOW',
          reasonCodes: ['TOOL_LOW_RISK'],
          evaluatedAt: new Date().toISOString(),
        };

      case 'EFFECTIVE_PLAN_COMMIT':
        return this.evaluateEffectivePlanCommitScope(input);

      default:
        return deny('DECISION', ['UNKNOWN_SCOPE']);
    }
  }

  private async evaluateEffectivePlanCommitScope(
    input: AuthorizationPolicyInput,
  ): Promise<AuthorizationPolicyResult> {
    if (!input.decisionId) {
      return deny(input.scope, ['MISSING_AUTHORIZED_DECISION']);
    }

    if (this.ledgerStore) {
      const record = await this.ledgerStore.getDecision(
        input.tripId,
        input.decisionId,
      );
      if (!record) {
        return deny(input.scope, ['DECISION_RECORD_NOT_FOUND']);
      }
      if (record.recordStatus !== 'AUTHORIZED') {
        return deny(input.scope, ['DECISION_NOT_AUTHORIZED']);
      }
    }

    return {
      schemaId: AUTHORIZATION_POLICY_RESULT_SCHEMA_ID,
      scope: input.scope,
      outcome: 'ALLOW',
      reasonCodes: ['AUTHORIZED_DECISION_READY'],
      evaluatedAt: new Date().toISOString(),
    };
  }

  private async evaluateDecisionScope(
    input: AuthorizationPolicyInput,
  ): Promise<AuthorizationPolicyResult> {
    if (!input.candidateId) {
      return deny(input.scope, ['MISSING_CANDIDATE_CHOICE']);
    }

    if (
      input.decisionId &&
      this.ledgerStore &&
      this.workspaceService
    ) {
      const record = await this.ledgerStore.getDecision(
        input.tripId,
        input.decisionId,
      );
      if (record?.workspaceId) {
        const workspace = await this.workspaceService.get(
          input.tripId,
          record.workspaceId,
        );
        if (
          workspace &&
          candidateHasNonOverridableBlock(workspace, input.candidateId)
        ) {
          return deny(input.scope, ['CANDIDATE_NON_OVERRIDABLE_BLOCK']);
        }
      }
    }

    const automationDecision = await this.evaluateAutomationForDecision(input);
    if (automationDecision) {
      return automationDecision;
    }

    return {
      schemaId: AUTHORIZATION_POLICY_RESULT_SCHEMA_ID,
      scope: input.scope,
      outcome: 'ASK',
      reasonCodes: ['L2_USER_CONFIRMATION_REQUIRED'],
      evaluatedAt: new Date().toISOString(),
    };
  }

  private async evaluateAutomationForDecision(
    input: AuthorizationPolicyInput,
  ): Promise<AuthorizationPolicyResult | undefined> {
    if (!this.prisma) return undefined;

    const trip = await this.prisma.trip.findUnique({
      where: { id: input.tripId },
      select: { metadata: true, budgetConfig: true },
    });
    if (!trip) return undefined;

    const metadata = (trip.metadata ?? {}) as Record<string, unknown>;
    const pacing = (trip.budgetConfig ?? {}) as Record<string, unknown>;
    const stored = readStoredTravelDecisionContract(metadata);
    const automation = resolveAutomationPolicyFromTripMetadata(metadata, pacing);
    const semanticKey =
      typeof input.metadata?.semanticKey === 'string'
        ? input.metadata.semanticKey
        : undefined;
    const semanticCapability =
      typeof input.metadata?.semanticCapability === 'string'
        ? input.metadata.semanticCapability
        : undefined;

    if (!semanticKey && !semanticCapability) {
      return undefined;
    }

    const evaluation = evaluateDecisionAutomation({
      automation,
      automationPaused: stored?.automationPaused === true,
      semanticKey,
      semanticCapability,
      enforcement:
        typeof input.metadata?.enforcement === 'string'
          ? input.metadata.enforcement
          : undefined,
    });

    return {
      schemaId: AUTHORIZATION_POLICY_RESULT_SCHEMA_ID,
      scope: input.scope,
      outcome: evaluation.outcome,
      reasonCodes: evaluation.reasonCodes,
      evaluatedAt: new Date().toISOString(),
    };
  }
}

function deny(
  scope: AuthorizationPolicyInput['scope'],
  reasonCodes: string[],
): AuthorizationPolicyResult {
  return {
    schemaId: AUTHORIZATION_POLICY_RESULT_SCHEMA_ID,
    scope,
    outcome: 'DENY',
    reasonCodes,
    evaluatedAt: new Date().toISOString(),
  };
}
