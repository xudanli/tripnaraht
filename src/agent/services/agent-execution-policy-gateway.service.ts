import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  evaluateAgenticAdmission,
  evaluateMcpToolDispatch,
  mergeExecutionToolPolicies,
  type AgenticAdmissionDecision,
  type McpToolDispatchDecision,
} from '../runtime/agent-execution-policy-gateway.util';
import { parseAgenticGovernanceHitlFlag } from '../runtime/agentic-tool-governance.util';
import type { GovernanceApprovedToolInvocation } from '../runtime/agentic-tool-governance.util';
import { AgenticTokenQuotaService } from './agentic-token-quota.service';
import type { AgentMemoryContext } from '../memory/interfaces/agent-memory-context.interface';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { resolveAgenticQuotaSessionId } from '../runtime/agentic-session-quota-key.util';
import { resolveAgenticQuotaOrgId } from '../runtime/agentic-org-quota-key.util';
import { mountAgenticTokenQuotaCheckOnRequest } from '../runtime/cost-governance-observability.util';
import {
  hydrateRouteAndRunExecutionPolicyInPlace,
  type ExecutionPolicyGatewayObservabilityV1,
  type RouteAndRunExecutionPolicyCarrier,
} from '../runtime/execution-policy-gateway-context.util';

/**
 * Nest 门面：编排 / Agentic / MCP 共享的执行策略网关（Harness Control P2）。
 */
@Injectable()
export class AgentExecutionPolicyGatewayService {
  private readonly logger = new Logger(AgentExecutionPolicyGatewayService.name);

  constructor(
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly tokenQuota?: AgenticTokenQuotaService,
  ) {}

  isHitlGovernanceEnabled(): boolean {
    const raw =
      this.configService?.get<string>('FEATURE_AGENTIC_GOVERNANCE_HITL') ??
      process.env.FEATURE_AGENTIC_GOVERNANCE_HITL;
    return parseAgenticGovernanceHitlFlag(raw);
  }

  mergeToolPolicies(toolPoliciesFromMemory?: unknown) {
    return mergeExecutionToolPolicies(this.isHitlGovernanceEnabled(), toolPoliciesFromMemory);
  }

  evaluateMcpToolDispatch(params: {
    mcpToolName: string;
    policies: ReturnType<typeof mergeExecutionToolPolicies>;
    toolCallId?: string;
    approvedInvocations?: GovernanceApprovedToolInvocation[];
  }): McpToolDispatchDecision {
    const decision = evaluateMcpToolDispatch(params);
    if (decision.action === 'hold') {
      this.logger.warn(decision.logLine);
    } else if (decision.policy.mode === 'ask') {
      this.logger.debug(decision.logLine);
    }
    return decision;
  }

  async checkAgenticAdmission(
    request: RouteAndRunRequestDto,
    userId: string | null | undefined,
    estimatedTokens: number,
  ): Promise<AgenticAdmissionDecision> {
    if (!this.tokenQuota) {
      const decision = {
        allowed: true,
        quota: {
          allowed: true,
          scope: 'none' as const,
          used: 0,
          limit: 0,
          remaining: Number.MAX_SAFE_INTEGER,
        },
      };
      mountAgenticTokenQuotaCheckOnRequest(request as never, decision.quota);
      return decision;
    }
    const sessionId = resolveAgenticQuotaSessionId(request);
    const orgId = resolveAgenticQuotaOrgId(request);
    const quota = await this.tokenQuota.checkBeforeAgenticRun(
      userId,
      estimatedTokens,
      sessionId,
      orgId,
    );
    mountAgenticTokenQuotaCheckOnRequest(request as never, quota);
    return { allowed: quota.allowed, quota };
  }

  async recordAgenticTokenUsage(
    request: RouteAndRunRequestDto,
    userId: string | null | undefined,
    tokens: number,
  ): Promise<void> {
    if (!this.tokenQuota || !tokens) return;
    const sessionId = resolveAgenticQuotaSessionId(request);
    const orgId = resolveAgenticQuotaOrgId(request);
    await this.tokenQuota.recordAgenticUsage(userId, tokens, sessionId, orgId).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[AgentExecutionPolicy] token quota record failed (non-fatal): ${msg}`);
    });
  }

  /** route_and_run 主链 tick 入口：合并 policies 并挂载 observability 到 request。 */
  hydrateRouteAndRunRequest(
    request: RouteAndRunRequestDto,
    memory: AgentMemoryContext | undefined,
  ): ExecutionPolicyGatewayObservabilityV1 {
    const obs = hydrateRouteAndRunExecutionPolicyInPlace(
      request as RouteAndRunExecutionPolicyCarrier,
      memory,
      this.isHitlGovernanceEnabled(),
    );
    this.logger.debug(
      `[AgentExecutionPolicy] hydrated request_id=${request.request_id} hitl=${obs.hitl_governance_enabled} policies=${obs.tool_policy_count} approved=${obs.approved_invocation_count}`,
    );
    return obs;
  }
}
