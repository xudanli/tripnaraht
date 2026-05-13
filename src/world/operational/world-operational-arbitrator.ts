/**
 * WorldOperationalArbitrator — constraint arbiter over OperationalWorldState + typed slices + route/vehicle.
 * Produces a single execution judgment (not another information blob).
 */

import { Injectable } from '@nestjs/common';
import {
  OperationalSeverity,
  maxOperationalSeverity,
  type OperationalSlice,
} from '../contracts/operational-severity.contract';
import type { OperationalWorldState } from '../../skills/runtime-os/types/runtime-os.types';

export type OperationalExecutionStatus = 'safe' | 'caution' | 'dangerous' | 'blocked';

export interface OperationalArbitration {
  executionStatus: OperationalExecutionStatus;
  blockingReasons: string[];
  recommendedActions: string[];
  enforcedPolicies: string[];
  confidence: number;
  /** Worst normalized severity before route/vehicle modifiers (audit). */
  rawSeverity: OperationalSeverity;
}

export interface WorldOperationalArbitrationInput {
  operationalWorldState: OperationalWorldState;
  operationalSlices: OperationalSlice[];
  route?: { includesFRoad?: boolean; includesHighlands?: boolean };
  vehiclePolicy?: { drivetrain?: '2WD' | '4WD' | 'AWD' | 'unknown'; camper?: boolean };
}

@Injectable()
export class WorldOperationalArbitrator {
  arbitrate(input: WorldOperationalArbitrationInput): OperationalArbitration {
    const { operationalWorldState: ows, operationalSlices, route, vehiclePolicy } = input;

    let maxSev = this.severityFromOperationalWorldState(ows);
    const blockingReasons: string[] = [];
    const recommendedActions: string[] = [];
    const enforcedPolicies: string[] = [];

    for (const sl of operationalSlices) {
      if (sl.freshness === 'expired') {
        maxSev = maxOperationalSeverity(maxSev, OperationalSeverity.CAUTION);
        recommendedActions.push(`refresh_stale_slice:${sl.type}`);
      } else if (sl.freshness === 'stale') {
        maxSev = maxOperationalSeverity(maxSev, OperationalSeverity.CAUTION);
        recommendedActions.push(`revalidate_slice:${sl.type}`);
      }
      maxSev = maxOperationalSeverity(maxSev, sl.severity);
      if (sl.severity === OperationalSeverity.BLOCKED) {
        blockingReasons.push(...(sl.reasonCodes ?? [`slice:${sl.type}`]));
      }
    }

    if (ows.blockingFactors?.length) {
      for (const b of ows.blockingFactors) {
        blockingReasons.push(`world:${b}`);
      }
    }

    // Vehicle × route hard constraints
    if (route?.includesFRoad && vehiclePolicy?.drivetrain === '2WD') {
      maxSev = OperationalSeverity.BLOCKED;
      blockingReasons.push('vehicle:2wd_incompatible_with_f_route');
      enforcedPolicies.push('deny_f_road_segments_until_vehicle_upgraded');
    }

    if (route?.includesHighlands && vehiclePolicy?.drivetrain === '2WD') {
      maxSev = maxOperationalSeverity(maxSev, OperationalSeverity.DANGEROUS);
      blockingReasons.push('vehicle:2wd_on_highlands_route');
      enforcedPolicies.push('require_4wd_or_remove_highlands_segments');
    }

    // Camper × elevated wind / weather (from world summary strings)
    if (vehiclePolicy?.camper && ows.warnings?.some((w) => /high_wind|wind/i.test(w))) {
      maxSev = maxOperationalSeverity(maxSev, OperationalSeverity.CAUTION);
      enforcedPolicies.push('reduce_exposed_segments_and_monitor_crosswind_for_camper');
    }

    const executionStatus = this.toExecutionStatus(maxSev);
    if (executionStatus === 'blocked') {
      recommendedActions.push('halt_automated_execution_until_blockers_cleared');
    } else if (executionStatus === 'dangerous') {
      recommendedActions.push('require_human_ack_and_tighten_operating_envelope');
    } else if (executionStatus === 'caution') {
      recommendedActions.push('apply_conservative_defaults_and_recheck_before_long_legs');
    }

    const confidence = this.computeConfidence(ows, operationalSlices);

    return {
      executionStatus,
      blockingReasons: [...new Set(blockingReasons)],
      recommendedActions: [...new Set(recommendedActions)],
      enforcedPolicies: [...new Set(enforcedPolicies)],
      confidence,
      rawSeverity: maxSev,
    };
  }

  private severityFromOperationalWorldState(ows: OperationalWorldState): OperationalSeverity {
    if (ows.blockingFactors?.length) {
      return OperationalSeverity.BLOCKED;
    }
    if (ows.operationalRisk === 'high') {
      return OperationalSeverity.DANGEROUS;
    }
    if (ows.operationalRisk === 'medium') {
      return OperationalSeverity.WARNING;
    }
    return OperationalSeverity.INFO;
  }

  private toExecutionStatus(s: OperationalSeverity): OperationalExecutionStatus {
    if (s === OperationalSeverity.BLOCKED) return 'blocked';
    if (s === OperationalSeverity.DANGEROUS) return 'dangerous';
    if (s === OperationalSeverity.WARNING || s === OperationalSeverity.CAUTION) return 'caution';
    return 'safe';
  }

  private computeConfidence(ows: OperationalWorldState, slices: OperationalSlice[]): number {
    let c = ows.confidence ?? 0.7;
    if (slices.some((s) => s.freshness === 'expired')) {
      c *= 0.75;
    } else if (slices.some((s) => s.freshness === 'stale')) {
      c *= 0.88;
    }
    if (slices.some((s) => s.confidence != null && s.confidence < 0.5)) {
      c *= 0.9;
    }
    return Math.max(0.08, Math.min(0.99, c));
  }
}
