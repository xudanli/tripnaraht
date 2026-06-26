import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import type { RecordTransactionInput } from '../types/money-brain.types';
import type {
  OfflineOperationInput,
  OfflineOperationType,
  OfflineSyncRequest,
  OfflineSyncResult,
} from '../types/in-trip-offline.types';
import { isInTripExecutionEnabled } from '../utils/in-trip-config.util';
import { ExperiencePulseService } from './experience-pulse.service';
import { GroupPulseService } from './group-pulse.service';
import { InTripAccessService } from './in-trip-access.service';
import { SmartTransactionService } from './smart-transaction.service';
import type { SubmitExperiencePulseInput } from '../types/experience-loop.types';
import type { MoodCheckInput, MotionSignalInput, MicroFeedbackInput } from '../types/group-pulse.types';

@Injectable()
export class InTripOfflineSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: InTripAccessService,
    private readonly transactions: SmartTransactionService,
    private readonly groupPulse: GroupPulseService,
    private readonly experiencePulse: ExperiencePulseService,
  ) {}

  async sync(
    tripId: string,
    userId: string,
    request: OfflineSyncRequest,
  ): Promise<OfflineSyncResult> {
    if (!isInTripExecutionEnabled()) {
      throw new BadRequestException('行中执行模块未启用');
    }

    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    const operations = [...(request.operations ?? [])].sort(
      (a, b) => a.clientSeq - b.clientSeq,
    );

    let applied = 0;
    let skipped = 0;
    const conflicts: OfflineSyncResult['conflicts'] = [];

    for (const op of operations) {
      const existing = await this.prisma.tripInTripOfflineQueueEntry.findFirst({
        where: { tripId, userId, clientSeq: BigInt(op.clientSeq) },
      });

      if (existing?.syncedAt) {
        skipped += 1;
        continue;
      }

      try {
        await this.applyOperation(tripId, userId, op);
        const recordedAt = new Date(op.recordedAt);
        if (existing) {
          await this.prisma.tripInTripOfflineQueueEntry.update({
            where: { id: existing.id },
            data: { syncedAt: new Date(), conflictStatus: 'applied' },
          });
        } else {
          await this.prisma.tripInTripOfflineQueueEntry.create({
            data: {
              tripId,
              userId,
              operationType: op.operationType,
              payload: toInputJsonValue(op.payload),
              clientSeq: BigInt(op.clientSeq),
              recordedAt,
              syncedAt: new Date(),
              conflictStatus: 'applied',
            },
          });
        }
        applied += 1;
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        conflicts.push({
          clientSeq: op.clientSeq,
          operationType: op.operationType,
          reason,
        });

        const recordedAt = new Date(op.recordedAt);
        if (existing) {
          await this.prisma.tripInTripOfflineQueueEntry.update({
            where: { id: existing.id },
            data: { conflictStatus: 'manual_review' },
          });
        } else {
          await this.prisma.tripInTripOfflineQueueEntry.create({
            data: {
              tripId,
              userId,
              operationType: op.operationType,
              payload: toInputJsonValue(op.payload),
              clientSeq: BigInt(op.clientSeq),
              recordedAt,
              conflictStatus: 'manual_review',
            },
          });
        }
      }
    }

    return {
      applied,
      skipped,
      conflicts,
      syncedAt: new Date().toISOString(),
    };
  }

  private async applyOperation(
    tripId: string,
    userId: string,
    op: OfflineOperationInput,
  ): Promise<void> {
    this.assertOperationType(op.operationType);

    switch (op.operationType) {
      case 'record_transaction':
        await this.transactions.record(
          tripId,
          userId,
          op.payload as unknown as RecordTransactionInput,
        );
        return;
      case 'mood_check':
        await this.groupPulse.submitMoodCheck(
          tripId,
          userId,
          op.payload as unknown as MoodCheckInput,
        );
        return;
      case 'motion_signal':
        await this.groupPulse.submitMotion(
          tripId,
          userId,
          op.payload as unknown as MotionSignalInput,
        );
        return;
      case 'micro_feedback':
        await this.groupPulse.submitMicroFeedback(
          tripId,
          userId,
          op.payload as unknown as MicroFeedbackInput,
        );
        return;
      case 'experience_pulse':
        await this.experiencePulse.submit(
          tripId,
          userId,
          op.payload as unknown as SubmitExperiencePulseInput,
        );
        return;
      default:
        throw new BadRequestException(`未知离线操作类型: ${(op as OfflineOperationInput).operationType}`);
    }
  }

  private assertOperationType(type: string): asserts type is OfflineOperationType {
    const allowed: OfflineOperationType[] = [
      'record_transaction',
      'mood_check',
      'motion_signal',
      'experience_pulse',
      'micro_feedback',
    ];
    if (!allowed.includes(type as OfflineOperationType)) {
      throw new BadRequestException(`不支持的 operationType: ${type}`);
    }
  }
}
