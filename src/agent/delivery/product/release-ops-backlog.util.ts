/**
 * Release Operations Backlog — 无默认「下一 Sprint 新能力」。
 * 只由真实 Beta Trip 证据产生：Incident / Task Failure / Data Gap / Latency /
 * Recovery / User Comprehension / Release Drift。
 */

export const RELEASE_OPS_BACKLOG_SCHEMA =
  'nara.release_ops_backlog@v1' as const;

export type ReleaseOpsBacklogSource =
  | 'INCIDENT'
  | 'TASK_FAILURE'
  | 'DATA_GAP'
  | 'LATENCY'
  | 'RECOVERY'
  | 'USER_COMPREHENSION'
  | 'RELEASE_DRIFT';

export type ReleaseOpsBacklogItemV1 = {
  schemaId: typeof RELEASE_OPS_BACKLOG_SCHEMA;
  version: 1;
  itemId: string;
  source: ReleaseOpsBacklogSource;
  tripId: string;
  evidenceRef: string;
  summaryZh: string;
  /** 显式禁止路线图驱动新能力 */
  roadmapDrivenCapabilityForbidden: true;
  noDefaultNextSprintCapability: true;
  createdAt: string;
};

export type ReleaseOpsBacklogV1 = {
  items: ReleaseOpsBacklogItemV1[];
  roadmapDrivenCapabilityForbidden: true;
  noDefaultNextSprintCapability: true;
};

export function createEmptyReleaseOpsBacklog(): ReleaseOpsBacklogV1 {
  return {
    items: [],
    roadmapDrivenCapabilityForbidden: true,
    noDefaultNextSprintCapability: true,
  };
}

export function admitReleaseOpsBacklogItem(input: {
  backlog: ReleaseOpsBacklogV1;
  source: ReleaseOpsBacklogSource;
  tripId: string;
  evidenceRef: string;
  summaryZh: string;
  itemId?: string;
}):
  | { ok: true; backlog: ReleaseOpsBacklogV1; item: ReleaseOpsBacklogItemV1 }
  | { ok: false; code: 'NO_REAL_EVIDENCE' | 'ROADMAP_CAPABILITY_REJECTED'; reasonZh: string } {
  if (!input.tripId.trim() || !input.evidenceRef.trim()) {
    return {
      ok: false,
      code: 'NO_REAL_EVIDENCE',
      reasonZh: '没有真实证据的问题原则上不进入 V1 Backlog',
    };
  }
  const item: ReleaseOpsBacklogItemV1 = {
    schemaId: RELEASE_OPS_BACKLOG_SCHEMA,
    version: 1,
    itemId: input.itemId ?? `robi_${input.source}_${Date.now()}`,
    source: input.source,
    tripId: input.tripId,
    evidenceRef: input.evidenceRef,
    summaryZh: input.summaryZh,
    roadmapDrivenCapabilityForbidden: true,
    noDefaultNextSprintCapability: true,
    createdAt: new Date().toISOString(),
  };
  return {
    ok: true,
    item,
    backlog: { ...input.backlog, items: [...input.backlog.items, item] },
  };
}

/** 路线图「新能力」提案一律拒绝 */
export function rejectRoadmapCapabilityProposal(summaryZh: string): {
  ok: false;
  code: 'ROADMAP_CAPABILITY_REJECTED';
  reasonZh: string;
} {
  return {
    ok: false,
    code: 'ROADMAP_CAPABILITY_REJECTED',
    reasonZh: `拒绝路线图新能力「${summaryZh}」：Release Operations 无默认下一 Sprint 新能力`,
  };
}
