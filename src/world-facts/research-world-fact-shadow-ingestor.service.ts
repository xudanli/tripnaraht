import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorldFactService } from './world-fact.service';

/**
 * RESEARCH → WorldFact 并行影子写入（不改 researchData、不改下游 Gate）。
 * 开关：WORLD_FACT_SHADOW_INGEST_ENABLED=1
 */
@Injectable()
export class ResearchWorldFactShadowIngestorService {
  private readonly logger = new Logger(ResearchWorldFactShadowIngestorService.name);

  constructor(
    private readonly worldFacts: WorldFactService,
    private readonly config: ConfigService,
  ) {}

  private enabled(): boolean {
    const v = this.config.get<string>('WORLD_FACT_SHADOW_INGEST_ENABLED') ?? process.env.WORLD_FACT_SHADOW_INGEST_ENABLED;
    return v === '1' || v === 'true' || v === 'yes';
  }

  private snapshotVersion(): string {
    return (
      this.config.get<string>('WORLD_FACT_SNAPSHOT_VERSION') ??
      process.env.WORLD_FACT_SNAPSHOT_VERSION ??
      'poc/v1'
    );
  }

  /**
   * 从单次 RESEARCH 产出抽取可结构化断言并 append（best-effort，失败仅打日志）。
   */
  async ingestFromResearchOutput(params: {
    researchData: Record<string, unknown>;
    requestId: string;
    countryCode?: string;
    routeDirectionId?: string;
  }): Promise<void> {
    if (!this.enabled()) return;

    const cc = (params.countryCode ?? 'UNKNOWN').toUpperCase();
    const snap = this.snapshotVersion();

    try {
      const rd = params.researchData;

      const wind = rd.windSpeedMs;
      if (typeof wind === 'number' && Number.isFinite(wind)) {
        await this.worldFacts.append({
          factKey: `country:${cc}:aggregated_wind_mps`,
          subjectType: 'country',
          subjectId: cc,
          predicate: 'aggregated_wind_mps',
          valueJson: {
            mps: wind,
            windSpeedMs_meta: rd.windSpeedMs_meta ?? null,
            researchRequestId: params.requestId,
          },
          confidence: 0.75,
          sourceType: 'research_shadow',
          sourceRef: params.requestId,
          observedAt: new Date(),
          snapshotVersion: snap,
        });
      }

      const rcw =
        (rd.routeCorridorWorld as Record<string, unknown> | undefined) ??
        (rd.route_corridor_world as Record<string, unknown> | undefined);
      const constraints = rcw?.constraints as Record<string, unknown> | undefined;
      const vehicleRequired = constraints?.vehicleRequired ?? constraints?.vehicle_required;
      const rdId = params.routeDirectionId ?? 'unknown';
      if (vehicleRequired != null && String(vehicleRequired).trim() !== '') {
        await this.worldFacts.append({
          factKey: `route_direction:${rdId}:vehicle_required`,
          subjectType: 'route_direction',
          subjectId: rdId,
          predicate: 'vehicle_required',
          valueJson: {
            raw: vehicleRequired,
            researchRequestId: params.requestId,
          },
          confidence: 0.85,
          sourceType: 'research_shadow',
          sourceRef: params.requestId,
          observedAt: new Date(),
          snapshotVersion: snap,
        });
      }

      const wm = rd.world as Record<string, unknown> | undefined;
      const phys = wm?.physical as Record<string, unknown> | undefined;
      const prefetched = phys?.prefetched_evidence;
      if (Array.isArray(prefetched) && prefetched.length > 0) {
        await this.worldFacts.append({
          factKey: `research:${params.requestId}:prefetched_evidence_count`,
          subjectType: 'research_session',
          subjectId: params.requestId,
          predicate: 'prefetched_evidence_count',
          valueJson: {
            count: prefetched.length,
          },
          confidence: 1,
          sourceType: 'research_shadow',
          sourceRef: params.requestId,
          observedAt: new Date(),
          snapshotVersion: snap,
        });
      }
    } catch (e: any) {
      this.logger.warn(`WorldFact shadow ingest failed (non-fatal): ${e?.message ?? e}`);
    }
  }
}
