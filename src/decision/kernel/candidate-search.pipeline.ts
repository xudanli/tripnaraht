import type { DecisionState } from './decision-state.types';
import type { ConstraintRelaxation } from './decision-state.types';
import type { CandidateSearchAudit } from './decision-state.types';
import type { CGUSCandidate } from '../../trips/decision/optimization/cgus-search.service';
import type { RoutePlanDraft } from '../../trips/decision/shared/world-model.types';
import { PlanFeaturesService } from '../../trips/decision/optimization/plan-features/plan-features.service';
import { NeighborhoodOperators } from '../../trips/decision/optimization/neighborhood/neighborhood-operators';
import { RepairOperators } from '../../trips/decision/optimization/neighborhood/repair-operators';
import { ExposureAnnotationService } from '../../trips/decision/optimization/plan-features/exposure-annotation.service';
import {
  decisionStateToTripWorldState,
  itineraryToRoutePlanDraft,
  resolveKernelTripIdHint,
} from './dso-to-trips-converter';
import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';
import { convertRoutePlanDraftToTripPlan } from '../../trips/decision/tot/plan-converter';
import { ConstraintEngineService } from '../../trips/decision/constraints/constraint-engine.service';

export interface CandidateSearchOptions {
  /** Max candidates returned to CGUS */
  maxCandidates: number;
  /** How many repair iterations for infeasible candidates */
  repairMaxIters: number;
  /** Max repair variants per infeasible candidate per iteration */
  repairTopKPerCandidate?: number;
  /** Per-iteration cap on newly added candidates (repairs) */
  maxNewCandidatesPerIter?: number;
  /** Stop early if we already have this many feasible candidates */
  stopWhenFeasibleCount?: number;
  /** Hard cap for pool size to avoid explosion */
  maxPoolSize?: number;
}

export interface CandidateSearchCandidate extends CGUSCandidate {
  relaxations?: ConstraintRelaxation[];
  summary?: string;
  diversitySignature: string;
  violationDetails?: Array<{
    type: string;
    severity: 'HARD' | 'SOFT';
    degree: number;
    detail: string;
    slotId?: string;
    activityId?: string;
    details?: Record<string, any>;
    suggestions?: string[];
  }>;
}

export interface CandidateSearchPipelineResult {
  candidates: CandidateSearchCandidate[];
  audit: CandidateSearchAudit;
}

/**
 * G1 skeleton: generate → constraint-project → repair (1-2 iters) → select diverse Top-N.
 *
 * Note: constraint evaluation is delegated to trips `ConstraintEngineService`.
 */
export class CandidateSearchPipeline {
  private readonly ops = new NeighborhoodOperators();
  private readonly repairOps = new RepairOperators();

  constructor(
    private readonly planFeatures: PlanFeaturesService,
    private readonly constraintEngine: ConstraintEngineService,
    private readonly exposureAnnotation?: ExposureAnnotationService,
  ) {}

  async buildCandidatesFromItinerary(
    state: DecisionState,
    planDraft: Itinerary,
    routeDirectionId: string,
    tripId: string,
    options: CandidateSearchOptions,
  ): Promise<CandidateSearchPipelineResult> {
    const basePlan = itineraryToRoutePlanDraft(planDraft, tripId, routeDirectionId) as RoutePlanDraft;
    const initialVariants = this.ops.generateAll(basePlan);
    const audit: CandidateSearchAudit = {
      budget: {
        maxCandidates: options.maxCandidates,
        repairMaxIters: options.repairMaxIters,
        repairTopKPerCandidate: options.repairTopKPerCandidate ?? 2,
        maxNewCandidatesPerIter: options.maxNewCandidatesPerIter ?? 30,
        maxPoolSize: options.maxPoolSize ?? 200,
        stopWhenFeasibleCount: options.stopWhenFeasibleCount ?? options.maxCandidates,
      },
      initialVariantCount: initialVariants.length,
      iterations: [],
      finalCandidateCount: 0,
      finalFeasibleCount: 0,
      stopReason: 'COMPLETED',
    };

    const dayIndexToDate: Record<number, string> = {};
    for (let i = 0; i < (planDraft.days?.length ?? 0); i++) {
      const d = String(planDraft.days[i]?.date ?? '').slice(0, 10);
      if (d) dayIndexToDate[i] = d;
    }

    let pool: CandidateSearchCandidate[] = initialVariants.map((v) => ({
      id: `plan-${v.id}`,
      plan: v.plan,
      feasible: true,
      constraintViolations: [],
      relaxations: v.relaxations,
      summary: v.summary,
      diversitySignature: this.planFeatures.extract(v.plan).diversitySignature,
    }));

    const tripWorldState = decisionStateToTripWorldState(state, {
      prismaTripId: resolveKernelTripIdHint(state),
    });
    if (this.exposureAnnotation) {
      pool = pool.map((c) => ({
        ...c,
        plan: this.exposureAnnotation!.annotatePlan(c.plan, tripWorldState, dayIndexToDate),
      }));
    }

    const project = async (c: CandidateSearchCandidate): Promise<CandidateSearchCandidate> => {
      const tripPlan = convertRoutePlanDraftToTripPlan(c.plan, tripWorldState);
      const feasibility = await this.constraintEngine.isFeasible(tripWorldState, tripPlan);
      const mapped = feasibility.violations.map((v) => ({
        type: v.code,
        severity: (v.severity === 'error' ? 'HARD' : 'SOFT') as 'HARD' | 'SOFT',
        degree: v.severity === 'error' ? 1 : v.severity === 'warning' ? 0.5 : 0.2,
        detail: v.message,
        slotId: (v as any).slotId,
        activityId: (v as any).activityId,
        details: (v as any).details,
        suggestions: (v as any).suggestions,
      }));
      return {
        ...c,
        feasible: feasibility.feasible,
        constraintViolations: mapped.map(({ type, severity, degree }) => ({ type, severity, degree })),
        violationDetails: mapped,
      };
    };

    // Iterative repair loop (bounded).
    for (let iter = 0; iter <= Math.max(0, options.repairMaxIters); iter++) {
      const poolSizeBeforeProjection = pool.length;
      pool = await Promise.all(pool.map(project));

      const feasibleCount = pool.filter((c) => c.feasible).length;
      const infeasibleCount = Math.max(0, pool.length - feasibleCount);
      const stopFeasible = Math.max(0, options.stopWhenFeasibleCount ?? options.maxCandidates);
      if (feasibleCount >= stopFeasible) {
        audit.iterations.push({
          iter,
          poolSizeBeforeProjection,
          feasibleCountAfterProjection: feasibleCount,
          infeasibleCountAfterProjection: infeasibleCount,
          repairsGenerated: 0,
          repairsAccepted: 0,
          poolSizeAfterDedup: pool.length,
        });
        audit.stopReason = 'FEASIBLE_TARGET_REACHED';
        break;
      }

      if (iter >= options.repairMaxIters) {
        audit.iterations.push({
          iter,
          poolSizeBeforeProjection,
          feasibleCountAfterProjection: feasibleCount,
          infeasibleCountAfterProjection: infeasibleCount,
          repairsGenerated: 0,
          repairsAccepted: 0,
          poolSizeAfterDedup: pool.length,
        });
        audit.stopReason = 'REPAIR_ITER_LIMIT';
        break;
      }

      const nextPool: CandidateSearchCandidate[] = [...pool];
      const topK = Math.max(1, Math.min(5, options.repairTopKPerCandidate ?? 2));
      const maxNew = Math.max(1, Math.min(200, options.maxNewCandidatesPerIter ?? 30));
      const maxPoolSize = Math.max(options.maxCandidates, options.maxPoolSize ?? 200);
      let newAdded = 0;
      let repairsGenerated = 0;
      let breakReason: CandidateSearchAudit['stopReason'] | undefined;
      for (const c of pool) {
        if (c.feasible) continue;
        const hardCodes =
          c.violationDetails?.filter((v) => v.severity === 'HARD').map((v) => v.type) ?? [];
        if (hardCodes.length === 0) continue;
        const repairs = this.repairOps.repairForViolationCodes(c.plan, hardCodes, c.violationDetails);
        repairsGenerated += repairs.length;

        // Rank repairs by (1) targeted violation type match, (2) structure improvement,
        // then keep Top-K to control candidate explosion.
        const targetMatchScore = (targets: string[], codes: string[]) => {
          const s = new Set(targets.map((t) => String(t || '').toUpperCase()));
          const cset = new Set(codes.map((c) => String(c || '').toUpperCase()));

          let score = 0;
          // Strong matches
          if (cset.has('TIME_WINDOW_VIOLATION') && s.has('TIME_WINDOW_VIOLATION')) score += 3.2;
          else if (cset.has('TIME_WINDOW_VIOLATION') && (s.has('TIME') || s.has('CONNECTIVITY_INSUFFICIENT_TIME') || s.has('MAX_DAILY_DRIVE_EXCEEDED'))) score += 1.2;

          if (cset.has('CONNECTIVITY_INSUFFICIENT_TIME') && s.has('CONNECTIVITY_INSUFFICIENT_TIME')) score += 2.6;
          else if (cset.has('CONNECTIVITY_INSUFFICIENT_TIME') && (s.has('TIME') || s.has('MAX_DAILY_DRIVE_EXCEEDED'))) score += 1.4;

          if (cset.has('MAX_DAILY_DRIVE_EXCEEDED') && s.has('MAX_DAILY_DRIVE_EXCEEDED')) score += 2.6;
          else if (cset.has('MAX_DAILY_DRIVE_EXCEEDED') && (s.has('TIME') || s.has('CONNECTIVITY_INSUFFICIENT_TIME'))) score += 1.4;

          if ((cset.has('WEATHER_UNSAFE') || cset.has('WEATHER_STORM')) && s.has('WEATHER_UNSAFE')) score += 2.8;
          else if ((cset.has('WEATHER_UNSAFE') || cset.has('WEATHER_STORM')) && s.has('WEATHER')) score += 2.0;
          if (
            (cset.has('RAPID_ASCENT_VIOLATION') || cset.has('SLOPE_VIOLATION') || cset.has('PERMIT_REQUIRED')) &&
            (s.has('RAPID_ASCENT_VIOLATION') || s.has('SLOPE_VIOLATION') || s.has('PERMIT_REQUIRED') || s.has('SAFETY'))
          ) {
            score += 2.0;
          }
          if (cset.has('ROAD_CLOSED') && s.has('ROAD_CLOSED')) score += 1.8;

          // Weak matches
          if (Array.from(s).some((t) => cset.has(t))) score += 0.8;
          return score;
        };

        const ranked = repairs
          .map((r) => {
            const f = this.planFeatures.extract(r.plan);
            const typeScore = targetMatchScore(r.targets, hardCodes);
            const structuralScore = -(0.6 * f.slackTightness01 + 0.4 * f.effort01); // higher is better (less tight/effort)
            const score = typeScore + structuralScore;
            return { r, score };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, topK);

        for (const { r } of ranked) {
          if (newAdded >= maxNew) {
            breakReason = 'MAX_NEW_CANDIDATES_REACHED';
            break;
          }
          if (nextPool.length >= maxPoolSize) {
            breakReason = 'MAX_POOL_SIZE_REACHED';
            break;
          }
          const plan = this.exposureAnnotation
            ? this.exposureAnnotation.annotatePlan(r.plan, tripWorldState, dayIndexToDate)
            : r.plan;
          nextPool.push({
            id: `plan-repair-${iter + 1}-${c.id}-${r.id}`,
            plan,
            feasible: true,
            constraintViolations: [],
            relaxations: [...(c.relaxations ?? []), ...(r.relaxations ?? [])],
            summary: `修复(${hardCodes.join(',')}): ${r.summary}`,
            diversitySignature: this.planFeatures.extract(plan).diversitySignature,
          });
          newAdded++;
        }
        if (newAdded >= maxNew || nextPool.length >= maxPoolSize) break;
      }
      // Dedup by diversity signature before next iteration to control explosion.
      const seen = new Set<string>();
      pool = nextPool.filter((x) => {
        const sig = x.diversitySignature ?? this.planFeatures.extract(x.plan).diversitySignature;
        x.diversitySignature = sig;
        if (seen.has(sig)) return false;
        seen.add(sig);
        return true;
      });

      // Hard cap: if still too large, keep a diverse subset to avoid ballooning.
      if (pool.length > maxPoolSize) {
        pool = this.selectDiverseTop(pool, maxPoolSize);
        breakReason = 'DIVERSITY_SELECTION';
      }
      audit.iterations.push({
        iter,
        poolSizeBeforeProjection,
        feasibleCountAfterProjection: feasibleCount,
        infeasibleCountAfterProjection: infeasibleCount,
        repairsGenerated,
        repairsAccepted: newAdded,
        poolSizeAfterDedup: pool.length,
      });
      if (breakReason) {
        audit.stopReason = breakReason;
      }
    }

    const candidates = this.selectDiverseTop(pool, options.maxCandidates);
    audit.finalCandidateCount = candidates.length;
    audit.finalFeasibleCount = candidates.filter((c) => c.feasible).length;
    if (audit.stopReason === 'COMPLETED' && candidates.length < pool.length) {
      audit.stopReason = 'DIVERSITY_SELECTION';
    }
    return { candidates, audit };
  }

  private selectDiverseTop(pool: CandidateSearchCandidate[], n: number): CandidateSearchCandidate[] {
    if (pool.length <= n) return pool;
    const feats = pool.map((c) => ({ c, f: this.planFeatures.extract(c.plan) }));
    const distance = (a: (typeof feats)[0], b: (typeof feats)[0]) => {
      const segA = a.f.segmentsCount;
      const segB = b.f.segmentsCount;
      const segNorm = Math.abs(segA - segB) / Math.max(1, Math.max(segA, segB));
      return (
        0.35 * segNorm +
        0.35 * Math.abs(a.f.slackTightness01 - b.f.slackTightness01) +
        0.3 * Math.abs(a.f.effort01 - b.f.effort01)
      );
    };

    const selected: typeof feats = [];
    const base = feats.find((x) => x.c.id === 'plan-base') ?? feats[0];
    if (base) selected.push(base);

    const minDist = 0.18;
    while (selected.length < n) {
      let best: (typeof feats)[0] | undefined;
      let bestScore = -Infinity;
      for (const cand of feats) {
        if (selected.includes(cand)) continue;
        const d = Math.min(...selected.map((s) => distance(cand, s)));
        const score = d + 0.02 * Math.min(10, cand.f.segmentsCount);
        if (score > bestScore) {
          bestScore = score;
          best = cand;
        }
      }
      if (!best) break;
      const d = Math.min(...selected.map((s) => distance(best!, s)));
      if (d < minDist) break;
      selected.push(best);
    }

    return selected.map((x) => x.c);
  }
}

