import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import type { ExecutionPolicyIR } from '../contracts/execution-policy-ir.types';
import type {
  ExecutionPolicyVersion,
  PolicyVersionMetrics,
} from '../contracts/execution-policy-version.types';
import { DEFAULT_POLICY_VERSION_METRICS } from '../contracts/execution-policy-version.types';
import { compilePolicy } from '../utils/execution-policy.compiler';
import { EcpsRuntimeBiasService } from './ecps-runtime-bias.service';
import {
  buildPolicySelectionContext,
  scorePolicyVersion,
  selectPolicyVersion,
} from '../utils/policy-version-selection.util';
import type { ExecutionControlContext } from '../contracts/execution-control-policy.types';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { DEFAULT_ECPS_RUNTIME_BIAS } from '../contracts/policy-correction.types';

function newVersionId(): string {
  return `pv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory policy version graph (Policy Git). Swap for persistence / CRDT later.
 */
@Injectable()
export class ExecutionPolicyVersionRegistryService implements OnModuleInit {
  private readonly logger = new Logger(ExecutionPolicyVersionRegistryService.name);
  private readonly byId = new Map<string, ExecutionPolicyVersion>();
  /** Default fallback when explicit id missing / selection empty. */
  private defaultVersionId: string | null = null;

  constructor(@Optional() private readonly ecpsRuntimeBias?: EcpsRuntimeBiasService) {}

  onModuleInit(): void {
    const ir = this.ecpsRuntimeBias?.compileExecutionPolicy() ?? compilePolicy([], DEFAULT_ECPS_RUNTIME_BIAS, {});
    const id = this.commitIr(ir, {
      metrics: { ...DEFAULT_POLICY_VERSION_METRICS },
      active: true,
      labels: ['baseline'],
    });
    this.defaultVersionId = id;
    this.logger.log(`Policy version graph seeded: default=${id}`);
  }

  get(versionId: string): ExecutionPolicyVersion | undefined {
    return this.byId.get(versionId);
  }

  listSelectable(): ExecutionPolicyVersion[] {
    return [...this.byId.values()].filter((v) => v.active);
  }

  getDefaultVersionId(): string | null {
    return this.defaultVersionId;
  }

  /** Promote default pointer (merge winner / ops). */
  setDefaultVersion(versionId: string): void {
    if (!this.byId.has(versionId)) {
      throw new Error(`POLICY_VERSION_UNKNOWN:${versionId}`);
    }
    this.defaultVersionId = versionId;
  }

  commitIr(
    ir: ExecutionPolicyIR,
    opts?: {
      parentVersionId?: string;
      metrics?: PolicyVersionMetrics;
      active?: boolean;
      labels?: string[];
      versionId?: string;
    },
  ): string {
    const versionId = opts?.versionId ?? newVersionId();
    const v: ExecutionPolicyVersion = {
      versionId,
      parentVersionId: opts?.parentVersionId,
      policyIR: ir,
      compiledAt: ir.compiledAt,
      metrics: opts?.metrics ?? { ...DEFAULT_POLICY_VERSION_METRICS },
      active: opts?.active ?? true,
      labels: opts?.labels,
    };
    this.byId.set(versionId, v);
    return versionId;
  }

  setVersionActive(versionId: string, active: boolean): void {
    const v = this.byId.get(versionId);
    if (!v) throw new Error(`POLICY_VERSION_UNKNOWN:${versionId}`);
    this.byId.set(versionId, { ...v, active });
  }

  updateMetrics(versionId: string, metrics: Partial<PolicyVersionMetrics>): void {
    const v = this.byId.get(versionId);
    if (!v) throw new Error(`POLICY_VERSION_UNKNOWN:${versionId}`);
    this.byId.set(versionId, { ...v, metrics: { ...v.metrics, ...metrics } });
  }

  /**
   * PV-ER selection: explicit pin → else argmax over selectable population → default version.
   */
  resolveForRequest(params: {
    ecpsCtx: ExecutionControlContext;
    request: RouteAndRunRequestDto;
    explicitVersionId?: string;
  }): { version: ExecutionPolicyVersion; selectionScore: number; pinned: boolean } {
    const { ecpsCtx, request } = params;
    const explicit = params.explicitVersionId ?? request.options?.execution_policy_version_id;

    if (explicit) {
      const v = this.byId.get(explicit);
      if (v) {
        const sel = buildPolicySelectionContext(ecpsCtx, request);
        return { version: v, selectionScore: scorePolicyVersion(v, sel), pinned: true };
      }
      this.logger.warn(`Unknown execution_policy_version_id=${explicit}, falling back to selection`);
    }

    const sel = buildPolicySelectionContext(ecpsCtx, request);
    const pool = this.listSelectable();
    const picked = selectPolicyVersion(pool, sel);
    const version =
      picked ??
      (this.defaultVersionId ? this.byId.get(this.defaultVersionId) : undefined) ??
      pool[0];

    if (!version) {
      throw new Error('POLICY_VERSION_GRAPH_EMPTY');
    }

    return {
      version,
      selectionScore: scorePolicyVersion(version, sel),
      pinned: false,
    };
  }

  /** @internal tests */
  _clearAllForTests(): void {
    this.byId.clear();
    this.defaultVersionId = null;
  }
}
