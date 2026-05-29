/**
 * 决策内核：CGUS 前是否拼接 RAG 检索证据（λ / recency / WorldConstraintStore 物化）。
 *
 * 优先级：DecisionOS `ragEvidence.enabled` > `DECISION_OS_RAG_EVIDENCE_ENABLED` >
 * `KERNEL_CGUS_RAG_EVIDENCE` > staging/production 默认开。
 */
export const KERNEL_CGUS_RAG_EVIDENCE_ENV = 'KERNEL_CGUS_RAG_EVIDENCE' as const;
export const DECISION_OS_RAG_EVIDENCE_ENABLED_ENV = 'DECISION_OS_RAG_EVIDENCE_ENABLED' as const;

export function isKernelCgusRagEvidenceEnabledFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = (env[KERNEL_CGUS_RAG_EVIDENCE_ENV] ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function parseTriStateEnv(raw: string | undefined): boolean | undefined {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return undefined;
}

/**
 * CGUS 前 RAG 证据链是否启用（与 DecisionOSConfig.ragEvidence 对齐）。
 */
export function resolveCgusRagEvidenceEnabled(options?: {
  configEnabled?: boolean;
  env?: NodeJS.ProcessEnv;
}): boolean {
  if (options?.configEnabled === true) return true;
  if (options?.configEnabled === false) return false;

  const env = options?.env ?? process.env;
  const osFlag = parseTriStateEnv(env[DECISION_OS_RAG_EVIDENCE_ENABLED_ENV]);
  if (osFlag !== undefined) return osFlag;
  if (isKernelCgusRagEvidenceEnabledFromEnv(env)) return true;

  const nodeEnv = (env.NODE_ENV ?? 'development').toLowerCase();
  return nodeEnv === 'production' || nodeEnv === 'staging';
}
