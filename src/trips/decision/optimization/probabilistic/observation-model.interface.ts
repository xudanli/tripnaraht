/**
 * 观测模型接口（POMDP Ω(o|s)）
 *
 * 技术交底书 4.5.2：Ω(o|s) = P(观测 o | 真实状态 s)
 * 支持高斯观测、分类观测、复合观测等形式
 *
 * 参考：docs/DECISION_OS_POMDP_COMPLETE_DERIVATION_PLAN.md
 */

import {
  WorldStateSample,
  WorldStateObservation,
} from './probabilistic-world-model.interface';

/**
 * 观测模型：计算 P(观测 o | 状态 s)
 *
 * 对应 POMDP 八元组中的 Ω(o|s)
 */
export interface IObservationModel {
  /**
   * 计算观测似然 Ω(o|s) = P(observation | sample)
   *
   * @param sample 状态采样 s
   * @param observation 观测 o
   * @returns 似然值，非负，可未归一化
   */
  computeLikelihood(
    sample: WorldStateSample,
    observation: WorldStateObservation,
  ): number;
}
