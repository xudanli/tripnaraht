import { BadRequestException } from '@nestjs/common';
import {
  ODYSSEY_TRIP_INTENT_TAG_OPTIONS,
  type OdysseyTripIntentTagId,
} from '../config/trip-intent-tags.config';
import type { UpdateTripIntentInput } from '../dto/odyssey-intake.dto';

const KNOWN_TAG_IDS = new Set<string>(ODYSSEY_TRIP_INTENT_TAG_OPTIONS.map((o) => o.id));

/**
 * 归一化 PATCH trip-intent 请求体。
 * 优先级：tripIntentTag > trip_intent_tag > tripIntentTags > trip_intent_tags
 * 单选时写入 [tag]，tripIntentTags[0] 为当前选中项。
 */
export function normalizeTripIntentInput(dto: UpdateTripIntentInput): string[] {
  let raw: string[] | undefined;

  if (typeof dto.tripIntentTag === 'string' && dto.tripIntentTag.trim()) {
    raw = [dto.tripIntentTag.trim()];
  } else if (typeof dto.trip_intent_tag === 'string' && dto.trip_intent_tag.trim()) {
    raw = [dto.trip_intent_tag.trim()];
  } else if (Array.isArray(dto.tripIntentTags) && dto.tripIntentTags.length > 0) {
    raw = dto.tripIntentTags.map((t) => t.trim()).filter(Boolean);
  } else if (Array.isArray(dto.trip_intent_tags) && dto.trip_intent_tags.length > 0) {
    raw = dto.trip_intent_tags.map((t) => t.trim()).filter(Boolean);
  }

  if (!raw?.length) {
    throw new BadRequestException(
      '需提供 tripIntentTag、trip_intent_tag、tripIntentTags 或 trip_intent_tags 之一',
    );
  }

  for (const id of raw) {
    if (!KNOWN_TAG_IDS.has(id)) {
      throw new BadRequestException(
        `未知的 tripIntentTag: ${id}；可选值: ${[...KNOWN_TAG_IDS].join(', ')}`,
      );
    }
  }

  return raw;
}

export function getTripIntentTagLabel(tagId: string): string | undefined {
  return ODYSSEY_TRIP_INTENT_TAG_OPTIONS.find((o) => o.id === tagId)?.label;
}

export type { OdysseyTripIntentTagId };
