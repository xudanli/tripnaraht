import type { ExecutionRiskCutoverBuildMetadata, ExecutionRiskShadowComparison } from './execution-risk-shadow-compare.types';
import { EXECUTION_RISK_SHADOW_COMPARISON_SCHEMA_ID } from './execution-risk-shadow-compare.types';
import {
  assertClusterVisibilityConsistency,
  clusterVisibilityStructureValid,
} from './cluster-visibility-consistency.util';

export interface ShadowBuildVerifyCheck {
  id: string;
  pass: boolean;
  detail: string;
}

export interface ShadowBuildVerifyResult {
  pass: boolean;
  checks: ShadowBuildVerifyCheck[];
  build?: ExecutionRiskCutoverBuildMetadata;
}

const REQUIRED_CLUSTER_VISIBILITY_FIELDS = [
  'totalClusterCount',
  'visibleClusterCount',
  'suppressedClusterCount',
  'hiddenStopCount',
  'hiddenHighSeverityCount',
  'audits',
] as const;

export function verifyShadowCompareBuild(input: {
  comparison: ExecutionRiskShadowComparison;
  build?: Partial<ExecutionRiskCutoverBuildMetadata>;
}): ShadowBuildVerifyResult {
  const checks: ShadowBuildVerifyCheck[] = [];
  const cv = input.comparison.semanticComparison?.clusterVisibility;

  checks.push({
    id: 'shadow-schema-v2',
    pass: input.comparison.schemaId === EXECUTION_RISK_SHADOW_COMPARISON_SCHEMA_ID,
    detail: `schemaId=${input.comparison.schemaId ?? 'missing'}`,
  });

  for (const field of REQUIRED_CLUSTER_VISIBILITY_FIELDS) {
    const present = cv != null && field in cv;
    checks.push({
      id: `clusterVisibility.${field}`,
      pass: present,
      detail: present ? 'present' : 'missing — old build or incomplete response',
    });
  }

  checks.push({
    id: 'clusterVisibility.structure',
    pass: clusterVisibilityStructureValid(cv),
    detail: clusterVisibilityStructureValid(cv)
      ? 'cluster visibility structure valid'
      : 'clusterVisibility incomplete',
  });

  const consistency = cv ? assertClusterVisibilityConsistency(cv) : { pass: false, violations: ['missing clusterVisibility'] };
  checks.push({
    id: 'clusterVisibility.consistency',
    pass: consistency.pass,
    detail: consistency.pass ? 'SUPPRESSED cluster rules satisfied' : consistency.violations.join('; '),
  });

  if (input.build) {
    for (const key of ['appBuildSha', 'packageVersion', 'knowledgeVersion', 'contractVersion', 'shadowSchemaVersion'] as const) {
      checks.push({
        id: `build.${key}`,
        pass: Boolean(input.build[key]),
        detail: String(input.build[key] ?? 'missing'),
      });
    }
  }

  return {
    pass: checks.every((c) => c.pass),
    checks,
    build: input.build as ExecutionRiskCutoverBuildMetadata | undefined,
  };
}
