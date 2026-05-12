import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import type { ExecutionPlanningContext } from './execution-planning-context.types';
import type {
  ActiveRoutePlanningPolicy,
  RoutePlanningPolicyParameters,
} from './route-planning-policy-config.types';
import { DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS } from './route-planning-policy.defaults';
import { PolicySelectionLogService } from './policy-selection-log.service';
import { RoutePlanningPolicyRegistryService } from './route-planning-policy-registry.service';

/**
 * Configuration Plane：策略即数据 —— JSON 文件 / 环境变量热评估（每次请求重新解析）。
 */
@Injectable()
export class RoutePlanningPolicyConfigService {
  private readonly logger = new Logger(RoutePlanningPolicyConfigService.name);

  constructor(
    private readonly nestConfig: ConfigService,
    private readonly policyRegistry: RoutePlanningPolicyRegistryService,
    @Optional() private readonly policySelectionLog?: PolicySelectionLogService,
  ) {}

  /**
   * 合并顺序：default < Policy Registry bundle（含 Domain Router）< JSON 文件 < ROUTE_PLANNING_POLICY_JSON < 逐项 env 覆盖
   *
   * @param planningContext 传入时参与 registry routing；省略则仅 env / registry 默认（无 domain 匹配）。
   */
  getActiveParameters(planningContext?: ExecutionPlanningContext | null): ActiveRoutePlanningPolicy {
    const sources: string[] = ['default'];
    let params: RoutePlanningPolicyParameters = {
      ...DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS,
    };

    const resolved = this.policyRegistry.resolveActiveBundle(planningContext);
    let activeBundleId: string | undefined;
    let activeRoutingRuleId: string | undefined;
    const policyBundleSelectionReason = resolved.selectionReason;
    if (resolved.bundle) {
      params = mergeParams(params, resolved.bundle.parameters);
      sources.push(`registry:${resolved.bundle.id}`);
      activeBundleId = resolved.bundle.id;
      if (resolved.routingRuleId) {
        activeRoutingRuleId = resolved.routingRuleId;
        sources.push(`router:${resolved.routingRuleId}`);
      }
      sources.push(`selection:${resolved.selectionReason}`);
    }

    const filePath =
      this.nestConfig.get<string>('ROUTE_PLANNING_POLICY_FILE') ??
      process.env.ROUTE_PLANNING_POLICY_FILE;
    if (filePath?.trim()) {
      const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
      try {
        if (fs.existsSync(abs)) {
          const raw = fs.readFileSync(abs, 'utf8');
          const parsed = JSON.parse(raw) as Partial<RoutePlanningPolicyParameters>;
          params = mergeParams(params, parsed);
          sources.push(`file:${abs}`);
        }
      } catch (e: any) {
        this.logger.warn(`ROUTE_PLANNING_POLICY_FILE load failed: ${e?.message ?? e}`);
      }
    }

    const inline =
      this.nestConfig.get<string>('ROUTE_PLANNING_POLICY_JSON') ??
      process.env.ROUTE_PLANNING_POLICY_JSON;
    if (inline?.trim()) {
      try {
        const parsed = JSON.parse(inline) as Partial<RoutePlanningPolicyParameters>;
        params = mergeParams(params, parsed);
        sources.push('env:ROUTE_PLANNING_POLICY_JSON');
      } catch (e: any) {
        this.logger.warn(`ROUTE_PLANNING_POLICY_JSON parse failed: ${e?.message ?? e}`);
      }
    }

    params = applyScalarEnvOverrides(params, this.nestConfig);
    const envMarks = scalarEnvTouched(this.nestConfig);
    if (envMarks.length) sources.push(...envMarks);

    params = clampParams(params);
    const revision = params.revision?.trim() || DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS.revision;

    this.policySelectionLog?.scheduleRecord({
      planningContext,
      resolved,
      effectiveRevision: revision,
    });

    return {
      params: { ...params, revision },
      revision,
      sources: dedupeSources(sources),
      activeBundleId,
      activeRoutingRuleId,
      policyBundleSelectionReason,
    };
  }
}

function mergeParams(
  base: RoutePlanningPolicyParameters,
  patch: Partial<RoutePlanningPolicyParameters>,
): RoutePlanningPolicyParameters {
  return { ...base, ...patch };
}

const ENV_SCALAR_KEYS: Partial<Record<string, keyof RoutePlanningPolicyParameters>> = {
  ROUTE_PLANNING_POLICY_REVISION: 'revision',
  ROUTE_PLANNING_POLICY_SOFT_STACK_CAP: 'softStackCap',
  ROUTE_PLANNING_POLICY_SOFT_FACTOR_PER_STACK: 'softFactorPerStack',
  ROUTE_PLANNING_POLICY_HARD_PENALTY_AFTER_COUNT: 'hardPenaltyAfterCount',
  ROUTE_PLANNING_POLICY_HARD_MULTIPLIER: 'hardMultiplier',
  ROUTE_PLANNING_POLICY_EXCLUDE_AT_COUNT: 'excludeAtCount',
  ROUTE_PLANNING_POLICY_AMBIENT_CAP: 'ambientCap',
  ROUTE_PLANNING_POLICY_AMBIENT_FACTOR: 'ambientFactor',
};

function applyScalarEnvOverrides(
  params: RoutePlanningPolicyParameters,
  nestConfig: ConfigService,
): RoutePlanningPolicyParameters {
  const next = { ...params };
  for (const [envKey, field] of Object.entries(ENV_SCALAR_KEYS)) {
    if (field === undefined) continue;
    const raw =
      nestConfig.get<string>(envKey) ?? (process.env as Record<string, string | undefined>)[envKey];
    if (raw === undefined || raw === '') continue;
    if (field === 'revision') {
      next.revision = String(raw);
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    (next as any)[field] = n;
  }
  return next;
}

function scalarEnvTouched(nestConfig: ConfigService): string[] {
  const out: string[] = [];
  for (const envKey of Object.keys(ENV_SCALAR_KEYS)) {
    const raw =
      nestConfig.get<string>(envKey) ?? (process.env as Record<string, string | undefined>)[envKey];
    if (raw !== undefined && raw !== '') out.push(`env:${envKey}`);
  }
  return out;
}

function clampParams(p: RoutePlanningPolicyParameters): RoutePlanningPolicyParameters {
  return {
    ...p,
    softStackCap: clampInt(p.softStackCap, 1, 10),
    softFactorPerStack: clampNum(p.softFactorPerStack, 0.5, 1),
    hardPenaltyAfterCount: clampInt(p.hardPenaltyAfterCount, 0, 30),
    hardMultiplier: clampNum(p.hardMultiplier, 0.05, 1),
    excludeAtCount: clampInt(p.excludeAtCount, 1, 50),
    ambientCap: clampInt(p.ambientCap, 0, 20),
    ambientFactor: clampNum(p.ambientFactor, 0.5, 1),
    revision: p.revision,
  };
}

function clampInt(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(v)));
}

function clampNum(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

function dedupeSources(s: string[]): string[] {
  return [...new Set(s)];
}
