/**
 * Release Candidate Discipline — RC1 → 真实 Trip → 仅 Fix P0/P1 → RC2。
 * 每个 RC 固定 Model/Prompt/Rule/Knowledge/Decision Policy/Client 版本。
 */

import type { ReleaseCandidateV1, VersionedArtifactV1 } from './release-candidate.util';
import { freezeReleaseCandidate } from './release-candidate.util';

export const RC_DISCIPLINE_SCHEMA = 'nara.rc_discipline@v1' as const;

export type RcPinnedVersionsV1 = {
  modelVersion: string;
  promptVersion: string;
  ruleVersion: string;
  knowledgePackageVersion: string;
  decisionPolicyVersion: string;
  clientVersion: string;
};

export type RcDisciplineCycleV1 = {
  schemaId: typeof RC_DISCIPLINE_SCHEMA;
  version: 1;
  rcId: string;
  sequence: number;
  pinned: RcPinnedVersionsV1;
  candidate: ReleaseCandidateV1;
  allowOnlyP0P1Fixes: true;
  nextStepIsRealTrip: true;
  reasonsZh: string[];
};

export function startRcDisciplineCycle(input: {
  rcId: string;
  sequence: number;
  pinned: RcPinnedVersionsV1;
}): RcDisciplineCycleV1 {
  const artifacts: VersionedArtifactV1[] = [
    {
      kind: 'MODEL',
      artifactId: 'model',
      version: input.pinned.modelVersion,
      contentDigest: `model:${input.pinned.modelVersion}`,
    },
    {
      kind: 'PROMPT',
      artifactId: 'prompt',
      version: input.pinned.promptVersion,
      contentDigest: `prompt:${input.pinned.promptVersion}`,
    },
    {
      kind: 'RULE',
      artifactId: 'rule',
      version: input.pinned.ruleVersion,
      contentDigest: `rule:${input.pinned.ruleVersion}`,
    },
    {
      kind: 'KNOWLEDGE',
      artifactId: 'knowledge',
      version: input.pinned.knowledgePackageVersion,
      contentDigest: `knowledge:${input.pinned.knowledgePackageVersion}`,
    },
    {
      kind: 'DECISION_POLICY',
      artifactId: 'decision_policy',
      version: input.pinned.decisionPolicyVersion,
      contentDigest: `policy:${input.pinned.decisionPolicyVersion}`,
    },
  ];
  const candidate = freezeReleaseCandidate({
    rcId: input.rcId,
    artifacts,
  });
  return {
    schemaId: RC_DISCIPLINE_SCHEMA,
    version: 1,
    rcId: input.rcId,
    sequence: input.sequence,
    pinned: input.pinned,
    candidate,
    allowOnlyP0P1Fixes: true,
    nextStepIsRealTrip: true,
    reasonsZh: [
      `RC${input.sequence} 已钉版本（含 Client ${input.pinned.clientVersion}）`,
      '下一步：真实 Trip → 仅 Fix P0/P1 → 下一 RC',
    ],
  };
}

export function assertRcFixSeverityAllowed(severity: 'P0' | 'P1' | 'P2' | 'P3'): {
  ok: boolean;
  reasonZh: string;
} {
  if (severity === 'P0' || severity === 'P1') {
    return { ok: true, reasonZh: '允许进入当前 RC 修复' };
  }
  return {
    ok: false,
    reasonZh: 'RC Discipline：本轮仅 Fix P0/P1；P2/P3 不阻断 RC 循环',
  };
}

export function advanceToNextRc(input: {
  current: RcDisciplineCycleV1;
  nextRcId: string;
  pinned?: Partial<RcPinnedVersionsV1>;
}): RcDisciplineCycleV1 {
  return startRcDisciplineCycle({
    rcId: input.nextRcId,
    sequence: input.current.sequence + 1,
    pinned: { ...input.current.pinned, ...input.pinned },
  });
}
