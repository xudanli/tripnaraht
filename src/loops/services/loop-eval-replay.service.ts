import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { ReadinessRepairLoop } from '../loops/readiness-repair.loop';
import { InTripRecoveryLoop } from '../loops/in-trip-recovery.loop';
import { LoopEvalCaseStorageService } from './loop-eval-case.storage.service';
import type { LoopEvalCase } from '../types/loop-eval-case.types';

export interface LoopEvalReplayResult {
  caseId: string;
  passed: boolean;
  message: string;
  actualStatus?: string;
  expectedStatus?: string;
}

@Injectable()
export class LoopEvalReplayService {
  constructor(
    @Inject(forwardRef(() => ReadinessRepairLoop))
    private readonly readinessRepairLoop: ReadinessRepairLoop,
    private readonly inTripRecoveryLoop: InTripRecoveryLoop,
    private readonly storage: LoopEvalCaseStorageService,
  ) {}

  async replayCaseById(caseId: string, userId: string): Promise<LoopEvalReplayResult> {
    const testCase = await this.storage.loadCase(caseId);
    if (!testCase) {
      throw new NotFoundException(`Loop eval case ${caseId} 不存在`);
    }
    return this.replayCase(testCase, userId);
  }

  async replayCase(testCase: LoopEvalCase, userId: string): Promise<LoopEvalReplayResult> {
    const approvalStatus = testCase.approval?.status ?? 'PENDING';
    if (approvalStatus === 'REJECTED') {
      throw new BadRequestException(`Case ${testCase.id} 已被拒绝，无法 replay`);
    }

    const exp = testCase.replayExpectations;
    let actualStatus: string | undefined;
    let passed = true;
    const messages: string[] = [];

    try {
      if (testCase.loopType === 'READINESS_REPAIR') {
        const result = await this.readinessRepairLoop.run({
          tripId: testCase.tripId,
          triggerType: 'MANUAL',
          forceRefreshEvidence: false,
          userId,
          metadata: { evalReplayCaseId: testCase.id },
        });
        actualStatus = result.status;

        if (exp?.expectedStatus && result.status !== exp.expectedStatus) {
          passed = false;
          messages.push(`status ${result.status} != expected ${exp.expectedStatus}`);
        }

        if (exp?.minReadinessDelta != null) {
          const delta = result.after.readinessScore - result.before.readinessScore;
          if (delta < exp.minReadinessDelta) {
            passed = false;
            messages.push(`readiness delta ${delta} < ${exp.minReadinessDelta}`);
          }
        }

        if (exp?.mustImproveBlockers) {
          if (result.after.hardBlockers >= result.before.hardBlockers) {
            passed = false;
            messages.push('blockers did not decrease');
          }
        }

        if (exp?.maxIterations != null && result.iterations.length > exp.maxIterations) {
          passed = false;
          messages.push(`iterations ${result.iterations.length} > ${exp.maxIterations}`);
        }
      } else if (testCase.loopType === 'IN_TRIP_RECOVERY') {
        const result = await this.inTripRecoveryLoop.run({
          tripId: testCase.tripId,
          userId,
          triggerType: 'MANUAL',
          metadata: { evalReplayCaseId: testCase.id },
        });
        actualStatus = result.status;
        if (exp?.expectedStatus && result.status !== exp.expectedStatus) {
          passed = false;
          messages.push(`status ${result.status} != expected ${exp.expectedStatus}`);
        }
      } else {
        return {
          caseId: testCase.id,
          passed: false,
          message: `Unsupported loop type for replay: ${testCase.loopType}`,
        };
      }
    } catch (error: unknown) {
      return {
        caseId: testCase.id,
        passed: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }

    return {
      caseId: testCase.id,
      passed,
      message: passed ? 'replay passed' : messages.join('; '),
      actualStatus,
      expectedStatus: exp?.expectedStatus,
    };
  }
}
