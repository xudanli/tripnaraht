import { createHash } from 'node:crypto';

export interface ResearchEvidenceSnapshot {
  researchEvidenceSnapshotId: string;
  evidenceVersion: string;
}

/**
 * 由 RESEARCH 产出物生成稳定快照 id（VERIFY 绑定用）。
 * 基于 requestId + researchData 序列化；序列化失败时退化为仅 requestId + 时间戳。
 */
export function buildResearchEvidenceSnapshot(
  requestId: string,
  researchData: Record<string, unknown>,
): ResearchEvidenceSnapshot {
  const evidenceVersion = new Date().toISOString();
  let body: string;
  try {
    body = JSON.stringify(researchData);
  } catch {
    body = '[non-serializable-research-data]';
  }
  const h = createHash('sha256')
    .update(requestId)
    .update('\0')
    .update(body)
    .digest('hex')
    .slice(0, 28);
  return {
    researchEvidenceSnapshotId: `research_${h}`,
    evidenceVersion,
  };
}
