import { Injectable } from '@nestjs/common';
import type {
  LookFeedbackReceipt,
  LookFeedbackResult,
  SubmitLookFeedbackInput,
} from '../observation.types';

export interface LookFeedbackRecord extends LookFeedbackReceipt {
  userCorrection?: SubmitLookFeedbackInput['userCorrection'];
}

@Injectable()
export class LookFeedbackStore {
  private readonly byId = new Map<string, LookFeedbackRecord>();
  private readonly byObservation = new Map<string, string[]>();

  submit(input: {
    observationId: string;
    assessmentId: string;
    assessmentRevision?: number;
    result: LookFeedbackResult;
    userCorrection?: SubmitLookFeedbackInput['userCorrection'];
  }): LookFeedbackReceipt {
    const feedbackId = `fb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const submittedAt = new Date().toISOString();
    const record: LookFeedbackRecord = {
      feedbackId,
      observationId: input.observationId,
      assessmentId: input.assessmentId,
      assessmentRevision: input.assessmentRevision,
      result: input.result,
      submittedAt,
      writesPlanVersion: false,
      analyticsEvent: 'look_feedback_submitted',
      userCorrection: input.userCorrection,
    };
    this.byId.set(feedbackId, record);
    const list = this.byObservation.get(input.observationId) ?? [];
    list.push(feedbackId);
    this.byObservation.set(input.observationId, list);
    const { userCorrection: _uc, ...receipt } = record;
    return { ...receipt };
  }

  listByObservation(observationId: string): LookFeedbackRecord[] {
    return (this.byObservation.get(observationId) ?? [])
      .map((id) => this.byId.get(id))
      .filter((r): r is LookFeedbackRecord => !!r)
      .map((r) => ({ ...r }));
  }

  clear(): void {
    this.byId.clear();
    this.byObservation.clear();
  }
}
