/**
 * Umferðin / 冰岛公路管理局 — 到达车流信号 Provider（Phase 2 骨架）
 *
 * 不能直接给出「Gullfoss 排队 18 分钟」，但可用于：
 * - 判断通往景点道路是否异常拥堵
 * - 校准 C 级 POI arrivalRateMultiplier
 */

import { Injectable, Logger } from '@nestjs/common';

/** 路段 → 关联 POI slug */
const ROAD_POI_TURN_RATES: Array<{
  roadSegmentId: string;
  poiIds: string[];
  /** 夏季平均日流量 → 到达率基线乘数 */
  baselineMultiplier: number;
}> = [
  { roadSegmentId: 'IS-R1-gullfoss-junction', poiIds: ['is.gullfoss', 'is.geysir'], baselineMultiplier: 1 },
  { roadSegmentId: 'IS-R1-south-coast', poiIds: ['is.seljalandsfoss', 'is.skogafoss', 'is.reynisfjara'], baselineMultiplier: 1 },
  { roadSegmentId: 'IS-R1-jokulsarlon', poiIds: ['is.jokulsarlon'], baselineMultiplier: 1 },
  { roadSegmentId: 'IS-R1-thingvellir', poiIds: ['is.thingvellir'], baselineMultiplier: 1 },
];

export interface ArrivalRateSignal {
  poiId: string;
  /** 相对基线的到达率乘数（1=正常，>1=高于正常车流） */
  multiplier: number;
  signalSource: 'TRAFFIC';
  observedAt: string;
  confidenceScore: number;
}

@Injectable()
export class UmferdinArrivalRateProvider {
  private readonly logger = new Logger(UmferdinArrivalRateProvider.name);

  /**
   * 获取 POI 相对到达率乘数
   * 当前：启发式基线；接入 Umferðin 开放数据后替换为实时监测
   */
  async getArrivalRateMultiplier(poiId: string): Promise<ArrivalRateSignal | undefined> {
    const linked = ROAD_POI_TURN_RATES.find((r) => r.poiIds.includes(poiId));
    if (!linked) return undefined;

    const apiEnabled = process.env.UMFERDIN_OPEN_DATA_ENABLED === 'true';
    if (!apiEnabled) {
      return {
        poiId,
        multiplier: linked.baselineMultiplier,
        signalSource: 'TRAFFIC',
        observedAt: new Date().toISOString(),
        confidenceScore: 0.4,
      };
    }

    // TODO: 接入 Umferðin 开放数据 API
    this.logger.debug(`Umferðin 实时车流待接入: ${linked.roadSegmentId}`);
    return {
      poiId,
      multiplier: linked.baselineMultiplier,
      signalSource: 'TRAFFIC',
      observedAt: new Date().toISOString(),
      confidenceScore: 0.5,
    };
  }

  async getMultipliersForPois(poiIds: string[]): Promise<Map<string, ArrivalRateSignal>> {
    const result = new Map<string, ArrivalRateSignal>();
    for (const poiId of poiIds) {
      const signal = await this.getArrivalRateMultiplier(poiId);
      if (signal) result.set(poiId, signal);
    }
    return result;
  }
}
