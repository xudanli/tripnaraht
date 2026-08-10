/**
 * Release Candidate 冻结 — Model / Prompt / Rule / Knowledge / Decision Policy 版本化入 Trace。
 */

export const RELEASE_CANDIDATE_SCHEMA = 'nara.release_candidate@v1' as const;

export type VersionedArtifactKind =
  | 'MODEL'
  | 'PROMPT'
  | 'RULE'
  | 'KNOWLEDGE'
  | 'DECISION_POLICY';

export type VersionedArtifactV1 = {
  kind: VersionedArtifactKind;
  artifactId: string;
  version: string;
  contentDigest: string;
};

export type ReleaseCandidateV1 = {
  schemaId: typeof RELEASE_CANDIDATE_SCHEMA;
  version: 1;
  rcId: string;
  frozenAt: string;
  frozen: true;
  artifacts: VersionedArtifactV1[];
  /** 全部五类必须在场 */
  allArtifactKindsPresent: boolean;
  roadmapCapabilityFrozen: true;
  reasonsZh: string[];
};

export type ReleaseCandidateTraceEntryV1 = {
  rcId: string;
  kind: VersionedArtifactKind;
  artifactId: string;
  version: string;
  contentDigest: string;
  recordedAt: string;
};

const REQUIRED_KINDS: VersionedArtifactKind[] = [
  'MODEL',
  'PROMPT',
  'RULE',
  'KNOWLEDGE',
  'DECISION_POLICY',
];

export function freezeReleaseCandidate(input: {
  rcId: string;
  artifacts: VersionedArtifactV1[];
  frozenAt?: string;
}): ReleaseCandidateV1 {
  const kinds = new Set(input.artifacts.map((a) => a.kind));
  const missing = REQUIRED_KINDS.filter((k) => !kinds.has(k));
  const allArtifactKindsPresent = missing.length === 0;
  const reasonsZh: string[] = [];
  if (!allArtifactKindsPresent) {
    reasonsZh.push(`RC 冻结缺版本化产物: ${missing.join(',')}`);
  }
  for (const a of input.artifacts) {
    if (!a.version.trim() || !a.contentDigest.trim()) {
      reasonsZh.push(`${a.kind} 缺少 version/digest`);
    }
  }
  if (allArtifactKindsPresent && reasonsZh.length === 0) {
    reasonsZh.push(
      'Release Candidate 已冻结：Model/Prompt/Rule/Knowledge/Decision Policy 已版本化',
    );
  }

  return {
    schemaId: RELEASE_CANDIDATE_SCHEMA,
    version: 1,
    rcId: input.rcId,
    frozenAt: input.frozenAt ?? new Date().toISOString(),
    frozen: true,
    artifacts: input.artifacts,
    allArtifactKindsPresent,
    roadmapCapabilityFrozen: true,
    reasonsZh,
  };
}

/** 将 RC 产物写入可审计 Trace 条目 */
export function projectReleaseCandidateIntoTrace(
  rc: ReleaseCandidateV1,
): ReleaseCandidateTraceEntryV1[] {
  if (!rc.allArtifactKindsPresent) {
    throw new Error(
      '[ReleaseCandidate] cannot_trace_incomplete_rc:all_kinds_required',
    );
  }
  const recordedAt = rc.frozenAt;
  return rc.artifacts.map((a) => ({
    rcId: rc.rcId,
    kind: a.kind,
    artifactId: a.artifactId,
    version: a.version,
    contentDigest: a.contentDigest,
    recordedAt,
  }));
}
