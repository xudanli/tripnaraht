/**
 * 单次 route_and_run 的 Shadow Grader 调度标记（进程内、request 级，供 observability 回显）。
 */

export type ShadowGraderScheduleMark = {
  scheduled: boolean;
  skip_reason?:
    | 'disabled'
    | 'no_active_shadow'
    | 'in_flight'
    | 'trajectory_capture_off';
  shadow_version?: string;
  marked_at: string;
};

const marks = new Map<string, ShadowGraderScheduleMark>();

export function markShadowGraderSchedule(
  requestId: string,
  mark: Omit<ShadowGraderScheduleMark, 'marked_at'>,
): void {
  const rid = requestId?.trim();
  if (!rid) return;
  marks.set(rid, { ...mark, marked_at: new Date().toISOString() });
}

export function readShadowGraderScheduleMark(requestId: string): ShadowGraderScheduleMark | undefined {
  const rid = requestId?.trim();
  if (!rid) return undefined;
  const v = marks.get(rid);
  if (v) marks.delete(rid);
  return v;
}

/** 测试用 */
export function clearShadowGraderScheduleMarks(): void {
  marks.clear();
}
