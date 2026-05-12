import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_OPS_OPERATIONAL_POLICY_V1 } from './operational-policy.defaults';
import type { OpsOperationalPolicyConfigV1 } from './operational-policy.types';

function mergeOpsOperationalPolicy(
  base: OpsOperationalPolicyConfigV1,
  patch: Partial<OpsOperationalPolicyConfigV1>,
): OpsOperationalPolicyConfigV1 {
  return {
    ...base,
    ...patch,
    version: patch.version ?? base.version,
    weather: { ...base.weather, ...patch.weather },
    worldFact: { ...base.worldFact, ...patch.worldFact },
    routing: { ...base.routing, ...patch.routing },
  };
}

/**
 * P-OPS-3 — Loads versioned operational policy: defaults merged with `OPS_OPERATIONAL_POLICY_JSON`.
 */
@Injectable()
export class OperationalPolicyService {
  private readonly logger = new Logger(OperationalPolicyService.name);
  private readonly effectivePolicy: OpsOperationalPolicyConfigV1;

  constructor() {
    let merged = DEFAULT_OPS_OPERATIONAL_POLICY_V1;
    const raw = process.env.OPS_OPERATIONAL_POLICY_JSON?.trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<OpsOperationalPolicyConfigV1>;
        merged = mergeOpsOperationalPolicy(DEFAULT_OPS_OPERATIONAL_POLICY_V1, parsed);
      } catch (e) {
        this.logger.warn(
          `OPS_OPERATIONAL_POLICY_JSON parse failed; using defaults: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    this.effectivePolicy = merged;
  }

  getEffectivePolicy(): OpsOperationalPolicyConfigV1 {
    return this.effectivePolicy;
  }
}
