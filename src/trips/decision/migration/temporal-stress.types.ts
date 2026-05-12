/**
 * TemporalStressDelta — 下游时间链应力占位；后续接 fatigue / mobility budget。
 */

export interface TemporalStressDelta {
  /** 0–1：时间传播链累积压力（占位启发） */
  ripplePressure01?: number;
  /** 与漂移策略相关的粗略分钟积压（占位） */
  sequenceBackpressureMinutes?: number;
  notes?: string[];
}
