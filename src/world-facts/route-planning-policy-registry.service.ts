import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import type { ExecutionPlanningContext } from './execution-planning-context.types';
import type {
  PolicyRegistryFile,
  PolicyRouteRule,
  PolicyRouteWhen,
  ResolvedRoutePlanningPolicyBundle,
  RoutePlanningPolicyBundle,
} from './policy-registry.types';
import type { RoutePlanningPolicyParameters } from './route-planning-policy-config.types';
import type { PolicyBundleSelectionReason } from './policy-selection.types';
import { DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS } from './route-planning-policy.defaults';

/**
 * Policy Data System：Registry + Bundle 选择。
 * - 显式 POLICY_ACTIVE_* 优先（运营强制）
 * - 其次 Domain Router（ExecutionPlanningContext → bundle）
 * - 最后 registry 首项 / embedded default
 */
@Injectable()
export class RoutePlanningPolicyRegistryService {
  private readonly logger = new Logger(RoutePlanningPolicyRegistryService.name);

  constructor(private readonly nestConfig: ConfigService) {}

  /**
   * 解析当前生效的策略包（每次调用重新读文件 —— 热切换）。
   *
   * @param planningContext 若提供且 Router 启用，则参与 domain 规则匹配；否则跳过 routing（见 selectionReason）。
   */
  resolveActiveBundle(
    planningContext?: ExecutionPlanningContext | null,
  ): ResolvedRoutePlanningPolicyBundle {
    const registry = this.loadRegistryFile();
    if (!registry || registry.bundles.length === 0) {
      return {
        bundle: this.embeddedDefaultBundle(),
        selectionReason: 'embedded_default',
      };
    }

    const envPick = this.tryPickFromEnv(registry);
    if (envPick) {
      return envPick;
    }

    const routerDisabled = this.isPolicyRouterDisabled();
    const routing = registry.routing;
    const rules = routing?.rules ?? [];
    const routingEnabled =
      !routerDisabled &&
      routing !== undefined &&
      rules.length > 0 &&
      routing.enabled !== false;

    if (routingEnabled && planningContext) {
      const domainPick = this.tryPickFromDomainRules(registry, rules, planningContext);
      if (domainPick) {
        return domainPick;
      }
    }

    if (routingEnabled && !planningContext) {
      return {
        bundle: this.normalizeBundle(registry.bundles[0]),
        selectionReason: 'routing_skipped_no_context',
      };
    }

    if (routerDisabled && rules.length > 0) {
      this.logger.debug('POLICY_ROUTER_DISABLED set; skipping domain routing');
    }

    return {
      bundle: this.normalizeBundle(registry.bundles[0]),
      selectionReason: routerDisabled && rules.length > 0 ? 'routing_disabled' : 'registry_fallback_first',
    };
  }

  private tryPickFromEnv(registry: PolicyRegistryFile): ResolvedRoutePlanningPolicyBundle | null {
    const bundleId =
      this.nestConfig.get<string>('POLICY_ACTIVE_BUNDLE_ID') ??
      process.env.POLICY_ACTIVE_BUNDLE_ID;
    const revision =
      this.nestConfig.get<string>('POLICY_ACTIVE_REVISION') ?? process.env.POLICY_ACTIVE_REVISION;

    let picked: RoutePlanningPolicyBundle | undefined;
    let selectionReason: PolicyBundleSelectionReason | undefined;

    if (bundleId?.trim()) {
      picked = registry.bundles.find((b) => b.id === bundleId.trim());
      if (!picked) {
        this.logger.warn(`POLICY_ACTIVE_BUNDLE_ID=${bundleId} not found in registry; falling back`);
      } else {
        selectionReason = 'env_bundle_id';
      }
    }

    if (!picked && revision?.trim()) {
      picked = registry.bundles.find((b) => b.revision === revision.trim());
      if (!picked) {
        this.logger.warn(`POLICY_ACTIVE_REVISION=${revision} not found in registry; falling back`);
      } else {
        selectionReason = 'env_revision';
      }
    }

    if (!picked || !selectionReason) {
      return null;
    }

    return { bundle: this.normalizeBundle(picked), selectionReason };
  }

  private tryPickFromDomainRules(
    registry: PolicyRegistryFile,
    rules: PolicyRouteRule[],
    ctx: ExecutionPlanningContext,
  ): ResolvedRoutePlanningPolicyBundle | null {
    const sorted = [...rules].sort((a, b) => a.priority - b.priority);

    for (const rule of sorted) {
      if (!ruleWhenMatches(rule.when, ctx)) continue;

      const picked = registry.bundles.find((b) => b.id === rule.bundleId);
      if (!picked) {
        this.logger.warn(
          `Policy route rule ${rule.id}: bundleId=${rule.bundleId} not found in registry; skipping rule`,
        );
        continue;
      }

      return {
        bundle: this.normalizeBundle(picked),
        routingRuleId: rule.id,
        selectionReason: 'domain_rule',
      };
    }

    return null;
  }

  private isPolicyRouterDisabled(): boolean {
    const v =
      this.nestConfig.get<string>('POLICY_ROUTER_DISABLED') ?? process.env.POLICY_ROUTER_DISABLED;
    return v === '1' || v?.toLowerCase() === 'true';
  }

  /** 嵌入默认包（无 registry 文件时） */
  embeddedDefaultBundle(): RoutePlanningPolicyBundle {
    return {
      id: 'embedded-default',
      revision: DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS.revision,
      parameters: { ...DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS },
      policyDeclarations: [],
    };
  }

  private loadRegistryFile(): PolicyRegistryFile | null {
    const configured =
      this.nestConfig.get<string>('POLICY_REGISTRY_FILE') ??
      process.env.POLICY_REGISTRY_FILE ??
      path.join(process.cwd(), 'config', 'policy-registry.json');

    const abs = path.isAbsolute(configured)
      ? configured
      : path.join(process.cwd(), configured);

    try {
      if (!fs.existsSync(abs)) {
        this.logger.debug(`Policy registry file not found at ${abs}, using embedded bundle`);
        return null;
      }
      const raw = fs.readFileSync(abs, 'utf8');
      const parsed = JSON.parse(raw) as PolicyRegistryFile;
      if (!parsed?.bundles?.length) {
        this.logger.warn(`Policy registry invalid or empty: ${abs}`);
        return null;
      }
      return parsed;
    } catch (e: any) {
      this.logger.warn(`Policy registry load failed (${abs}): ${e?.message ?? e}`);
      return null;
    }
  }

  private normalizeBundle(b: RoutePlanningPolicyBundle): RoutePlanningPolicyBundle {
    const params: RoutePlanningPolicyParameters = {
      ...DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS,
      ...b.parameters,
      revision: b.parameters.revision?.trim() || b.revision,
    };
    return {
      ...b,
      revision: b.revision || params.revision,
      parameters: params,
    };
  }
}

function ruleWhenMatches(when: PolicyRouteWhen, ctx: ExecutionPlanningContext): boolean {
  const hasCountry = Boolean(when.countryCodes?.length);
  const hasPrefix = Boolean(when.tripIdPrefixes?.length);
  const reqTrip = when.requireTripId === true;
  if (!hasCountry && !hasPrefix && !reqTrip) {
    return false;
  }

  if (reqTrip && !ctx.tripId?.trim()) {
    return false;
  }

  if (hasCountry) {
    const cc = ctx.countryCode?.trim().toUpperCase();
    const allowed = when.countryCodes!.map((c) => c.trim().toUpperCase());
    if (!cc || !allowed.includes(cc)) {
      return false;
    }
  }

  if (hasPrefix) {
    const tid = ctx.tripId?.trim();
    if (!tid) {
      return false;
    }
    if (!when.tripIdPrefixes!.some((p) => tid.startsWith(p))) {
      return false;
    }
  }

  return true;
}
