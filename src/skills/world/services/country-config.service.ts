// src/skills/world/services/country-config.service.ts

/**
 * 国家配置服务
 * 
 * 职责：
 * - 管理国家特定的文件路径
 * - 管理国家特定的数据源适配器
 * - 支持多国家扩展
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { RoadStatusAdapter } from '../../../data-contracts/adapters/road-status.adapter.interface';
import { IcelandRoadStatusAdapter } from '../../../data-contracts/adapters/iceland-road-status.adapter';
import { DefaultRoadStatusAdapter } from '../../../data-contracts/adapters/default-road-status.adapter';
import { GoogleMapsDirectService } from '../../../mcp/google-maps-direct.service';
import * as path from 'path';
import * as fs from 'fs';

export interface CountryConfig {
  /** 国家代码（ISO 3166-1 alpha-2） */
  countryCode: string;
  /** 道路状态文件路径 */
  roadStatusPath: string;
  /** 天气窗口文件路径 */
  weatherWindowsPath: string;
  /** 渡轮时刻表文件路径 */
  ferrySchedulesPath: string;
  /** 数据源适配器类型 */
  adapterType: 'iceland' | 'default';
  /** 国家中心坐标（用于地理编码） */
  centerCoordinates?: {
    latitude: number;
    longitude: number;
  };
  /** 默认RouteDirection配置（国家特定） */
  defaultRouteDirectionConfig?: {
    defaultConstraints?: any;
    defaultRiskProfile?: any;
    defaultFailureProfile?: any;
  };
  /** 国家特定的世界模型参数 */
  worldModelParameters?: {
    routeDifficultyAdjustment?: number;
    timeEstimateAdjustment?: number;
    riskAssessmentAdjustment?: number;
  };
}

@Injectable()
export class CountryConfigService {
  private readonly logger = new Logger(CountryConfigService.name);
  
  /** 数据文件基础路径 */
  private readonly dataBasePath = path.join(process.cwd(), 'data', 'physical-reality');
  
  /** 国家配置缓存 */
  private readonly countryConfigCache = new Map<string, CountryConfig>();

  constructor(
    @Optional() private readonly icelandRoadStatusAdapter?: IcelandRoadStatusAdapter,
    @Optional() private readonly defaultRoadStatusAdapter?: DefaultRoadStatusAdapter,
    @Optional() private readonly googleMapsDirectService?: GoogleMapsDirectService,
  ) {
    this.logger.log('国家配置服务已初始化');
  }

  /**
   * 获取国家配置
   */
  getCountryConfig(countryCode: string): CountryConfig {
    // 检查缓存
    const cached = this.countryConfigCache.get(countryCode.toUpperCase());
    if (cached) {
      return cached;
    }

    // 生成配置
    const config: CountryConfig = {
      countryCode: countryCode.toUpperCase(),
      roadStatusPath: this.getRoadStatusPath(countryCode),
      weatherWindowsPath: this.getWeatherWindowsPath(countryCode),
      ferrySchedulesPath: this.getFerrySchedulesPath(countryCode),
      adapterType: this.getAdapterType(countryCode),
      centerCoordinates: this.getCenterCoordinates(countryCode),
      defaultRouteDirectionConfig: this.getDefaultRouteDirectionConfig(countryCode),
      worldModelParameters: this.getWorldModelParameters(countryCode),
    };

    // 缓存配置
    this.countryConfigCache.set(countryCode.toUpperCase(), config);

    return config;
  }

  /**
   * 获取道路状态文件路径
   */
  getRoadStatusPath(countryCode: string): string {
    // 特殊处理：冰岛使用iceland而不是is
    const countryName = countryCode.toUpperCase() === 'IS' ? 'iceland' : countryCode.toLowerCase();
    const fileName = `${countryName}-road-status.json`;
    return path.join(this.dataBasePath, 'road-status', fileName);
  }

  /**
   * 获取天气窗口文件路径
   */
  getWeatherWindowsPath(countryCode: string): string {
    // 特殊处理：冰岛使用iceland而不是is
    const countryName = countryCode.toUpperCase() === 'IS' ? 'iceland' : countryCode.toLowerCase();
    const fileName = `${countryName}-weather-windows.json`;
    return path.join(this.dataBasePath, 'weather-windows', fileName);
  }

  /**
   * 获取渡轮时刻表文件路径
   */
  getFerrySchedulesPath(countryCode: string): string {
    // 特殊处理：冰岛使用iceland而不是is
    const countryName = countryCode.toUpperCase() === 'IS' ? 'iceland' : countryCode.toLowerCase();
    const fileName = `${countryName}-ferry-schedules.json`;
    return path.join(this.dataBasePath, 'ferry-schedules', fileName);
  }

  /**
   * 获取适配器类型
   */
  getAdapterType(countryCode: string): 'iceland' | 'default' {
    // 冰岛使用特定的适配器
    if (countryCode.toUpperCase() === 'IS') {
      return 'iceland';
    }
    // 其他国家使用默认适配器
    return 'default';
  }

  /**
   * 获取道路状态适配器
   */
  getRoadStatusAdapter(countryCode: string): RoadStatusAdapter | null {
    const adapterType = this.getAdapterType(countryCode);
    
    switch (adapterType) {
      case 'iceland':
        if (!this.icelandRoadStatusAdapter) {
          this.logger.warn(`IcelandRoadStatusAdapter不可用，使用默认适配器`);
          return this.defaultRoadStatusAdapter || null;
        }
        return this.icelandRoadStatusAdapter;
      case 'default':
        return this.defaultRoadStatusAdapter || null;
      default:
        this.logger.warn(`未知的适配器类型: ${adapterType}，使用默认适配器`);
        return this.defaultRoadStatusAdapter || null;
    }
  }

  /**
   * 检查数据文件是否存在
   */
  hasRoadStatusData(countryCode: string): boolean {
    const filePath = this.getRoadStatusPath(countryCode);
    return fs.existsSync(filePath);
  }

  /**
   * 检查天气窗口数据是否存在
   */
  hasWeatherWindowsData(countryCode: string): boolean {
    const filePath = this.getWeatherWindowsPath(countryCode);
    return fs.existsSync(filePath);
  }

  /**
   * 检查渡轮时刻表数据是否存在
   */
  hasFerrySchedulesData(countryCode: string): boolean {
    const filePath = this.getFerrySchedulesPath(countryCode);
    return fs.existsSync(filePath);
  }

  /**
   * 加载道路状态数据
   */
  async loadRoadStatusData(countryCode: string): Promise<any> {
    const filePath = this.getRoadStatusPath(countryCode);
    
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`道路状态数据文件不存在: ${filePath}`);
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error: any) {
      this.logger.error(`加载道路状态数据失败: ${filePath}`, error);
      return null;
    }
  }

  /**
   * 加载天气窗口数据
   */
  async loadWeatherWindowsData(countryCode: string): Promise<any> {
    const filePath = this.getWeatherWindowsPath(countryCode);
    
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`天气窗口数据文件不存在: ${filePath}`);
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error: any) {
      this.logger.error(`加载天气窗口数据失败: ${filePath}`, error);
      return null;
    }
  }

  /**
   * 加载渡轮时刻表数据
   */
  async loadFerrySchedulesData(countryCode: string): Promise<any> {
    const filePath = this.getFerrySchedulesPath(countryCode);
    
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`渡轮时刻表数据文件不存在: ${filePath}`);
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error: any) {
      this.logger.error(`加载渡轮时刻表数据失败: ${filePath}`, error);
      return null;
    }
  }

  /**
   * 获取支持的国家列表
   */
  getSupportedCountries(): string[] {
    const roadStatusDir = path.join(this.dataBasePath, 'road-status');
    
    if (!fs.existsSync(roadStatusDir)) {
      return [];
    }

    const files = fs.readdirSync(roadStatusDir);
    const countries: string[] = [];
    const countryNameMap: Record<string, string> = {
      'iceland': 'IS',
      'norway': 'NO',
      'greenland': 'GL',
      'lofoten': 'NO', // Lofoten是挪威的一部分
    };

    for (const file of files) {
      // 匹配格式: {countryName}-road-status.json
      const match = file.match(/^([a-z]+)-road-status\.json$/i);
      if (match) {
        const countryName = match[1].toLowerCase();
        const countryCode = countryNameMap[countryName] || countryName.toUpperCase().substring(0, 2);
        if (!countries.includes(countryCode)) {
          countries.push(countryCode);
        }
      }
    }

    return countries;
  }

  /**
   * 获取地理编码坐标（优先使用Google Maps API，降级到预定义坐标）
   * 
   * 这是Code Review P0优先级修复：修复硬编码冰岛坐标问题
   */
  async getGeocodingCoordinates(
    countryCode: string,
  ): Promise<{ lat: number; lng: number } | null> {
    const upperCountryCode = countryCode.toUpperCase();

    // 策略1: 优先使用Google Maps API进行地理编码
    if (this.googleMapsDirectService?.isServiceAvailable()) {
      try {
        // 获取国家名称（用于地理编码）
        const countryName = this.getCountryName(upperCountryCode);
        if (countryName) {
          const geocodeResult = await this.googleMapsDirectService.geocode({
            address: countryName,
            language: 'en',
            region: upperCountryCode,
          });

          if (
            geocodeResult?.success &&
            geocodeResult.data?.results?.length > 0
          ) {
            const result = geocodeResult.data.results[0];
            const coords = result.geometry?.location;
            if (coords) {
              this.logger.debug(
                `[CountryConfig] 通过Google Maps获取坐标: ${upperCountryCode} -> (${coords.lat}, ${coords.lng})`,
              );
              return { lat: coords.lat, lng: coords.lng };
            }
          }
        }
      } catch (error: any) {
        this.logger.warn(
          `[CountryConfig] Google Maps地理编码失败: ${error.message}，使用预定义坐标`,
        );
      }
    }

    // 策略2: 降级到预定义的国家中心坐标
    const centerCoords = this.getCenterCoordinates(upperCountryCode);
    if (centerCoords) {
      this.logger.debug(
        `[CountryConfig] 使用预定义坐标: ${upperCountryCode} -> (${centerCoords.latitude}, ${centerCoords.longitude})`,
      );
      return {
        lat: centerCoords.latitude,
        lng: centerCoords.longitude,
      };
    }

    // 策略3: 最终降级到冰岛坐标（向后兼容）
    this.logger.warn(
      `[CountryConfig] 无法获取 ${upperCountryCode} 的坐标，使用冰岛坐标作为降级方案`,
    );
    return { lat: 64.9631, lng: -19.0208 };
  }

  /**
   * 获取国家名称（用于地理编码）
   */
  private getCountryName(countryCode: string): string | null {
    const countryNames: Record<string, string> = {
      IS: 'Iceland',
      NO: 'Norway',
      GL: 'Greenland',
      JP: 'Japan',
      CN: 'China',
      US: 'United States',
      CA: 'Canada',
      AU: 'Australia',
      NZ: 'New Zealand',
      CH: 'Switzerland',
      FR: 'France',
      DE: 'Germany',
      IT: 'Italy',
      ES: 'Spain',
      GB: 'United Kingdom',
      SE: 'Sweden',
      FI: 'Finland',
      DK: 'Denmark',
      NL: 'Netherlands',
      BE: 'Belgium',
      AT: 'Austria',
      PT: 'Portugal',
      GR: 'Greece',
      PL: 'Poland',
      CZ: 'Czech Republic',
      HU: 'Hungary',
      RO: 'Romania',
      BG: 'Bulgaria',
      HR: 'Croatia',
      SI: 'Slovenia',
      SK: 'Slovakia',
      IE: 'Ireland',
      LU: 'Luxembourg',
      MT: 'Malta',
      CY: 'Cyprus',
      EE: 'Estonia',
      LV: 'Latvia',
      LT: 'Lithuania',
    };

    return countryNames[countryCode.toUpperCase()] || null;
  }

  /**
   * 获取国家中心坐标（用于地理编码）
   */
  getCenterCoordinates(countryCode: string): { latitude: number; longitude: number } | undefined {
    // 国家中心坐标映射（扩展更多国家）
    const countryCenters: Record<string, { latitude: number; longitude: number }> = {
      IS: { latitude: 64.9631, longitude: -19.0208 }, // 冰岛
      NO: { latitude: 60.4720, longitude: 8.4689 }, // 挪威
      GL: { latitude: 71.7069, longitude: -42.6043 }, // 格陵兰
      JP: { latitude: 36.2048, longitude: 138.2529 }, // 日本
      CN: { latitude: 35.8617, longitude: 104.1954 }, // 中国
      US: { latitude: 37.0902, longitude: -95.7129 }, // 美国
      CA: { latitude: 56.1304, longitude: -106.3468 }, // 加拿大
      AU: { latitude: -25.2744, longitude: 133.7751 }, // 澳大利亚
      NZ: { latitude: -40.9006, longitude: 174.8860 }, // 新西兰
      CH: { latitude: 46.8182, longitude: 8.2275 }, // 瑞士
      FR: { latitude: 46.2276, longitude: 2.2137 }, // 法国
      DE: { latitude: 51.1657, longitude: 10.4515 }, // 德国
      IT: { latitude: 41.8719, longitude: 12.5674 }, // 意大利
      ES: { latitude: 40.4637, longitude: -3.7492 }, // 西班牙
      GB: { latitude: 55.3781, longitude: -3.4360 }, // 英国
      SE: { latitude: 60.1282, longitude: 18.6435 }, // 瑞典
      FI: { latitude: 61.9241, longitude: 25.7482 }, // 芬兰
      DK: { latitude: 56.2639, longitude: 9.5018 }, // 丹麦
      NL: { latitude: 52.1326, longitude: 5.2913 }, // 荷兰
      BE: { latitude: 50.5039, longitude: 4.4699 }, // 比利时
      AT: { latitude: 47.5162, longitude: 14.5501 }, // 奥地利
      PT: { latitude: 39.3999, longitude: -8.2245 }, // 葡萄牙
      GR: { latitude: 39.0742, longitude: 21.8243 }, // 希腊
      PL: { latitude: 51.9194, longitude: 19.1451 }, // 波兰
      CZ: { latitude: 49.8175, longitude: 15.4730 }, // 捷克
      HU: { latitude: 47.1625, longitude: 19.5033 }, // 匈牙利
      RO: { latitude: 45.9432, longitude: 24.9668 }, // 罗马尼亚
      BG: { latitude: 42.7339, longitude: 25.4858 }, // 保加利亚
      HR: { latitude: 45.1000, longitude: 15.2000 }, // 克罗地亚
      SI: { latitude: 46.1512, longitude: 14.9955 }, // 斯洛文尼亚
      SK: { latitude: 48.6690, longitude: 19.6990 }, // 斯洛伐克
      IE: { latitude: 53.4129, longitude: -8.2439 }, // 爱尔兰
      LU: { latitude: 49.8153, longitude: 6.1296 }, // 卢森堡
      MT: { latitude: 35.9375, longitude: 14.3754 }, // 马耳他
      CY: { latitude: 35.1264, longitude: 33.4299 }, // 塞浦路斯
      EE: { latitude: 58.5953, longitude: 25.0136 }, // 爱沙尼亚
      LV: { latitude: 56.8796, longitude: 24.6032 }, // 拉脱维亚
      LT: { latitude: 55.1694, longitude: 23.8813 }, // 立陶宛
    };

    return countryCenters[countryCode.toUpperCase()];
  }

  /**
   * 获取默认RouteDirection配置（国家特定）
   */
  getDefaultRouteDirectionConfig(countryCode: string): CountryConfig['defaultRouteDirectionConfig'] {
    // 国家特定的默认配置
    const countryDefaults: Record<string, CountryConfig['defaultRouteDirectionConfig']> = {
      IS: {
        // 冰岛默认配置
        defaultConstraints: {
          vehicleType: '4WD',
          roadConditions: ['F-road', 'gravel'],
        },
        defaultRiskProfile: {
          weatherRisk: 'HIGH',
          roadRisk: 'MEDIUM',
        },
        defaultFailureProfile: {
          commonFailureModes: ['weather', 'road_conditions'],
        },
      },
      NO: {
        // 挪威默认配置
        defaultConstraints: {
          vehicleType: 'standard',
          roadConditions: ['paved', 'gravel'],
        },
        defaultRiskProfile: {
          weatherRisk: 'MEDIUM',
          roadRisk: 'LOW',
        },
        defaultFailureProfile: {
          commonFailureModes: ['weather', 'ferry_schedules'],
        },
      },
    };

    return countryDefaults[countryCode.toUpperCase()] || {
      // 默认配置
      defaultConstraints: {
        vehicleType: 'standard',
        roadConditions: ['paved'],
      },
      defaultRiskProfile: {
        weatherRisk: 'MEDIUM',
        roadRisk: 'LOW',
      },
      defaultFailureProfile: {
        commonFailureModes: ['weather'],
      },
    };
  }

  /**
   * 获取国家特定的世界模型参数
   */
  getWorldModelParameters(countryCode: string): CountryConfig['worldModelParameters'] {
    // 国家特定的世界模型参数调整（扩展更多国家）
    const countryParameters: Record<string, CountryConfig['worldModelParameters']> = {
      IS: {
        // 冰岛：路线难度较高，时间估计需要增加缓冲
        routeDifficultyAdjustment: 1.2,
        timeEstimateAdjustment: 1.15,
        riskAssessmentAdjustment: 1.1,
      },
      NO: {
        // 挪威：路线难度中等，时间估计正常
        routeDifficultyAdjustment: 1.0,
        timeEstimateAdjustment: 1.05,
        riskAssessmentAdjustment: 1.0,
      },
      JP: {
        // 日本：路线难度较低，时间估计较准确
        routeDifficultyAdjustment: 0.9,
        timeEstimateAdjustment: 0.95,
        riskAssessmentAdjustment: 0.9,
      },
      GL: {
        // 格陵兰：路线难度很高，时间估计需要大幅增加缓冲
        routeDifficultyAdjustment: 1.3,
        timeEstimateAdjustment: 1.25,
        riskAssessmentAdjustment: 1.2,
      },
      CH: {
        // 瑞士：路线难度中等偏高，时间估计需要适度缓冲
        routeDifficultyAdjustment: 1.1,
        timeEstimateAdjustment: 1.1,
        riskAssessmentAdjustment: 1.05,
      },
      US: {
        // 美国：路线难度中等，时间估计正常
        routeDifficultyAdjustment: 1.0,
        timeEstimateAdjustment: 1.0,
        riskAssessmentAdjustment: 1.0,
      },
      CA: {
        // 加拿大：路线难度中等偏高，时间估计需要适度缓冲
        routeDifficultyAdjustment: 1.1,
        timeEstimateAdjustment: 1.1,
        riskAssessmentAdjustment: 1.05,
      },
      AU: {
        // 澳大利亚：路线难度中等，时间估计正常
        routeDifficultyAdjustment: 1.0,
        timeEstimateAdjustment: 1.0,
        riskAssessmentAdjustment: 1.0,
      },
      NZ: {
        // 新西兰：路线难度中等偏高，时间估计需要适度缓冲
        routeDifficultyAdjustment: 1.1,
        timeEstimateAdjustment: 1.1,
        riskAssessmentAdjustment: 1.05,
      },
      CN: {
        // 中国：路线难度中等，时间估计较准确
        routeDifficultyAdjustment: 1.0,
        timeEstimateAdjustment: 0.95,
        riskAssessmentAdjustment: 1.0,
      },
    };

    return countryParameters[countryCode.toUpperCase()] || {
      // 默认参数（无调整）
      routeDifficultyAdjustment: 1.0,
      timeEstimateAdjustment: 1.0,
      riskAssessmentAdjustment: 1.0,
    };
  }

  /**
   * 切换国家配置（用于国家数据迁移）
   */
  switchCountryConfig(
    fromCountryCode: string,
    toCountryCode: string,
  ): { migrated: boolean; message: string } {
    const fromConfig = this.getCountryConfig(fromCountryCode);
    const toConfig = this.getCountryConfig(toCountryCode);

    // 检查目标国家是否有数据文件
    const hasData =
      this.hasRoadStatusData(toCountryCode) ||
      this.hasWeatherWindowsData(toCountryCode) ||
      this.hasFerrySchedulesData(toCountryCode);

    if (!hasData) {
      return {
        migrated: false,
        message: `目标国家 ${toCountryCode} 缺少必要的数据文件`,
      };
    }

    // 国家切换成功（配置已加载）
    this.logger.log(
      `国家配置已切换: ${fromCountryCode} -> ${toCountryCode}`,
    );

    return {
      migrated: true,
      message: `国家配置已从 ${fromCountryCode} 切换到 ${toCountryCode}`,
    };
  }

  /**
   * 获取国家特定的地理编码坐标（同步版本，如果国家中心坐标不存在，返回undefined）
   */
  getGeocodingCoordinatesSync(countryCode: string): { latitude: number; longitude: number } | undefined {
    return this.getCenterCoordinates(countryCode);
  }
}
