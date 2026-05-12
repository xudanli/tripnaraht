import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import type { ExecutionPolicyIR } from '../contracts/execution-policy-ir.types';
import type {
  PolicyAgent,
  PolicyFitness,
  PolicySpecialization,
  PolicySpecializationTag,
} from '../contracts/policy-agent.types';
import {
  DEFAULT_POLICY_FITNESS,
  DEFAULT_POLICY_SPECIALIZATION,
} from '../contracts/policy-agent.types';
import type { ExecutionTrace } from '../contracts/execution-trace.types';
import type { ExecutionControlContext } from '../contracts/execution-control-policy.types';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { DEFAULT_ECPS_RUNTIME_BIAS } from '../contracts/policy-correction.types';
import { compilePolicy } from '../utils/execution-policy.compiler';
import { computeFitnessFromExecutionTraces } from '../utils/policy-agent-fitness.util';
import {
  buildPolicyAgentSelectionContext,
  scorePolicyAgent,
  selectPolicyAgent,
} from '../utils/policy-agent-selection.util';
import { EcpsRuntimeBiasService } from './ecps-runtime-bias.service';

function newPolicyId(): string {
  return `pa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * MAPE population store — competing `PolicyAgent` entities with trace-derived fitness.
 */
@Injectable()
export class PolicyAgentPopulationService implements OnModuleInit {
  private readonly logger = new Logger(PolicyAgentPopulationService.name);
  private readonly agents = new Map<string, PolicyAgent>();
  private defaultPolicyId: string | null = null;

  constructor(@Optional() private readonly ecpsRuntimeBias?: EcpsRuntimeBiasService) {}

  onModuleInit(): void {
    const ir = this.ecpsRuntimeBias?.compileExecutionPolicy() ?? compilePolicy([], DEFAULT_ECPS_RUNTIME_BIAS, {});
    const id = this.registerFromIr(ir, {
      specialization: DEFAULT_POLICY_SPECIALIZATION,
      fitness: { ...DEFAULT_POLICY_FITNESS },
    });
    this.defaultPolicyId = id;
    this.logger.log(`Policy agent population seeded: default=${id}`);
  }

  get(policyId: string): PolicyAgent | undefined {
    return this.agents.get(policyId);
  }

  listActive(): PolicyAgent[] {
    return [...this.agents.values()].filter((a) => a.active);
  }

  getDefaultPolicyId(): string | null {
    return this.defaultPolicyId;
  }

  setDefaultPolicy(policyId: string): void {
    if (!this.agents.has(policyId)) throw new Error(`POLICY_AGENT_UNKNOWN:${policyId}`);
    this.defaultPolicyId = policyId;
  }

  /** Register / mutation — returns policyId. */
  registerFromIr(
    ir: ExecutionPolicyIR,
    opts?: {
      policyId?: string;
      parentPolicyId?: string;
      fitness?: PolicyFitness;
      specialization?: PolicySpecialization;
      active?: boolean;
    },
  ): string {
    const policyId = opts?.policyId ?? newPolicyId();
    const agent: PolicyAgent = {
      policyId,
      parentPolicyId: opts?.parentPolicyId,
      ecps: ir,
      fitness: opts?.fitness ?? { ...DEFAULT_POLICY_FITNESS },
      specialization: opts?.specialization ?? { ...DEFAULT_POLICY_SPECIALIZATION },
      active: opts?.active ?? true,
    };
    this.agents.set(policyId, agent);
    return policyId;
  }

  setActive(policyId: string, active: boolean): void {
    const a = this.agents.get(policyId);
    if (!a) throw new Error(`POLICY_AGENT_UNKNOWN:${policyId}`);
    this.agents.set(policyId, { ...a, active });
  }

  /** Update fitness from ETK batch (e.g. post-generation compiler loop). */
  ingestTracesForFitness(policyId: string, traces: ExecutionTrace[]): void {
    const a = this.agents.get(policyId);
    if (!a) throw new Error(`POLICY_AGENT_UNKNOWN:${policyId}`);
    const nextFitness = computeFitnessFromExecutionTraces(traces, a.fitness);
    this.agents.set(policyId, { ...a, fitness: nextFitness });
  }

  /** CEL — attach cognitive asset ids to a policy portfolio (idempotent merge). */
  linkCognitiveArtifacts(policyId: string, artifactIds: string[]): void {
    const a = this.agents.get(policyId);
    if (!a) throw new Error(`POLICY_AGENT_UNKNOWN:${policyId}`);
    const next = new Set([...(a.cognitiveArtifactRefs ?? []), ...artifactIds]);
    this.agents.set(policyId, { ...a, cognitiveArtifactRefs: [...next] });
  }

  /** Extinction — deactivate weak agents (does not delete; audit-friendly). */
  extinctBelowSuccessRate(floor: number): number {
    let n = 0;
    for (const [id, a] of this.agents) {
      if (a.fitness.successRate < floor && id !== this.defaultPolicyId) {
        this.agents.set(id, { ...a, active: false });
        n++;
      }
    }
    return n;
  }

  /**
   * MAPE selection: explicit pin (`policy_agent_id` / legacy `execution_policy_version_id`) →
   * argmax fitness/specialization score → default agent.
   */
  resolveForRequest(params: {
    ecpsCtx: ExecutionControlContext;
    request: RouteAndRunRequestDto;
    explicitPolicyId?: string;
  }): { agent: PolicyAgent; selectionScore: number; pinned: boolean } {
    const { ecpsCtx, request } = params;
    const explicit =
      params.explicitPolicyId ??
      request.options?.policy_agent_id ??
      request.options?.execution_policy_version_id;

    if (explicit) {
      const a = this.agents.get(explicit);
      if (a) {
        const sel = buildPolicyAgentSelectionContext(ecpsCtx, request);
        return { agent: a, selectionScore: scorePolicyAgent(a, sel), pinned: true };
      }
      this.logger.warn(`Unknown policy id=${explicit}, falling back to MAPE selection`);
    }

    const sel = buildPolicyAgentSelectionContext(ecpsCtx, request);
    const pool = this.listActive();
    const picked = selectPolicyAgent(pool, sel);
    const agent =
      picked ??
      (this.defaultPolicyId ? this.agents.get(this.defaultPolicyId) : undefined) ??
      pool[0];

    if (!agent) {
      throw new Error('POLICY_AGENT_POPULATION_EMPTY');
    }

    return {
      agent,
      selectionScore: scorePolicyAgent(agent, sel),
      pinned: false,
    };
  }

  /** Convenience mutation operator — compile child IR + lineage + tags. */
  mutateFromCompiler(params: {
    ir: ExecutionPolicyIR;
    parentPolicyId: string;
    specialization?: PolicySpecialization;
    fitnessSeed?: Partial<PolicyFitness>;
    tags?: PolicySpecializationTag[];
  }): string {
    const parent = this.agents.get(params.parentPolicyId);
    const specialization: PolicySpecialization = params.specialization ?? {
      primary: parent?.specialization.primary ?? 'GENERAL',
      tags: params.tags ?? [...(parent?.specialization.tags ?? ['GENERAL'])],
    };
    const fitness = {
      ...DEFAULT_POLICY_FITNESS,
      ...parent?.fitness,
      ...params.fitnessSeed,
    };
    return this.registerFromIr(params.ir, {
      parentPolicyId: params.parentPolicyId,
      fitness,
      specialization,
    });
  }

  /** @internal tests */
  _clearForTests(): void {
    this.agents.clear();
    this.defaultPolicyId = null;
  }
}
