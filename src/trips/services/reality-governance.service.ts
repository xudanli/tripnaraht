import { Injectable, Logger, Optional } from '@nestjs/common';
import type { RealityResource } from '../draft-synthesis/reality-governance/reality-resource.types';
import type { ResourceClaim } from '../draft-synthesis/reality-governance/resource-claim.types';
import type { GovernancePolicyMode } from '../draft-synthesis/reality-governance/governance-policy.types';
import {
  applyAllocationLoads,
  arbitrateResourceClaims,
} from '../draft-synthesis/reality-governance';
import type { GovernanceTickResult } from '../draft-synthesis/reality-governance/allocation.types';
import { buildGovernanceTickWorldBusEvent } from '../draft-synthesis/reality-governance';
import { WorldBusService } from './world-bus.service';

/**
 * 现实治理：资源注册、声明仲裁、负载记账（内存骨架；生产接 Redis/分区锁）。
 * tick 结束可向 WorldBus 发射 GOVERNANCE_TICK，联动全局世界状态。
 */
@Injectable()
export class RealityGovernanceService {
  private readonly logger = new Logger(RealityGovernanceService.name);

  private resources = new Map<string, RealityResource>();

  upsertResource(r: RealityResource): void {
    this.resources.set(r.id, { ...r });
  }

  getResource(id: string): RealityResource | undefined {
    const x = this.resources.get(id);
    return x ? { ...x } : undefined;
  }

  snapshotResources(): Record<string, RealityResource> {
    return Object.fromEntries([...this.resources.entries()].map(([k, v]) => [k, { ...v }]));
  }

  constructor(@Optional() private readonly worldBus?: WorldBusService) {}

  /**
   * 提交一批竞争声明，按策略仲裁并更新负载。
   */
  runGovernanceTick(
    claims: ResourceClaim[],
    mode: GovernancePolicyMode,
    options?: { cityKey?: string },
  ): GovernanceTickResult {
    const outcomes = arbitrateResourceClaims(claims, this.resources, mode);
    const updated = applyAllocationLoads(this.resources, outcomes);
    this.resources = updated;

    const resourceSnapshots: GovernanceTickResult['resourceSnapshots'] = {};
    for (const [id, r] of this.resources) {
      resourceSnapshots[id] = { capacity: r.capacity, currentLoad: r.currentLoad };
    }

    const result = { outcomes, resourceSnapshots };

    if (this.worldBus) {
      try {
        this.worldBus.emit(
          buildGovernanceTickWorldBusEvent({
            result,
            mode,
            cityKey: options?.cityKey,
          }),
        );
      } catch (e: any) {
        this.logger.warn(`WorldBus GOVERNANCE_TICK emit failed: ${e?.message}`);
      }
    }

    return result;
  }
}
