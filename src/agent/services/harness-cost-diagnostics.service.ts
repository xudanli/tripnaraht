import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmUsageRecorderService } from '../../llm/services/llm-usage-recorder.service';
import { AgenticTokenQuotaService } from './agentic-token-quota.service';
import {
  buildHarnessCostHistoryV1,
  type HarnessCostHistoryV1,
} from '../runtime/harness-cost-history.util';

@Injectable()
export class HarnessCostDiagnosticsService {
  private readonly logger = new Logger(HarnessCostDiagnosticsService.name);

  constructor(
    @Optional() private readonly tokenQuota?: AgenticTokenQuotaService,
    @Optional() private readonly llmUsageRecorder?: LlmUsageRecorderService,
  ) {}

  async buildCostHistorySnapshot(seriesDays = 7): Promise<HarnessCostHistoryV1 | null> {
    const quotaConfig = this.tokenQuota?.resolveConfig() ?? {
      enabled: false,
      perUserDaily: 0,
      perOrgDaily: 0,
      globalDaily: 0,
      perSessionCap: 0,
    };

    let dailyBuckets: HarnessCostHistoryV1['daily_buckets'] = [];
    let dbAvailable = false;
    if (this.llmUsageRecorder) {
      try {
        const series = await this.llmUsageRecorder.aggregateCostDailySeries(seriesDays);
        dbAvailable = series.source === 'db';
        dailyBuckets = series.buckets;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[HarnessCostDiagnostics] daily series failed (non-fatal): ${msg}`);
      }
    }

    let todayGlobalTokensUsed: number | null = null;
    if (this.tokenQuota) {
      try {
        todayGlobalTokensUsed = await this.tokenQuota.readTodayGlobalTokenUsage();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[HarnessCostDiagnostics] global usage read failed (non-fatal): ${msg}`);
      }
    }

    if (!dbAvailable && todayGlobalTokensUsed == null && !quotaConfig.enabled) {
      return null;
    }

    return buildHarnessCostHistoryV1({
      seriesDays,
      dailyBuckets,
      dbAvailable,
      quotaConfig,
      todayGlobalTokensUsed,
    });
  }
}
