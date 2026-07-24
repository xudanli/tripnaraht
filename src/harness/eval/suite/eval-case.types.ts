export type EvalCaseKind = 'jest' | 'fingerprint-only';

export type EvalSuiteCase = {
  caseId: string;
  kind: EvalCaseKind;
  description?: string;
  /** jest：相对 repo root 的 testPathPattern */
  jestPattern?: string;
  /** fingerprint-only：直接比对结构化快照 */
  payload?: unknown;
  expectedFingerprint?: string;
  allowedDiffPaths?: string[];
};

export type EvalSuiteDefinition = {
  suiteId: string;
  version: string;
  description?: string;
  env?: Record<string, string>;
  cases: EvalSuiteCase[];
  /** 全套件路径指纹基线（case 结果序列的稳定哈希） */
  pathFingerprintBaseline?: string | null;
};

export type EvalCaseRunResult = {
  caseId: string;
  kind: EvalCaseKind;
  passed: boolean;
  fingerprint: string;
  message?: string;
};

export type EvalSuiteRunResult = {
  suiteId: string;
  passed: boolean;
  pathFingerprint: string;
  baselineMatch: boolean | null;
  caseResults: EvalCaseRunResult[];
  lintStrictApplied: boolean;
  errors: string[];
  warnings: string[];
};
