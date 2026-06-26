/**
 * Exa Integration Service
 * 
 * 封装 Exa 搜索逻辑，提供缓存和错误处理
 * 用于在决策流程中集成实时信息搜索
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ExaService } from './exa.service';
import { RedisService } from '../redis/redis.service';
import { ExaMonitoringService } from './exa-monitoring.service';

export interface RealTimeRiskInfo {
  hasRisk: boolean;
  riskType?: 'ROAD_CLOSED' | 'WEATHER' | 'GEOLOGICAL' | 'POLITICAL' | 'TRANSPORT';
  riskDescription?: string;
  source?: string;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface ParsedSearchResult {
  title?: string;
  text: string;
  url?: string;
}

export interface RealTimeDestinationInfo {
  isOpen: boolean;
  status?: string;
  alternatives?: string[];
  source?: string;
}

@Injectable()
export class ExaIntegrationService {
  private readonly logger = new Logger(ExaIntegrationService.name);

  constructor(
    @Optional() private readonly exaService?: ExaService,
    @Optional() private readonly redisService?: RedisService,
    @Optional() private readonly monitoring?: ExaMonitoringService,
  ) {
    if (!exaService) {
      this.logger.warn('ExaService not available, Exa integration will be disabled');
    }
  }

  /**
   * 搜索实时风险信息（用于 Abu 安全检查）
   * 
   * @param countryCode 国家代码
   * @param routeName 路线名称
   * @param month 月份（1-12）
   * @param year 年份（默认当前年份）
   */
  async searchRealTimeRisks(
    countryCode: string,
    routeName: string,
    month: number,
    year: number = new Date().getFullYear(),
  ): Promise<RealTimeRiskInfo> {
    if (!this.exaService) {
      this.logger.debug('ExaService not available, skipping real-time risk search');
      return { hasRisk: false };
    }

    const cacheKey = `exa:risk:${countryCode}:${routeName}:${month}:${year}`;
    
    // 检查缓存（实时风险信息缓存 1-6 小时）
    if (this.redisService) {
      try {
        const cached = await this.redisService.get<string>(cacheKey);
        if (cached) {
          this.logger.debug(`Using cached risk info for ${countryCode} ${routeName}`);
          return JSON.parse(cached);
        }
      } catch (error) {
        this.logger.warn('Failed to get cached risk info:', error);
      }
    }

    const startTime = Date.now();
    try {
      // 构建搜索查询
      const query = this.buildRiskSearchQuery(countryCode, routeName, month, year);
      
      // 调用 Exa 搜索
      const result = await this.exaService.webSearch(query, {
        numResults: 5,
        useAutoprompt: true,
      });

      // 记录调用指标
      const responseTime = Date.now() - startTime;
      await this.monitoring?.recordCall({
        timestamp: Date.now(),
        toolName: 'web_search_exa',
        success: true,
        responseTime,
        resultCount: result?.content?.length || 0,
      });

      // 解析搜索结果
      const riskInfo = this.parseRiskSearchResult(result, countryCode, routeName, month);

      // 缓存结果（1小时）
      if (this.redisService && riskInfo.hasRisk) {
        try {
          await this.redisService.set(cacheKey, JSON.stringify(riskInfo), 3600);
        } catch (error) {
          this.logger.warn('Failed to cache risk info:', error);
        }
      }

      return riskInfo;
    } catch (error: any) {
      // 记录失败指标
      const responseTime = Date.now() - startTime;
      await this.monitoring?.recordCall({
        timestamp: Date.now(),
        toolName: 'web_search_exa',
        success: false,
        responseTime,
        error: error.message,
      });

      this.logger.warn(`Exa risk search failed: ${error.message}, falling back to structured data`);
      // 降级：返回无风险，继续使用结构化数据
      return { hasRisk: false };
    }
  }

  /**
   * 搜索目的地实时动态信息（用于 Neptune 空间修复）
   */
  async searchDestinationStatus(
    destination: string,
    category: string,
    month: number,
    year: number = new Date().getFullYear(),
  ): Promise<RealTimeDestinationInfo> {
    if (!this.exaService) {
      this.logger.debug('ExaService not available, skipping destination status search');
      return { isOpen: true };
    }

    const cacheKey = `exa:destination:${destination}:${category}:${month}:${year}`;
    
    // 检查缓存（目的地动态信息缓存 6-24 小时）
    if (this.redisService) {
      try {
        const cached = await this.redisService.get<string>(cacheKey);
        if (cached) {
          this.logger.debug(`Using cached destination status for ${destination}`);
          return JSON.parse(cached);
        }
      } catch (error) {
        this.logger.warn('Failed to get cached destination status:', error);
      }
    }

    try {
      const query = `${destination} ${category} ${year}年${month}月 开放 状态`;
      const result = await this.exaService.webSearch(query, {
        numResults: 3,
        useAutoprompt: true,
      });

      const statusInfo = this.parseDestinationStatusResult(result);

      // 缓存结果（6小时）
      if (this.redisService) {
        try {
          await this.redisService.set(cacheKey, JSON.stringify(statusInfo), 21600);
        } catch (error) {
          this.logger.warn('Failed to cache destination status:', error);
        }
      }

      return statusInfo;
    } catch (error: any) {
      this.logger.warn(`Exa destination status search failed: ${error.message}`);
      return { isOpen: true }; // 降级：假设开放
    }
  }

  /**
   * 构建风险搜索查询
   */
  private buildRiskSearchQuery(
    countryCode: string,
    routeName: string,
    month: number,
    year: number,
  ): string {
    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    const monthName = monthNames[month - 1];

    const countryName = this.getCountrySearchName(countryCode);
    return `"${countryName}" "${routeName}" ${year} ${monthName} road closure safety closed blocked`;
  }

  /**
   * 解析风险搜索结果
   */
  private parseRiskSearchResult(
    result: any,
    countryCode: string,
    routeName: string,
    _month: number,
  ): RealTimeRiskInfo {
    if (!result || !result.content || !result.content[0]) {
      return { hasRisk: false };
    }

    const content = result.content[0];
    if (content.type !== 'text') {
      return { hasRisk: false };
    }

    const results = this.parseSearchResultItems(content.text);
    if (results.length === 0) {
      return { hasRisk: false };
    }

    // 检查风险关键词
    const riskKeywords = {
      ROAD_CLOSED: ['封闭', '关闭', '禁止通行', '封路', 'closed', 'blocked'],
      WEATHER: ['暴雪', '洪水', '台风', '极端天气', 'blizzard', 'flood', 'storm'],
      GEOLOGICAL: ['地震', '山体滑坡', '地质灾害', 'earthquake', 'landslide'],
      POLITICAL: ['抗议', '冲突', '安全事件', 'protest', 'conflict'],
      TRANSPORT: ['维修', '事故', '中断', 'maintenance', 'accident'],
    };

    for (const item of results) {
      const searchableText = `${item.title || ''} ${item.text} ${item.url || ''}`;
      if (!this.isRiskResultRelevantToRoute(searchableText, countryCode, routeName)) {
        continue;
      }

      const lowerText = searchableText.toLowerCase();
      for (const [riskType, keywords] of Object.entries(riskKeywords)) {
        if (keywords.some(keyword => lowerText.includes(keyword))) {
          return {
            hasRisk: true,
            riskType: riskType as RealTimeRiskInfo['riskType'],
            riskDescription: this.extractRiskDescription(item.text || item.title || searchableText, keywords),
            source: item.url,
            confidence: this.resultMentionsRoute(searchableText, routeName) ? 'HIGH' : 'MEDIUM',
          };
        }
      }
    }

    return { hasRisk: false };
  }

  private parseSearchResultItems(rawText: string): ParsedSearchResult[] {
    try {
      const parsed = JSON.parse(rawText);
      if (Array.isArray(parsed.results)) {
        return parsed.results
          .map((r: any) => ({
            title: typeof r.title === 'string' ? r.title : undefined,
            text: typeof r.text === 'string' ? r.text : typeof r.title === 'string' ? r.title : '',
            url: typeof r.url === 'string' ? r.url : undefined,
          }))
          .filter((r: ParsedSearchResult) => r.text || r.title || r.url);
      }
    } catch {
      // Fall through to raw text handling.
    }
    return rawText ? [{ text: rawText }] : [];
  }

  private isRiskResultRelevantToRoute(text: string, countryCode: string, routeName: string): boolean {
    const normalized = text.toLowerCase();
    const countryAliases = this.getCountryAliases(countryCode);
    const hasCountrySignal = countryAliases.some(alias => normalized.includes(alias.toLowerCase()));
    const hasRouteSignal = this.resultMentionsRoute(text, routeName);

    // For country-level advisories, country signal is enough. Otherwise require the route to be named.
    return hasCountrySignal || hasRouteSignal;
  }

  private resultMentionsRoute(text: string, routeName: string): boolean {
    const normalized = text.toLowerCase();
    const tokens = routeName
      .split(/[\s,，、/|·\-–—()（）]+/)
      .map(token => token.trim())
      .filter(token => token.length >= 3);
    return tokens.some(token => normalized.includes(token.toLowerCase()));
  }

  private getCountrySearchName(countryCode: string): string {
    return this.getCountryAliases(countryCode)[0] || countryCode.toUpperCase();
  }

  private getCountryAliases(countryCode: string): string[] {
    const code = countryCode.toUpperCase();
    const aliases: Record<string, string[]> = {
      IS: ['Iceland', '冰岛', 'Ísland', '.is'],
      CN: ['China', '中国', '中华人民共和国', '.cn'],
      JP: ['Japan', '日本', '.jp'],
      US: ['United States', 'USA', '美国', '.us'],
      FR: ['France', '法国', '.fr'],
      IT: ['Italy', '意大利', '.it'],
      CH: ['Switzerland', 'Swiss', '瑞士', '.ch'],
      NP: ['Nepal', '尼泊尔', '.np'],
    };
    return aliases[code] || [code];
  }

  /**
   * 提取风险描述
   */
  private extractRiskDescription(text: string, keywords: string[]): string {
    // 简单提取：找到包含关键词的句子
    const sentences = text.split(/[。！？\n]/);
    for (const sentence of sentences) {
      if (keywords.some(keyword => sentence.toLowerCase().includes(keyword))) {
        return sentence.trim().substring(0, 200);
      }
    }
    return text.substring(0, 200);
  }

  /**
   * 深度风险搜索（用于高风险场景）
   * 
   * @param countryCode 国家代码
   * @param routeName 路线名称
   * @param month 月份（1-12）
   * @param year 年份（默认当前年份）
   */
  async searchDeepRisks(
    countryCode: string,
    routeName: string,
    month: number,
    year: number = new Date().getFullYear(),
  ): Promise<RealTimeRiskInfo> {
    if (!this.exaService) {
      this.logger.debug('ExaService not available, skipping deep risk search');
      return { hasRisk: false };
    }

    const cacheKey = `exa:deeprisk:${countryCode}:${routeName}:${month}:${year}`;
    
    // 检查缓存（深度风险信息缓存 6-12 小时）
    if (this.redisService) {
      try {
        const cached = await this.redisService.get<string>(cacheKey);
        if (cached) {
          this.logger.debug(`Using cached deep risk info for ${countryCode} ${routeName}`);
          return JSON.parse(cached);
        }
      } catch (error) {
        this.logger.warn('Failed to get cached deep risk info:', error);
      }
    }

    const startTime = Date.now();
    try {
      const query = this.buildRiskSearchQuery(countryCode, routeName, month, year);
      
      // 使用深度搜索获取更全面的风险信息
      const result = await this.exaService.deepSearch(query, {
        numResults: 10,
      });

      // 记录调用指标
      const responseTime = Date.now() - startTime;
      await this.monitoring?.recordCall({
        timestamp: Date.now(),
        toolName: 'deep_search_exa',
        success: true,
        responseTime,
        resultCount: result?.content?.length || 0,
      });

      const riskInfo = this.parseRiskSearchResult(result, countryCode, routeName, month);

      // 缓存结果（6小时）
      if (this.redisService && riskInfo.hasRisk) {
        try {
          await this.redisService.set(cacheKey, JSON.stringify(riskInfo), 21600);
        } catch (error) {
          this.logger.warn('Failed to cache deep risk info:', error);
        }
      }

      return riskInfo;
    } catch (error: any) {
      // 记录失败指标
      const responseTime = Date.now() - startTime;
      await this.monitoring?.recordCall({
        timestamp: Date.now(),
        toolName: 'deep_search_exa',
        success: false,
        responseTime,
        error: error.message,
      });

      this.logger.warn(`Exa deep risk search failed: ${error.message}`);
      return { hasRisk: false };
    }
  }

  /**
   * 搜索目的地替代方案（用于 Neptune 空间修复）
   * 
   * @param destination 目的地名称
   * @param category POI 类别
   * @param month 月份（1-12）
   * @param year 年份（默认当前年份）
   */
  async searchAlternativeDestinations(
    destination: string,
    category: string,
    month: number,
    year: number = new Date().getFullYear(),
  ): Promise<{
    alternatives: Array<{
      name: string;
      description?: string;
      reason?: string;
    }>;
  }> {
    if (!this.exaService) {
      this.logger.debug('ExaService not available, skipping alternative search');
      return { alternatives: [] };
    }

    const cacheKey = `exa:alternatives:${destination}:${category}:${month}:${year}`;
    
    // 检查缓存（替代方案缓存 12-24 小时）
    if (this.redisService) {
      try {
        const cached = await this.redisService.get<string>(cacheKey);
        if (cached) {
          this.logger.debug(`Using cached alternatives for ${destination}`);
          return JSON.parse(cached);
        }
      } catch (error) {
        this.logger.warn('Failed to get cached alternatives:', error);
      }
    }

    const startTime = Date.now();
    try {
      const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
      const monthName = monthNames[month - 1];
      const query = `${destination} ${category} ${year}年${monthName} 替代 推荐 类似`;
      
      const result = await this.exaService.webSearch(query, {
        numResults: 5,
        useAutoprompt: true,
      });

      // 记录调用指标
      const responseTime = Date.now() - startTime;
      await this.monitoring?.recordCall({
        timestamp: Date.now(),
        toolName: 'web_search_exa',
        success: true,
        responseTime,
        resultCount: result?.content?.length || 0,
      });

      const alternatives = this.parseAlternativesResult(result);

      // 缓存结果（12小时）
      if (this.redisService && alternatives.alternatives.length > 0) {
        try {
          await this.redisService.set(cacheKey, JSON.stringify(alternatives), 43200);
        } catch (error) {
          this.logger.warn('Failed to cache alternatives:', error);
        }
      }

      return alternatives;
    } catch (error: any) {
      // 记录失败指标
      const responseTime = Date.now() - startTime;
      await this.monitoring?.recordCall({
        timestamp: Date.now(),
        toolName: 'web_search_exa',
        success: false,
        responseTime,
        error: error.message,
      });

      this.logger.warn(`Exa alternative search failed: ${error.message}`);
      return { alternatives: [] };
    }
  }

  /**
   * 爬取官方网页内容（用于获取权威信息）
   * 
   * @param url 官方网页 URL
   * @param purpose 用途描述（用于日志）
   */
  async crawlOfficialPage(
    url: string,
    _purpose: string = 'official information',
  ): Promise<{
    content: string;
    success: boolean;
  }> {
    if (!this.exaService) {
      this.logger.debug('ExaService not available, skipping crawl');
      return { content: '', success: false };
    }

    const cacheKey = `exa:crawl:${Buffer.from(url).toString('base64').substring(0, 50)}`;
    
    // 检查缓存（官方网页内容缓存 24-48 小时）
    if (this.redisService) {
      try {
        const cached = await this.redisService.get<string>(cacheKey);
        if (cached) {
          this.logger.debug(`Using cached crawl result for ${url}`);
          return JSON.parse(cached);
        }
      } catch (error) {
        this.logger.warn('Failed to get cached crawl result:', error);
      }
    }

    const startTime = Date.now();
    try {
      const result = await this.exaService.crawlUrl(url, {
        text: true,
        markdown: true,
      });

      let content = '';
      if (result && result.content) {
        for (const item of result.content) {
          if (item.type === 'text') {
            content += item.text + '\n';
          }
        }
      }

      // 记录调用指标
      const responseTime = Date.now() - startTime;
      await this.monitoring?.recordCall({
        timestamp: Date.now(),
        toolName: 'crawling_exa',
        success: content.length > 0,
        responseTime,
        resultCount: result?.content?.length || 0,
      });

      const crawlResult = {
        content: content.trim(),
        success: content.length > 0,
      };

      // 缓存结果（24小时）
      if (this.redisService && crawlResult.success) {
        try {
          await this.redisService.set(cacheKey, JSON.stringify(crawlResult), 86400);
        } catch (error) {
          this.logger.warn('Failed to cache crawl result:', error);
        }
      }

      return crawlResult;
    } catch (error: any) {
      // 记录失败指标
      const responseTime = Date.now() - startTime;
      await this.monitoring?.recordCall({
        timestamp: Date.now(),
        toolName: 'crawling_exa',
        success: false,
        responseTime,
        error: error.message,
      });

      this.logger.warn(`Exa crawl failed for ${url}: ${error.message}`);
      return { content: '', success: false };
    }
  }

  /**
   * 启动深度研究（异步任务）
   * 
   * @param topic 研究主题
   * @param reportType 报告类型（可选）
   */
  async startDeepResearch(
    topic: string,
    reportType?: string,
  ): Promise<{
    researchId: string;
    status: 'started' | 'failed';
  }> {
    if (!this.exaService) {
      this.logger.debug('ExaService not available, skipping deep research');
      return { researchId: '', status: 'failed' };
    }

    const startTime = Date.now();
    try {
      const result = await this.exaService.deepResearcherStart(topic, {
        reportType,
        numResults: 20,
      });

      // 记录调用指标
      const responseTime = Date.now() - startTime;
      await this.monitoring?.recordCall({
        timestamp: Date.now(),
        toolName: 'deep_researcher_start',
        success: true,
        responseTime,
      });

      // 解析研究 ID（从结果中提取）
      const researchId = result?.researchId || result?.id || `research_${Date.now()}`;

      return {
        researchId,
        status: 'started',
      };
    } catch (error: any) {
      // 记录失败指标
      const responseTime = Date.now() - startTime;
      await this.monitoring?.recordCall({
        timestamp: Date.now(),
        toolName: 'deep_researcher_start',
        success: false,
        responseTime,
        error: error.message,
      });

      this.logger.warn(`Exa deep research start failed: ${error.message}`);
      return { researchId: '', status: 'failed' };
    }
  }

  /**
   * 检查深度研究状态
   * 
   * @param researchId 研究 ID
   */
  async checkDeepResearch(researchId: string): Promise<{
    status: 'completed' | 'in_progress' | 'failed';
    report?: string;
  }> {
    if (!this.exaService) {
      this.logger.debug('ExaService not available, skipping research check');
      return { status: 'failed' };
    }

    const startTime = Date.now();
    try {
      const result = await this.exaService.deepResearcherCheck(researchId);

      // 解析状态和报告
      const status = result?.status || 'in_progress';
      let report = '';

      if (status === 'completed' && result?.report) {
        if (typeof result.report === 'string') {
          report = result.report;
        } else if (result.report.content) {
          for (const item of result.report.content) {
            if (item.type === 'text') {
              report += item.text + '\n';
            }
          }
        }
      }

      // 记录调用指标
      const responseTime = Date.now() - startTime;
      await this.monitoring?.recordCall({
        timestamp: Date.now(),
        toolName: 'deep_researcher_check',
        success: status !== 'failed',
        responseTime,
        resultCount: report.length > 0 ? 1 : 0,
      });

      return {
        status: status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'in_progress',
        report: report.trim() || undefined,
      };
    } catch (error: any) {
      // 记录失败指标
      const responseTime = Date.now() - startTime;
      await this.monitoring?.recordCall({
        timestamp: Date.now(),
        toolName: 'deep_researcher_check',
        success: false,
        responseTime,
        error: error.message,
      });

      this.logger.warn(`Exa deep research check failed: ${error.message}`);
      return { status: 'failed' };
    }
  }

  /**
   * 解析替代方案搜索结果
   */
  private parseAlternativesResult(result: any): {
    alternatives: Array<{
      name: string;
      description?: string;
      reason?: string;
    }>;
  } {
    const alternatives: Array<{ name: string; description?: string; reason?: string }> = [];

    if (!result || !result.content) {
      return { alternatives };
    }

    for (const item of result.content) {
      if (item.type === 'text') {
        let text: string;
        try {
          const parsed = JSON.parse(item.text);
          if (parsed.results && parsed.results.length > 0) {
            text = parsed.results.map((r: any) => r.text || r.title || '').join(' ');
          } else {
            text = item.text;
          }
        } catch {
          text = item.text;
        }

        // 简单提取：查找推荐的地点名称
        // 这里可以进一步优化，使用更复杂的解析逻辑
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.includes('推荐') || line.includes('类似') || line.includes('替代')) {
            // 尝试提取地点名称（简化处理）
            const match = line.match(/([A-Za-z\u4e00-\u9fa5]+(?:\s+[A-Za-z\u4e00-\u9fa5]+)*)/);
            if (match && match[1].length > 2) {
              alternatives.push({
                name: match[1],
                description: line.trim().substring(0, 100),
              });
            }
          }
        }
      }
    }

    return { alternatives: alternatives.slice(0, 5) }; // 最多返回 5 个替代方案
  }

  /**
   * 解析目的地状态搜索结果
   */
  private parseDestinationStatusResult(result: any): RealTimeDestinationInfo {
    if (!result || !result.content || !result.content[0]) {
      return { isOpen: true };
    }

    const content = result.content[0];
    if (content.type !== 'text') {
      return { isOpen: true };
    }

    let text: string;
    try {
      const parsed = JSON.parse(content.text);
      if (parsed.results && parsed.results.length > 0) {
        text = parsed.results.map((r: any) => r.text || r.title || '').join(' ');
      } else {
        text = content.text;
      }
    } catch {
      text = content.text;
    }

    const lowerText = text.toLowerCase();
    
    // 检查关闭关键词
    const closedKeywords = ['关闭', '暂停', '不开放', 'closed', 'suspended'];
    const isClosed = closedKeywords.some(keyword => lowerText.includes(keyword));

    return {
      isOpen: !isClosed,
      status: isClosed ? 'CLOSED' : 'OPEN',
    };
  }
}
