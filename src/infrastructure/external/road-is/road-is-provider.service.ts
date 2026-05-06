import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { SegmentLatestRoadStatusV1 } from '../../../domain/ontology/validator/road-status-contract.types';
import {
  parseRoadSurfaceCondition,
  type RoadSurfaceCondition,
} from '../../../domain/ontology/validator/road-status-contract.types';

/**
 * Fetches live road surface condition for a Road.is query key (typically Icelandic F-road code, e.g. F208).
 * When ROAD_IS_PROVIDER_MOCK=true (default in dev), returns deterministic mock rows — no HTTP.
 */
@Injectable()
export class RoadIsProviderService {
  private readonly logger = new Logger(RoadIsProviderService.name);
  private readonly mockMode: boolean;
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.mockMode = String(this.config.get<string>('ROAD_IS_PROVIDER_MOCK') ?? 'true').toLowerCase() === 'true';
    this.baseUrl = (this.config.get<string>('ROAD_IS_API_BASE_URL') ?? 'https://api.road.is/api').replace(/\/$/, '');
    this.apiKey = this.config.get<string>('ROAD_IS_API_KEY');
    this.timeoutMs = Number(this.config.get<string>('ROAD_IS_HTTP_TIMEOUT_MS') ?? '8000');
  }

  /**
   * @param roadQueryKey — Road.is `road` query param (e.g. F208); must match rules.road_is_road_code when syncing segments.
   */
  async fetchCondition(roadQueryKey: string): Promise<SegmentLatestRoadStatusV1> {
    const key = String(roadQueryKey ?? '').trim();
    if (!key) {
      return this.mockSnapshotForKey('UNKNOWN', 'Empty road query key');
    }
    if (this.mockMode) {
      return this.mockFetch(key);
    }
    return this.httpFetch(key);
  }

  private mockFetch(roadQueryKey: string): SegmentLatestRoadStatusV1 {
    const forceClosed = String(this.config.get<string>('ROAD_IS_MOCK_FORCE_CLOSED_ROADS') ?? '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const forceHeavySnow = String(this.config.get<string>('ROAD_IS_MOCK_FORCE_HEAVY_SNOW_ROADS') ?? '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const upper = roadQueryKey.toUpperCase();
    let condition: RoadSurfaceCondition = 'OPEN';
    let text = 'Clear (mock)';

    if (forceClosed.includes(upper)) {
      condition = 'CLOSED';
      text = 'Sudden closure — heavy snow / avalanche risk (mock)';
    } else if (forceHeavySnow.includes(upper)) {
      condition = 'HEAVY_SNOW';
      text = 'Heavy snow — travel not advised (mock)';
    } else if (upper.includes('MOCK_CLOSED') || upper.endsWith('_CLOSED')) {
      condition = 'CLOSED';
      text = 'Closed despite calendar window (mock storm)';
    }

    const observed_at = new Date().toISOString();
    return {
      condition,
      condition_text: text,
      evidence_source: 'road.is',
      source_url: 'https://road.is',
      observed_at,
      synced_at: observed_at,
      provider: 'mock',
      raw: { road: roadQueryKey, mockMode: true },
    };
  }

  private async httpFetch(roadQueryKey: string): Promise<SegmentLatestRoadStatusV1> {
    const url = `${this.baseUrl}/condition`;
    try {
      const headers: Record<string, string> = {};
      if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

      const response = await axios.get(url, {
        params: { road: roadQueryKey },
        timeout: this.timeoutMs,
        headers,
      });

      const row = response.data?.results?.[0];
      if (!row) {
        return {
          condition: 'UNKNOWN',
          condition_text: 'road.is returned no results',
          evidence_source: 'road.is',
          source_url: 'https://road.is',
          observed_at: new Date().toISOString(),
          synced_at: new Date().toISOString(),
          provider: 'road.is',
          raw: response.data,
        };
      }

      const statusRaw = row.status ?? row.condition ?? '';
      const condition = parseRoadSurfaceCondition(statusRaw);
      const observed_at =
        typeof row.last_updated === 'string' ? new Date(row.last_updated).toISOString() : new Date().toISOString();

      return {
        condition,
        condition_text: row.status_text_en || row.status_text || String(statusRaw),
        evidence_source: 'road.is',
        source_url: typeof row.url === 'string' ? row.url : 'https://road.is',
        observed_at,
        synced_at: new Date().toISOString(),
        provider: 'road.is',
        raw: row,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[RoadIs] HTTP fetch failed for ${roadQueryKey}: ${msg}`);
      return {
        condition: 'UNKNOWN',
        condition_text: `road.is request failed: ${msg}`,
        evidence_source: 'road.is',
        observed_at: new Date().toISOString(),
        synced_at: new Date().toISOString(),
        provider: 'road.is',
        raw: { error: msg },
      };
    }
  }

  private mockSnapshotForKey(condition: RoadSurfaceCondition, text: string): SegmentLatestRoadStatusV1 {
    const t = new Date().toISOString();
    return {
      condition,
      condition_text: text,
      provider: 'mock',
      observed_at: t,
      synced_at: t,
      evidence_source: 'road.is',
    };
  }
}
