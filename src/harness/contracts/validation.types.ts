export type HarnessValidationSeverity = 'L1' | 'L2' | 'L3';

export interface HarnessValidationResult {
  passed: boolean;
  severity: HarnessValidationSeverity;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
