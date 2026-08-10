import { Injectable } from '@nestjs/common';
import type {
  LookDecisionProblem,
  LookDecisionProblemUpsertInput,
} from './look-decision-problem.types';
import { finalizePreviewRef } from './observation-decision-problem.mapper';

@Injectable()
export class LookDecisionProblemStore {
  private readonly byId = new Map<string, LookDecisionProblem>();
  private readonly byObservation = new Map<string, string>();

  upsert(input: LookDecisionProblemUpsertInput): LookDecisionProblem {
    const existingId = this.byObservation.get(input.observationId);
    const problemId =
      existingId ??
      input.preferredProblemId ??
      `look_dp_${input.observationId}_r${input.assessmentRevision}`;

    let problem: LookDecisionProblem = {
      problemId,
      tripId: input.tripId,
      observationId: input.observationId,
      assessmentId: input.assessmentId,
      assessmentRevision: input.assessmentRevision,
      type: input.type,
      semanticKey: input.semanticKey,
      title: input.title,
      description: input.description,
      status: 'OPEN',
      urgency: input.urgency ?? 'MEDIUM',
      detectedBy: 'USER',
      detectedAt: new Date().toISOString(),
      assessmentStatus: input.assessmentStatus,
      verificationStatus: input.verificationStatus,
      evidenceIds: input.evidenceIds,
      preview: input.preview,
      constraintBridgeKey: input.constraintBridgeKey,
      writesPlanVersion: false,
    };

    problem = finalizePreviewRef(problem);
    this.byId.set(problem.problemId, problem);
    this.byObservation.set(input.observationId, problem.problemId);
    return { ...problem };
  }

  get(problemId: string): LookDecisionProblem | undefined {
    const p = this.byId.get(problemId);
    return p ? { ...p } : undefined;
  }

  getByObservation(observationId: string): LookDecisionProblem | undefined {
    const id = this.byObservation.get(observationId);
    return id ? this.get(id) : undefined;
  }

  listByTrip(tripId: string): LookDecisionProblem[] {
    return [...this.byId.values()]
      .filter((p) => p.tripId === tripId)
      .map((p) => ({ ...p }));
  }

  clear(): void {
    this.byId.clear();
    this.byObservation.clear();
  }
}
