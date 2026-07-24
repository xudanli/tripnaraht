export type EpisodicSummarizerScheduleMark = {
  scheduled: boolean;
  skip_reason?: 'disabled' | 'below_threshold' | 'no_trip_id' | 'in_flight';
  scheduled_at?: string;
  tokens_before?: number;
  tokens_after?: number;
};

const marks = new Map<string, EpisodicSummarizerScheduleMark>();

export function markEpisodicSummarizerSchedule(
  requestId: string,
  mark: EpisodicSummarizerScheduleMark,
): void {
  marks.set(requestId, mark);
}

/** 一次性读取（route_and_run observability 消费后清除） */
export function readEpisodicSummarizerScheduleMark(
  requestId: string,
): EpisodicSummarizerScheduleMark | undefined {
  const mark = marks.get(requestId);
  if (mark) marks.delete(requestId);
  return mark;
}
