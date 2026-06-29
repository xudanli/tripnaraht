import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmUsageRecorderService } from '../../llm/services/llm-usage-recorder.service';
import { buildLlmRoutingAdminSnapshot } from '../runtime/harness-llm-routing-observability.util';

@Injectable()
export class HarnessLlmRoutingDiagnosticsService {
  private readonly logger = new Logger(HarnessLlmRoutingDiagnosticsService.name);

  constructor(@Optional() private readonly llmUsageRecorder?: LlmUsageRecorderService) {}

  async buildAdminSnapshot(seriesDays = 7) {
    if (!this.llmUsageRecorder) {
      return buildLlmRoutingAdminSnapshot({
        source: 'unavailable',
        seriesDays,
        rows: [],
      });
    }
    try {
      const rows = await this.llmUsageRecorder.aggregateProviderBreakdown(seriesDays);
      return buildLlmRoutingAdminSnapshot({
        source: rows.source,
        seriesDays,
        rows: rows.providers,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[HarnessLlmRoutingDiagnostics] breakdown failed: ${msg}`);
      return buildLlmRoutingAdminSnapshot({
        source: 'unavailable',
        seriesDays,
        rows: [],
      });
    }
  }
}
