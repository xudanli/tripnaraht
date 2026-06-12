/**
 * POI 避坑洞察服务：best-effort RAG chunk 检索 + 启发式合并。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ChunkRetrievalService } from '../../rag/services/chunk-retrieval.service';
import type { Itinerary } from '../interfaces/trip-plan.interface';
import {
  buildPoiPitfallCards,
  collectItineraryPoiItems,
  extractPitfallLinesFromChunk,
  type PoiPitfallCard,
} from '../utils/poi-pitfall-insight.util';

const MAX_POI_RAG_LOOKUPS = 6;
const CHUNKS_PER_POI = 3;

@Injectable()
export class PoiPitfallInsightService {
  private readonly logger = new Logger(PoiPitfallInsightService.name);

  constructor(@Optional() private readonly chunkRetrieval?: ChunkRetrievalService) {}

  async resolveForItinerary(
    itinerary: Itinerary,
    countryCode?: string | null,
  ): Promise<PoiPitfallCard[]> {
    const poiItems = collectItineraryPoiItems(itinerary).slice(0, MAX_POI_RAG_LOOKUPS);
    const ragHintsByPoiId: Record<string, string[]> = {};

    if (this.chunkRetrieval && poiItems.length > 0) {
      for (const { item } of poiItems) {
        const label = item.location_ref?.name?.trim();
        if (!label) continue;
        const poiKey = item.id || String(item.location_ref?.place_id ?? label);
        try {
          const query = [
            label,
            countryCode ?? '',
            'entrance queue tips 入口 排队 预约 避坑',
          ]
            .filter(Boolean)
            .join(' ');
          const rows = await this.chunkRetrieval.retrieve({
            query,
            category: 'travel_guides',
            limit: CHUNKS_PER_POI,
            useHybridSearch: true,
            credibilityMin: 0.3,
          });
          const lines: string[] = [];
          for (const row of rows) {
            lines.push(...extractPitfallLinesFromChunk(row.content ?? '', label));
          }
          if (lines.length) {
            ragHintsByPoiId[poiKey] = [...new Set(lines)].slice(0, 2);
          }
        } catch (e: unknown) {
          this.logger.debug(
            `[PoiPitfall] chunk skip ${label}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }

    return buildPoiPitfallCards(itinerary, ragHintsByPoiId);
  }
}
