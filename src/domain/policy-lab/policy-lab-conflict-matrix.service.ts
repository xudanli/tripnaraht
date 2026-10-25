/**
 * Policy Lab CONFLICT_MATRIX — shared load + evaluate (SSOT read path).
 * Admin writes via /admin/physical-domain/policy/constraints; runtime reads here.
 */

import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  evaluateConflictMatrix,
  type ConflictMatrixHit,
  type ConflictMatrixRule,
} from '../../trips/decision/shared/conflict-matrix.util';
import {
  buildFactsFromPhysicalWorld,
  extractPhysicalFromResearchData,
  extractPhysicalFromWorldState,
  type PolicyLabPhysicalWorldInput,
} from './policy-lab-conflict-matrix.facts.util';
import {
  DRIVE_SAFETY_RULE_ID,
  WIND_SPEED_DRIVE_LIMIT_RULE_ID,
  resolveDriveSafetyThresholdMpsFromConfig,
} from './policy-lab-drive-safety.util';
import { driveSafetyWindThresholdMps as driveSafetyWindThresholdMpsFallback } from '../../trips/ontology/environment/weather.schema';

export const POLICY_LAB_CONFLICT_MATRIX_FALLBACK_RULES: ConflictMatrixRule[] = [
  {
    id: 'froad_low_visibility_hard_block_v1',
    conditions: ['segment.type = F_ROAD', 'weather.visibilityMeters < 100'],
    effect: 'HARD_BLOCK',
    priority: 100,
  },
  {
    id: 'froad_snow_depth_hard_block_v1',
    conditions: ['segment.type = F_ROAD', 'weather.snowDepthCm > 10'],
    effect: 'HARD_BLOCK',
    priority: 92,
  },
  {
    id: 'wind_small_car_hard_block_v1',
    conditions: ['weather.windSpeedKph > 50', 'vehicle.type = SMALL_CAR'],
    effect: 'HARD_BLOCK',
    priority: 95,
  },
  {
    id: 'heavy_rain_high_confidence_reroute_v1',
    conditions: ['weather.precipitationMm > 10', 'weather.confidenceScore > 0.85'],
    effect: 'RE_ROUTE',
    priority: 80,
  },
];

@Injectable()
export class PolicyLabConflictMatrixService {
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async loadEnabledConflictMatrixRules(): Promise<ConflictMatrixRule[]> {
    if (!this.prisma) return [...POLICY_LAB_CONFLICT_MATRIX_FALLBACK_RULES];
    try {
      const rows = await (this.prisma as any).physicalDomainConstraintConfig.findMany({
        where: { enabled: true },
        orderBy: [{ updatedAt: 'desc' }],
        take: 200,
      });
      const out: ConflictMatrixRule[] = [];
      for (const row of rows) {
        const p = row.params as any;
        if (!p || typeof p !== 'object') continue;
        const kind = String(p.kind ?? p.type ?? '').toUpperCase();
        if (kind !== 'CONFLICT_MATRIX') continue;
        const effect = String(p.effect ?? '').toUpperCase();
        if (!['HARD_BLOCK', 'WARNING', 'RE_ROUTE', 'SPEED_FACTOR_DOWN'].includes(effect)) continue;
        const conditions = Array.isArray(p.conditions)
          ? p.conditions.map((x: any) => String(x)).filter(Boolean)
          : [];
        if (conditions.length === 0) continue;
        const priority = Number.isFinite(Number(p.priority)) ? Number(p.priority) : 0;
        out.push({
          id: row.ruleId,
          conditions,
          effect: effect as ConflictMatrixRule['effect'],
          priority,
        });
      }
      return out.length > 0 ? out : [...POLICY_LAB_CONFLICT_MATRIX_FALLBACK_RULES];
    } catch {
      return [...POLICY_LAB_CONFLICT_MATRIX_FALLBACK_RULES];
    }
  }

  buildFacts(input: PolicyLabPhysicalWorldInput): Record<string, unknown> {
    return buildFactsFromPhysicalWorld(input);
  }

  async evaluate(facts: Record<string, unknown>): Promise<ConflictMatrixHit[]> {
    const rules = await this.loadEnabledConflictMatrixRules();
    return evaluateConflictMatrix({ rules, facts });
  }

  async evaluatePhysicalWorld(input: PolicyLabPhysicalWorldInput): Promise<ConflictMatrixHit[]> {
    return this.evaluate(this.buildFacts(input));
  }

  async evaluateFromResearchData(
    researchData: Record<string, any> | undefined,
    tripRequest?: any,
  ): Promise<ConflictMatrixHit[]> {
    return this.evaluatePhysicalWorld(extractPhysicalFromResearchData(researchData, tripRequest));
  }

  async evaluateFromWorldState(input: {
    worldState?: any;
    plan?: any;
    vehicleType?: string;
    timeISO?: string;
  }): Promise<ConflictMatrixHit[]> {
    return this.evaluatePhysicalWorld(extractPhysicalFromWorldState(input));
  }

  /**
   * Resolve drive-safety wind threshold (m/s) from Policy Lab config.
   * Prefers `drive_safety_v1`, then legacy `wind_speed_drive_limit_v1`, else code fallback.
   */
  async resolveDriveSafetyWindThresholdMps(vehicleType: unknown): Promise<number> {
    if (!this.prisma) return driveSafetyWindThresholdMpsFallback(vehicleType);
    try {
      const primary = await (this.prisma as any).physicalDomainConstraintConfig.findUnique({
        where: { ruleId: DRIVE_SAFETY_RULE_ID },
      });
      if (primary) {
        return resolveDriveSafetyThresholdMpsFromConfig(primary, vehicleType);
      }
      const legacy = await (this.prisma as any).physicalDomainConstraintConfig.findUnique({
        where: { ruleId: WIND_SPEED_DRIVE_LIMIT_RULE_ID },
      });
      if (legacy) {
        return resolveDriveSafetyThresholdMpsFromConfig(legacy, vehicleType);
      }
    } catch {
      // fall through
    }
    return driveSafetyWindThresholdMpsFallback(vehicleType);
  }
}
