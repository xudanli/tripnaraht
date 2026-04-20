/**
 * 决策内核：CGUS 前是否拼接 RAG 检索证据（λ / recency）。
 *
 * 环境变量名；默认关闭，避免 OPTIMIZE 路径每次打库。
 */
export const KERNEL_CGUS_RAG_EVIDENCE_ENV = 'KERNEL_CGUS_RAG_EVIDENCE' as const;

export function isKernelCgusRagEvidenceEnabledFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = (env[KERNEL_CGUS_RAG_EVIDENCE_ENV] ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}
