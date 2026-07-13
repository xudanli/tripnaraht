import { ConflictException } from '@nestjs/common';
import {
  TEP_REPAIR_PENDING_STALE_MS,
  TepRepairExecutionStore,
} from './tep-repair-execution.store';

function createMockTx() {
  const state: {
    row: {
      idempotencyKey: string;
      status: 'PENDING' | 'APPLIED' | 'FAILED';
      planVersionId: string | null;
      decisionId: string | null;
      createdAt: Date;
    } | null;
  } = { row: null };

  return {
    state,
    tx: {
      tepRepairExecution: {
        findUnique: jest.fn(async ({ where }: { where: { idempotencyKey: string } }) => {
          if (!state.row || state.row.idempotencyKey !== where.idempotencyKey) return null;
          return state.row;
        }),
        upsert: jest.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { idempotencyKey: string };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            if (state.row?.idempotencyKey === where.idempotencyKey) {
              state.row = {
                ...state.row,
                ...update,
                status: update.status as 'PENDING',
              };
            } else {
              state.row = {
                idempotencyKey: where.idempotencyKey,
                status: create.status as 'PENDING',
                planVersionId: null,
                decisionId: null,
                createdAt: new Date(),
              };
            }
            return state.row;
          },
        ),
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { idempotencyKey: string };
            data: Record<string, unknown>;
          }) => {
            if (!state.row || state.row.idempotencyKey !== where.idempotencyKey) {
              throw new Error('not found');
            }
            state.row = { ...state.row, ...data } as typeof state.row;
            return state.row;
          },
        ),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { idempotencyKey: string; status: string };
            data: Record<string, unknown>;
          }) => {
            if (
              state.row?.idempotencyKey === where.idempotencyKey &&
              state.row.status === where.status
            ) {
              state.row = { ...state.row, ...data } as typeof state.row;
              return { count: 1 };
            }
            return { count: 0 };
          },
        ),
      },
    },
  };
}

describe('TepRepairExecutionStore', () => {
  const store = new TepRepairExecutionStore();
  const baseInput = {
    tripId: 'trip_1',
    optionId: 'REPAIR-SDR101-D1-activity_x',
    idempotencyKey: 'trip:trip_1:tep-repair:REPAIR-SDR101-D1-activity_x',
  };

  it('claims a fresh repair execution', async () => {
    const { tx } = createMockTx();

    await expect(store.claimOrReplay(tx as never, baseInput)).resolves.toEqual({
      action: 'proceed',
    });
  });

  it('replays an applied execution', async () => {
    const { tx, state } = createMockTx();
    state.row = {
      idempotencyKey: baseInput.idempotencyKey,
      status: 'APPLIED',
      planVersionId: 'plan_v2',
      decisionId: 'decision_1',
      createdAt: new Date(),
    };

    await expect(store.claimOrReplay(tx as never, baseInput)).resolves.toEqual({
      action: 'replay',
      planVersionId: 'plan_v2',
      decisionId: 'decision_1',
    });
  });

  it('returns in_progress for a fresh pending execution', async () => {
    const { tx, state } = createMockTx();
    state.row = {
      idempotencyKey: baseInput.idempotencyKey,
      status: 'PENDING',
      planVersionId: null,
      decisionId: null,
      createdAt: new Date(),
    };

    await expect(store.claimOrReplay(tx as never, baseInput)).resolves.toEqual({
      action: 'in_progress',
    });
  });

  it('reclaims stale pending execution', async () => {
    const { tx, state } = createMockTx();
    state.row = {
      idempotencyKey: baseInput.idempotencyKey,
      status: 'PENDING',
      planVersionId: null,
      decisionId: null,
      createdAt: new Date(Date.now() - TEP_REPAIR_PENDING_STALE_MS - 1),
    };

    await expect(store.claimOrReplay(tx as never, baseInput)).resolves.toEqual({
      action: 'proceed',
    });
    expect(state.row?.status).toBe('PENDING');
  });

  it('throws REPAIR_IN_PROGRESS conflict', () => {
    expect(() => store.throwRepairInProgress(baseInput.optionId)).toThrow(ConflictException);
    expect(() => store.throwRepairInProgress(baseInput.optionId)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'REPAIR_IN_PROGRESS' }),
      }),
    );
  });
});
