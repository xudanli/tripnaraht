// src/safety/adapters/us-state-dept.adapter.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  TravelAdvisoryDto,
  DataSourceType,
  RiskType,
} from '../dto/geopolitical-risk.dto';
import {
  TravelAdvisoryAdapter,
  mapToGeopoliticalRiskLevel,
  COUNTRY_NAMES,
} from '../interfaces/travel-advisory-adapter.interface';

/**
 * 美国国务院旅行警告数据适配器
 * 
 * 数据源：https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html
 * API: https://cadatalog.state.gov/catalog/api/
 * 
 * 风险等级映射：
 * - Level 1: Exercise Normal Precautions
 * - Level 2: Exercise Increased Caution  
 * - Level 3: Reconsider Travel
 * - Level 4: Do Not Travel
 */
@Injectable()
export class UsStateDeptAdapter implements TravelAdvisoryAdapter {
  private readonly logger = new Logger(UsStateDeptAdapter.name);
  private readonly http: AxiosInstance;
  private lastUpdated: Date | null = null;
  private advisoriesCache: Map<string, TravelAdvisoryDto> = new Map();
  private cacheExpiresAt: number = 0;
  private readonly cacheTtlMs = 6 * 60 * 60 * 1000; // 6小时缓存

  sourceName = 'US State Department';

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.http = axios.create({
      baseURL: 'https://cadatalog.state.gov/catalog/api',
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TripNARA-Safety-Service/1.0',
      },
    });

    this.logger.log('美国国务院旅行警告适配器已初始化');
  }

  isAvailable(): boolean {
    return true;
  }

  getLastUpdated(): Date | null {
    return this.lastUpdated;
  }

  /**
   * 获取指定国家的旅行警告
   */
  async getAdvisory(countryCode: string): Promise<TravelAdvisoryDto | null> {
    const upperCode = countryCode.toUpperCase();
    
    // 检查缓存
    if (this.cacheExpiresAt > Date.now() && this.advisoriesCache.has(upperCode)) {
      return this.advisoriesCache.get(upperCode) || null;
    }

    try {
      // 刷新所有数据
      await this.refreshAdvisories();
      return this.advisoriesCache.get(upperCode) || null;
    } catch (error: any) {
      this.logger.error(`获取 ${upperCode} 旅行警告失败: ${error.message}`);
      
      // 返回缓存数据（即使过期）
      if (this.advisoriesCache.has(upperCode)) {
        this.logger.warn(`使用过期缓存数据: ${upperCode}`);
        return this.advisoriesCache.get(upperCode) || null;
      }
      
      return null;
    }
  }

  /**
   * 获取所有国家的旅行警告
   */
  async getAllAdvisories(): Promise<TravelAdvisoryDto[]> {
    // 检查缓存
    if (this.cacheExpiresAt > Date.now() && this.advisoriesCache.size > 0) {
      return Array.from(this.advisoriesCache.values());
    }

    try {
      await this.refreshAdvisories();
      return Array.from(this.advisoriesCache.values());
    } catch (error: any) {
      this.logger.error(`获取所有旅行警告失败: ${error.message}`);
      return Array.from(this.advisoriesCache.values());
    }
  }

  /**
   * 刷新警告数据
   */
  private async refreshAdvisories(): Promise<void> {
    this.logger.debug('正在刷新美国国务院旅行警告数据...');

    try {
      // 尝试从官方API获取数据
      const response = await this.fetchFromApi();
      
      if (response && response.length > 0) {
        this.processAdvisories(response);
        this.cacheExpiresAt = Date.now() + this.cacheTtlMs;
        this.lastUpdated = new Date();
        this.logger.log(`成功刷新 ${this.advisoriesCache.size} 条旅行警告`);
      }
    } catch (error: any) {
      this.logger.warn(`API获取失败，使用备用数据: ${error.message}`);
      // 使用硬编码的备用数据（关键高风险国家）
      this.loadFallbackData();
    }
  }

  /**
   * 从API获取数据
   */
  private async fetchFromApi(): Promise<any[]> {
    // 注意：实际API可能需要调整端点和参数
    // 这里使用模拟数据结构，实际部署时需要根据真实API调整
    const response = await this.http.get('/1/resources', {
      params: {
        resource_type: 'travel_advisory',
        limit: 300,
      },
    });

    return response.data?.resources || [];
  }

  /**
   * 处理API返回的警告数据
   */
  private processAdvisories(rawData: any[]): void {
    for (const item of rawData) {
      try {
        const countryCode = this.extractCountryCode(item);
        if (!countryCode) continue;

        const advisory = this.parseAdvisory(item, countryCode);
        if (advisory) {
          this.advisoriesCache.set(countryCode, advisory);
        }
      } catch (error: any) {
        this.logger.debug(`解析警告数据失败: ${error.message}`);
      }
    }
  }

  /**
   * 提取国家代码
   */
  private extractCountryCode(item: any): string | null {
    // 尝试多种字段获取国家代码
    const code = item.iso_code || item.country_code || item.iso_alpha2;
    return code ? code.toUpperCase() : null;
  }

  /**
   * 解析单条警告
   */
  private parseAdvisory(item: any, countryCode: string): TravelAdvisoryDto | null {
    const level = parseInt(item.advisory_level || item.level || '2', 10);
    
    return {
      id: `us-state-dept-${countryCode}-${Date.now()}`,
      source: DataSourceType.US_STATE_DEPT,
      countryCode,
      riskLevel: mapToGeopoliticalRiskLevel(level, 'US_STATE_DEPT'),
      title: item.title || `${COUNTRY_NAMES[countryCode] || countryCode} Travel Advisory`,
      description: item.description || item.advisory_text || this.getDefaultDescription(level),
      riskTypes: this.inferRiskTypes(item, level),
      publishedAt: new Date(item.published_date || item.date || Date.now()),
      updatedAt: item.updated_date ? new Date(item.updated_date) : undefined,
      sourceUrl: item.url || `https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories/${countryCode.toLowerCase()}-travel-advisory.html`,
    };
  }

  /**
   * 获取默认描述
   */
  private getDefaultDescription(level: number): string {
    switch (level) {
      case 1:
        return 'Exercise normal precautions when traveling to this country.';
      case 2:
        return 'Exercise increased caution when traveling to this country due to various risks.';
      case 3:
        return 'Reconsider travel to this country due to serious risks. US citizens should carefully consider the risks of traveling.';
      case 4:
        return 'Do not travel to this country. US citizens should not travel due to very serious threats to safety and security.';
      default:
        return 'Please check the latest travel advisory before planning your trip.';
    }
  }

  /**
   * 推断风险类型
   */
  private inferRiskTypes(item: any, level: number): RiskType[] {
    const types: RiskType[] = [];
    const text = `${item.description || ''} ${item.advisory_text || ''} ${item.risks || ''}`.toLowerCase();

    if (text.includes('terrorism') || text.includes('terrorist')) {
      types.push(RiskType.TERRORISM);
    }
    if (text.includes('war') || text.includes('armed conflict') || text.includes('military')) {
      types.push(RiskType.WAR);
      types.push(RiskType.ARMED_CONFLICT);
    }
    if (text.includes('civil unrest') || text.includes('demonstration') || text.includes('protest')) {
      types.push(RiskType.CIVIL_UNREST);
    }
    if (text.includes('crime') || text.includes('robbery') || text.includes('violence')) {
      types.push(RiskType.CRIME);
    }
    if (text.includes('kidnapping') || text.includes('kidnap')) {
      types.push(RiskType.KIDNAPPING);
    }
    if (text.includes('political') || text.includes('instability')) {
      types.push(RiskType.POLITICAL_INSTABILITY);
    }

    // 根据等级添加默认风险类型
    if (types.length === 0) {
      if (level >= 4) {
        types.push(RiskType.ARMED_CONFLICT);
      } else if (level >= 3) {
        types.push(RiskType.POLITICAL_INSTABILITY);
      }
    }

    return types;
  }

  /**
   * 加载备用数据 - 关键高风险国家的硬编码数据
   * 当API不可用时使用
   */
  private loadFallbackData(): void {
    const fallbackData: Array<{ code: string; level: number; risks: RiskType[]; desc: string }> = [
      // Level 4: Do Not Travel
      { code: 'AF', level: 4, risks: [RiskType.WAR, RiskType.TERRORISM, RiskType.KIDNAPPING], desc: 'Armed conflict, terrorism, kidnapping, civil unrest' },
      { code: 'IR', level: 4, risks: [RiskType.TERRORISM, RiskType.KIDNAPPING, RiskType.POLITICAL_INSTABILITY], desc: 'Risk of detention, terrorism, civil unrest' },
      { code: 'IQ', level: 4, risks: [RiskType.TERRORISM, RiskType.ARMED_CONFLICT, RiskType.KIDNAPPING], desc: 'Terrorism, armed conflict, kidnapping' },
      { code: 'LY', level: 4, risks: [RiskType.ARMED_CONFLICT, RiskType.TERRORISM, RiskType.CRIME], desc: 'Armed conflict, terrorism, crime, kidnapping' },
      { code: 'KP', level: 4, risks: [RiskType.POLITICAL_INSTABILITY], desc: 'Risk of arrest and long-term detention' },
      { code: 'RU', level: 4, risks: [RiskType.WAR, RiskType.POLITICAL_INSTABILITY], desc: 'Potential for harassment, arbitrary enforcement of laws' },
      { code: 'SY', level: 4, risks: [RiskType.WAR, RiskType.TERRORISM, RiskType.KIDNAPPING], desc: 'Armed conflict, terrorism, civil unrest, kidnapping' },
      { code: 'VE', level: 4, risks: [RiskType.CRIME, RiskType.CIVIL_UNREST, RiskType.POLITICAL_INSTABILITY], desc: 'Crime, civil unrest, poor health infrastructure' },
      { code: 'YE', level: 4, risks: [RiskType.WAR, RiskType.TERRORISM, RiskType.KIDNAPPING], desc: 'Armed conflict, terrorism, kidnapping, landmines' },
      { code: 'UA', level: 4, risks: [RiskType.WAR, RiskType.ARMED_CONFLICT], desc: 'Active armed conflict, military action' },
      { code: 'BY', level: 4, risks: [RiskType.POLITICAL_INSTABILITY], desc: 'Risk of detention, arbitrary enforcement of laws' },
      { code: 'MM', level: 4, risks: [RiskType.ARMED_CONFLICT, RiskType.CIVIL_UNREST], desc: 'Armed conflict, civil unrest, limited consular assistance' },
      { code: 'SD', level: 4, risks: [RiskType.ARMED_CONFLICT, RiskType.TERRORISM, RiskType.CIVIL_UNREST], desc: 'Armed conflict, civil unrest, terrorism' },
      { code: 'SS', level: 4, risks: [RiskType.ARMED_CONFLICT, RiskType.CRIME, RiskType.KIDNAPPING], desc: 'Crime, armed conflict, kidnapping' },
      { code: 'SO', level: 4, risks: [RiskType.TERRORISM, RiskType.ARMED_CONFLICT, RiskType.KIDNAPPING], desc: 'Terrorism, crime, piracy, kidnapping' },
      
      // Level 3: Reconsider Travel
      { code: 'LB', level: 3, risks: [RiskType.TERRORISM, RiskType.ARMED_CONFLICT], desc: 'Terrorism, armed conflict in border areas' },
      { code: 'PK', level: 3, risks: [RiskType.TERRORISM], desc: 'Terrorism, extremism' },
      { code: 'BD', level: 3, risks: [RiskType.TERRORISM, RiskType.CIVIL_UNREST], desc: 'Terrorism, civil unrest, crime' },
      { code: 'HT', level: 4, risks: [RiskType.CRIME, RiskType.KIDNAPPING, RiskType.CIVIL_UNREST], desc: 'Kidnapping, crime, civil unrest' },
      { code: 'ML', level: 4, risks: [RiskType.TERRORISM, RiskType.KIDNAPPING], desc: 'Terrorism, crime, kidnapping' },
      { code: 'NI', level: 3, risks: [RiskType.CIVIL_UNREST, RiskType.POLITICAL_INSTABILITY], desc: 'Limited healthcare, arbitrary enforcement of laws, civil unrest' },
      { code: 'NG', level: 3, risks: [RiskType.TERRORISM, RiskType.CRIME, RiskType.KIDNAPPING], desc: 'Terrorism, crime, kidnapping, civil unrest' },
      
      // Middle East - 重点关注
      { code: 'IL', level: 3, risks: [RiskType.TERRORISM, RiskType.ARMED_CONFLICT], desc: 'Terrorism, civil unrest, armed conflict in border areas' },
      { code: 'PS', level: 4, risks: [RiskType.ARMED_CONFLICT, RiskType.TERRORISM], desc: 'Armed conflict, terrorism, civil unrest' },
      { code: 'SA', level: 3, risks: [RiskType.TERRORISM], desc: 'Terrorism, missile and drone attacks' },
      { code: 'AE', level: 2, risks: [RiskType.TERRORISM], desc: 'Exercise increased caution due to threat of terrorism' },
      { code: 'JO', level: 2, risks: [RiskType.TERRORISM], desc: 'Exercise increased caution due to terrorism' },
      { code: 'EG', level: 3, risks: [RiskType.TERRORISM], desc: 'Terrorism, civil unrest in some areas' },
    ];

    for (const data of fallbackData) {
      const advisory: TravelAdvisoryDto = {
        id: `us-state-dept-${data.code}-fallback`,
        source: DataSourceType.US_STATE_DEPT,
        countryCode: data.code,
        riskLevel: mapToGeopoliticalRiskLevel(data.level, 'US_STATE_DEPT'),
        title: `${COUNTRY_NAMES[data.code] || data.code} Travel Advisory - Level ${data.level}`,
        description: data.desc,
        riskTypes: data.risks,
        publishedAt: new Date(),
        sourceUrl: `https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories/${data.code.toLowerCase()}-travel-advisory.html`,
      };
      this.advisoriesCache.set(data.code, advisory);
    }

    this.cacheExpiresAt = Date.now() + this.cacheTtlMs;
    this.lastUpdated = new Date();
    this.logger.log(`已加载 ${this.advisoriesCache.size} 条备用旅行警告数据`);
  }
}
