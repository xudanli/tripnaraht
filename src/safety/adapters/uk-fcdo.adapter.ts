// src/safety/adapters/uk-fcdo.adapter.ts

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
 * 英国外交部 (FCDO) 旅行警告数据适配器
 * 
 * 数据源：https://www.gov.uk/foreign-travel-advice
 * API: https://www.gov.uk/api/content/foreign-travel-advice
 * 
 * 风险等级：
 * - No specific advice
 * - See our travel advice before travelling
 * - Advise against all but essential travel (to parts/all)
 * - Advise against all travel (to parts/all)
 */
@Injectable()
export class UkFcdoAdapter implements TravelAdvisoryAdapter {
  private readonly logger = new Logger(UkFcdoAdapter.name);
  private readonly http: AxiosInstance;
  private lastUpdated: Date | null = null;
  private advisoriesCache: Map<string, TravelAdvisoryDto> = new Map();
  private cacheExpiresAt: number = 0;
  private readonly cacheTtlMs = 6 * 60 * 60 * 1000; // 6小时缓存

  sourceName = 'UK Foreign Office (FCDO)';

  // 国家名称到ISO代码的映射（UK API使用国家名称作为标识符）
  private readonly countryNameToCode: Record<string, string> = {
    'afghanistan': 'AF',
    'albania': 'AL',
    'algeria': 'DZ',
    'argentina': 'AR',
    'armenia': 'AM',
    'australia': 'AU',
    'austria': 'AT',
    'azerbaijan': 'AZ',
    'bahrain': 'BH',
    'bangladesh': 'BD',
    'belarus': 'BY',
    'belgium': 'BE',
    'brazil': 'BR',
    'bulgaria': 'BG',
    'canada': 'CA',
    'chile': 'CL',
    'china': 'CN',
    'colombia': 'CO',
    'croatia': 'HR',
    'cuba': 'CU',
    'cyprus': 'CY',
    'czech-republic': 'CZ',
    'denmark': 'DK',
    'egypt': 'EG',
    'estonia': 'EE',
    'finland': 'FI',
    'france': 'FR',
    'georgia': 'GE',
    'germany': 'DE',
    'greece': 'GR',
    'hong-kong': 'HK',
    'hungary': 'HU',
    'iceland': 'IS',
    'india': 'IN',
    'indonesia': 'ID',
    'iran': 'IR',
    'iraq': 'IQ',
    'ireland': 'IE',
    'israel': 'IL',
    'italy': 'IT',
    'japan': 'JP',
    'jordan': 'JO',
    'kazakhstan': 'KZ',
    'kenya': 'KE',
    'north-korea': 'KP',
    'south-korea': 'KR',
    'kuwait': 'KW',
    'lebanon': 'LB',
    'libya': 'LY',
    'lithuania': 'LT',
    'latvia': 'LV',
    'luxembourg': 'LU',
    'malaysia': 'MY',
    'mexico': 'MX',
    'morocco': 'MA',
    'netherlands': 'NL',
    'new-zealand': 'NZ',
    'nigeria': 'NG',
    'norway': 'NO',
    'oman': 'OM',
    'pakistan': 'PK',
    'the-occupied-palestinian-territories': 'PS',
    'panama': 'PA',
    'philippines': 'PH',
    'poland': 'PL',
    'portugal': 'PT',
    'qatar': 'QA',
    'romania': 'RO',
    'russia': 'RU',
    'saudi-arabia': 'SA',
    'serbia': 'RS',
    'singapore': 'SG',
    'slovakia': 'SK',
    'slovenia': 'SI',
    'south-africa': 'ZA',
    'spain': 'ES',
    'sweden': 'SE',
    'switzerland': 'CH',
    'syria': 'SY',
    'taiwan': 'TW',
    'thailand': 'TH',
    'turkey': 'TR',
    'ukraine': 'UA',
    'united-arab-emirates': 'AE',
    'united-states': 'US',
    'venezuela': 'VE',
    'vietnam': 'VN',
    'yemen': 'YE',
    'sudan': 'SD',
    'south-sudan': 'SS',
    'somalia': 'SO',
    'haiti': 'HT',
    'mali': 'ML',
    'myanmar-burma': 'MM',
  };

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.http = axios.create({
      baseURL: 'https://www.gov.uk/api/content',
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TripNARA-Safety-Service/1.0',
      },
    });

    this.logger.log('英国外交部(FCDO)旅行警告适配器已初始化');
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
      // 查找国家slug
      const slug = this.findCountrySlug(upperCode);
      if (!slug) {
        this.logger.debug(`未找到国家代码 ${upperCode} 对应的FCDO页面`);
        return null;
      }

      const advisory = await this.fetchSingleAdvisory(slug, upperCode);
      if (advisory) {
        this.advisoriesCache.set(upperCode, advisory);
      }
      return advisory;
    } catch (error: any) {
      this.logger.error(`获取 ${upperCode} FCDO警告失败: ${error.message}`);
      return this.advisoriesCache.get(upperCode) || null;
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
      await this.refreshAllAdvisories();
      return Array.from(this.advisoriesCache.values());
    } catch (error: any) {
      this.logger.error(`获取所有FCDO警告失败: ${error.message}`);
      this.loadFallbackData();
      return Array.from(this.advisoriesCache.values());
    }
  }

  /**
   * 查找国家代码对应的slug
   */
  private findCountrySlug(countryCode: string): string | null {
    for (const [slug, code] of Object.entries(this.countryNameToCode)) {
      if (code === countryCode) {
        return slug;
      }
    }
    return null;
  }

  /**
   * 获取单个国家的警告
   */
  private async fetchSingleAdvisory(slug: string, countryCode: string): Promise<TravelAdvisoryDto | null> {
    try {
      const response = await this.http.get(`/foreign-travel-advice/${slug}`);
      const data = response.data;

      if (!data) {
        return null;
      }

      return this.parseAdvisory(data, countryCode);
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.debug(`FCDO未找到国家: ${slug}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * 刷新所有警告
   */
  private async refreshAllAdvisories(): Promise<void> {
    this.logger.debug('正在刷新FCDO旅行警告数据...');

    // 获取所有国家列表
    const response = await this.http.get('/foreign-travel-advice');
    const countries = response.data?.links?.children || [];

    let successCount = 0;
    const batchSize = 10;

    for (let i = 0; i < countries.length; i += batchSize) {
      const batch = countries.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (country: any) => {
          try {
            const slug = country.base_path?.replace('/foreign-travel-advice/', '');
            const countryCode = this.countryNameToCode[slug];
            
            if (slug && countryCode) {
              const advisory = await this.fetchSingleAdvisory(slug, countryCode);
              if (advisory) {
                this.advisoriesCache.set(countryCode, advisory);
                successCount++;
              }
            }
          } catch (error: any) {
            this.logger.debug(`获取单个国家警告失败: ${error.message}`);
          }
        }),
      );
    }

    this.cacheExpiresAt = Date.now() + this.cacheTtlMs;
    this.lastUpdated = new Date();
    this.logger.log(`成功刷新 ${successCount} 条FCDO旅行警告`);
  }

  /**
   * 解析警告数据
   */
  private parseAdvisory(data: any, countryCode: string): TravelAdvisoryDto | null {
    const details = data.details || {};
    const alertStatus = details.alert_status || [];
    const summary = details.summary || '';
    
    // 解析风险等级
    const riskLevel = this.parseRiskLevel(alertStatus, summary);
    
    // 解析风险类型
    const riskTypes = this.parseRiskTypes(summary, alertStatus);

    return {
      id: `uk-fcdo-${countryCode}-${Date.now()}`,
      source: DataSourceType.UK_FCDO,
      countryCode,
      riskLevel,
      title: data.title || `${COUNTRY_NAMES[countryCode] || countryCode} Travel Advice`,
      description: this.cleanHtml(summary) || 'See the latest travel advice for this destination.',
      riskTypes,
      publishedAt: new Date(data.first_published_at || Date.now()),
      updatedAt: data.public_updated_at ? new Date(data.public_updated_at) : undefined,
      sourceUrl: `https://www.gov.uk${data.base_path || '/foreign-travel-advice/' + countryCode.toLowerCase()}`,
    };
  }

  /**
   * 解析风险等级
   */
  private parseRiskLevel(alertStatus: any[], summary: string): number {
    const statusText = alertStatus.join(' ').toLowerCase();
    const summaryLower = summary.toLowerCase();
    const combinedText = `${statusText} ${summaryLower}`;

    if (combinedText.includes('advise against all travel')) {
      return mapToGeopoliticalRiskLevel('advise against all travel', 'UK_FCDO');
    }
    if (combinedText.includes('advise against all but essential travel')) {
      return mapToGeopoliticalRiskLevel('advise against all but essential travel', 'UK_FCDO');
    }
    if (combinedText.includes('high degree of caution')) {
      return mapToGeopoliticalRiskLevel('high degree of caution', 'UK_FCDO');
    }
    
    return mapToGeopoliticalRiskLevel('see our travel advice', 'UK_FCDO');
  }

  /**
   * 解析风险类型
   */
  private parseRiskTypes(summary: string, alertStatus: any[]): RiskType[] {
    const types: RiskType[] = [];
    const text = `${summary} ${alertStatus.join(' ')}`.toLowerCase();

    if (text.includes('terrorism') || text.includes('terrorist')) {
      types.push(RiskType.TERRORISM);
    }
    if (text.includes('war') || text.includes('armed conflict') || text.includes('military operations')) {
      types.push(RiskType.WAR);
      types.push(RiskType.ARMED_CONFLICT);
    }
    if (text.includes('civil unrest') || text.includes('demonstration') || text.includes('protest')) {
      types.push(RiskType.CIVIL_UNREST);
    }
    if (text.includes('crime') || text.includes('robbery') || text.includes('violent crime')) {
      types.push(RiskType.CRIME);
    }
    if (text.includes('kidnapping') || text.includes('hostage')) {
      types.push(RiskType.KIDNAPPING);
    }
    if (text.includes('political') || text.includes('instability')) {
      types.push(RiskType.POLITICAL_INSTABILITY);
    }
    if (text.includes('natural disaster') || text.includes('earthquake') || text.includes('hurricane')) {
      types.push(RiskType.NATURAL_DISASTER);
    }

    return types;
  }

  /**
   * 清理HTML标签
   */
  private cleanHtml(html: string): string {
    if (!html) return '';
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 加载备用数据
   */
  private loadFallbackData(): void {
    const fallbackData: Array<{ code: string; level: string; risks: RiskType[] }> = [
      { code: 'AF', level: 'advise against all travel', risks: [RiskType.WAR, RiskType.TERRORISM] },
      { code: 'IR', level: 'advise against all travel', risks: [RiskType.POLITICAL_INSTABILITY, RiskType.TERRORISM] },
      { code: 'IQ', level: 'advise against all travel', risks: [RiskType.TERRORISM, RiskType.ARMED_CONFLICT] },
      { code: 'LY', level: 'advise against all travel', risks: [RiskType.ARMED_CONFLICT, RiskType.TERRORISM] },
      { code: 'SY', level: 'advise against all travel', risks: [RiskType.WAR, RiskType.TERRORISM] },
      { code: 'YE', level: 'advise against all travel', risks: [RiskType.WAR, RiskType.TERRORISM] },
      { code: 'UA', level: 'advise against all travel', risks: [RiskType.WAR, RiskType.ARMED_CONFLICT] },
      { code: 'RU', level: 'advise against all travel', risks: [RiskType.POLITICAL_INSTABILITY] },
      { code: 'BY', level: 'advise against all travel', risks: [RiskType.POLITICAL_INSTABILITY] },
      { code: 'SD', level: 'advise against all travel', risks: [RiskType.ARMED_CONFLICT, RiskType.CIVIL_UNREST] },
      { code: 'SS', level: 'advise against all travel', risks: [RiskType.ARMED_CONFLICT] },
      { code: 'SO', level: 'advise against all travel', risks: [RiskType.TERRORISM, RiskType.ARMED_CONFLICT] },
      { code: 'IL', level: 'advise against all but essential travel', risks: [RiskType.ARMED_CONFLICT, RiskType.TERRORISM] },
      { code: 'PS', level: 'advise against all travel', risks: [RiskType.ARMED_CONFLICT] },
      { code: 'LB', level: 'advise against all but essential travel', risks: [RiskType.ARMED_CONFLICT, RiskType.TERRORISM] },
    ];

    for (const data of fallbackData) {
      const advisory: TravelAdvisoryDto = {
        id: `uk-fcdo-${data.code}-fallback`,
        source: DataSourceType.UK_FCDO,
        countryCode: data.code,
        riskLevel: mapToGeopoliticalRiskLevel(data.level, 'UK_FCDO'),
        title: `${COUNTRY_NAMES[data.code] || data.code} Travel Advice`,
        description: `FCDO ${data.level.replace('advise', 'advises')} to ${COUNTRY_NAMES[data.code] || data.code}.`,
        riskTypes: data.risks,
        publishedAt: new Date(),
        sourceUrl: `https://www.gov.uk/foreign-travel-advice/${data.code.toLowerCase()}`,
      };
      this.advisoriesCache.set(data.code, advisory);
    }

    this.cacheExpiresAt = Date.now() + this.cacheTtlMs;
    this.lastUpdated = new Date();
    this.logger.log(`已加载 ${this.advisoriesCache.size} 条FCDO备用数据`);
  }
}
