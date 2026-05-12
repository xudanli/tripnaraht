/**
 * safetravel.get_advisories — SafeTravel.is 官方 RSS 旅行安全警报
 *
 * 数据源：https://safetravel.is/feed（application/rss+xml）
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput, SkillMetadata } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import { SafetravelService } from '../../iceland-info/services/safetravel.service';
import { AlertSeverity, type SafetravelAlertDto } from '../../iceland-info/dto/safetravel.dto';
import { stripHtmlLite } from '../../iceland-info/utils/safetravel-rss-parse.util';
import type { SafetravelRSSRefined } from '../../iceland-info/interfaces/safetravel-rss-refined.interface';
import type { SafetravelRouteAlertEvidence } from '../itinerary/safetravel-verify-evidence.util';
import { rssRefinedItemsToSafetravelRouteAlerts } from './safetravel-rss-to-route-verify-alerts.util';

export interface SafetravelGetAdvisoriesInput extends SkillInput {
  /** 可选：按关键词过滤（匹配 title/description，大小写不敏感） */
  region_keyword?: string;
  /** 最多返回条数（默认 30） */
  max_items?: number;
}

export interface SafetravelGetAdvisoriesOutput extends SkillOutput {
  alerts: SafetravelAlertDto[];
  /** 与 `alerts` 同源 RSS 项的规则精炼层（零臆造坐标；`max_items`/关键词过滤已对齐） */
  rss_refined: SafetravelRSSRefined[];
  /**
   * 由 `rss_refined` 保守推导的路段级警报，与行程项 `metadata.route_segment_ref` 对齐；
   * 供 `itinerary.verify` / `research_data.safetravel_alerts` 使用。
   */
  safetravel_alerts: SafetravelRouteAlertEvidence[];
  lastUpdated: string;
  source: 'safetravel.is/feed';
  gate_recommendation: 'ALLOW' | 'ADJUST_REQUIRED' | 'BLOCK' | 'NEED_USER_CONFIRM';
  summary: string;
}

@SkillDecorator({
  name: 'safetravel.get_advisories',
  description:
    '冰岛 SafeTravel 官方 RSS 安全警报（火山、路况、旅行建议等），供 Gate 与高地/自驾前巡检。',
  version: '1.0.0',
  category: 'world',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class SafetravelGetAdvisoriesSkill implements Skill<SafetravelGetAdvisoriesInput, SafetravelGetAdvisoriesOutput> {
  private readonly logger = new Logger(SafetravelGetAdvisoriesSkill.name);

  metadata: SkillMetadata = {
    name: 'safetravel.get_advisories',
    description:
      '拉取 safetravel.is/feed RSS，解析为结构化 alerts、rss_refined 与 safetravel_alerts（路段级，供 verify 对齐）；含 gate_recommendation（CRITICAL→BLOCK）。',
    version: '1.0.0',
    category: 'world',
    toolGroup: 'DOMAIN',
    inputSchema: {
      required: [],
      typeChecks: {
        max_items: { type: 'number', min: 1, max: 100 },
      },
    },
  };

  constructor(private readonly safetravel: SafetravelService) {
    this.logger.log('SafetravelGetAdvisoriesSkill initialized');
  }

  async execute(input: SafetravelGetAdvisoriesInput): Promise<SafetravelGetAdvisoriesOutput> {
    const pack = await this.safetravel.fetchRssFeedAlerts();
    let alerts = pack.alerts;
    let rss_refined = [...(pack.rss_refined ?? [])];
    const kw = (input.region_keyword || '').trim().toLowerCase();
    if (kw) {
      alerts = alerts.filter((a) => {
        const blob = `${a.title} ${stripHtmlLite(a.description)}`.toLowerCase();
        return blob.includes(kw);
      });
      rss_refined = rss_refined.filter((r) => {
        const blob = `${r.title} ${r.body}`.toLowerCase();
        return blob.includes(kw);
      });
    }
    const max = Math.min(100, Math.max(1, input.max_items ?? 30));
    alerts = alerts.slice(0, max);
    rss_refined = rss_refined.slice(0, max);

    const hasCritical = alerts.some((a) => a.severity === AlertSeverity.CRITICAL);
    const hasHigh = alerts.some((a) => a.severity === AlertSeverity.HIGH);
    let gate_recommendation: SafetravelGetAdvisoriesOutput['gate_recommendation'] = 'ALLOW';
    if (hasCritical) {
      gate_recommendation = 'BLOCK';
    } else if (hasHigh) {
      gate_recommendation = 'ADJUST_REQUIRED';
    } else if (alerts.some((a) => a.severity === AlertSeverity.MEDIUM)) {
      gate_recommendation = 'NEED_USER_CONFIRM';
    }

    const summary =
      alerts.length === 0
        ? 'SafeTravel RSS：当前无条目（或已全部被关键词过滤）。'
        : `SafeTravel RSS：${alerts.length} 条；建议 ${gate_recommendation}。`;

    const safetravel_alerts = rssRefinedItemsToSafetravelRouteAlerts(rss_refined);

    this.logger.log(`[safetravel.get_advisories] ${alerts.length} alerts → ${gate_recommendation}`);

    return {
      alerts,
      rss_refined,
      safetravel_alerts,
      lastUpdated: pack.lastUpdated,
      source: 'safetravel.is/feed',
      gate_recommendation,
      summary,
    };
  }
}
