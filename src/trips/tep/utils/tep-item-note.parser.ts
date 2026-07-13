/**
 * ItineraryItem.note 结构化元数据 — `_tep` 命名空间（过渡方案）
 * @see TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md §11.2
 */

export const TEP_NOTE_SCHEMA_VERSION = '1.0' as const;

export interface TepItemNotePayload {
  schemaVersion: typeof TEP_NOTE_SCHEMA_VERSION;
  importance?: 'MANDATORY' | 'RECOMMENDED' | 'OPTIONAL';
  flexibility?: 'FIXED' | 'MOVABLE' | 'REPLACEABLE' | 'REMOVABLE';
  routeSegmentId?: string;
  weatherSensitive?: boolean;
  bufferMinutes?: number;
  bufferKind?: 'TRANSIT' | 'REST' | 'FUEL' | 'FLEX';
  latestArrival?: string;
  mustDo?: boolean;
  durationMinutes?: number;
  weatherFallbackRef?: string;
  weatherFallbackPoiId?: string;
}

export interface ParsedTepItemNote {
  /** TEP 结构化字段（`_tep` 或 legacy 顶层键） */
  tep: TepItemNotePayload;
  /** 用户可见纯文本（若 note 非 JSON） */
  userNote?: string;
  /** 解析降级：非法 JSON 或 schema 不匹配 */
  degraded: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readTepNamespace(raw: Record<string, unknown>): TepItemNotePayload {
  const nested = asRecord(raw._tep);
  const source = nested ?? raw;

  const out: TepItemNotePayload = {
    schemaVersion: TEP_NOTE_SCHEMA_VERSION,
  };

  const importance = source.importance ?? source.tepImportance;
  if (importance === 'MANDATORY' || importance === 'RECOMMENDED' || importance === 'OPTIONAL') {
    out.importance = importance;
  }

  const flexibility = source.flexibility ?? source.tepFlexibility;
  if (
    flexibility === 'FIXED' ||
    flexibility === 'MOVABLE' ||
    flexibility === 'REPLACEABLE' ||
    flexibility === 'REMOVABLE'
  ) {
    out.flexibility = flexibility;
  }

  const routeSegmentId = source.routeSegmentId ?? source.route_segment_id;
  if (typeof routeSegmentId === 'string') out.routeSegmentId = routeSegmentId;

  if (source.weatherSensitive === true) out.weatherSensitive = true;
  if (source.mustDo === true || source.isMustDo === true) out.mustDo = true;

  if (typeof source.bufferMinutes === 'number') out.bufferMinutes = source.bufferMinutes;
  if (typeof source.bufferKind === 'string') {
    out.bufferKind = source.bufferKind as TepItemNotePayload['bufferKind'];
  }

  const latest = source.latestArrival ?? source.latest_arrival;
  if (typeof latest === 'string') out.latestArrival = latest;

  if (typeof source.durationMinutes === 'number') out.durationMinutes = source.durationMinutes;

  const weatherFallbackRef = source.weatherFallbackRef ?? source.weather_fallback_ref;
  if (typeof weatherFallbackRef === 'string') out.weatherFallbackRef = weatherFallbackRef;

  const weatherFallbackPoiId = source.weatherFallbackPoiId ?? source.weather_fallback_poi_id;
  if (typeof weatherFallbackPoiId === 'string') out.weatherFallbackPoiId = weatherFallbackPoiId;

  return out;
}

/** 解析 note JSON；保留 userNote，不覆盖用户原始文本 */
export function parseTepItemNote(note: string | null | undefined): ParsedTepItemNote {
  if (!note?.trim()) {
    return { tep: { schemaVersion: TEP_NOTE_SCHEMA_VERSION }, degraded: false };
  }

  const trimmed = note.trim();
  if (!trimmed.startsWith('{')) {
    return {
      tep: { schemaVersion: TEP_NOTE_SCHEMA_VERSION },
      userNote: trimmed,
      degraded: false,
    };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const record = asRecord(parsed);
    if (!record) {
      return {
        tep: { schemaVersion: TEP_NOTE_SCHEMA_VERSION },
        userNote: trimmed,
        degraded: true,
      };
    }

    const userNote =
      typeof record.userNote === 'string'
        ? record.userNote
        : typeof record.note === 'string'
          ? record.note
          : undefined;

    return {
      tep: readTepNamespace(record),
      userNote,
      degraded: false,
    };
  } catch {
    return {
      tep: { schemaVersion: TEP_NOTE_SCHEMA_VERSION },
      userNote: trimmed,
      degraded: true,
    };
  }
}

/** 合并 `_tep` 命名空间到 legacy 扁平 metadata（投影器消费） */
export function tepNoteToMetadata(note: string | null | undefined): Record<string, unknown> {
  const parsed = parseTepItemNote(note);
  const { tep } = parsed;
  return {
    ...tep,
    tepImportance: tep.importance,
    tepFlexibility: tep.flexibility,
    ...(parsed.userNote ? { userNote: parsed.userNote } : {}),
    ...(parsed.degraded ? { _tepParseDegraded: true } : {}),
  };
}
