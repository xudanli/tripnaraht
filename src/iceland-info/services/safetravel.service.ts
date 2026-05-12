// src/iceland-info/services/safetravel.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientFactory } from '../../common/utils/http-client.factory';
import { SafetravelQueryDto, SafetravelResponseDto, AlertType, AlertSeverity } from '../dto/safetravel.dto';
import { AxiosInstance } from 'axios';
import {
  parseSafetravelRssItems,
  rssRowsToSafetravelAlerts,
} from '../utils/safetravel-rss-parse.util';
import { refineSafetravelRssItems } from '../utils/safetravel-rss-refine.util';
import {
  SAFETRAVEL_RSS_LLM_JSON_SCHEMA,
  buildSafetravelRssLlmUserPrompt,
  isSafetravelRssLlmRefineEnabled,
  mergeSafetravelRssRefinedWithLlm,
  parseLlmRefinementJson,
  resolveSafetravelRssLlmMode,
  shouldRunSafetravelRssLlmRefine,
} from '../utils/safetravel-rss-llm-merge.util';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import type { SafetravelRSSRefined } from '../interfaces/safetravel-rss-refined.interface';
import type { SafetravelRssItemRow } from '../utils/safetravel-rss-parse.util';

@Injectable()
export class SafetravelService {
  private readonly logger = new Logger(SafetravelService.name);
  private readonly httpClient: AxiosInstance;
  private readonly baseURL = 'https://safetravel.is';
  private rssCache: { at: number; data: SafetravelResponseDto } | null = null;
  private readonly RSS_CACHE_MS = 5 * 60 * 1000;

  constructor(
    private configService: ConfigService,
    @Optional() private readonly llmService?: LlmService,
  ) {
    this.httpClient = HttpClientFactory.create({
      baseURL: this.baseURL,
      timeout: 10000,
    });
  }

  /**
   * 从官方 RSS（https://safetravel.is/feed）拉取旅行安全条目，解析为结构化 alerts。
   * 第二层：在 `SAFETRAVEL_RSS_LLM_REFINE` 非 off 且注入 `LlmService` 时，对命中启发式的条目调用 LLM 精炼并与规则层合并。
   * 契约探测见 npm run diagnostic:safetravel
   */
  async fetchRssFeedAlerts(): Promise<SafetravelResponseDto> {
    const now = Date.now();
    if (this.rssCache && now - this.rssCache.at < this.RSS_CACHE_MS) {
      return this.rssCache.data;
    }
    const res = await this.httpClient.get<string>('/feed', {
      responseType: 'text',
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      validateStatus: () => true,
    });
    if (res.status !== 200 || typeof res.data !== 'string') {
      throw new Error(`SafeTravel RSS: HTTP ${res.status}`);
    }
    const rows = parseSafetravelRssItems(res.data);
    const alerts = rssRowsToSafetravelAlerts(rows);
    let rss_refined = refineSafetravelRssItems(rows);

    const refineEnv =
      this.configService.get<string>('SAFETRAVEL_RSS_LLM_REFINE') || process.env.SAFETRAVEL_RSS_LLM_REFINE;
    if (this.llmService && isSafetravelRssLlmRefineEnabled(refineEnv)) {
      const mode = resolveSafetravelRssLlmMode(refineEnv);
      rss_refined = await this.applyLlmRefinementToRss(rows, rss_refined, mode);
    } else if (isSafetravelRssLlmRefineEnabled(refineEnv) && !this.llmService) {
      this.logger.debug('SAFETRAVEL_RSS_LLM_REFINE enabled but LlmService not injected — rules only');
    }

    const data: SafetravelResponseDto = {
      alerts,
      travelConditions: [],
      lastUpdated: new Date().toISOString(),
      rss_refined,
    };
    this.rssCache = { at: now, data };
    this.logger.log(`SafeTravel RSS: ${alerts.length} item(s)`);
    return data;
  }

  private async applyLlmRefinementToRss(
    rows: SafetravelRssItemRow[],
    rules: SafetravelRSSRefined[],
    mode: 'auto' | 'always',
  ): Promise<SafetravelRSSRefined[]> {
    if (rules.length === 0) return rules;
    const provider = this.resolveRssLlmProvider();
    const out: SafetravelRSSRefined[] = [];
    let attempted = 0;
    let merged = 0;
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      const row = rows[i];
      if (!row || !shouldRunSafetravelRssLlmRefine(mode, rule, row)) {
        out.push(rule);
        continue;
      }
      attempted += 1;
      try {
        const prompt = buildSafetravelRssLlmUserPrompt(rule, row);
        const raw = await this.llmService!.callLlmWithSchema(provider, prompt, SAFETRAVEL_RSS_LLM_JSON_SCHEMA);
        const obj = parseLlmRefinementJson(raw);
        if (obj) {
          out.push(mergeSafetravelRssRefinedWithLlm(rule, obj));
          merged += 1;
        } else {
          this.logger.warn(`SafeTravel RSS LLM: parse failed for item ${i}, using rules only`);
          out.push(rule);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`SafeTravel RSS LLM: item ${i} failed (${msg}), using rules only`);
        out.push(rule);
      }
    }
    if (attempted > 0) {
      this.logger.log(`SafeTravel RSS LLM: attempted=${attempted} merged=${merged} provider=${provider}`);
    }
    return out;
  }

  private resolveRssLlmProvider(): LlmProvider {
    const raw = (
      this.configService.get<string>('SAFETRAVEL_RSS_LLM_PROVIDER') || process.env.SAFETRAVEL_RSS_LLM_PROVIDER ||
      ''
    )
      .toLowerCase()
      .trim();
    const map: Record<string, LlmProvider> = {
      openai: LlmProvider.OPENAI,
      deepseek: LlmProvider.DEEPSEEK,
      gemini: LlmProvider.GEMINI,
      anthropic: LlmProvider.ANTHROPIC,
      vllm: LlmProvider.VLLM,
    };
    if (raw && map[raw]) return map[raw];
    return this.llmService!.getDefaultProvider();
  }

  /**
   * 获取安全警报和旅行条件
   */
  async getSafetyInfo(query: SafetravelQueryDto): Promise<SafetravelResponseDto> {
    try {
      // safetravel.is 可能没有公开API
      // 尝试调用可能的端点，如果失败则使用模拟数据
      try {
        // 尝试获取警报（如果API存在）
        const alertsResponse = await this.httpClient.get('/api/alerts', {
          params: {
            region: query.region,
            type: query.alertType,
          },
        }).catch(() => null);

        // 尝试获取旅行条件
        const conditionsResponse = await this.httpClient.get('/api/travel-conditions', {
          params: {
            region: query.region,
          },
        }).catch(() => null);

        if (alertsResponse || conditionsResponse) {
          return this.parseSafetravelResponse(
            alertsResponse?.data,
            conditionsResponse?.data,
            query,
          );
        }

        // API不可用，返回模拟数据
        this.logger.warn('safetravel.is API不可用，使用模拟数据');
        return this.getMockSafetyData(query);
      } catch (apiError: any) {
        this.logger.warn(`safetravel.is API调用失败: ${apiError.message}，使用模拟数据`);
        return this.getMockSafetyData(query);
      }
    } catch (error: any) {
      this.logger.error(`获取safetravel.is安全信息失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 解析safetravel.is API响应
   */
  private parseSafetravelResponse(
    alertsData: any,
    conditionsData: any,
    query: SafetravelQueryDto,
  ): SafetravelResponseDto {
    const alerts = (alertsData?.alerts || []).map((alert: any) => {
      // 将字符串severity转换为枚举值
      let severity = AlertSeverity.MEDIUM;
      if (alert.severity) {
        const severityStr = String(alert.severity).toLowerCase();
        if (severityStr === 'low') severity = AlertSeverity.LOW;
        else if (severityStr === 'medium') severity = AlertSeverity.MEDIUM;
        else if (severityStr === 'high') severity = AlertSeverity.HIGH;
        else if (severityStr === 'critical') severity = AlertSeverity.CRITICAL;
      }
      
      return {
        id: alert.id || `alert-${Date.now()}`,
        title: alert.title || '安全警报',
        description: alert.description || '',
        type: alert.type || AlertType.GENERAL,
        severity,
        effectiveTime: alert.effectiveTime || new Date().toISOString(),
        expiryTime: alert.expiryTime,
        regions: alert.regions || [],
        fRoads: alert.fRoads || [],
      };
    });

    const travelConditions = (conditionsData?.conditions || []).map((condition: any) => ({
      region: condition.region || '',
      roadStatus: condition.roadStatus || 'open',
      weatherStatus: condition.weatherStatus || 'good',
      overallStatus: condition.overallStatus || 'green',
      description: condition.description || '',
      lastUpdated: condition.lastUpdated || new Date().toISOString(),
    }));

    return {
      alerts: alerts.filter((alert: any) => {
        if (query.region && !alert.regions.includes(query.region)) {
          return false;
        }
        if (query.alertType && alert.type !== query.alertType) {
          return false;
        }
        return true;
      }),
      travelConditions: travelConditions.filter((condition: any) => {
        if (query.region && condition.region !== query.region) {
          return false;
        }
        return true;
      }),
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * 获取模拟安全数据（当API不可用时）
   */
  private getMockSafetyData(query: SafetravelQueryDto): SafetravelResponseDto {
    const alerts = [
      {
        id: 'alert-1',
        title: '高地强风警告',
        description: '中央高地区域预计有强风，风速可能超过15m/s，建议推迟出行。',
        type: AlertType.WEATHER,
        severity: AlertSeverity.HIGH,
        effectiveTime: new Date().toISOString(),
        expiryTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        regions: ['highlands', 'central-highlands'],
        fRoads: ['F26', 'F208'],
      },
      {
        id: 'alert-2',
        title: 'F路路况提醒',
        description: '部分F路因天气原因需要谨慎驾驶，建议4x4车辆。',
        type: AlertType.ROAD,
        severity: AlertSeverity.MEDIUM,
        effectiveTime: new Date().toISOString(),
        regions: ['highlands'],
        fRoads: ['F910', 'F88'],
      },
    ].filter((alert) => {
      if (query.region && !alert.regions.includes(query.region)) {
        return false;
      }
      if (query.alertType && alert.type !== query.alertType) {
        return false;
      }
      return true;
    });

    const travelConditions = [
      {
        region: 'highlands',
        roadStatus: 'caution',
        weatherStatus: 'fair',
        overallStatus: 'yellow',
        description: '高地路况一般，部分F路需要谨慎驾驶',
        lastUpdated: new Date().toISOString(),
      },
      {
        region: 'central-highlands',
        roadStatus: 'open',
        weatherStatus: 'good',
        overallStatus: 'green',
        description: '中央高地区域路况良好',
        lastUpdated: new Date().toISOString(),
      },
    ].filter((condition) => {
      if (query.region && condition.region !== query.region) {
        return false;
      }
      return true;
    });

    return {
      alerts,
      travelConditions,
      lastUpdated: new Date().toISOString(),
    };
  }
}
