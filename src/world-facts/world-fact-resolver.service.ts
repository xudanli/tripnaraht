import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WorldFact } from '@prisma/client';
import { PrometheusMetricsService } from '../monitoring/prometheus-metrics.service';
import { WorldFactRepository } from './world-fact.repository';
import { computeFactFreshness } from './world-fact-freshness.util';
import type { ResolvedWorldFact } from './world-fact-resolver.types';

/**
 * Phase 2：统一事实读取层（SSOT for read）。
 * — 业务代码应优先通过 Resolver 消费事实，而非散落 orderBy / 直连 researchData。
 * — 写入仍走 {@link WorldFactService} / ingestor。
 */
@Injectable()
export class WorldFactResolverService {
  private readonly logger = new Logger(WorldFactResolverService.name);

  constructor(
    private readonly repo: WorldFactRepository,
    private readonly config: ConfigService,
    @Optional() private readonly promMetrics?: PrometheusMetricsService,
  ) {}

  /** 解析过期事实时是否视为「无效」（默认：过期仍返回，由 freshness 标记） */
  private hideExpired(): boolean {
    const v =
      this.config.get<string>('WORLD_FACT_HIDE_EXPIRED') ?? process.env.WORLD_FACT_HIDE_EXPIRED;
    return v === '1' || v === 'true' || v === 'yes';
  }

  resolveLatestByFactKey(factKey: string): Promise<ResolvedWorldFact | null> {
    return this.wrapResolved(() => this.repo.findLatestRowByFactKey(factKey));
  }

  resolveLatestBySubjectPredicate(
    subjectType: string,
    subjectId: string,
    predicate: string,
  ): Promise<ResolvedWorldFact | null> {
    const sid = subjectId;
    return this.wrapResolved(() =>
      this.repo.findLatestBySubjectPredicate(subjectType, sid, predicate),
    );
  }

  private async wrapResolved(fetch: () => Promise<WorldFact | null>): Promise<ResolvedWorldFact | null> {
    try {
      const row = await fetch();
      if (!row) return null;
      const freshness = computeFactFreshness(row);
      this.promMetrics?.observeOpsWorldFactAgeSeconds(freshness.ageMs / 1000, 'resolver_latest');
      if (this.hideExpired() && freshness.isExpiredByValidTo) {
        this.logger.debug(`WorldFactResolver: skipped expired fact id=${row.id} factKey=${row.factKey}`);
        return null;
      }
      return { fact: row, freshness };
    } catch (e: any) {
      this.logger.warn(`WorldFactResolver read failed: ${e?.message ?? e}`);
      return null;
    }
  }

  /** 调试 / Explainability：同一 factKey 的版本链（含 supersedes 关系） */
  async historyByFactKey(factKey: string, limit?: number): Promise<ResolvedWorldFact[]> {
    const rows = await this.repo.findHistoryByFactKey(factKey, limit);
    return rows.map((fact) => {
      const freshness = computeFactFreshness(fact);
      this.promMetrics?.observeOpsWorldFactAgeSeconds(freshness.ageMs / 1000, 'resolver_history');
      return { fact, freshness };
    });
  }
}
