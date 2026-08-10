/**
 * Evidence-driven Fix — Architecture Freeze。
 * 研发任务只能来自真实 Beta Incident / Task Failure / 数据质量 / 性能 / 稳定 / 恢复 / 用户理解。
 */

export const EVIDENCE_DRIVEN_FIX_SCHEMA =
  'nara.evidence_driven_fix@v1' as const;

export type EvidenceDrivenTaskSource =
  | 'BETA_INCIDENT'
  | 'TASK_FAILURE'
  | 'DATA_QUALITY'
  | 'PERFORMANCE'
  | 'STABILITY'
  | 'RECOVERY'
  | 'USER_UNDERSTANDING';

export type EvidenceDrivenTaskV1 = {
  schemaId: typeof EVIDENCE_DRIVEN_FIX_SCHEMA;
  version: 1;
  taskId: string;
  source: EvidenceDrivenTaskSource;
  evidenceRef: string;
  summaryZh: string;
  architectureFreeze: true;
  evidenceDrivenFix: true;
  /** 禁止无证据扩架构 */
  newArchitectureForbidden: true;
};

export function createEvidenceDrivenTask(input: {
  source: EvidenceDrivenTaskSource;
  evidenceRef: string;
  summaryZh: string;
  taskId?: string;
}): EvidenceDrivenTaskV1 {
  if (!input.evidenceRef.trim()) {
    throw new Error(
      '[EvidenceDrivenFix] evidenceRef_required:Architecture Freeze, Evidence-driven Fix',
    );
  }
  return {
    schemaId: EVIDENCE_DRIVEN_FIX_SCHEMA,
    version: 1,
    taskId: input.taskId ?? `edt_${input.source}_${Date.now()}`,
    source: input.source,
    evidenceRef: input.evidenceRef,
    summaryZh: input.summaryZh,
    architectureFreeze: true,
    evidenceDrivenFix: true,
    newArchitectureForbidden: true,
  };
}

export function assertTaskSourceAllowed(source: string): boolean {
  const ok: EvidenceDrivenTaskSource[] = [
    'BETA_INCIDENT',
    'TASK_FAILURE',
    'DATA_QUALITY',
    'PERFORMANCE',
    'STABILITY',
    'RECOVERY',
    'USER_UNDERSTANDING',
  ];
  return (ok as string[]).includes(source);
}
