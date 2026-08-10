/**
 * Observation list projection for iOS home / history.
 */

import type {
  ObservationAssessment,
  ObservationIntent,
  TravelObservationEvent,
} from './observation.types';

export type LookListFilter =
  | 'all'
  | 'road'
  | 'vehicle'
  | 'activity'
  | 'parking'
  | 'rental'
  | 'document';

export type LookListStatus =
  | 'needs_plan_change'
  | 'attention'
  | 'normal'
  | 'reference_only';

export type LookListDetailKind =
  | 'assessment'
  | 'evidence'
  | 'evidence_package';

export interface LookObservationListItem {
  observationId: string;
  intent: ObservationIntent;
  filter: Exclude<LookListFilter, 'all'>;
  titleZh: string;
  summaryZh: string;
  capturedAt: string;
  placeLabelZh?: string;
  status: LookListStatus;
  detailKind: LookListDetailKind;
  thumbnailUrl?: string | null;
  assessmentStatus?: string;
  channel: 'LOOK_FIELD';
  writesPlanVersion: false;
}

export interface LookObservationListResponse {
  items: LookObservationListItem[];
  nextCursor: string | null;
  limit: number;
}

const INTENT_FILTER: Record<ObservationIntent, Exclude<LookListFilter, 'all'>> =
  {
    CHECK_ROAD: 'road',
    CHECK_VEHICLE: 'vehicle',
    CHECK_ACTIVITY_ENTRY: 'activity',
    CHECK_PARKING: 'parking',
    CHECK_RENTAL_HANDOVER: 'rental',
  };

const INTENT_TITLE: Record<ObservationIntent, string> = {
  CHECK_ROAD: '道路观察',
  CHECK_VEHICLE: '车辆观察',
  CHECK_ACTIVITY_ENTRY: '集合点观察',
  CHECK_PARKING: '停车观察',
  CHECK_RENTAL_HANDOVER: '租车交接留证',
};

export function intentToListFilter(
  intent: ObservationIntent,
): Exclude<LookListFilter, 'all'> {
  return INTENT_FILTER[intent] ?? 'document';
}

export function parseListFilter(raw?: string): LookListFilter {
  const v = (raw ?? 'all').toLowerCase();
  if (
    v === 'road' ||
    v === 'vehicle' ||
    v === 'activity' ||
    v === 'parking' ||
    v === 'rental' ||
    v === 'document'
  ) {
    return v;
  }
  return 'all';
}

export function mapListStatus(
  assessment: ObservationAssessment | undefined,
  event: TravelObservationEvent,
): LookListStatus {
  if (event.status !== 'COMPLETED' || !assessment) {
    return 'attention';
  }
  switch (assessment.status) {
    case 'EXECUTION_BLOCK':
    case 'SUGGEST_REPLACE':
      return 'needs_plan_change';
    case 'NEED_CONFIRM':
    case 'NOTICE':
    case 'UNKNOWN':
      return 'attention';
    case 'INFO':
      return event.intent === 'CHECK_RENTAL_HANDOVER'
        ? 'reference_only'
        : 'normal';
    default:
      return 'normal';
  }
}

export function mapDetailKind(
  intent: ObservationIntent,
): LookListDetailKind {
  if (intent === 'CHECK_RENTAL_HANDOVER') return 'evidence_package';
  return 'assessment';
}

export function projectObservationListItem(
  event: TravelObservationEvent,
  assessment: ObservationAssessment | undefined,
  opts?: { thumbnailUrl?: string | null },
): LookObservationListItem {
  const filter = intentToListFilter(event.intent);
  const titleZh = INTENT_TITLE[event.intent] ?? '现场观察';
  const summaryZh =
    assessment?.summary.whatHappened ??
    (event.status === 'COMPLETED'
      ? '观察已完成'
      : '分析进行中…');
  const placeLabelZh =
    typeof event.spatialContext.latitude === 'number'
      ? `${event.spatialContext.latitude.toFixed(3)}, ${Number(
          event.spatialContext.longitude ?? 0,
        ).toFixed(3)}`
      : undefined;

  return {
    observationId: event.observationId,
    intent: event.intent,
    filter,
    titleZh,
    summaryZh,
    capturedAt: event.capturedAt,
    placeLabelZh,
    status: mapListStatus(assessment, event),
    detailKind: mapDetailKind(event.intent),
    thumbnailUrl: opts?.thumbnailUrl ?? null,
    assessmentStatus: assessment?.status,
    channel: 'LOOK_FIELD',
    writesPlanVersion: false,
  };
}

export function paginateObservations(
  items: LookObservationListItem[],
  opts: { limit: number; cursor?: string },
): LookObservationListResponse {
  const limit = Math.min(Math.max(opts.limit || 20, 1), 50);
  let start = 0;
  if (opts.cursor) {
    const idx = items.findIndex((i) => i.observationId === opts.cursor);
    start = idx >= 0 ? idx + 1 : 0;
  }
  const slice = items.slice(start, start + limit);
  const nextCursor =
    start + limit < items.length
      ? slice[slice.length - 1]?.observationId ?? null
      : null;
  return { items: slice, nextCursor, limit };
}
