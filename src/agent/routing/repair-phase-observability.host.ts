/**
 * REPAIR 阶段审计可观测宿主。
 */

import type { Logger } from '@nestjs/common';

export interface RepairPhaseObservabilityHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly promMetrics?: any;
  normalizeDecisionOsAuditReport(auditReport: unknown): any;
}
