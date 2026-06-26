import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { LoopEvalCaseStorageService } from './loop-eval-case.storage.service';
import type { LoopEvalCase, LoopEvalApprovalStatus } from '../types/loop-eval-case.types';

export interface ReviewLoopEvalCaseInput {
  caseId: string;
  tripId: string;
  userId: string;
  note?: string;
}

export interface ReviewLoopEvalCaseResult {
  caseId: string;
  approvalStatus: LoopEvalApprovalStatus;
  promoted: boolean;
  case: LoopEvalCase;
}

@Injectable()
export class LoopEvalApprovalService {
  constructor(private readonly storage: LoopEvalCaseStorageService) {}

  async approve(input: ReviewLoopEvalCaseInput): Promise<ReviewLoopEvalCaseResult> {
    return this.review(input, 'APPROVED');
  }

  async reject(input: ReviewLoopEvalCaseInput): Promise<ReviewLoopEvalCaseResult> {
    return this.review(input, 'REJECTED');
  }

  private async review(
    input: ReviewLoopEvalCaseInput,
    status: LoopEvalApprovalStatus,
  ): Promise<ReviewLoopEvalCaseResult> {
    const existing = await this.storage.loadCase(input.caseId);
    if (!existing) {
      throw new NotFoundException(`Loop eval case ${input.caseId} 不存在`);
    }
    if (existing.tripId !== input.tripId) {
      throw new NotFoundException(`Case ${input.caseId} 不属于行程 ${input.tripId}`);
    }

    const currentStatus = existing.approval?.status ?? 'PENDING';
    if (currentStatus !== 'PENDING') {
      throw new BadRequestException(`Case ${input.caseId} 已处于 ${currentStatus} 状态`);
    }

    const updated: LoopEvalCase = {
      ...existing,
      approval: {
        status,
        reviewedBy: input.userId,
        reviewedAt: new Date().toISOString(),
        note: input.note,
      },
    };

    await this.storage.saveCase(updated);

    let promoted = false;
    if (status === 'APPROVED' && updated.kind === 'GOLDEN') {
      promoted = await this.storage.promoteToApprovedCorpus(updated);
    }

    return {
      caseId: input.caseId,
      approvalStatus: status,
      promoted,
      case: promoted ? (await this.storage.loadCase(input.caseId)) ?? updated : updated,
    };
  }
}
