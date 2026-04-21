import type { BeliefStateSample } from './decision-state.types';
import type { ScenarioEdgeEvalInput } from './parallel-decision-kernel';
import { edgeRiskBreakdown, type RiskBreakdown } from './environmental-milp-builder';
import { explainEdgeRisk } from './risk-explanation.engine';

/**
 * What we predicted (before execution), at the edge level.
 * This is the "fact fingerprint" stored for audit + calibration.
 */
export type PredictedEdgeRiskFingerprint = {
  edgeId: string;
  breakdown: RiskBreakdown;
  primaryFactors: string[];
  bullets: string[];
};

/**
 * What actually happened (after execution), at the edge level.
 * Keep it minimal and extensible: it can be fed by GPS traces, manual check-ins, or incident reports.
 */
export type ObservedEdgeOutcome = {
  edgeId: string;
  /**
   * Observed average speed on this edge (km/h). Low speed is a proxy for terrain/water difficulty.
   * Optional because not all platforms provide reliable speed.
   */
  avgSpeedKmh?: number;
  /** Whether user reported/triggered a rescue/incident on this edge. */
  rescueTriggered?: boolean;
  /**
   * Observed water crossing depth (cm), if user/vehicle sensor provides it.
   * If missing, we can still use speed/incident as weak supervision.
   */
  observedWaterDepthCm?: number;
  /** Free-form notes (driver feedback). */
  notes?: string;
};

export type RiskFeedbackEvent = {
  itineraryId: string;
  planId?: string;
  at: string;
  alpha?: number;
  samplesUsed?: Array<Pick<BeliefStateSample, 'sampleId' | 'weight' | 'environmentSummary'>>;
  predicted: PredictedEdgeRiskFingerprint[];
  observed: ObservedEdgeOutcome[];
};

export type CalibrationSignal = {
  edgeId: string;
  factor: string;
  direction: 'INCREASE' | 'DECREASE';
  strength01: number;
  reason: string;
};

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Build predicted fingerprints for a given scenario (weatherRisk).
 * In practice you'll call this on the reduced set or on "representative" scenarios.
 */
export function buildPredictedEdgeFingerprints(params: {
  edges: ScenarioEdgeEvalInput[];
  weatherRisk01: number;
  windSpeedMs?: number;
}): PredictedEdgeRiskFingerprint[] {
  const out: PredictedEdgeRiskFingerprint[] = [];
  for (const e of params.edges) {
    const edgeId = String((e.edge as any).id ?? `${e.edge.from}__${e.edge.to}`);
    const roadOpen = e.roadOpenOverride01 ?? e.edge.road_open;
    const breakdown = edgeRiskBreakdown({ ...e.edge, road_open: roadOpen }, params.weatherRisk01);
    const exp = explainEdgeRisk({
      breakdown,
      edge: { ...e.edge, road_open: roadOpen },
      env: { weatherRisk01: params.weatherRisk01, windSpeedMs: params.windSpeedMs },
    });
    out.push({ edgeId, breakdown, primaryFactors: exp.primaryFactors, bullets: exp.bullets });
  }
  return out;
}

/**
 * Compare predicted vs observed, and produce calibration signals that can be used by flywheel:
 * - offline regression tests
 * - human-in-the-loop tuning of risk-config
 * - future automated weight updates
 */
export function deriveCalibrationSignals(params: {
  predicted: PredictedEdgeRiskFingerprint[];
  observed: ObservedEdgeOutcome[];
}): CalibrationSignal[] {
  const obsById = new Map(params.observed.map((o) => [String(o.edgeId), o] as const));
  const signals: CalibrationSignal[] = [];

  for (const p of params.predicted) {
    const o = obsById.get(String(p.edgeId));
    if (!o) continue;

    // Strong supervision: rescue/incident contradicts "low risk" prediction.
    if (o.rescueTriggered === true && p.breakdown.total < 6) {
      signals.push({
        edgeId: p.edgeId,
        factor: 'global',
        direction: 'INCREASE',
        strength01: 1,
        reason: `rescueTriggered=true but predictedRisk=${p.breakdown.total.toFixed(2)} (<6)`,
      });
    }

    // Water depth supervision (if available)
    if (typeof o.observedWaterDepthCm === 'number' && Number.isFinite(o.observedWaterDepthCm)) {
      // If observed depth is "easy" (<20cm) but predicted water component is extreme, suggest decrease.
      if (o.observedWaterDepthCm < 20 && p.breakdown.components.water >= 2) {
        signals.push({
          edgeId: p.edgeId,
          factor: 'water_crossing',
          direction: 'DECREASE',
          strength01: clamp01((p.breakdown.components.water - 1) / 8),
          reason: `observedWaterDepthCm=${o.observedWaterDepthCm} (<20) but predictedWater=${p.breakdown.components.water.toFixed(2)}`,
        });
      }
      // If observed depth is deep (>=50cm) but predicted water component is low, suggest increase.
      if (o.observedWaterDepthCm >= 50 && p.breakdown.components.water < 0.5) {
        signals.push({
          edgeId: p.edgeId,
          factor: 'water_crossing',
          direction: 'INCREASE',
          strength01: clamp01((o.observedWaterDepthCm - 50) / 50),
          reason: `observedWaterDepthCm=${o.observedWaterDepthCm} (>=50) but predictedWater=${p.breakdown.components.water.toFixed(2)}`,
        });
      }
    }

    // Weak supervision: very low speed indicates terrain difficulty; if predicted terrain is low, increase.
    if (typeof o.avgSpeedKmh === 'number' && Number.isFinite(o.avgSpeedKmh) && o.avgSpeedKmh > 0) {
      if (o.avgSpeedKmh < 10 && p.breakdown.components.terrain < 1) {
        signals.push({
          edgeId: p.edgeId,
          factor: 'terrain',
          direction: 'INCREASE',
          strength01: clamp01((10 - o.avgSpeedKmh) / 10),
          reason: `avgSpeedKmh=${o.avgSpeedKmh.toFixed(1)} (<10) but predictedTerrain=${p.breakdown.components.terrain.toFixed(2)}`,
        });
      }
      if (o.avgSpeedKmh > 40 && p.breakdown.total >= 8) {
        signals.push({
          edgeId: p.edgeId,
          factor: 'global',
          direction: 'DECREASE',
          strength01: clamp01((o.avgSpeedKmh - 40) / 60),
          reason: `avgSpeedKmh=${o.avgSpeedKmh.toFixed(1)} (>40) but predictedRisk=${p.breakdown.total.toFixed(2)} (>=8)`,
        });
      }
    }
  }

  return signals;
}

