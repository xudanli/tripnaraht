import { Injectable, Logger, Optional } from '@nestjs/common';
import type {
  ContingencyPathId,
  ContingencyRunMetric,
  DecisionOsSloSnapshot,
  MemoryStateShadowRecord,
  SloOutcome,
  ValidationGatewayStageId,
  ValidationRunMetric,
  ValidationStageMetric,
} from './decision-os-slo.types';

const MAX_RING = 500;
const MAX_SHADOW_RING = 200;

@Injectable()
export class DecisionOsSloService {
  private readonly logger = new Logger(DecisionOsSloService.name);
  private readonly validationRuns: ValidationRunMetric[] = [];
  private readonly contingencyRuns: ContingencyRunMetric[] = [];
  private readonly memoryStateShadow: MemoryStateShadowRecord[] = [];

  recordValidation(metric: ValidationRunMetric): void {
    this.validationRuns.push(metric);
    if (this.validationRuns.length > MAX_RING) {
      this.validationRuns.splice(0, this.validationRuns.length - MAX_RING);
    }
    this.logger.debug(
      `[SLO] validation requestId=${metric.requestId} passed=${metric.passed} issues=${metric.totalIssues} ms=${metric.durationMs}`,
    );
  }

  recordContingency(metric: ContingencyRunMetric): void {
    this.contingencyRuns.push(metric);
    if (this.contingencyRuns.length > MAX_RING) {
      this.contingencyRuns.splice(0, this.contingencyRuns.length - MAX_RING);
    }
    this.logger.debug(
      `[SLO] contingency path=${metric.pathId} trip=${metric.tripId} outcome=${metric.outcome} ms=${metric.durationMs}`,
    );
  }

  recordMemoryStateShadow(record: Omit<MemoryStateShadowRecord, 'recordedAt'> & { recordedAt?: string }): void {
    const row: MemoryStateShadowRecord = {
      ...record,
      recordedAt: record.recordedAt ?? new Date().toISOString(),
    };
    this.memoryStateShadow.push(row);
    if (this.memoryStateShadow.length > MAX_SHADOW_RING) {
      this.memoryStateShadow.shift();
    }
    this.logger.debug(
      `[SLO] memory_state_shadow user=${row.userId} keys=${row.changedKeys.length} overlay=${row.overlayApplied}`,
    );
  }

  getRecentMemoryStateShadow(limit = 20): MemoryStateShadowRecord[] {
    const n = Math.max(1, Math.min(limit, MAX_SHADOW_RING));
    return this.memoryStateShadow.slice(-n);
  }

  getSnapshot(): DecisionOsSloSnapshot {
    const vTotal = this.validationRuns.length;
    const vPassed = this.validationRuns.filter((r) => r.passed).length;
    const vPassRate = vTotal === 0 ? 100 : Math.round((vPassed / vTotal) * 10000) / 100;
    const vAvgMs =
      vTotal === 0
        ? 0
        : Math.round(this.validationRuns.reduce((s, r) => s + r.durationMs, 0) / vTotal);

    const byStage: DecisionOsSloSnapshot['validation']['byStage'] = {};
    for (const run of this.validationRuns) {
      for (const st of run.stages) {
        const cur = byStage[st.stageId] ?? { runs: 0, avgIssueCount: 0 };
        cur.runs += 1;
        cur.avgIssueCount =
          Math.round(((cur.avgIssueCount * (cur.runs - 1) + st.issueCount) / cur.runs) * 100) / 100;
        byStage[st.stageId] = cur;
      }
    }

    const cTotal = this.contingencyRuns.length;
    const cSuccess = this.contingencyRuns.filter(
      (r) => r.outcome === 'SUCCESS' || r.outcome === 'PARTIAL',
    ).length;
    const cSuccessRate = cTotal === 0 ? 100 : Math.round((cSuccess / cTotal) * 10000) / 100;

    const byPath: DecisionOsSloSnapshot['contingency']['byPath'] = {};
    for (const pathId of ['KERNEL_REPLAN', 'IN_TRIP_RECOVERY', 'SILENT_HEAL', 'ADVISOR_PLAN_B'] as ContingencyPathId[]) {
      const rows = this.contingencyRuns.filter((r) => r.pathId === pathId);
      if (rows.length === 0) continue;
      const ok = rows.filter((r) => r.outcome === 'SUCCESS' || r.outcome === 'PARTIAL').length;
      byPath[pathId] = {
        runs: rows.length,
        successRatePct: Math.round((ok / rows.length) * 10000) / 100,
      };
    }

    return {
      generatedAt: new Date().toISOString(),
      validation: {
        totalRuns: vTotal,
        passedRuns: vPassed,
        passRatePct: vPassRate,
        avgDurationMs: vAvgMs,
        byStage,
      },
      contingency: {
        totalRuns: cTotal,
        successRuns: cSuccess,
        successRatePct: cSuccessRate,
        byPath,
      },
      blendedInterventionSuccessRatePct: cSuccessRate,
    };
  }

  /** 测试 / benchmark 重置 */
  reset(): void {
    this.validationRuns.length = 0;
    this.contingencyRuns.length = 0;
    this.memoryStateShadow.length = 0;
  }

  getRecentValidationRuns(limit = 20): ValidationRunMetric[] {
    return this.validationRuns.slice(-limit);
  }

  getRecentContingencyRuns(limit = 20): ContingencyRunMetric[] {
    return this.contingencyRuns.slice(-limit);
  }

  static countIssueClasses(issues: Array<{ class?: string }>): {
    fatal: number;
    conflict: number;
    advisory: number;
  } {
    let fatal = 0;
    let conflict = 0;
    let advisory = 0;
    for (const i of issues) {
      if (i.class === 'FATAL') fatal++;
      else if (i.class === 'CONFLICT') conflict++;
      else if (i.class === 'ADVISORY') advisory++;
    }
    return { fatal, conflict, advisory };
  }

  static deriveValidationOutcome(hasFatal: boolean, hasConflict: boolean): SloOutcome {
    if (hasFatal) return 'FAILED';
    if (hasConflict) return 'PARTIAL';
    return 'SUCCESS';
  }

  static buildStageMetric(params: {
    stageId: ValidationGatewayStageId;
    durationMs: number;
    issuesBefore: number;
    issuesAfter: number;
    issues: Array<{ class?: string }>;
    skipped?: boolean;
    error?: string;
  }): ValidationStageMetric {
    const added = Math.max(0, params.issuesAfter - params.issuesBefore);
    const slice = params.issues.slice(params.issuesBefore);
    const counts = DecisionOsSloService.countIssueClasses(slice);
    return {
      stageId: params.stageId,
      durationMs: params.durationMs,
      issueCount: added,
      fatalCount: counts.fatal,
      conflictCount: counts.conflict,
      advisoryCount: counts.advisory,
      skipped: params.skipped === true,
      error: params.error,
    };
  }
}
