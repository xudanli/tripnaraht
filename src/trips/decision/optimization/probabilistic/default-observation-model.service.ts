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
  /** 高斯观测方差参数（对应 σ²） */
  private readonly windSpeedVariance = 25;
  private readonly temperatureVariance = 36;

  computeLikelihood(
    sample: WorldStateSample,
    obs: WorldStateObservation,
  ): number {
    const q =
      obs.quality === 'HIGH' ? 0.9 : obs.quality === 'LOW' ? 0.5 : 0.7;
    const { variable, value } = obs.observation;

    if (variable === 'windSpeed' && typeof value === 'number') {
      const diff = Math.abs(
        (sample.weather as { windSpeedMs?: number }).windSpeedMs - value,
      );
      return Math.exp(-(diff * diff) / (2 * this.windSpeedVariance)) * q;
    }
    if (variable === 'temperatureC' && typeof value === 'number') {
      const diff = Math.abs(
        (sample.weather as { temperatureC?: number }).temperatureC - value,
      );
      return Math.exp(-(diff * diff) / (2 * this.temperatureVariance)) * q;
    }

    return q;
  }
}
