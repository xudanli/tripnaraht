import { Injectable } from '@nestjs/common';
import type { AmbiguityReport } from '../kernel/ambiguity-resolver';
import type { FailureDriversReport, StochasticAggregate } from '../kernel/parallel-decision-kernel';
import type { DecisionMetaMode } from '../kernel/decision-state.types';

export type TripDecisionReport = {
  aggregate: StochasticAggregate;
  ambiguity?: AmbiguityReport;
  failureDrivers?: FailureDriversReport;
  /**
   * Optional: when the solver already computed a pivot/wait analysis,
   * the actuator can translate it into UX instructions.
   */
  pivot?: {
    /**
     * If waiting reduces CVaR by 80%, then waitBetterBy01=0.8.
     * 0..1, higher is stronger "wait" dominance.
     */
    waitBetterBy01?: number;
    /**
     * Suggested wait duration in minutes (if available).
     */
    waitMinutes?: number;
  };
};

export type RealtimeShelterPoint = {
  id: string;
  name?: string;
  lat: number;
  lng: number;
  kind?: 'SHELTER' | 'GAS' | 'HOSPITAL' | 'RANGER' | 'OTHER';
};

export type RealtimeState = {
  at: string; // ISO
  lat: number;
  lng: number;
  speedMs?: number;
  /** Observed delay from plan start / schedule, if known. */
  delayMinutes?: number;
  /** Optional nearby emergency points supplied by client/Ontology. */
  nearbyShelters?: RealtimeShelterPoint[];
};

export type InterventionAction =
  | 'MAINTAIN_GUIDANCE'
  | 'FORCE_RETREAT_MODE'
  | 'EMERGENCY_MELT_CUTOFF'
  | 'WAITING_FOR_WINDOW';

export type InterventionDecision = {
  /** Control-plane action for the client (UI state machine). */
  action: InterventionAction;
  /**
   * Suggested decision meta mode. This is the bridge from solver output → UI mode.
   * - EXPLORE: normal planning
   * - EMERGENCY: hard cut-off / melt
   * - ADJUST: retreat / replan / pivot
   */
  mode: DecisionMetaMode;
  /**
   * Human-facing text (high-priority). UI may render it as an overlay.
   * Keep it short, imperative, and auditable.
   */
  primaryMessage?: string;
  /**
   * Supporting bullets (e.g. failure drivers from CVaR tail).
   */
  bullets?: string[];
  /**
   * When forcing retreat/replan, highlight the nearest emergency point.
   */
  highlightShelter?: RealtimeShelterPoint;
  /**
   * Waiting UX: provide a recommended wait, and the projected risk drop if present.
   */
  waiting?: { waitMinutes?: number; riskDrop01?: number };
  /**
   * For observability / audit: stable reasons.
   */
  reasonCodes: string[];
};

@Injectable()
export class InterventionEngine {
  /** Nest 不能对「带默认值的 constructor 形参」做 DI；策略用字段默认即可。 */
  private readonly policy = {
    envelopeDelayMinutesThreshold: 30,
    waitingDominanceThreshold01: 0.8,
  };

  /**
   * 极致干预：对比预期包络线与实时观测。
   * 该接口是 UI “手”的控制面：返回明确的 UI 模式切换建议与文案。
   */
  async checkAndIntervene(realtimeState: RealtimeState, predictedPlan: TripDecisionReport): Promise<InterventionDecision> {
    const ambiguity = predictedPlan.ambiguity;

    // 1) 确定性截断（共识熔断）
    if (ambiguity?.isEmergency) {
      return this.triggerEmergencyMelt({
        ambiguity,
        failureDrivers: predictedPlan.failureDrivers,
      });
    }

    // 2) 决策支点引导（Waiting for Window）
    if (this.shouldRecommendWaiting(predictedPlan)) {
      return this.pushWaitingForWindow(predictedPlan);
    }

    // 3) 空间/时间包络线偏离（撤退/寻路模式）
    if (this.isOutOfSafetyEnvelope(realtimeState, predictedPlan)) {
      return this.pushRetreatMode(realtimeState, predictedPlan);
    }

    return this.maintainGuidance();
  }

  private maintainGuidance(): InterventionDecision {
    return {
      action: 'MAINTAIN_GUIDANCE',
      mode: 'EXPLORE',
      reasonCodes: ['OK'],
    };
  }

  private triggerEmergencyMelt(params: {
    ambiguity: AmbiguityReport;
    failureDrivers?: FailureDriversReport;
  }): InterventionDecision {
    const bullets = [
      ...(params.failureDrivers?.bullets ?? []),
      ...(params.failureDrivers?.topFactors?.slice(0, 3).map((x) => x.factor) ?? []).map((f) => `关键风险因子：${f}`),
    ].slice(0, 6);

    return {
      action: 'EMERGENCY_MELT_CUTOFF',
      mode: 'EMERGENCY',
      primaryMessage: `已触发群体共识预警：该路径已关闭，请立即执行备选方案。`,
      bullets: bullets.length > 0 ? bullets : [params.ambiguity.reason],
      reasonCodes: ['CONSENSUS_EMERGENCY', 'DETERMINISTIC_CUTOFF'],
    };
  }

  private isOutOfSafetyEnvelope(realtimeState: RealtimeState, _predictedPlan: TripDecisionReport): boolean {
    const delay = realtimeState.delayMinutes;
    if (typeof delay === 'number' && Number.isFinite(delay) && delay >= this.policy.envelopeDelayMinutesThreshold) {
      return true;
    }
    return false;
  }

  private pushRetreatMode(realtimeState: RealtimeState, _predictedPlan: TripDecisionReport): InterventionDecision {
    const shelter = this.pickNearestShelter(realtimeState);
    return {
      action: 'FORCE_RETREAT_MODE',
      mode: 'ADJUST',
      primaryMessage: `已偏离安全包络线：请切换至撤退/寻路模式。`,
      bullets: [
        `延误已达到阈值（≥${this.policy.envelopeDelayMinutesThreshold} 分钟），继续前进将显著抬升硬约束触发概率。`,
        ...(shelter ? [`就近应急点：${shelter.name ?? shelter.id}`] : []),
      ],
      highlightShelter: shelter,
      reasonCodes: ['OUT_OF_SAFETY_ENVELOPE', 'UI_MODE_FORCE_SWITCH'],
    };
  }

  private shouldRecommendWaiting(predictedPlan: TripDecisionReport): boolean {
    const waitBetterBy01 = predictedPlan.pivot?.waitBetterBy01;
    if (typeof waitBetterBy01 !== 'number' || !Number.isFinite(waitBetterBy01)) return false;
    return waitBetterBy01 >= this.policy.waitingDominanceThreshold01;
  }

  private pushWaitingForWindow(predictedPlan: TripDecisionReport): InterventionDecision {
    const waitBetterBy01 = predictedPlan.pivot?.waitBetterBy01;
    const waitMinutes = predictedPlan.pivot?.waitMinutes;
    return {
      action: 'WAITING_FOR_WINDOW',
      mode: 'ADJUST',
      primaryMessage: `静候窗口（Waiting for Window）：等待比硬闯更安全。`,
      bullets: [
        typeof waitBetterBy01 === 'number' ? `预计等待可使尾部风险下降约 ${Math.round(waitBetterBy01 * 100)}%。` : undefined,
        typeof waitMinutes === 'number' ? `建议等待 ${Math.max(1, Math.round(waitMinutes))} 分钟后再评估。` : undefined,
      ].filter(Boolean) as string[],
      waiting: { waitMinutes, riskDrop01: waitBetterBy01 },
      reasonCodes: ['PIVOT_GUIDANCE', 'WAIT_WINDOW'],
    };
  }

  private pickNearestShelter(realtimeState: RealtimeState): RealtimeShelterPoint | undefined {
    const pts = realtimeState.nearbyShelters ?? [];
    if (pts.length === 0) return undefined;
    const d2 = (p: RealtimeShelterPoint) => (p.lat - realtimeState.lat) ** 2 + (p.lng - realtimeState.lng) ** 2;
    return [...pts].sort((a, b) => d2(a) - d2(b) || String(a.id).localeCompare(String(b.id)))[0];
  }
}

