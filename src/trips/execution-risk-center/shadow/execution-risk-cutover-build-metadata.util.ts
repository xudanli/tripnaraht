import { createHash } from 'crypto';
import {
  EXECUTION_RISK_SHADOW_COMPARISON_SCHEMA_ID,
  type ExecutionRiskCutoverBuildMetadata,
} from './execution-risk-shadow-compare.types';

export type { ExecutionRiskCutoverBuildMetadata };

export const EXECUTION_RISK_CONTRACT_VERSION = 'execution-risk-contracts@v1.1';
export const EXECUTION_RISK_PACKAGE_VERSION = 'execution-risk-backend-package@v1';

export function resolveAppBuildSha(): string {
  return (
    process.env.APP_BUILD_SHA ??
    process.env.GIT_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    'local-dev'
  );
}

export function readPackageVersionFromEnv(): string {
  return process.env.npm_package_version ?? '0.1.0';
}

export function buildCutoverBuildMetadata(input?: {
  knowledgeVersion?: string;
  appBuildSha?: string;
  packageVersion?: string;
}): ExecutionRiskCutoverBuildMetadata {
  return {
    appBuildSha: input?.appBuildSha ?? resolveAppBuildSha(),
    packageVersion: input?.packageVersion ?? readPackageVersionFromEnv(),
    knowledgeVersion: input?.knowledgeVersion ?? process.env.EXECUTION_RISK_KNOWLEDGE_VERSION ?? 'unknown',
    contractVersion: EXECUTION_RISK_CONTRACT_VERSION,
    shadowSchemaVersion: EXECUTION_RISK_SHADOW_COMPARISON_SCHEMA_ID,
  };
}

export function capturedAtBucket(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}`;
}

export function sourceFactVersionFromSourceKeys(sourceKeys: string[]): string {
  const sorted = [...sourceKeys].sort().join('|');
  return createHash('sha256').update(sorted).digest('hex').slice(0, 16);
}

export function shadowSnapshotDedupKey(input: {
  tripId: string;
  sourceFactVersion: string;
  planVersionId: string;
  capturedAt: string;
}): string {
  return [
    input.tripId,
    input.sourceFactVersion,
    input.planVersionId,
    capturedAtBucket(input.capturedAt),
  ].join(':');
}

export function isFormalShadowSchema(comparison: { schemaId?: string }): boolean {
  return comparison.schemaId === EXECUTION_RISK_SHADOW_COMPARISON_SCHEMA_ID;
}
