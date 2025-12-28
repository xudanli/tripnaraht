// src/trips/decision/services/poi-features-adapter.service.ts

/**
 * POI Features Adapter Service
 * 
 * 为决策层提供统一的 POI Features 接口
 * 支持斯瓦尔巴和冰岛等不同目的地的 POI 数据
 */

import { Injectable, Logger } from '@nestjs/common';
import { SvalbardPoiFeaturesService, SvalbardGeoFeatures } from '../../../places/services/svalbard-poi-features.service';
import { IcelandPoiFeaturesService, IcelandGeoFeatures } from '../../../places/services/iceland-poi-features.service';

export type PoiFeatures = SvalbardGeoFeatures | IcelandGeoFeatures;

export interface PoiFeaturesContext {
  destination: string;
  region?: string;
}

@Injectable()
export class PoiFeaturesAdapterService {
  private readonly logger = new Logger(PoiFeaturesAdapterService.name);

  constructor(
    private readonly svalbardFeatures: SvalbardPoiFeaturesService,
    private readonly icelandFeatures: IcelandPoiFeaturesService
  ) {}

  /**
   * 根据目的地获取 POI Features
   */
  async getPoiFeatures(context: PoiFeaturesContext): Promise<PoiFeatures | null> {
    const { destination, region } = context;

    // 判断目的地类型
    if (destination.startsWith('IS-') || destination === 'IS' || destination.includes('ICELAND')) {
      // 冰岛
      const regionKey = region || this.inferIcelandRegion(destination);
      this.logger.log(`获取冰岛 POI Features: ${regionKey}`);
      return await this.icelandFeatures.getIcelandFeatures(regionKey);
    } else if (destination.startsWith('SVALBARD') || destination.includes('LONGYEARBYEN')) {
      // 斯瓦尔巴
      const regionKey = region || 'SVALBARD_LONGYEARBYEN';
      this.logger.log(`获取斯瓦尔巴 POI Features: ${regionKey}`);
      return await this.svalbardFeatures.getSvalbardFeatures(regionKey);
    }

    this.logger.warn(`未找到 POI Features 服务: ${destination}`);
    return null;
  }

  /**
   * 推断冰岛区域
   */
  private inferIcelandRegion(destination: string): string {
    // 从目的地字符串推断区域
    if (destination.includes('REYKJAVIK')) {
      return 'IS_REYKJAVIK';
    } else if (destination.includes('KEFLAVIK') || destination.includes('AIRPORT')) {
      return 'IS_KEFLAVIK_AIRPORT';
    } else if (destination.includes('GOLDEN_CIRCLE') || destination.includes('GOLDEN')) {
      return 'IS_GOLDEN_CIRCLE';
    } else if (destination.includes('SOUTH_COAST') || destination.includes('SOUTH')) {
      return 'IS_SOUTH_COAST';
    } else if (destination.includes('VIK')) {
      return 'IS_VIK';
    } else if (destination.includes('HOFN')) {
      return 'IS_HOFN';
    }
    
    // 默认返回雷克雅未克
    return 'IS_REYKJAVIK';
  }

  /**
   * 检查是否为冰岛 POI Features
   */
  isIcelandFeatures(features: PoiFeatures): features is IcelandGeoFeatures {
    return 'attractions' in features && 'services' in features;
  }

  /**
   * 检查是否为斯瓦尔巴 POI Features
   */
  isSvalbardFeatures(features: PoiFeatures): features is SvalbardGeoFeatures {
    return 'ports' in features && 'trail' in features;
  }
}

