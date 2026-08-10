/**
 * Observation Timeline — 仅记录已有 WorldState / Evidence / Event 的时序变化。
 * 不新增预测逻辑。
 */

export const OBSERVATION_TIMELINE_SCHEMA = 'nara.observation_timeline@v1' as const;

export type ObservationTimelineEntryKind =
  | 'WORLD_STATE'
  | 'EVIDENCE'
  | 'EVENT';

export type ObservationTimelineEntryV1 = {
  at: string;
  kind: ObservationTimelineEntryKind;
  refId: string;
  summaryZh: string;
  /** 禁止预测字段 */
  isPrediction: false;
};

export type ObservationTimelineV1 = {
  schemaId: typeof OBSERVATION_TIMELINE_SCHEMA;
  version: 1;
  tripId: string;
  decisionKey?: string;
  entries: ObservationTimelineEntryV1[];
  noPredictionLogic: true;
};

export function createObservationTimeline(input: {
  tripId: string;
  decisionKey?: string;
}): ObservationTimelineV1 {
  return {
    schemaId: OBSERVATION_TIMELINE_SCHEMA,
    version: 1,
    tripId: input.tripId,
    decisionKey: input.decisionKey,
    entries: [],
    noPredictionLogic: true,
  };
}

export function appendObservationTimelineEntry(
  timeline: ObservationTimelineV1,
  entry: Omit<ObservationTimelineEntryV1, 'isPrediction'> & {
    isPrediction?: boolean;
  },
): ObservationTimelineV1 {
  if (entry.isPrediction === true) {
    throw new Error(
      '[ObservationTimeline] prediction_forbidden:only_record_existing_observations',
    );
  }
  const next: ObservationTimelineEntryV1 = {
    at: entry.at,
    kind: entry.kind,
    refId: entry.refId,
    summaryZh: entry.summaryZh,
    isPrediction: false,
  };
  const entries = [...timeline.entries, next].sort((a, b) =>
    a.at.localeCompare(b.at),
  );
  return { ...timeline, entries };
}
