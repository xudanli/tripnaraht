import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { FeasibilityReportService } from '../../trip-constraint-solver/services/feasibility-report.service';
import { DecisionProblemCollectorService } from '../collectors/decision-problem.collector';
import { DecisionRecordStoreService } from '../persistence/decision-record.store';
import type { DecisionOutcomeValidation, DecisionRecord } from '../types/decision-semantics.types';
import { buildExpectedOutcomes } from '../validation/build-expected-outcomes.util';
import {
  buildValidationBaselineFromReport,
  collectObservedOutcomes,
  loadPoiFeedbackSinceDecision,
} from '../validation/collect-observed-outcomes.util';
import { loadExperienceOutcomesSinceDecision } from '../validation/collect-experience-outcomes.util';
import { loadLightExecutionSignals } from '../validation/load-light-execution-observations.util';
import { DecisionLedgerBridgeService } from '../ledger/decision-ledger-bridge.service';
import {
  evaluateOutcomeValidation,
  validationStatusFromVerdict,
} from '../validation/evaluate-outcome-validation.util';

@Injectable()
export class DecisionOutcomeValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recordStore: DecisionRecordStoreService,
    private readonly feasibility: FeasibilityReportService,
    private readonly collector: DecisionProblemCollectorService,
    private readonly ledgerBridge: DecisionLedgerBridgeService,
  ) {}

  async validateDecision(tripId: string, decisionId: string): Promise<DecisionOutcomeValidation> {
    const record = await this.recordStore.getRecord(tripId, decisionId);
    if (!record) {
      throw new NotFoundException(`DECISION_RECORD_NOT_FOUND: ${decisionId}`);
    }

    const [report, collected] = await Promise.all([
      this.feasibility.getReport(tripId),
      this.collector.collect(tripId),
    ]);

    const problem = collected.items.find((p) => p.id === record.problemId);
    const problemStillOpen = !!problem && problem.status !== 'RESOLVED' && problem.status !== 'DISMISSED';

    const [poiFeedbackRows, lightExecutionSignals, experienceOutcomes] = await Promise.all([
      loadPoiFeedbackSinceDecision(this.prisma, tripId, record.decidedAt),
      loadLightExecutionSignals(this.prisma, tripId, record.decidedAt),
      loadExperienceOutcomesSinceDecision(this.prisma, tripId, record.decidedAt),
    ]);

    const expectedOutcomes =
      record.expectedOutcomes?.length
        ? record.expectedOutcomes
        : buildExpectedOutcomes(record, problem);

    const observedOutcomes = collectObservedOutcomes({
      report,
      problemStillOpen,
      poiFeedbackRows,
      lightExecutionSignals,
    });

    const ledgerStale = await this.ledgerBridge.isLedgerStaleForDecision(tripId, record);

    const validation = evaluateOutcomeValidation({
      record,
      expectedOutcomes,
      observedOutcomes,
      experienceOutcomes,
      ledgerStale,
    });

    await this.recordStore.updateRecord(tripId, decisionId, {
      validationStatus: validationStatusFromVerdict(validation.verdict),
      lastOutcomeValidation: validation,
      expectedOutcomes: record.expectedOutcomes ?? expectedOutcomes,
      validationBaseline:
        record.validationBaseline ??
        buildValidationBaselineFromReport(report, problemStillOpen),
    });

    if (validation.verdict === 'CONFIRMED' && problem) {
      await this.recordStore.markProblemResolved(tripId, {
        problemId: problem.id,
        semanticKey: problem.semanticKey ?? problem.id,
        resolvedAt: validation.evaluatedAt ?? new Date().toISOString(),
        resolvedByDecisionId: decisionId,
        resolvedTripVersion: report.currentTripVersion,
        resolution: 'VALIDATION_CONFIRMED',
      });
    }

    return validation;
  }

  async capturePostDecisionBaseline(
    tripId: string,
    record: DecisionRecord,
  ): Promise<Partial<DecisionRecord>> {
    const [report, collected] = await Promise.all([
      this.feasibility.getReport(tripId),
      this.collector.collect(tripId),
    ]);
    const problem = collected.items.find((p) => p.id === record.problemId);
    const problemOpen = !!problem && problem.status !== 'RESOLVED' && problem.status !== 'DISMISSED';

    return {
      expectedOutcomes: buildExpectedOutcomes(record, problem),
      validationBaseline: buildValidationBaselineFromReport(report, problemOpen),
      validationStatus: record.status === 'EXECUTED' ? 'PENDING' : 'NOT_APPLICABLE',
    };
  }
}
