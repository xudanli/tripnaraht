import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SideEffectRegistryService } from '../../agent/services/side-effect-registry.service';
import { AGENT_ACTION_LOG_STATUS } from '../../agent/constants/agent-action-log.constants';
import type { SideEffectConfig } from '../../agent/interfaces/side-effect.interface';

export type SagaReplayResult =
  | { ok: true; already_replayed: boolean; message?: string }
  | { ok: false; code: string; message: string };

@Injectable()
export class SagaSideEffectReplayService {
  private readonly logger = new Logger(SagaSideEffectReplayService.name);

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly sideEffects?: SideEffectRegistryService,
  ) {}

  async replaySideEffects(input: {
    agentActionLogId: string;
    idempotencyKey?: string | null;
  }): Promise<SagaReplayResult> {
    if (!this.prisma?.isDbConnected()) {
      return { ok: false, code: 'DB_UNAVAILABLE', message: 'Database not connected' };
    }
    if (!this.sideEffects) {
      return { ok: false, code: 'SIDE_EFFECTS_UNAVAILABLE', message: 'SideEffectRegistry not available' };
    }

    const log = await this.prisma.agentActionLog.findUnique({ where: { id: input.agentActionLogId } });
    if (!log) {
      return { ok: false, code: 'NOT_FOUND', message: 'Saga log not found' };
    }
    const st = String(log.status ?? '');
    if (st !== AGENT_ACTION_LOG_STATUS.COMMITTED && st !== AGENT_ACTION_LOG_STATUS.FAILED) {
      return {
        ok: false,
        code: 'INVALID_STATUS',
        message: `Replay only allowed for COMMITTED or FAILED; got ${st}`,
      };
    }

    const existing = await this.prisma.adminSagaSideEffectReplay.findUnique({
      where: { agentActionLogId: log.id },
    });
    if (existing) {
      return {
        ok: true,
        already_replayed: true,
        message: 'Side effects were already replayed for this saga log',
      };
    }

    const payload = (log.payload ?? {}) as Record<string, unknown>;
    const configs = payload.side_effect_configs as unknown;
    if (!Array.isArray(configs) || configs.length === 0) {
      throw new BadRequestException(
        'This saga log has no persisted side_effect_configs; cannot safely replay (upgrade client / re-run commit with newer server).',
      );
    }

    const actionInput = payload.action_input;
    const actionType = String(payload.action_type ?? '');
    const targetType = String(payload.target_type ?? '');
    const targetRef =
      payload.target_ref === undefined || payload.target_ref === null ? undefined : String(payload.target_ref);

    try {
      await this.prisma.adminSagaSideEffectReplay.create({
        data: {
          agentActionLogId: log.id,
          idempotencyKey: input.idempotencyKey?.trim() || null,
        },
      });
    } catch (e: any) {
      if (String(e?.code ?? '') === 'P2002') {
        return { ok: true, already_replayed: true, message: 'Concurrent replay deduplicated' };
      }
      this.logger.warn(`replay ledger insert failed: ${e?.message ?? e}`);
      return { ok: false, code: 'LEDGER_ERROR', message: e?.message ?? String(e) };
    }

    const wallet =
      actionInput && typeof actionInput === 'object' && actionInput !== null && 'wallet' in actionInput
        ? (actionInput as { wallet?: unknown }).wallet
        : undefined;

    try {
      await this.sideEffects.applyMany(
        {
          request_id: log.requestId,
          trip_id: log.tripId,
          action_id: log.actionId,
          action_name: log.actionName,
          action_type: actionType,
          target_type: targetType,
          target_ref: targetRef,
          action_input: actionInput,
          state: {
            trip: { trip_id: log.tripId },
            request_id: log.requestId,
            trip_id: log.tripId,
            ...(typeof wallet === 'object' && wallet !== null ? { wallet } : {}),
          },
        },
        configs as SideEffectConfig[],
      );
      await this.prisma.agentActionLog.update({
        where: { id: log.id },
        data: { status: AGENT_ACTION_LOG_STATUS.SIDE_EFFECT_DONE, lastError: null },
      });
      return { ok: true, already_replayed: false };
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      await this.prisma.adminSagaSideEffectReplay
        .delete({ where: { agentActionLogId: log.id } })
        .catch(() => undefined);
      await this.prisma.agentActionLog
        .update({
          where: { id: log.id },
          data: { status: AGENT_ACTION_LOG_STATUS.FAILED, lastError: msg },
        })
        .catch(() => undefined);
      this.logger.warn(`saga replay apply failed log=${log.id}: ${msg}`);
      return { ok: false, code: 'APPLY_FAILED', message: msg };
    }
  }
}
