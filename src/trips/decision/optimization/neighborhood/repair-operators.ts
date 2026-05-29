import type { RoutePlanDraft } from '../../shared/world-model.types';
import type { ConstraintRelaxation } from '../../../../decision/kernel/decision-state.types';
import { NeighborhoodOperators, type NeighborhoodVariant } from './neighborhood-operators';
import {
  applyTopologyMutation,
  isTopologyMutationViolation,
  REPAIR_SPATIAL_POI_V2_ID,
  type TopologyMutationContext,
} from '../../constraint-graph/topology-mutation.util';

export interface RepairResult extends NeighborhoodVariant {
  /** Which violation codes this repair targets. */
  targets: string[];
  /** Stable candidate id override (e.g. repair-spatial-poi-v2) */
  candidateId?: string;
}

/**
 * Minimal repair operators (G1 skeleton).
 *
 * These are intentionally lightweight and operate only on RoutePlanDraft structure.
 * They should be upgraded to time-window/POI graph edits once segments carry richer semantics.
 */
export class RepairOperators {
  private readonly ops = new NeighborhoodOperators();

  repairForViolationCodes(
    plan: RoutePlanDraft,
    violationCodes: string[],
    violationDetails?: Array<{
      type: string;
      severity: 'HARD' | 'SOFT';
      details?: Record<string, any>;
      activityId?: string;
    }>,
    topologyContext?: TopologyMutationContext,
  ): RepairResult[] {
    const codes = violationCodes.map((c) => String(c || '').toUpperCase());
    const out: RepairResult[] = [];

    // PR-3: spatial POI topology mutation (Ring vs F208)
    if (topologyContext && isTopologyMutationViolation(codes)) {
      const mutation = applyTopologyMutation(plan, topologyContext);
      if (mutation) {
        out.push({
          id: REPAIR_SPATIAL_POI_V2_ID,
          candidateId: REPAIR_SPATIAL_POI_V2_ID,
          plan: mutation.plan,
          summary: mutation.summary,
          targets: codes.filter((c) => isTopologyMutationViolation([c])),
          relaxations: [
            {
              id: 'relax-topology-ring-bypass',
              constraintType: 'ROAD_CLOSED',
              severity: 'SOFT',
              degree: 0.15,
              reason: 'F-road 封路后采用环岛 continuity 拓扑变异（PR-3）',
            },
          ],
        });
      }
    }

    // TIME / schedule window / connectivity
    if (
      codes.some((c) =>
        [
          'TIME_WINDOW_VIOLATION',
          'CONNECTIVITY_INSUFFICIENT_TIME',
          'MAX_DAILY_DRIVE_EXCEEDED',
        ].includes(c),
      )
    ) {
      out.push(this.asRepair(this.ops.paceDown(plan, 2), ['CONNECTIVITY_INSUFFICIENT_TIME', 'MAX_DAILY_DRIVE_EXCEEDED']));
      out.push(this.asRepair(this.ops.spreadAcrossDays(plan, 2), ['CONNECTIVITY_INSUFFICIENT_TIME', 'MAX_DAILY_DRIVE_EXCEEDED']));
      out.push(this.asRepair(this.ops.ensureConnectivityBuffer(plan, 10), ['CONNECTIVITY_INSUFFICIENT_TIME']));
      out.push(this.asRepair(this.ops.ensureConnectivityBuffer(plan, 20), ['CONNECTIVITY_INSUFFICIENT_TIME']));
      out.push(this.asRepair(this.ops.shiftDayStart(plan, '10:00', 60), ['TIME_WINDOW_VIOLATION']));
      out.push(this.asRepair(this.ops.shiftDayStart(plan, '11:00', 60), ['TIME_WINDOW_VIOLATION']));

      // Window alignment repair: if we have opening windows, align the affected POI slot to the first window.
      const tw = (violationDetails ?? []).find((v) => String(v.type).toUpperCase() === 'TIME_WINDOW_VIOLATION');
      const openingWindows = tw?.details?.openingWindows;
      const activityId = tw?.activityId;
      if (activityId && Array.isArray(openingWindows) && openingWindows.length > 0) {
        const first = String(openingWindows[0] ?? '');
        const m = first.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
        if (m) {
          out.push(
            this.asRepair(
              this.ops.alignPoiToTimeWindow(plan, activityId, m[1], m[2]),
              ['TIME_WINDOW_VIOLATION'],
            ),
          );
        }
      }
    }

    // ROAD closed / blocked (current checker uses weather/drive/connectivity; road closure comes from other sources)
    if (codes.some((c) => ['ROAD_CLOSED', 'ROAD_CLOSURE', 'ROAD_BLOCKED'].includes(c))) {
      out.push(this.asRepair(this.ops.shrinkScale(plan, 0.65), ['ROAD_CLOSED']));
      out.push(this.asRepair(this.ops.spreadAcrossDays(plan, 3), ['ROAD_CLOSED']));
    }

    // Weather unsafe
    if (codes.some((c) => ['WEATHER_UNSAFE', 'WEATHER_STORM', 'WEATHER_UNSAFE_GLOBAL'].includes(c))) {
      out.push(this.asRepair(this.ops.paceDown(plan, 2), ['WEATHER_UNSAFE']));
      out.push(this.asRepair(this.ops.shrinkScale(plan, 0.8), ['WEATHER_UNSAFE']));
    }

    // RouteDirection hard constraints (from RouteDirectionConstraintsService)
    if (codes.some((c) => ['RAPID_ASCENT_VIOLATION', 'SLOPE_VIOLATION', 'PERMIT_REQUIRED'].includes(c))) {
      out.push(this.asRepair(this.ops.reduceEffort(plan, 0.35), ['RAPID_ASCENT_VIOLATION', 'SLOPE_VIOLATION']));
      out.push(this.asRepair(this.ops.shrinkScale(plan, 0.8), ['RAPID_ASCENT_VIOLATION', 'SLOPE_VIOLATION', 'PERMIT_REQUIRED']));
    }

    // Generic safety bucket (legacy / future)
    if (codes.some((c) => ['HAZARD_ZONE', 'DEM_VIOLATION', 'SAFETY_VIOLATION'].includes(c))) {
      out.push(this.asRepair(this.ops.reduceEffort(plan, 0.35), ['HAZARD_ZONE', 'DEM_VIOLATION', 'SAFETY_VIOLATION']));
      out.push(this.asRepair(this.ops.shrinkScale(plan, 0.8), ['HAZARD_ZONE', 'DEM_VIOLATION', 'SAFETY_VIOLATION']));
    }

    // Dedup by id.
    const seen = new Set<string>();
    return out.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }

  private asRepair(v: NeighborhoodVariant, targets: string[], extraRelaxations?: ConstraintRelaxation[]): RepairResult {
    return {
      ...v,
      targets,
      relaxations: [...(v.relaxations ?? []), ...(extraRelaxations ?? [])],
    };
  }
}

