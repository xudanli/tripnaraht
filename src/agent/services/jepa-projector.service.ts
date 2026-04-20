import { Injectable } from '@nestjs/common';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { OrchestratorState, JepaPayload } from '../interfaces/trip-plan.interface';

@Injectable()
export class JepaProjectorService {
  /**
   * JEPA：把现有 DSO（DecisionState）的“当前可观测世界状态”投影为 z_env / z_user / z_state。
   * predictor 输出与 delta / prediction_errors 先保持可选（未在核心链路实现时避免误导）。
   *
   * 注意：这是从 AgentService.buildJePaPayload() 迁出，保持同口径以避免行为变化。
   */
  buildJePaPayload(
    decisionState?: DecisionState,
    orchestrationState?: OrchestratorState,
  ): JepaPayload | undefined {
    if (!decisionState) return undefined;

    const env = decisionState.environmentState;
    const trip = decisionState.tripState;
    const intent = decisionState.userIntent;
    const feedback = decisionState.feedback;
    const constraints = decisionState.constraints;
    const world = decisionState.worldStateSummary;

    const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
    const normalize01Maybe = (n: unknown): number | null => {
      if (typeof n !== 'number' || Number.isNaN(n)) return null;
      return clamp01(n <= 1 ? n : n / 100);
    };
    const mapRiskLabelTo01 = (label?: string): number | null => {
      const l = (label ?? '').toUpperCase();
      if (l === 'LOW') return 0.2;
      if (l === 'MEDIUM') return 0.5;
      if (l === 'HIGH') return 0.8;
      return null;
    };
    const mapFitnessLabelTo01 = (labelOrNumber?: string | number): number | null => {
      if (typeof labelOrNumber === 'number') return clamp01(labelOrNumber);
      const l = (labelOrNumber ?? '').toLowerCase();
      if (l === 'low') return 0.4;
      if (l === 'medium') return 0.6;
      if (l === 'high') return 0.8;
      return null;
    };
    const normalizeSlopeTo01 = (maxSlope?: number): number | null => {
      if (typeof maxSlope !== 'number' || Number.isNaN(maxSlope)) return null;
      // 归一化假设：maxSlope 单位可能为百分比；用 50 作为上界做裁剪到 0..1
      return clamp01(maxSlope / 50);
    };

    const normalizeZState01Maybe = (v: unknown): number | null => {
      if (v === null || v === undefined) return null;
      if (typeof v !== 'number' || Number.isNaN(v)) return null;
      return clamp01(v <= 1 ? v : v / 100);
    };

    const coerceZStateFromHistory = (
      raw: unknown,
    ): JepaPayload['latent_contract']['z_state'] | null => {
      if (!raw || typeof raw !== 'object') return null;
      const r = raw as Record<string, unknown>;
      const continuity = normalizeZState01Maybe(r.continuity);
      const risk_score = normalizeZState01Maybe(r.risk_score);
      const cost = normalizeZState01Maybe(r.cost);
      const fatigue = normalizeZState01Maybe(r.fatigue);
      const satisfaction_estimate = normalizeZState01Maybe(r.satisfaction_estimate);

      if (
        continuity === null &&
        risk_score === null &&
        cost === null &&
        fatigue === null &&
        satisfaction_estimate === null
      ) {
        // 全空/不可用：当作缺失快照
        return null;
      }

      const missing_fields =
        Array.isArray(r.missing_fields) ? (r.missing_fields as unknown[]).map((x) => String(x)) : [];

      return {
        continuity,
        risk_score,
        cost,
        fatigue,
        satisfaction_estimate,
        missing_fields,
        fill_strategy: 'NULL' as const,
      };
    };

    const getLatestHistoryZState = (
      history: DecisionState['history'] | undefined,
      type: string,
      key: 'prev' | 'next',
    ): JepaPayload['latent_contract']['z_state'] | null => {
      if (!history || !Array.isArray(history) || history.length === 0) return null;
      for (let i = history.length - 1; i >= 0; i--) {
        const h = history[i] as any;
        if (h?.type === type) {
          return coerceZStateFromHistory(h?.[key]);
        }
      }
      return null;
    };
    const getLatestHistoryPayload = (
      history: DecisionState['history'] | undefined,
      type: string,
    ): Record<string, unknown> | null => {
      if (!history || !Array.isArray(history) || history.length === 0) return null;
      for (let i = history.length - 1; i >= 0; i--) {
        const h = history[i] as { type?: string; payload?: unknown } | undefined;
        if (h?.type === type && h.payload && typeof h.payload === 'object') {
          return h.payload as Record<string, unknown>;
        }
      }
      return null;
    };

    const z_state_before_action = getLatestHistoryZState(
      decisionState.history,
      'jepa_z_state_before_action',
      'prev',
    );
    const z_state_after_action = getLatestHistoryZState(
      decisionState.history,
      'jepa_z_state_after_action',
      'next',
    );

    const z_state_after_execution_observation = getLatestHistoryZState(
      decisionState.history,
      'jepa_z_state_after_execution_observation',
      'next',
    );

    const missingEnv: string[] = [];
    const missingUser: string[] = [];
    const missingState: string[] = [];

    const slope01 = normalizeSlopeTo01(world?.physical?.demEvidence?.maxSlope);
    if (slope01 === null) missingEnv.push('terrain_risk.slope');

    const weatherRisk01 = env?.weatherRisk !== undefined ? normalize01Maybe(env.weatherRisk) : null;
    if (weatherRisk01 === null) missingEnv.push('weather_state.precipitation_proxy');

    const accessibility01 =
      env?.accessibilityScore !== undefined
        ? normalize01Maybe(env.accessibilityScore)
        : normalize01Maybe(world?.physical?.climateSeasonality?.accessibilityScore);
    if (accessibility01 === null) missingEnv.push('accessibility.signal_coverage');

    const z_env = {
      terrain_risk: [slope01, null, null] as [number | null, number | null, number | null],
      weather_state: [null, null, weatherRisk01] as [number | null, number | null, number | null],
      accessibility: [null, accessibility01] as [number | null, number | null],
      temporal_factor: [null, null] as [number | null, number | null],
      missing_fields: missingEnv,
      fill_strategy: 'NULL' as const,
    };

    const riskTolerance01 = mapRiskLabelTo01(intent?.party?.riskTolerance);
    if (riskTolerance01 === null) missingUser.push('risk_tolerance');

    // delay_sensitivity 与 experience_level 在当前链路可能未必提供；先返回 null。
    const delaySensitivity01: number | null = null;
    if (delaySensitivity01 === null) missingUser.push('delay_sensitivity');

    const fatigueLimit01 = mapFitnessLabelTo01(intent?.party?.fitnessLevel);
    if (fatigueLimit01 === null) missingUser.push('fatigue_limit');

    const experienceLevel01: number | null = null;
    if (experienceLevel01 === null) missingUser.push('experience_level');

    const z_user = {
      risk_tolerance: riskTolerance01,
      delay_sensitivity: delaySensitivity01,
      fatigue_limit: fatigueLimit01,
      experience_level: experienceLevel01,
      missing_fields: missingUser,
      fill_strategy: 'NULL' as const,
    };

    // continuity：用 constraints.feasible 作为可持续性近似（强约束失败 => 低连续性）
    const continuity01 = typeof constraints?.feasible === 'boolean' ? (constraints.feasible ? 0.9 : 0.2) : null;
    if (continuity01 === null) missingState.push('continuity');

    // risk_score：优先 failureRiskLevel，否则使用 weatherRisk
    const failureRisk01 = mapRiskLabelTo01(env?.failureRiskLevel);
    const riskScore01 = failureRisk01 ?? weatherRisk01;
    if (riskScore01 === null) missingState.push('risk_score');

    const cost01 = trip?.budgetOverrun !== undefined ? normalize01Maybe(trip.budgetOverrun) : null;
    if (cost01 === null) missingState.push('cost');

    const fatigue01 = trip?.fatigue !== undefined ? normalize01Maybe(trip.fatigue) : null;
    if (fatigue01 === null) missingState.push('fatigue');

    const rawSat = feedback?.satisfactionScore;
    const satisfactionEstimate01 =
      rawSat === undefined
        ? null
        : typeof rawSat === 'number'
          ? clamp01(rawSat <= 1 ? rawSat : rawSat / 5)
          : null;
    if (satisfactionEstimate01 === null) missingState.push('satisfaction_estimate');

    const z_state_current: JepaPayload['latent_contract']['z_state'] = {
      continuity: continuity01,
      risk_score: riskScore01,
      cost: cost01,
      fatigue: fatigue01,
      satisfaction_estimate: satisfactionEstimate01,
      missing_fields: missingState,
      fill_strategy: 'NULL' as const,
    };

    // 若 history 里存在动作前/后快照，则用它们作为预测/真实口径
    const z_state_for_pred: JepaPayload['latent_contract']['z_state'] = z_state_before_action ?? z_state_current;
    // 优先使用执行偏差信号回灌后的“更真实”观测快照
    const z_state_for_real: JepaPayload['latent_contract']['z_state'] =
      z_state_after_execution_observation ?? z_state_after_action ?? z_state_current;

    // ===== Predictor（多头概率模拟器）=====
    let riskTrajectory: Array<{ at: string; risk_score: number | null; reason?: string }> | undefined = undefined;

    const failurePredictions = orchestrationState?.research_data?.failure_risk_prediction?.predictions as
      | Array<{ day: number; riskLevel: string; riskFactors?: string[]; mitigation?: string[] }>
      | undefined;

    const startDateStr = intent?.dateRange?.startDate;
    const startDate = startDateStr ? new Date(startDateStr) : null;

    if (Array.isArray(failurePredictions) && failurePredictions.length > 0) {
      riskTrajectory = failurePredictions.map((p) => {
        const day = typeof p.day === 'number' ? p.day : 1;
        const riskScore =
          p.riskLevel === 'LOW'
            ? 0.2
            : p.riskLevel === 'MEDIUM'
              ? 0.5
              : p.riskLevel === 'HIGH'
                ? 0.8
                : p.riskLevel === 'CRITICAL'
                  ? 0.95
                  : null;

        const at =
          startDate && !Number.isNaN(startDate.getTime())
            ? new Date(startDate.getTime() + (day - 1) * 24 * 60 * 60 * 1000).toISOString()
            : `day_${day}`;

        const reason = Array.isArray(p.riskFactors) && p.riskFactors.length > 0 ? p.riskFactors[0] : undefined;
        return { at, risk_score: riskScore, reason };
      });
    }

    const avgRiskScore =
      riskTrajectory && riskTrajectory.length > 0
        ? riskTrajectory.reduce((sum, x) => sum + (typeof x.risk_score === 'number' ? x.risk_score : 0), 0) /
          riskTrajectory.length
        : null;

    const risk_increase_prob =
      typeof avgRiskScore === 'number'
        ? clamp01(avgRiskScore)
        : typeof z_state_for_pred.risk_score === 'number'
          ? clamp01(z_state_for_pred.risk_score)
          : null;

    const continuity_break_prob =
      typeof z_state_for_pred.continuity === 'number' ? clamp01(1 - z_state_for_pred.continuity) : null;

    const fatigue_increase_prob =
      typeof z_state_for_pred.fatigue === 'number' ? clamp01(z_state_for_pred.fatigue) : null;

    const cost_overrun_prob =
      typeof z_state_for_pred.cost === 'number' ? clamp01(z_state_for_pred.cost) : null;

    const z_pred: JepaPayload['latent_contract']['z_state'] = {
      continuity:
        typeof z_state_for_pred.continuity === 'number' && typeof continuity_break_prob === 'number'
          ? clamp01(z_state_for_pred.continuity - continuity_break_prob * 0.15)
          : null,
      risk_score:
        typeof avgRiskScore === 'number'
          ? clamp01(avgRiskScore)
          : typeof z_state_for_pred.risk_score === 'number' && typeof risk_increase_prob === 'number'
            ? clamp01(z_state_for_pred.risk_score + risk_increase_prob * 0.15)
            : null,
      cost:
        typeof z_state_for_pred.cost === 'number' && typeof cost_overrun_prob === 'number'
          ? clamp01(z_state_for_pred.cost + cost_overrun_prob * 0.15)
          : null,
      fatigue:
        typeof z_state_for_pred.fatigue === 'number' && typeof fatigue_increase_prob === 'number'
          ? clamp01(z_state_for_pred.fatigue + fatigue_increase_prob * 0.15)
          : null,
      satisfaction_estimate:
        typeof z_state_for_pred.satisfaction_estimate === 'number' &&
        (typeof risk_increase_prob === 'number' || typeof fatigue_increase_prob === 'number')
          ? clamp01(
              z_state_for_pred.satisfaction_estimate -
                ((risk_increase_prob ?? 0) * 0.08 + (fatigue_increase_prob ?? 0) * 0.08),
            )
          : null,
      missing_fields: [],
      fill_strategy: 'NULL' as const,
    };

    const delta: Partial<Record<keyof JepaPayload['latent_contract']['z_state'], number | null>> = {};
    (['continuity', 'risk_score', 'cost', 'fatigue', 'satisfaction_estimate'] as const).forEach((k) => {
      const realV = z_state_for_real[k];
      const predV = z_pred[k];
      if (typeof realV === 'number' && typeof predV === 'number') {
        // UI 的语义：Delta = Real - Pred
        delta[k] = realV - predV;
      } else {
        delta[k] = null;
      }
    });

    // ===== Prediction Error（基于现有可观测数据的可计算闭环）=====
    let utilityErrorMagnitude: number | null = null;
    if (
      typeof z_pred.satisfaction_estimate === 'number' &&
      typeof z_state_for_real.satisfaction_estimate === 'number'
    ) {
      utilityErrorMagnitude = Math.abs(z_pred.satisfaction_estimate - z_state_for_real.satisfaction_estimate);
    }

    let worldErrorMagnitude: number | null = null;
    if (typeof z_pred.risk_score === 'number' && typeof z_state_for_real.risk_score === 'number') {
      worldErrorMagnitude = Math.abs(z_pred.risk_score - z_state_for_real.risk_score);
    }

    let userDriftMagnitude: number | null = null;
    if (typeof z_pred.satisfaction_estimate === 'number') {
      const actualAccept =
        typeof feedback?.accepted === 'boolean'
          ? feedback.accepted
          : typeof feedback?.behaviorSignals?.savePlan === 'boolean'
            ? feedback.behaviorSignals.savePlan
            : null;

      if (typeof actualAccept === 'boolean') {
        const actualAcceptProb = actualAccept ? 1 : 0;
        userDriftMagnitude = Math.abs(z_pred.satisfaction_estimate - actualAcceptProb);
      }
    }

    const predictionErrors: JepaPayload['prediction_errors'] = (() => {
      const out: NonNullable<JepaPayload['prediction_errors']> = {};

      if (utilityErrorMagnitude !== null) {
        out.utility_error = {
          magnitude: utilityErrorMagnitude,
          details: [
            utilityErrorMagnitude > 0.2
              ? '用户效用与预测差异较大（需要校准风险/疲劳到满意度的映射）'
              : '用户效用与预测存在差异（幅度较小）',
          ],
        };
      }

      if (worldErrorMagnitude !== null) {
        out.world_error = {
          magnitude: worldErrorMagnitude,
          details: [
            `pred_risk=${typeof z_pred.risk_score === 'number' ? z_pred.risk_score.toFixed(2) : 'null'}`,
            `real_risk=${typeof z_state_for_real.risk_score === 'number' ? z_state_for_real.risk_score.toFixed(2) : 'null'}`,
          ],
        };
      }

      if (userDriftMagnitude !== null) {
        out.user_drift = {
          magnitude: userDriftMagnitude,
          details: ['用户采纳倾向与预测采纳倾向不一致（先用效用倾向近似，后续接入条件模拟器行为分布）'],
        };
      }

      return Object.keys(out).length > 0 ? out : undefined;
    })();

    const triggerReasons: string[] = [];
    if (typeof weatherRisk01 === 'number' && weatherRisk01 >= 0.6) {
      triggerReasons.push('WEATHER_SPIKE');
    }
    if (constraints?.feasible === false) {
      triggerReasons.push('CONSTRAINT_CONFLICT');
    }
    if (feedback?.accepted === false) {
      triggerReasons.push('USER_REJECTION');
    }
    if (typeof worldErrorMagnitude === 'number' && worldErrorMagnitude >= 0.2) {
      triggerReasons.push('WORLD_ERROR_HIGH');
    }
    if (typeof userDriftMagnitude === 'number' && userDriftMagnitude >= 0.2) {
      triggerReasons.push('USER_DRIFT_HIGH');
    }
    const arbitrationPayload = getLatestHistoryPayload(decisionState.history, 'kernel_arbitration');
    const arbitration: JepaPayload['arbitration'] | undefined = arbitrationPayload
      ? {
          selected_candidate_id:
            typeof arbitrationPayload.selected_candidate_id === 'string'
              ? arbitrationPayload.selected_candidate_id
              : undefined,
          rejected_count:
            typeof arbitrationPayload.rejected_count === 'number'
              ? arbitrationPayload.rejected_count
              : Array.isArray(arbitrationPayload.rejected_candidates)
                ? arbitrationPayload.rejected_candidates.length
                : undefined,
          conflict_detected:
            typeof arbitrationPayload.conflict_detected === 'boolean'
              ? arbitrationPayload.conflict_detected
              : undefined,
          fallback_used:
            arbitrationPayload.conflict_resolution === 'FALLBACK_BASELINE'
              ? true
              : typeof arbitrationPayload.fallback_used === 'boolean'
                ? arbitrationPayload.fallback_used
                : undefined,
        }
      : undefined;

    return {
      version: '1.0',
      latent_contract: {
        z_env,
        z_user,
        z_state: z_state_for_real,
      },
      predictor_outputs: {
        risk_head: typeof risk_increase_prob === 'number' ? { risk_increase_prob } : undefined,
        continuity_head: typeof continuity_break_prob === 'number' ? { continuity_break_prob } : undefined,
        fatigue_head: typeof fatigue_increase_prob === 'number' ? { fatigue_increase_prob } : undefined,
        cost_head: typeof cost_overrun_prob === 'number' ? { cost_overrun_prob } : undefined,
      },
      decision_trace: {
        z_pred,
        z_real: z_state_for_real,
        delta,
        at: new Date().toISOString(),
      },
      prediction_errors: predictionErrors,
      risk_trajectory: riskTrajectory,
      trigger_reasons: triggerReasons.length > 0 ? Array.from(new Set(triggerReasons)) : undefined,
      arbitration,
    };
  }
}

