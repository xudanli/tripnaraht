/**
 * 默认观测模型（保持现有行为）
 *
 * 实现技术交底书 4.5.2 中的高斯观测形式：
 * Ω(o|s) ∝ exp(-‖o - h(s)‖² / (2σ²))
 *
 * 当前支持：windSpeed、temperatureC
 * 可扩展：通过注册更多 variable 处理器
 */

import { Injectable } from '@nestjs/common';
import {
  WorldStateSample,
  WorldStateObservation,
} from './probabilistic-world-model.interface';
import { IObservationModel } from './observation-model.interface';

@Injectable()
export class DefaultObservationModelService implements IObservationModel {
  static readVarianceConfig(options?: { countryCode?: string; month?: number }): {
    presetId?: string;
    windSpeedVariance: number;
    temperatureVariance: number;
    visibilityVariance: number;
    precipitationVariance: number;
    roadClosureVariance: number;
    fatigueVariance: number;
  } {
    const num = (v: string | undefined, fallback: number): number => {
      const n = v !== undefined ? Number(v) : NaN;
      return Number.isFinite(n) && n > 0 ? n : fallback;
    };
    const cc = (options?.countryCode ?? '').toUpperCase();
    const m = options?.month;
    let presetId: string | undefined;
    let preset = {
      windSpeedVariance: 25,
      temperatureVariance: 36,
      visibilityVariance: 4_000_000,
      precipitationVariance: 25,
      roadClosureVariance: 0.04, // 0-1 domain, std~0.2
      fatigueVariance: 0.04, // 0-1 domain, std~0.2
    };
    if (cc === 'IS' && typeof m === 'number') {
      if (m === 11 || m === 12 || m === 1 || m === 2 || m === 3) {
        presetId = 'IS_WINTER';
        preset = {
          windSpeedVariance: 49, // std ~7m/s
          temperatureVariance: 64, // std ~8C
          visibilityVariance: 9_000_000, // std ~3000m
          precipitationVariance: 36, // std ~6mm
          roadClosureVariance: 0.06,
          fatigueVariance: 0.06,
        };
      } else if (m === 6 || m === 7 || m === 8) {
        presetId = 'IS_SUMMER';
        preset = {
          windSpeedVariance: 25,
          temperatureVariance: 36,
          visibilityVariance: 4_000_000,
          precipitationVariance: 25,
          roadClosureVariance: 0.04,
          fatigueVariance: 0.04,
        };
      }
    }
    // env 覆盖优先级最高（允许按地区 preset + 运维调参）
    const windSpeedVariance = num(process.env.DECISION_OS_OBS_VAR_WIND, preset.windSpeedVariance);
    const temperatureVariance = num(process.env.DECISION_OS_OBS_VAR_TEMP_C, preset.temperatureVariance);
    const visibilityVariance = num(process.env.DECISION_OS_OBS_VAR_VIS_M, preset.visibilityVariance);
    const precipitationVariance = num(process.env.DECISION_OS_OBS_VAR_PRECIP_MM, preset.precipitationVariance);
    const roadClosureVariance = num(process.env.DECISION_OS_OBS_VAR_ROAD_CLOSURE01, preset.roadClosureVariance);
    const fatigueVariance = num(process.env.DECISION_OS_OBS_VAR_FATIGUE01, preset.fatigueVariance);
    return {
      presetId,
      windSpeedVariance,
      temperatureVariance,
      visibilityVariance,
      precipitationVariance,
      roadClosureVariance,
      fatigueVariance,
    };
  }

  /** 高斯观测方差参数（对应 σ²） */
  private readonly windSpeedVariance: number;
  private readonly temperatureVariance: number;
  private readonly visibilityVariance: number; // (m^2)
  private readonly precipitationVariance: number; // (mm^2)
  private readonly roadClosureVariance: number; // (0-1)^2
  private readonly fatigueVariance: number; // (0-1)^2

  constructor() {
    const cfg = DefaultObservationModelService.readVarianceConfig();
    this.windSpeedVariance = cfg.windSpeedVariance;
    this.temperatureVariance = cfg.temperatureVariance;
    this.visibilityVariance = cfg.visibilityVariance;
    this.precipitationVariance = cfg.precipitationVariance;
    this.roadClosureVariance = cfg.roadClosureVariance;
    this.fatigueVariance = cfg.fatigueVariance;
  }

  computeLikelihood(
    sample: WorldStateSample,
    obs: WorldStateObservation,
  ): number {
    const q =
      obs.quality === 'HIGH' ? 0.9 : obs.quality === 'LOW' ? 0.5 : 0.7;
    const { variable, value } = obs.observation;

    if (variable === 'windSpeed' && typeof value === 'number') {
      const diff = Math.abs(
        ((sample.weather as { windSpeedMs?: number }).windSpeedMs ?? 0) - value,
      );
      return Math.exp(-(diff * diff) / (2 * this.windSpeedVariance)) * q;
    }
    if (variable === 'temperatureC' && typeof value === 'number') {
      const diff = Math.abs(
        ((sample.weather as { temperatureC?: number }).temperatureC ?? 0) - value,
      );
      return Math.exp(-(diff * diff) / (2 * this.temperatureVariance)) * q;
    }
    if (variable === 'visibilityM' && typeof value === 'number') {
      const diff = Math.abs(
        ((sample.weather as { visibilityM?: number }).visibilityM ?? 0) - value,
      );
      return Math.exp(-(diff * diff) / (2 * this.visibilityVariance)) * q;
    }
    if (variable === 'precipitationMm' && typeof value === 'number') {
      const diff = Math.abs(
        ((sample.weather as { precipitationMm?: number }).precipitationMm ?? 0) - value,
      );
      return Math.exp(-(diff * diff) / (2 * this.precipitationVariance)) * q;
    }
    if (variable === 'roadClosure01' && typeof value === 'number') {
      const total = Array.isArray(sample.roadStatuses) ? sample.roadStatuses.length : 0;
      const closed =
        total > 0 ? sample.roadStatuses.filter((r) => r.status === 'CLOSED').length : 0;
      const closure01 = total > 0 ? closed / total : 0;
      const diff = Math.abs(closure01 - value);
      return Math.exp(-(diff * diff) / (2 * this.roadClosureVariance)) * q;
    }
    if (variable === 'fatigue01' && typeof value === 'number') {
      const ft = (sample.humanCapability as { fatigueThreshold?: number } | undefined)?.fatigueThreshold ?? 0.6;
      const fatigue01 = Math.max(0, Math.min(1, ft));
      const diff = Math.abs(fatigue01 - value);
      return Math.exp(-(diff * diff) / (2 * this.fatigueVariance)) * q;
    }

    return q;
  }
}
