/**
 * P5 Replay：用同一份 Evidence 重跑 Sufficiency / Grounding / Issue，检查结论是否漂移。
 * 不重放 IO，不重新取证。
 */

import { diagnoseSystem1Issues } from './diagnose-system1-issue.util';
import { evaluateEvidenceSufficiency } from './evaluate-evidence-sufficiency.util';
import { groundSystem1Claims } from './ground-system1-claims.util';
import type {
  EvidenceSufficiencyResult,
  System1ClaimGrounding,
  System1Issue,
  System1TurnTrace,
} from './system1-runtime.types';

export function replaySystem1Turn(trace: System1TurnTrace): {
  sufficiency: EvidenceSufficiencyResult | null;
  groundingResult: System1ClaimGrounding[];
  issues: System1Issue[];
  drifted: boolean;
  drift: string[];
} {
  const sufficiency =
    trace.requiredEvidence.length > 0
      ? evaluateEvidenceSufficiency({
          required: trace.requiredEvidence,
          evidence: trace.retrievedEvidence,
        })
      : null;
  const grounding = groundSystem1Claims({
    claims: trace.claims,
    evidence: trace.retrievedEvidence,
  });
  const replayed: Pick<
    System1TurnTrace,
    | 'taskFrame'
    | 'authority'
    | 'requiredEvidence'
    | 'retrievedEvidence'
    | 'sufficiency'
    | 'claims'
    | 'groundingResult'
    | 'routeDecision'
    | 'finalAnswer'
  > = {
    taskFrame: trace.taskFrame,
    authority: trace.authority,
    requiredEvidence: trace.requiredEvidence,
    retrievedEvidence: trace.retrievedEvidence,
    sufficiency,
    claims: grounding.grounded,
    groundingResult: grounding.result,
    routeDecision: {
      recommendedRoute: sufficiency?.recommendedRoute ?? trace.routeDecision.recommendedRoute,
      answerMode: sufficiency?.answerMode ?? trace.routeDecision.answerMode,
    },
    finalAnswer: trace.finalAnswer,
  };
  const issues = diagnoseSystem1Issues(replayed);
  const drift: string[] = [];
  if ((trace.sufficiency?.status ?? null) !== (sufficiency?.status ?? null)) {
    drift.push(
      `sufficiency:${trace.sufficiency?.status ?? 'null'}->${sufficiency?.status ?? 'null'}`,
    );
  }
  const origIssues = trace.issues.map((i) => i.code).sort().join(',');
  const nextIssues = issues.map((i) => i.code).sort().join(',');
  if (origIssues !== nextIssues) {
    drift.push(`issues:${origIssues}->${nextIssues}`);
  }
  return {
    sufficiency,
    groundingResult: grounding.result,
    issues,
    drifted: drift.length > 0,
    drift,
  };
}
