// src/rag/services/hybrid-search-config.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Hybrid Search 权重配置
 */
export interface HybridSearchWeights {
  denseWeight: number; // Dense 检索权重
  sparseWeight: number; // Sparse 检索权重
}

/**
 * 查询类型
 */
export enum QueryType {
  GENERAL = 'GENERAL', // 通用查询
  ACCOMMODATION = 'ACCOMMODATION', // 住宿查询
  ROUTE = 'ROUTE', // 路线查询
  WEATHER = 'WEATHER', // 天气查询
  POI = 'POI', // POI 查询
  SAFETY = 'SAFETY', // 安全查询
}

/**
 * 查询类型检测配置
 */
interface QueryTypeDetection {
  triggers: string[]; // 触发关键词
  weights: HybridSearchWeights; // 对应权重
}

/**
 * Hybrid Search 配置服务
 *
 * 根据查询类型动态调整 Dense/Sparse 权重
 * 支持配置文件和环境变量覆盖
 */
@Injectable()
export class HybridSearchConfigService {
  private readonly logger = new Logger(HybridSearchConfigService.name);

  // 默认权重
  private defaultWeights: HybridSearchWeights = {
    denseWeight: 0.6,
    sparseWeight: 0.4,
  };

  // 查询类型检测规则
  private readonly queryTypeDetections: QueryTypeDetection[] = [
    {
      triggers: ['住宿', '酒店', '旅馆', '民宿', 'hotel', 'accommodation', 'stay', 'lodging', 'booking'],
      weights: { denseWeight: 0.5, sparseWeight: 0.5 }, // 住宿查询需要更强的关键词匹配
    },
    {
      triggers: ['路线', '环岛', '行程', 'route', 'ring road', 'itinerary'],
      weights: { denseWeight: 0.55, sparseWeight: 0.45 }, // 路线查询需要平衡语义和关键词
    },
    {
      triggers: ['天气', '气候', '温度', 'weather', 'climate'],
      weights: { denseWeight: 0.7, sparseWeight: 0.3 }, // 天气查询更依赖语义
    },
    {
      triggers: ['安全', '危险', '注意', 'safety', 'risk', 'danger'],
      weights: { denseWeight: 0.65, sparseWeight: 0.35 }, // 安全查询需要语义理解
    },
    {
      triggers: ['景点', 'poi', 'place', 'attraction'],
      weights: { denseWeight: 0.6, sparseWeight: 0.4 }, // POI 查询平衡
    },
  ];

  constructor(private readonly configService: ConfigService) {
    this.loadConfig();
  }

  /**
   * 从配置加载权重
   */
  private loadConfig(): void {
    const configDense = this.configService.get<number>('RAG_HYBRID_DENSE_WEIGHT');
    const configSparse = this.configService.get<number>('RAG_HYBRID_SPARSE_WEIGHT');

    if (configDense !== undefined && configSparse !== undefined) {
      this.defaultWeights.denseWeight = configDense;
      this.defaultWeights.sparseWeight = configSparse;
      this.logger.log(`从配置加载 Hybrid Search 权重: dense=${configDense}, sparse=${configSparse}`);
    }
  }

  /**
   * 根据查询类型获取权重
   */
  getWeightsForQuery(query: string): HybridSearchWeights {
    const queryLower = query.toLowerCase();

    // 检测查询类型
    for (const detection of this.queryTypeDetections) {
      if (detection.triggers.some((trigger) => queryLower.includes(trigger.toLowerCase()))) {
        this.logger.debug(
          `查询类型匹配: ${detection.triggers[0]} → dense=${detection.weights.denseWeight}, sparse=${detection.weights.sparseWeight}`,
        );
        return detection.weights;
      }
    }

    // 默认权重
    return { ...this.defaultWeights };
  }

  /**
   * 根据查询类型枚举获取权重
   */
  getWeightsForType(queryType: QueryType): HybridSearchWeights {
    const detection = this.queryTypeDetections.find((d) =>
      d.triggers.some((t) => t.toLowerCase() === queryType.toLowerCase()),
    );

    if (detection) {
      return detection.weights;
    }

    return { ...this.defaultWeights };
  }

  /**
   * 设置默认权重（运行时动态调整）
   */
  setDefaultWeights(weights: HybridSearchWeights): void {
    this.defaultWeights = { ...weights };
    this.logger.log(`更新默认权重: dense=${weights.denseWeight}, sparse=${weights.sparseWeight}`);
  }

  /**
   * 添加或更新查询类型检测规则
   */
  setQueryTypeDetection(
    queryType: string,
    triggers: string[],
    weights: HybridSearchWeights,
  ): void {
    const existingIndex = this.queryTypeDetections.findIndex((d) =>
      d.triggers.includes(queryType),
    );

    if (existingIndex >= 0) {
      this.queryTypeDetections[existingIndex] = { triggers, weights };
    } else {
      this.queryTypeDetections.push({ triggers, weights });
    }

    this.logger.debug(`更新查询类型检测: ${queryType} → dense=${weights.denseWeight}, sparse=${weights.sparseWeight}`);
  }

  /**
   * 获取所有查询类型检测规则
   */
  getAllQueryTypeDetections(): QueryTypeDetection[] {
    return this.queryTypeDetections.map((d) => ({ ...d }));
  }

  /**
   * 验证权重配置
   */
  validateWeights(weights: HybridSearchWeights): boolean {
    const { denseWeight, sparseWeight } = weights;
    const sum = denseWeight + sparseWeight;
    const isValid = Math.abs(sum - 1.0) < 0.01; // 允许 0.01 的误差

    if (!isValid) {
      this.logger.warn(`权重配置无效: dense=${denseWeight}, sparse=${sparseWeight}, sum=${sum}`);
    }

    return isValid;
  }

  /**
   * 归一化权重（确保和为 1）
   */
  normalizeWeights(weights: HybridSearchWeights): HybridSearchWeights {
    const { denseWeight, sparseWeight } = weights;
    const sum = denseWeight + sparseWeight;

    if (sum === 0) {
      return { denseWeight: 0.5, sparseWeight: 0.5 };
    }

    return {
      denseWeight: denseWeight / sum,
      sparseWeight: sparseWeight / sum,
    };
  }
}
