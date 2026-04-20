import { Injectable } from '@nestjs/common';
import type { UserTravelProfile } from '../interfaces/user-travel-profile.interface';
import {
  createDefaultDecisionParams,
  normalizeDecisionParams,
  type DecisionParams,
} from '../interfaces/decision-params.interface';
import { ConflictResolverStrategy, type MemoryAtom } from '../strategies/conflict-resolver.strategy';
import { DecisionKnobRegistry, type KnobApplication } from '../registry/decision-knob.registry';

export interface DecisionParamsV2Result {
  params: DecisionParams;
  audit: KnobApplication[];
  contradictionScore?: number;
}

/**
 * V2 mapping: registry-driven mapping + conflict arbitration hook.
 *
 * Notes:
 * - For now, it treats UserTravelProfile as LONG_TERM atoms.
 * - Session atoms should be provided by signal extractors (future).
 * - This is feature-flagged by the injector; default behavior remains unchanged when disabled.
 */
@Injectable()
export class DecisionParamsMappingV2Service {
  private readonly resolver = new ConflictResolverStrategy();
  private readonly registry = new DecisionKnobRegistry();

  constructor() {
    // Register knobs. Keep deterministic + auditable.
    this.registry.register<'SLOW' | 'FAST' | 'MODERATE'>('pacePreference', ({ params, atom, strength01, audit }) => {
      if (atom.value === 'SLOW') {
        params.constraints.bufferTimeMin = (params.constraints.bufferTimeMin || 15) + 60 * strength01;
        params.strategyPreference.abuWeight += 0.2 * strength01;
        params.repairPolicy.preferRestDay = true;
        params.repairPolicy.preferSplitDays = true;
        audit.push({ key: 'pacePreference', reason: 'PACE_SLOW', strength01 });
      } else if (atom.value === 'FAST') {
        params.constraints.bufferTimeMin = Math.max(5, (params.constraints.bufferTimeMin || 15) - 10 * strength01);
        params.strategyPreference.drDreWeight += 0.15 * strength01;
        params.routeDirectionBias.difficultyWeight += 0.2 * strength01;
        audit.push({ key: 'pacePreference', reason: 'PACE_FAST', strength01 });
      }
    });

    this.registry.register<'LOW' | 'MEDIUM' | 'HIGH'>('altitudeTolerance', ({ params, atom, strength01, audit }) => {
      if (atom.value === 'LOW') {
        params.constraints.maxElevationM = 3500;
        params.constraints.avoidRapidAscent = true;
        params.constraints.maxDailyAscentM = 500 * strength01;
        audit.push({ key: 'altitudeTolerance', reason: 'ALTITUDE_LOW', strength01 });
      } else if (atom.value === 'MEDIUM') {
        params.constraints.maxElevationM = 4500;
        params.constraints.maxDailyAscentM = 800 * strength01;
        audit.push({ key: 'altitudeTolerance', reason: 'ALTITUDE_MEDIUM', strength01 });
      } else if (atom.value === 'HIGH') {
        params.constraints.maxElevationM = 6000;
        params.constraints.maxDailyAscentM = 1200 * strength01;
        audit.push({ key: 'altitudeTolerance', reason: 'ALTITUDE_HIGH', strength01 });
      }
    });

    this.registry.register<'LOW' | 'MEDIUM' | 'HIGH'>('riskTolerance', ({ params, atom, strength01, audit }) => {
      if (atom.value === 'LOW') {
        params.routeDirectionBias.stabilityWeight += 0.3 * strength01;
        params.strategyPreference.abuWeight += 0.3 * strength01;
        params.repairPolicy.preferAltRoute = true;
        audit.push({ key: 'riskTolerance', reason: 'RISK_LOW', strength01 });
      } else if (atom.value === 'HIGH') {
        params.routeDirectionBias.adventureWeight += 0.3 * strength01;
        params.routeDirectionBias.difficultyWeight += 0.2 * strength01;
        params.strategyPreference.neptuneWeight += 0.2 * strength01;
        audit.push({ key: 'riskTolerance', reason: 'RISK_HIGH', strength01 });
      }
    });

    this.registry.register<'SCENIC' | 'ADVENTURE' | 'RELAXED'>('travelPhilosophy', ({ params, atom, strength01, audit }) => {
      if (atom.value === 'SCENIC') {
        params.routeDirectionBias.sceneryWeight += 0.4 * strength01;
        params.routeDirectionBias.difficultyWeight -= 0.2 * strength01;
        audit.push({ key: 'travelPhilosophy', reason: 'PHILOSOPHY_SCENIC', strength01 });
      } else if (atom.value === 'ADVENTURE') {
        params.routeDirectionBias.adventureWeight += 0.4 * strength01;
        params.routeDirectionBias.difficultyWeight += 0.3 * strength01;
        params.routeDirectionBias.stabilityWeight -= 0.2 * strength01;
        audit.push({ key: 'travelPhilosophy', reason: 'PHILOSOPHY_ADVENTURE', strength01 });
      } else if (atom.value === 'RELAXED') {
        params.routeDirectionBias.stabilityWeight += 0.3 * strength01;
        params.routeDirectionBias.difficultyWeight -= 0.3 * strength01;
        params.repairPolicy.preferRestDay = true;
        audit.push({ key: 'travelPhilosophy', reason: 'PHILOSOPHY_RELAXED', strength01 });
      }
    });
  }

  map(profile: UserTravelProfile): DecisionParamsV2Result {
    const params = createDefaultDecisionParams();
    const audit: KnobApplication[] = [];

    // Keep parity with legacy mapper:
    // - confidenceMultiplier is discrete: <0.5 => 0.5 else 1.0
    const confidenceMultiplier = profile.confidence < 0.5 ? 0.5 : 1.0;

    // LONG_TERM atoms (session atoms will be added later)
    const nowIso = (profile.updatedAt ?? new Date()).toISOString();
    const atomBase = {
      scope: 'LONG_TERM' as const,
      confidence: profile.confidence,
      updatedAt: nowIso,
      halfLifeDays: 365,
      provenance: { source: 'user_travel_profile' },
    };

    let contradictionScore: number | undefined;
    const applyAtom = <T>(key: Parameters<DecisionKnobRegistry['apply']>[0], longTerm?: MemoryAtom<T>) => {
      if (!longTerm) return;
      const res = this.resolver.resolve({ longTerm });
      contradictionScore = Math.max(contradictionScore ?? 0, res?.contradictionScore ?? 0);
      // Strength is the legacy confidenceMultiplier to preserve behavior exactly.
      const strength01 = confidenceMultiplier;
      this.registry.apply(key as any, { params, atom: res?.winner ?? longTerm, strength01, audit });
    };

    applyAtom('pacePreference', profile.pacePreference ? ({ ...atomBase, value: profile.pacePreference } as any) : undefined);
    applyAtom(
      'altitudeTolerance',
      profile.altitudeTolerance ? ({ ...atomBase, value: profile.altitudeTolerance } as any) : undefined,
    );
    applyAtom('riskTolerance', profile.riskTolerance ? ({ ...atomBase, value: profile.riskTolerance } as any) : undefined);
    applyAtom(
      'travelPhilosophy',
      profile.travelPhilosophy ? ({ ...atomBase, value: profile.travelPhilosophy } as any) : undefined,
    );

    return { params: normalizeDecisionParams(params), audit, contradictionScore };
  }

  /**
   * V2 merge: keep parity with UserProfileMapperService.mergeDecisionParams().
   */
  mergeDecisionParams(paramsList: DecisionParams[]): DecisionParams {
    if (paramsList.length === 0) {
      return createDefaultDecisionParams();
    }

    if (paramsList.length === 1) {
      return paramsList[0];
    }

    const merged = createDefaultDecisionParams();

    // Merge RouteDirection weights by average
    for (const p of paramsList) {
      merged.routeDirectionBias.difficultyWeight += p.routeDirectionBias.difficultyWeight;
      merged.routeDirectionBias.sceneryWeight += p.routeDirectionBias.sceneryWeight;
      merged.routeDirectionBias.adventureWeight += p.routeDirectionBias.adventureWeight;
      merged.routeDirectionBias.stabilityWeight += p.routeDirectionBias.stabilityWeight;
    }
    const count = paramsList.length;
    merged.routeDirectionBias.difficultyWeight /= count;
    merged.routeDirectionBias.sceneryWeight /= count;
    merged.routeDirectionBias.adventureWeight /= count;
    merged.routeDirectionBias.stabilityWeight /= count;

    // Merge strategy weights by average
    for (const p of paramsList) {
      merged.strategyPreference.abuWeight += p.strategyPreference.abuWeight;
      merged.strategyPreference.drDreWeight += p.strategyPreference.drDreWeight;
      merged.strategyPreference.neptuneWeight += p.strategyPreference.neptuneWeight;
    }
    merged.strategyPreference.abuWeight /= count;
    merged.strategyPreference.drDreWeight /= count;
    merged.strategyPreference.neptuneWeight /= count;

    // Merge constraints: strictest values
    for (const p of paramsList) {
      if (p.constraints.maxElevationM) {
        if (!merged.constraints.maxElevationM || p.constraints.maxElevationM < merged.constraints.maxElevationM) {
          merged.constraints.maxElevationM = p.constraints.maxElevationM;
        }
      }
      if (p.constraints.maxDailyAscentM) {
        if (!merged.constraints.maxDailyAscentM || p.constraints.maxDailyAscentM < merged.constraints.maxDailyAscentM) {
          merged.constraints.maxDailyAscentM = p.constraints.maxDailyAscentM;
        }
      }
      if (p.constraints.bufferTimeMin) {
        if (!merged.constraints.bufferTimeMin || p.constraints.bufferTimeMin > merged.constraints.bufferTimeMin) {
          merged.constraints.bufferTimeMin = p.constraints.bufferTimeMin;
        }
      }
      if (p.constraints.avoidRapidAscent) {
        merged.constraints.avoidRapidAscent = true;
      }
    }

    // Merge repair policy: OR
    merged.repairPolicy.preferSplitDays = paramsList.some((p) => p.repairPolicy.preferSplitDays);
    merged.repairPolicy.preferAltRoute = paramsList.some((p) => p.repairPolicy.preferAltRoute);
    merged.repairPolicy.preferRestDay = paramsList.some((p) => p.repairPolicy.preferRestDay);

    return normalizeDecisionParams(merged);
  }
}

