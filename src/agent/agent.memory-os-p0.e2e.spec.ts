/**
 * Memory OS P0 — E2E / 集成验收
 *
 * TC-SINK-01：滑动窗口外 pivot，无 recent_messages，constraints hydrate 正确
 * TC-CON-01：memory_contract.constraint_sink 经 attachObservability 透出
 */

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import {
  buildCoastalPivotConstraintSinkObservability,
  buildIcelandCoastalPivotStagingMemoryContext,
  ICELAND_COASTAL_PIVOT_STAGING_TRIP_ID,
} from './memory/decision-ledger/fixtures/iceland-coastal-pivot-staging.fixture';
import {
  hydrateTripPlanFromConstraintSink,
  mergeConstraintSinkIntoMemoryContractObs,
} from './memory/constraint-sink/hydrate-trip-plan-from-constraint-sink.util';
import { deriveConstraintSinkUiAnchorV1 } from './contracts/memory-console-ui-state.v1';
import { MemoryConsoleController } from './memory/console/memory-console.controller';
import { UserMemoryConsoleService } from './memory/console/user-memory-console.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('Memory OS P0 — E2E / integration', () => {
  describe('TC-SINK-01 — window-outside pivot without recent_messages', () => {
    it('hydrates highlands + relaxed pace from TripTaskMemory constraints only', () => {
      const memory = buildIcelandCoastalPivotStagingMemoryContext();
      const requestDto = {
        request_id: 'tc-sink-01',
        user_id: memory.userId,
        trip_id: ICELAND_COASTAL_PIVOT_STAGING_TRIP_ID,
        message: '帮我生成方案',
      };

      expect((requestDto as any).conversation_context).toBeUndefined();

      const { tripPlanRequest, applied } = hydrateTripPlanFromConstraintSink(
        { message: requestDto.message, destination: '未指定' },
        memory.activeTripState,
        requestDto as any,
      );

      expect(tripPlanRequest.destination).toBe('highlands');
      expect(tripPlanRequest.pace).toBe('relaxed');
      expect(applied.patch_ids).toContain('patch-coastal-pivot-staging-001');
      expect(tripPlanRequest.message).toContain('[CONSTRAINT_SINK]');
    });

    it('maps hydrate result to Gate UI anchor contract', () => {
      const obs = buildCoastalPivotConstraintSinkObservability();
      const anchor = deriveConstraintSinkUiAnchorV1(obs);
      expect(anchor?.patch_ids).toContain('patch-coastal-pivot-staging-001');
      expect(anchor?.headline_key).toBe('memory.ui.constraint_sink.pivot_applied');
    });
  });

  describe('TC-CON-01 — observability.memory_contract.constraint_sink', () => {
    it('INTAKE merge produces attachObservability-ready memory_contract shape', () => {
      const applied = {
        keys: ['destination', 'pace', 'guardian_debate_intent_hint'],
        patch_ids: ['patch-coastal-pivot-staging-001'],
        overridden_by_request: [] as string[],
      };
      const memContract = mergeConstraintSinkIntoMemoryContractObs(
        {
          revision: 'v1',
          loaded: true,
          layers: ['L1_user_profile'],
          user_id_present: true,
          snapshot_id: 'snap-coastal',
          snapshot_version: 1,
          loaded_at_iso: new Date().toISOString(),
        },
        applied,
      );

      const respObservability = {
        ...(memContract ? { memory_contract: memContract } : {}),
      };

      expect(respObservability.memory_contract?.layers).toContain('constraint_sink_hydrated');
      expect(respObservability.memory_contract?.constraint_sink).toMatchObject({
        hydrated: true,
        patch_ids: applied.patch_ids,
      });
    });
  });

  describe('Memory Console HTTP (controller smoke)', () => {
    let app: INestApplication;
    const mockConsole = {
      getConsole: jest.fn().mockResolvedValue({
        revision: 'v1',
        user_id: 'u1',
        l0: null,
        l1: null,
        l2_recent: [],
        meta: { l2_total_count: 0, feature_flags: { constraint_sink: true, memory_console: true } },
      }),
      deleteTripConstraintPatch: jest.fn().mockResolvedValue(0),
      deleteL2Decision: jest.fn().mockResolvedValue(undefined),
    };

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [ConfigModule.forRoot({ isGlobal: true })],
        controllers: [MemoryConsoleController],
        providers: [{ provide: UserMemoryConsoleService, useValue: mockConsole }],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate: (ctx: any) => {
            const req = ctx.switchToHttp().getRequest();
            req.user = { userId: 'u1' };
            return true;
          },
        })
        .compile();

      app = moduleRef.createNestApplication();
      app.setGlobalPrefix('api');
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /api/agent/memory/v1/console returns console payload', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/agent/memory/v1/console')
        .query({ trip_id: ICELAND_COASTAL_PIVOT_STAGING_TRIP_ID })
        .expect(200);
      expect(res.body.revision).toBe('v1');
      expect(mockConsole.getConsole).toHaveBeenCalledWith('u1', ICELAND_COASTAL_PIVOT_STAGING_TRIP_ID);
    });

    it('DELETE /api/agent/memory/v1/console/trip/:tripId/constraints/:patchId', async () => {
      await request(app.getHttpServer())
        .delete(
          `/api/agent/memory/v1/console/trip/${ICELAND_COASTAL_PIVOT_STAGING_TRIP_ID}/constraints/patch-coastal-pivot-staging-001`,
        )
        .expect(200);
      expect(mockConsole.deleteTripConstraintPatch).toHaveBeenCalledWith(
        'u1',
        ICELAND_COASTAL_PIVOT_STAGING_TRIP_ID,
        'patch-coastal-pivot-staging-001',
      );
    });

    it('DELETE /api/agent/memory/v1/console/l2/:decisionId (TC-CON-02)', async () => {
      await request(app.getHttpServer()).delete('/api/agent/memory/v1/console/l2/rd-dec-001').expect(200);
      expect(mockConsole.deleteL2Decision).toHaveBeenCalledWith('u1', 'rd-dec-001');
    });
  });
});
