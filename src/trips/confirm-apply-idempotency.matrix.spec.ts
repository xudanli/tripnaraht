/**
 * Agent Harness P0-1 / P1 — Confirm/Apply idempotency matrix (unit, no live DB).
 *
 * Upgrades evidence/work-packages/AGENT-HARNESS-P0/P0-1-CONFIRM-IDEMPOTENCY.md
 * from "documented PARTIAL" toward corridor-level PASS rows.
 */
import type { Prisma } from '@prisma/client';
import { executeItineraryAdjustAuthoritativeCanary } from '../decision-runtime/execution/authoritative-write/itinerary-adjust-canary.executor';
import {
  ClientWriteProtocolService,
} from '../decision-runtime/execution/authoritative-write/client-write-protocol.service';
import { AuthoritativeWriteGatewayService } from '../decision-runtime/execution/authoritative-write/authoritative-write-gateway.service';
import { AuthoritativeWriteHandlerRegistryService } from '../decision-runtime/execution/authoritative-write/corridor-handler.registry';
import {
  clearUwc1eProtocolSessionsForTests,
} from '../decision-runtime/execution/authoritative-write/client-write-protocol.store';
import {
  UWC_1E_PROTOCOL_VERSION,
  UWC_1E_SCHEMA_ID,
} from '../decision-runtime/execution/authoritative-write/client-write-protocol.types';
import { ExecutionRiskApplyService } from './execution-risk-center/services/execution-risk-apply.service';
import { ExecutionRiskConfirmWriteService } from './execution-risk-center/services/execution-risk-confirm-write.service';
import { ExecutionRiskRecommendationService } from './execution-risk-center/services/execution-risk-recommendation.service';
import {
  buildHarnessActiveRisks,
  HARNESS_TRIP_ID,
  stableWindRiskId,
} from './execution-risk-center/harness/execution-risk-p0.harness.util';
import { UnifiedDecisionResolutionService } from '../decision-runtime/gateway/services/unified-decision-resolution.service';
import {
  projectPlanProposalUwcPreview,
} from './arrange-itinerary/utils/plan-proposal-uwc-preview.util';
import type { PlanProposal } from './arrange-itinerary/types/plan-proposal.types';
import { PlanProposalApplyService } from './arrange-itinerary/services/plan-proposal-apply.service';
import {
  EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
  isEffectivePlanWriteChainBadRequest,
} from '../decision-runtime/execution/effective-plan-write-chain-blocked.util';
import { BadRequestException } from '@nestjs/common';

describe('Confirm/Apply idempotency matrix (P0-1)', () => {
  describe('MX-UWC-ITINERARY: canary Apply×2', () => {
    const tripId = 'trip-mx-uwc';

    function buildPrismaMock(initialMeta: Record<string, unknown>) {
      let tripMeta = { ...initialMeta };
      let itemUpdateCount = 0;
      let itemStart = new Date('2026-07-24T09:00:00.000Z');
      let itemEnd = new Date('2026-07-24T10:00:00.000Z');

      const prisma = {
        $transaction: async <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => {
          const tx = {
            trip: {
              findUnique: async () => ({
                id: tripId,
                metadata: tripMeta,
                updatedAt: new Date('2026-07-24T00:00:00.000Z'),
              }),
              update: async ({ data }: { data: { metadata: Record<string, unknown> } }) => {
                tripMeta = { ...data.metadata };
                return { id: tripId };
              },
            },
            itineraryItem: {
              findUnique: async () => ({
                id: 'i1',
                isPaid: false,
                bookedAt: null,
                bookingStatus: null,
                startTime: itemStart,
                endTime: itemEnd,
              }),
              update: async ({
                data,
              }: {
                data: { startTime: Date; endTime: Date };
              }) => {
                itemUpdateCount += 1;
                itemStart = data.startTime;
                itemEnd = data.endTime;
                return { id: 'i1' };
              },
            },
          } as unknown as Prisma.TransactionClient;
          return fn(tx);
        },
        getMeta: () => tripMeta,
        getItemUpdateCount: () => itemUpdateCount,
      };
      return prisma;
    }

    it('same idempotencyKey → 1st APPLIED, 2nd IDEMPOTENT_REPLAY; one Item update', async () => {
      const prisma = buildPrismaMock({ revision: 3 });
      const input = {
        prisma,
        tripId,
        idempotencyKey: 'idem-mx-uwc-1',
        expectedTripRevision: 3,
        timeUpdates: [
          {
            itemId: 'i1',
            startTimeIso: '2026-07-24T10:00:00.000Z',
            endTimeIso: '2026-07-24T11:00:00.000Z',
          },
        ],
      };

      const first = await executeItineraryAdjustAuthoritativeCanary(input);
      expect(first.outcome).toBe('APPLIED');
      expect(prisma.getItemUpdateCount()).toBe(1);
      const revisionAfter = (prisma.getMeta() as { revision?: number }).revision;
      expect(revisionAfter).toBe(4);

      const second = await executeItineraryAdjustAuthoritativeCanary({
        ...input,
        expectedTripRevision: revisionAfter!,
      });
      expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(prisma.getItemUpdateCount()).toBe(1);
      expect((prisma.getMeta() as { revision?: number }).revision).toBe(4);
    });

    it('priorIdempotencyApplied fast-path → IDEMPOTENT_REPLAY without txn Item write', async () => {
      const prisma = buildPrismaMock({ revision: 5 });
      const out = await executeItineraryAdjustAuthoritativeCanary({
        prisma,
        tripId,
        idempotencyKey: 'idem-mx-uwc-fast',
        expectedTripRevision: 5,
        priorIdempotencyApplied: true,
        timeUpdates: [
          {
            itemId: 'i1',
            startTimeIso: '2026-07-24T10:00:00.000Z',
            endTimeIso: '2026-07-24T11:00:00.000Z',
          },
        ],
      });
      expect(out.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(prisma.getItemUpdateCount()).toBe(0);
    });
  });

  describe('MX-UWC-1E: forged confirmation rejected', () => {
    beforeEach(() => {
      clearUwc1eProtocolSessionsForTests();
    });

    it('Apply with wrong confirmationId → CONFIRMATION_MISMATCH; no pipeline', async () => {
      const registry = new AuthoritativeWriteHandlerRegistryService();
      const gateway = new AuthoritativeWriteGatewayService(registry);
      const protocol = new ClientWriteProtocolService(gateway, registry);

      const preview = await protocol.preview({
        schemaId: UWC_1E_SCHEMA_ID,
        protocolVersion: UWC_1E_PROTOCOL_VERSION,
        stage: 'PREVIEW',
        productSurface: 'web',
        slice: 'actions_commit',
        tripId: 't-mx-1e',
        intendedMutation: {
          request_id: 'r-mx',
          context_signature: 'sig-mx',
        },
        expectedWriteVersion: {
          kind: 'RESOURCE_VERSION_SET',
          resources: [{ resourceId: 't-mx-1e', expectedVersion: 1 }],
        },
      });
      expect('draft' in preview).toBe(true);
      if (!('draft' in preview)) return;

      const confirm = await protocol.confirm({
        schemaId: UWC_1E_SCHEMA_ID,
        protocolVersion: UWC_1E_PROTOCOL_VERSION,
        stage: 'CONFIRM',
        draftId: preview.draft.draftId,
        explicitConfirm: true,
        productSurface: 'web',
      });
      expect('confirmationId' in confirm).toBe(true);
      if (!('confirmationId' in confirm)) return;

      const forged = await protocol.apply({
        schemaId: UWC_1E_SCHEMA_ID,
        protocolVersion: UWC_1E_PROTOCOL_VERSION,
        stage: 'APPLY',
        draftId: preview.draft.draftId,
        confirmationId: 'conf_forged_token',
        idempotencyKey: 'idem-mx-1e-forge',
        productSurface: 'web',
      });
      expect('errorCode' in forged).toBe(true);
      if (!('errorCode' in forged)) return;
      expect(forged.errorCode).toBe('CONFIRMATION_MISMATCH');
      expect(forged.sessionState).toBe('CONFIRMED');
    });
  });

  describe('MX-ERC: confirm×2 same key', () => {
    const riskId = stableWindRiskId();
    const recommendationId = 'env-rec-env-wind-001-plan-shorten';
    const idempotencyKey = '550e8400-e29b-41d4-a716-446655440099';
    const userId = 'user-mx';

    function buildService() {
      const risk = {
        ...buildHarnessActiveRisks()[0]!,
        id: riskId,
        affectedActivities: [{ id: 'act-glacier', label: '冰川徒步', kind: 'activity' as const }],
      };
      const aggregation = {
        getRisk: jest.fn(async () => risk),
        listRisks: jest.fn(async () => [risk]),
      };
      const recommendations = {
        listForRisk: jest.fn(async () => [
          {
            id: recommendationId,
            riskId,
            label: '缩短徒步',
            description: '将冰川徒步缩短为 90 分钟',
            impactSummary: '-30min',
            sourceSystem: 'ENVIRONMENT_EVENT',
            sourceId: 'env-wind-001',
          },
        ]),
        listThreePlansForRisk: jest.fn(async () => [
          { planType: 'RECOMMENDED', actionCodes: ['SHORTEN_HIKE_DURATION'] },
        ]),
      } as unknown as ExecutionRiskRecommendationService;

      return new ExecutionRiskApplyService(
        aggregation as never,
        recommendations,
        new ExecutionRiskConfirmWriteService(),
      );
    }

    it('second confirm with same key → idempotentReplay; stable planVersionId', async () => {
      const prev = process.env.EXECUTION_RISK_CONFIRM_WRITE_ENABLED;
      process.env.EXECUTION_RISK_CONFIRM_WRITE_ENABLED = '1';
      try {
        const service = buildService();
        await service.applyRecommendation(HARNESS_TRIP_ID, riskId, recommendationId, userId, {
          idempotencyKey,
        });
        const first = await service.confirmRecommendation(
          HARNESS_TRIP_ID,
          riskId,
          recommendationId,
          userId,
          true,
          { idempotencyKey },
        );
        expect(first.applied).toBe(true);
        expect(first.newPlanVersionId).toBeTruthy();

        const second = await service.confirmRecommendation(
          HARNESS_TRIP_ID,
          riskId,
          recommendationId,
          userId,
          true,
          { idempotencyKey },
        );
        expect(second.idempotentReplay).toBe(true);
        expect(second.newPlanVersionId).toBe(first.newPlanVersionId);
      } finally {
        if (prev === undefined) delete process.env.EXECUTION_RISK_CONFIRM_WRITE_ENABLED;
        else process.env.EXECUTION_RISK_CONFIRM_WRITE_ENABLED = prev;
      }
    });
  });

  describe('MX-DECISIONCORE: apply VERIFIED → idempotent_replay', () => {
    it('applyResolution on VERIFIED returns idempotent_replay without re-execute', async () => {
      const resolutionStore = {
        buildIdempotencyKey: jest.fn(),
        buildResolutionId: jest.fn(),
        findByIdempotencyKey: jest.fn(),
        getForProblem: jest.fn().mockResolvedValue({
          resolutionId: 'res_mx_1',
          problemId: 'p_mx',
          selectedActionId: 'opt_a',
          status: 'VERIFIED',
          decidedAt: new Date().toISOString(),
          actionPlanId: 'ap_mx',
          writeChain: 'EVALUATE_AUTHORIZE_EXECUTE',
        }),
        upsert: jest.fn(),
      };
      const canonical = {
        evaluate: jest.fn(),
        authorize: jest.fn(),
        execute: jest.fn(),
      };
      const service = new UnifiedDecisionResolutionService(
        {
          getProblemDetail: jest.fn(),
          collectRows: jest.fn().mockResolvedValue([]),
          invalidateCache: jest.fn(),
          resolveWorldStateVersionForTrip: jest.fn().mockResolvedValue('ws_v1'),
        } as never,
        { createDecision: jest.fn() } as never,
        canonical as never,
        resolutionStore as never,
        { validateDecision: jest.fn() } as never,
      );

      const first = await service.applyResolution('trip_mx', 'p_mx', 'user_mx');
      const second = await service.applyResolution('trip_mx', 'p_mx', 'user_mx');

      expect(first.applyResult.status).toBe('idempotent_replay');
      expect(second.applyResult.status).toBe('idempotent_replay');
      expect(first.resolution.resolutionId).toBe('res_mx_1');
      expect(second.resolution.resolutionId).toBe('res_mx_1');
      expect(canonical.execute).not.toHaveBeenCalled();
      expect(resolutionStore.upsert).not.toHaveBeenCalled();
    });
  });

  describe('MX-ARRANGE: no server AE; preview → existing UWC canary', () => {
    const originalChain = process.env.EFFECTIVE_PLAN_WRITE_CHAIN;

    afterEach(() => {
      if (originalChain === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
      else process.env.EFFECTIVE_PLAN_WRITE_CHAIN = originalChain;
    });

    function arrangeProposal(overrides: Partial<PlanProposal> = {}): PlanProposal {
      return {
        proposalId: 'prop_mx_arr',
        tripId: 'trip-mx-arrange',
        userId: 'user_1',
        intent: 'MOVE_ITEM',
        basePlanVersion: 1,
        contextVersion: 1,
        affectedDays: [1],
        changes: [],
        tradeoffs: [],
        validation: { status: 'PASS', warnings: [], conflicts: [] },
        diff: { summary: '', timelineChanges: [] },
        requiresConfirmation: true,
        status: 'AWAITING_CONFIRMATION',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        source: { type: 'ai_action', payload: {} },
        ...overrides,
      } as PlanProposal;
    }

    it('MX-ARRANGE-LEGACY-APPLY: HTTP apply path blocked under write chain (no AE)', async () => {
      process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
      const prisma = { $transaction: jest.fn() };
      const items = { create: jest.fn(), update: jest.fn() };
      const svc = new PlanProposalApplyService(
        prisma as never,
        items as never,
        {} as never,
        {} as never,
      );
      try {
        await svc.apply({
          proposal: arrangeProposal({
            changes: [{ operation: 'ADD', dayIndex: 1 }],
            validation: { status: 'PASS', warnings: [], conflicts: [] },
          }) as PlanProposal,
          userId: 'u1',
        });
        throw new Error('expected CHAIN_REQUIRED');
      } catch (e) {
        if (e instanceof Error && e.message === 'expected CHAIN_REQUIRED') throw e;
        expect(isEffectivePlanWriteChainBadRequest(e)).toBe(true);
        expect(
          ((e as BadRequestException).getResponse() as { code?: string }).code,
        ).toBe(EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE);
      }
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('MX-ARRANGE-PREVIEW-NOWRITE: uwcPreview projection never mutates Items', async () => {
      const itemUpdate = jest.fn();
      const txn = jest.fn();
      const dayDate = new Date('2026-07-24T00:00:00.000Z');
      const prisma = {
        $transaction: txn,
        trip: {
          findUnique: async () => ({
            updatedAt: dayDate,
            metadata: { revision: 3 },
            TripDay: [{ id: 'day1', date: dayDate }],
          }),
        },
        itineraryItem: { update: itemUpdate, create: jest.fn() },
      };

      const open = await projectPlanProposalUwcPreview(
        prisma as never,
        arrangeProposal({
          tripId: 'trip-mx-arrange',
          changes: [
            {
              operation: 'MOVE',
              itemId: 'i1',
              dayIndex: 1,
              startTime: '10:00',
              endTime: '11:00',
            },
          ],
        }),
      );
      expect(open.open).toBe(true);
      if (open.open) {
        expect(open.slice).toBe('itinerary_same_day_time_adjust');
      }

      const closed = await projectPlanProposalUwcPreview(
        prisma as never,
        arrangeProposal({
          changes: [{ operation: 'ADD', dayIndex: 1, itemId: 'x' }],
        }),
      );
      expect(closed.open).toBe(false);

      expect(txn).not.toHaveBeenCalled();
      expect(itemUpdate).not.toHaveBeenCalled();
    });

    it('MX-ARRANGE-HINT→CANARY: open same-day hint feeds UWC Apply×2 idempotent', async () => {
      const tripId = 'trip-mx-arrange';
      const dayDate = new Date('2026-07-24T00:00:00.000Z');
      const previewPrisma = {
        trip: {
          findUnique: async () => ({
            updatedAt: dayDate,
            metadata: { revision: 3 },
            TripDay: [{ id: 'day1', date: dayDate }],
          }),
        },
      };
      const preview = await projectPlanProposalUwcPreview(
        previewPrisma as never,
        arrangeProposal({
          tripId,
          changes: [
            {
              operation: 'MOVE',
              itemId: 'i1',
              dayIndex: 1,
              startTime: '10:00',
              endTime: '11:00',
            },
          ],
        }),
      );
      expect(preview.open).toBe(true);
      if (!preview.open || preview.slice !== 'itinerary_same_day_time_adjust') {
        throw new Error('expected same-day open preview');
      }

      let tripMeta: Record<string, unknown> = { revision: preview.expectedTripRevision };
      let itemUpdateCount = 0;
      let itemStart = new Date('2026-07-24T09:00:00.000Z');
      let itemEnd = new Date('2026-07-24T10:00:00.000Z');
      const canaryPrisma = {
        $transaction: async <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => {
          const tx = {
            trip: {
              findUnique: async () => ({
                id: tripId,
                metadata: tripMeta,
                updatedAt: dayDate,
              }),
              update: async ({ data }: { data: { metadata: Record<string, unknown> } }) => {
                tripMeta = { ...data.metadata };
                return { id: tripId };
              },
            },
            itineraryItem: {
              findUnique: async () => ({
                id: 'i1',
                isPaid: false,
                bookedAt: null,
                bookingStatus: null,
                startTime: itemStart,
                endTime: itemEnd,
              }),
              update: async ({
                data,
              }: {
                data: { startTime: Date; endTime: Date };
              }) => {
                itemUpdateCount += 1;
                itemStart = data.startTime;
                itemEnd = data.endTime;
                return { id: 'i1' };
              },
            },
          } as unknown as Prisma.TransactionClient;
          return fn(tx);
        },
      };

      const first = await executeItineraryAdjustAuthoritativeCanary({
        prisma: canaryPrisma,
        tripId,
        idempotencyKey: 'idem-mx-arrange-1',
        expectedTripRevision: preview.expectedTripRevision,
        timeUpdates: preview.timeUpdates,
      });
      expect(first.outcome).toBe('APPLIED');
      expect(itemUpdateCount).toBe(1);

      const second = await executeItineraryAdjustAuthoritativeCanary({
        prisma: canaryPrisma,
        tripId,
        idempotencyKey: 'idem-mx-arrange-1',
        expectedTripRevision: (tripMeta as { revision: number }).revision,
        timeUpdates: preview.timeUpdates,
      });
      expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(itemUpdateCount).toBe(1);
    });

    it('MX-ARRANGE-HINT→ADD: open ADD hint feeds UWC Apply×2 idempotent', async () => {
      const tripId = 'trip-mx-arrange';
      const dayDate = new Date('2026-07-24T00:00:00.000Z');
      const previewPrisma = {
        trip: {
          findUnique: async () => ({
            updatedAt: dayDate,
            metadata: { revision: 3 },
            TripDay: [{ id: 'day1', date: dayDate }],
          }),
        },
      };
      const preview = await projectPlanProposalUwcPreview(
        previewPrisma as never,
        arrangeProposal({
          tripId,
          intent: 'ADD_ITEM',
          changes: [
            {
              operation: 'ADD',
              dayIndex: 1,
              startTime: '10:00',
              endTime: '11:00',
              placeId: 99,
              label: '黑沙滩',
            },
          ],
        }),
      );
      expect(preview.open).toBe(true);
      if (!preview.open || preview.slice !== 'itinerary_same_day_add_item') {
        throw new Error('expected same-day ADD open preview');
      }

      let tripMeta: Record<string, unknown> = { revision: preview.expectedTripRevision };
      let itemCreateCount = 0;
      const canaryPrisma = {
        $transaction: async <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => {
          const tx = {
            trip: {
              findUnique: async () => ({
                id: tripId,
                metadata: tripMeta,
                updatedAt: dayDate,
              }),
              update: async ({ data }: { data: { metadata: Record<string, unknown> } }) => {
                tripMeta = { ...data.metadata };
                return { id: tripId };
              },
            },
            itineraryItem: {
              findFirst: async () => ({ order: 1 }),
              create: async () => {
                itemCreateCount += 1;
                return { id: 'new-item' };
              },
            },
          } as unknown as Prisma.TransactionClient;
          return fn(tx);
        },
      };

      const first = await executeItineraryAdjustAuthoritativeCanary({
        prisma: canaryPrisma,
        tripId,
        idempotencyKey: 'idem-mx-arrange-add-1',
        expectedTripRevision: preview.expectedTripRevision,
        itemCreates: preview.itemCreates,
      });
      expect(first.outcome).toBe('APPLIED');
      expect(itemCreateCount).toBe(1);

      const second = await executeItineraryAdjustAuthoritativeCanary({
        prisma: canaryPrisma,
        tripId,
        idempotencyKey: 'idem-mx-arrange-add-1',
        expectedTripRevision: (tripMeta as { revision: number }).revision,
        itemCreates: preview.itemCreates,
      });
      expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(itemCreateCount).toBe(1);
    });

    it('MX-ARRANGE-HINT→AUTO_ARRANGE: from-candidates hint → Apply×2 idempotent', async () => {
      const tripId = 'trip-mx-arrange';
      const dayDate = new Date('2026-07-24T00:00:00.000Z');
      const previewPrisma = {
        trip: {
          findUnique: async () => ({
            updatedAt: dayDate,
            metadata: { revision: 3 },
            TripDay: [{ id: 'day1', date: dayDate }],
          }),
        },
      };
      const preview = await projectPlanProposalUwcPreview(
        previewPrisma as never,
        arrangeProposal({
          tripId,
          intent: 'AUTO_ARRANGE',
          changes: [
            {
              operation: 'ADD',
              dayIndex: 1,
              startTime: '10:00',
              endTime: '11:00',
              placeId: 99,
              candidateId: 'cand-aa',
              removeFromCandidates: true,
              label: '黑沙滩',
            },
            {
              operation: 'REMOVE_CANDIDATE',
              dayIndex: 1,
              candidateId: 'cand-aa',
            },
          ],
        }),
      );
      expect(preview.open).toBe(true);
      if (
        !preview.open ||
        preview.slice !== 'itinerary_same_day_add_from_candidates'
      ) {
        throw new Error('expected from-candidates open preview');
      }

      let tripMeta: Record<string, unknown> = {
        revision: preview.expectedTripRevision,
      };
      let itemCreateCount = 0;
      let candidateDeleteCount = 0;
      const canaryPrisma = {
        $transaction: async <T>(
          fn: (tx: Prisma.TransactionClient) => Promise<T>,
        ) => {
          const tx = {
            trip: {
              findUnique: async () => ({
                id: tripId,
                metadata: tripMeta,
                updatedAt: dayDate,
              }),
              update: async ({
                data,
              }: {
                data: { metadata: Record<string, unknown> };
              }) => {
                tripMeta = { ...data.metadata };
                return { id: tripId };
              },
            },
            itineraryItem: {
              findFirst: async () => ({ order: 1 }),
              create: async () => {
                itemCreateCount += 1;
                return { id: 'new-item' };
              },
            },
            tripAttractionExploreCandidate: {
              deleteMany: async () => {
                candidateDeleteCount += 1;
                return { count: 1 };
              },
            },
          } as unknown as Prisma.TransactionClient;
          return fn(tx);
        },
      };

      const first = await executeItineraryAdjustAuthoritativeCanary({
        prisma: canaryPrisma,
        tripId,
        idempotencyKey: 'idem-mx-arrange-aa-1',
        expectedTripRevision: preview.expectedTripRevision,
        itemCreates: preview.itemCreates,
        candidateRemovals: preview.candidateRemovals,
      });
      expect(first.outcome).toBe('APPLIED');
      expect(itemCreateCount).toBe(1);
      expect(candidateDeleteCount).toBe(1);

      const second = await executeItineraryAdjustAuthoritativeCanary({
        prisma: canaryPrisma,
        tripId,
        idempotencyKey: 'idem-mx-arrange-aa-1',
        expectedTripRevision: (tripMeta as { revision: number }).revision,
        itemCreates: preview.itemCreates,
        candidateRemovals: preview.candidateRemovals,
      });
      expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(itemCreateCount).toBe(1);
      expect(candidateDeleteCount).toBe(1);
    });

    it('MX-ARRANGE-HINT→MULTI_DAY_AUTO_ARRANGE: ≥2 days → Apply×2 atomic', async () => {
      const tripId = 'trip-mx-arrange';
      const d1 = new Date('2026-07-24T00:00:00.000Z');
      const d2 = new Date('2026-07-25T00:00:00.000Z');
      const previewPrisma = {
        trip: {
          findUnique: async () => ({
            updatedAt: d1,
            metadata: { revision: 3 },
            TripDay: [
              { id: 'day1', date: d1 },
              { id: 'day2', date: d2 },
            ],
          }),
        },
      };
      const preview = await projectPlanProposalUwcPreview(
        previewPrisma as never,
        arrangeProposal({
          tripId,
          intent: 'AUTO_ARRANGE',
          changes: [
            {
              operation: 'ADD',
              dayIndex: 1,
              startTime: '10:00',
              endTime: '11:00',
              placeId: 99,
              candidateId: 'cand-a',
              removeFromCandidates: true,
            },
            {
              operation: 'REMOVE_CANDIDATE',
              dayIndex: 1,
              candidateId: 'cand-a',
            },
            {
              operation: 'ADD',
              dayIndex: 2,
              startTime: '10:00',
              endTime: '11:00',
              placeId: 100,
              candidateId: 'cand-b',
              removeFromCandidates: true,
            },
            {
              operation: 'REMOVE_CANDIDATE',
              dayIndex: 2,
              candidateId: 'cand-b',
            },
          ],
        }),
      );
      expect(preview.open).toBe(true);
      if (
        !preview.open ||
        preview.slice !== 'itinerary_multi_day_add_from_candidates'
      ) {
        throw new Error('expected multi-day from-candidates open preview');
      }

      let tripMeta: Record<string, unknown> = {
        revision: preview.expectedTripRevision,
      };
      let itemCreateCount = 0;
      let candidateDeleteCount = 0;
      const canaryPrisma = {
        $transaction: async <T>(
          fn: (tx: Prisma.TransactionClient) => Promise<T>,
        ) => {
          const tx = {
            trip: {
              findUnique: async () => ({
                id: tripId,
                metadata: tripMeta,
                updatedAt: d1,
              }),
              update: async ({
                data,
              }: {
                data: { metadata: Record<string, unknown> };
              }) => {
                tripMeta = { ...data.metadata };
                return { id: tripId };
              },
            },
            itineraryItem: {
              findFirst: async () => ({ order: 1 }),
              create: async () => {
                itemCreateCount += 1;
                return { id: `new-${itemCreateCount}` };
              },
            },
            tripAttractionExploreCandidate: {
              deleteMany: async () => {
                candidateDeleteCount += 1;
                return { count: 1 };
              },
            },
          } as unknown as Prisma.TransactionClient;
          return fn(tx);
        },
      };

      const first = await executeItineraryAdjustAuthoritativeCanary({
        prisma: canaryPrisma,
        tripId,
        idempotencyKey: 'idem-mx-arrange-mdaa-1',
        expectedTripRevision: preview.expectedTripRevision,
        itemCreates: preview.itemCreates,
        candidateRemovals: preview.candidateRemovals,
        operation: 'multi_day_add_from_candidates',
      });
      expect(first.outcome).toBe('APPLIED');
      expect(first.reasonCodes).toContain('MULTI_DAY_ADD_FROM_CANDIDATES');
      expect(itemCreateCount).toBe(2);
      expect(candidateDeleteCount).toBe(2);

      const second = await executeItineraryAdjustAuthoritativeCanary({
        prisma: canaryPrisma,
        tripId,
        idempotencyKey: 'idem-mx-arrange-mdaa-1',
        expectedTripRevision: (tripMeta as { revision: number }).revision,
        itemCreates: preview.itemCreates,
        candidateRemovals: preview.candidateRemovals,
        operation: 'multi_day_add_from_candidates',
      });
      expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(itemCreateCount).toBe(2);
      expect(candidateDeleteCount).toBe(2);
    });

    it('MX-ARRANGE-HINT→REMOVE: open REMOVE hint feeds UWC Apply×2 idempotent', async () => {
      const tripId = 'trip-mx-arrange';
      const dayDate = new Date('2026-07-24T00:00:00.000Z');
      const previewPrisma = {
        trip: {
          findUnique: async () => ({
            updatedAt: dayDate,
            metadata: { revision: 3 },
            TripDay: [{ id: 'day1', date: dayDate }],
          }),
        },
      };
      const preview = await projectPlanProposalUwcPreview(
        previewPrisma as never,
        arrangeProposal({
          tripId,
          intent: 'REPLAN_DAY',
          changes: [
            { operation: 'REMOVE', itemId: 'i-rm-1', dayIndex: 1 },
            { operation: 'REMOVE', itemId: 'i-rm-2', dayIndex: 1 },
          ],
        }),
      );
      expect(preview.open).toBe(true);
      if (!preview.open || preview.slice !== 'itinerary_same_day_remove_item') {
        throw new Error('expected same-day REMOVE open preview');
      }

      let tripMeta: Record<string, unknown> = {
        revision: preview.expectedTripRevision,
      };
      const remaining = new Set(['i-rm-1', 'i-rm-2']);
      let itemDeleteCount = 0;
      const canaryPrisma = {
        $transaction: async <T>(
          fn: (tx: Prisma.TransactionClient) => Promise<T>,
        ) => {
          const tx = {
            trip: {
              findUnique: async () => ({
                id: tripId,
                metadata: tripMeta,
                updatedAt: dayDate,
              }),
              update: async ({
                data,
              }: {
                data: { metadata: Record<string, unknown> };
              }) => {
                tripMeta = { ...data.metadata };
                return { id: tripId };
              },
            },
            itineraryItem: {
              findFirst: async ({
                where,
              }: {
                where: { id: string };
              }) => {
                if (!remaining.has(where.id)) return null;
                return {
                  id: where.id,
                  isPaid: false,
                  bookedAt: null,
                  bookingStatus: 'NONE',
                };
              },
              delete: async ({ where }: { where: { id: string } }) => {
                remaining.delete(where.id);
                itemDeleteCount += 1;
                return { id: where.id };
              },
            },
          } as unknown as Prisma.TransactionClient;
          return fn(tx);
        },
      };

      const first = await executeItineraryAdjustAuthoritativeCanary({
        prisma: canaryPrisma,
        tripId,
        idempotencyKey: 'idem-mx-arrange-rm-1',
        expectedTripRevision: preview.expectedTripRevision,
        itemRemovals: preview.itemRemovals,
      });
      expect(first.outcome).toBe('APPLIED');
      expect(itemDeleteCount).toBe(2);
      expect(remaining.size).toBe(0);

      const second = await executeItineraryAdjustAuthoritativeCanary({
        prisma: canaryPrisma,
        tripId,
        idempotencyKey: 'idem-mx-arrange-rm-1',
        expectedTripRevision: (tripMeta as { revision: number }).revision,
        itemRemovals: preview.itemRemovals,
      });
      expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(itemDeleteCount).toBe(2);
    });

    it('MX-ARRANGE-HINT→REORDER: open REORDER hint feeds UWC Apply×2 idempotent', async () => {
      const tripId = 'trip-mx-arrange';
      const dayDate = new Date('2026-07-24T00:00:00.000Z');
      const previewPrisma = {
        trip: {
          findUnique: async () => ({
            updatedAt: dayDate,
            metadata: { revision: 3 },
            TripDay: [{ id: 'day1', date: dayDate }],
          }),
        },
      };
      const preview = await projectPlanProposalUwcPreview(
        previewPrisma as never,
        arrangeProposal({
          tripId,
          intent: 'OPTIMIZE_ROUTE',
          changes: [
            { operation: 'REORDER', itemId: 'i-a', dayIndex: 1, order: 2 },
            { operation: 'REORDER', itemId: 'i-b', dayIndex: 1, order: 1 },
          ],
        }),
      );
      expect(preview.open).toBe(true);
      if (
        !preview.open ||
        preview.slice !== 'itinerary_same_day_reorder_items'
      ) {
        throw new Error('expected same-day REORDER open preview');
      }

      let tripMeta: Record<string, unknown> = {
        revision: preview.expectedTripRevision,
      };
      const orders = new Map<string, number>([
        ['i-a', 1],
        ['i-b', 2],
      ]);
      let itemUpdateCount = 0;
      const canaryPrisma = {
        $transaction: async <T>(
          fn: (tx: Prisma.TransactionClient) => Promise<T>,
        ) => {
          const tx = {
            trip: {
              findUnique: async () => ({
                id: tripId,
                metadata: tripMeta,
                updatedAt: dayDate,
              }),
              update: async ({
                data,
              }: {
                data: { metadata: Record<string, unknown> };
              }) => {
                tripMeta = { ...data.metadata };
                return { id: tripId };
              },
            },
            itineraryItem: {
              findFirst: async ({
                where,
              }: {
                where: { id: string };
              }) => {
                if (!orders.has(where.id)) return null;
                return {
                  id: where.id,
                  isPaid: false,
                  bookedAt: null,
                  bookingStatus: 'NONE',
                };
              },
              update: async ({
                where,
                data,
              }: {
                where: { id: string };
                data: { order: number };
              }) => {
                orders.set(where.id, data.order);
                itemUpdateCount += 1;
                return { id: where.id };
              },
            },
          } as unknown as Prisma.TransactionClient;
          return fn(tx);
        },
      };

      const first = await executeItineraryAdjustAuthoritativeCanary({
        prisma: canaryPrisma,
        tripId,
        idempotencyKey: 'idem-mx-arrange-ro-1',
        expectedTripRevision: preview.expectedTripRevision,
        itemReorders: preview.itemReorders,
      });
      expect(first.outcome).toBe('APPLIED');
      expect(itemUpdateCount).toBe(2);
      expect(orders.get('i-a')).toBe(2);
      expect(orders.get('i-b')).toBe(1);

      const second = await executeItineraryAdjustAuthoritativeCanary({
        prisma: canaryPrisma,
        tripId,
        idempotencyKey: 'idem-mx-arrange-ro-1',
        expectedTripRevision: (tripMeta as { revision: number }).revision,
        itemReorders: preview.itemReorders,
      });
      expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(itemUpdateCount).toBe(2);
    });

    it('MX-ARRANGE-HINT→MOVE_ADD: open MOVE+ADD hint → Apply×2 atomic idempotent', async () => {
      const tripId = 'trip-mx-arrange';
      const dayDate = new Date('2026-07-24T00:00:00.000Z');
      const previewPrisma = {
        trip: {
          findUnique: async () => ({
            updatedAt: dayDate,
            metadata: { revision: 3 },
            TripDay: [{ id: 'day1', date: dayDate }],
          }),
        },
      };
      const preview = await projectPlanProposalUwcPreview(
        previewPrisma as never,
        arrangeProposal({
          tripId,
          intent: 'REPLAN_DAY',
          changes: [
            {
              operation: 'MOVE',
              itemId: 'i-move',
              dayIndex: 1,
              startTime: '09:00',
              endTime: '10:00',
            },
            {
              operation: 'ADD',
              dayIndex: 1,
              startTime: '11:00',
              endTime: '12:00',
              placeId: 99,
              label: '黑沙滩',
            },
          ],
        }),
      );
      expect(preview.open).toBe(true);
      if (
        !preview.open ||
        preview.slice !== 'itinerary_same_day_move_and_add'
      ) {
        throw new Error('expected same-day MOVE+ADD open preview');
      }

      let tripMeta: Record<string, unknown> = {
        revision: preview.expectedTripRevision,
      };
      let itemUpdateCount = 0;
      let itemCreateCount = 0;
      const canaryPrisma = {
        $transaction: async <T>(
          fn: (tx: Prisma.TransactionClient) => Promise<T>,
        ) => {
          const tx = {
            trip: {
              findUnique: async () => ({
                id: tripId,
                metadata: tripMeta,
                updatedAt: dayDate,
              }),
              update: async ({
                data,
              }: {
                data: { metadata: Record<string, unknown> };
              }) => {
                tripMeta = { ...data.metadata };
                return { id: tripId };
              },
            },
            itineraryItem: {
              findUnique: async ({ where }: { where: { id: string } }) => {
                if (where.id !== 'i-move') return null;
                return {
                  id: 'i-move',
                  isPaid: false,
                  bookedAt: null,
                  bookingStatus: 'NONE',
                  startTime: dayDate,
                  endTime: dayDate,
                };
              },
              findFirst: async () => ({ order: 1 }),
              update: async () => {
                itemUpdateCount += 1;
                return { id: 'i-move' };
              },
              create: async () => {
                itemCreateCount += 1;
                return { id: 'new-item' };
              },
            },
          } as unknown as Prisma.TransactionClient;
          return fn(tx);
        },
      };

      const first = await executeItineraryAdjustAuthoritativeCanary({
        prisma: canaryPrisma,
        tripId,
        idempotencyKey: 'idem-mx-arrange-ma-1',
        expectedTripRevision: preview.expectedTripRevision,
        timeUpdates: preview.timeUpdates,
        itemCreates: preview.itemCreates,
      });
      expect(first.outcome).toBe('APPLIED');
      expect(first.reasonCodes).toContain('SAME_DAY_MOVE_AND_ADD');
      expect(itemUpdateCount).toBe(1);
      expect(itemCreateCount).toBe(1);

      const second = await executeItineraryAdjustAuthoritativeCanary({
        prisma: canaryPrisma,
        tripId,
        idempotencyKey: 'idem-mx-arrange-ma-1',
        expectedTripRevision: (tripMeta as { revision: number }).revision,
        timeUpdates: preview.timeUpdates,
        itemCreates: preview.itemCreates,
      });
      expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(itemUpdateCount).toBe(1);
      expect(itemCreateCount).toBe(1);
    });

    it('MX-ARRANGE-HINT→REDUCE_INTENSITY: REST+MOVE hint → Apply×2 atomic', async () => {
      const tripId = 'trip-mx-arrange';
      const dayDate = new Date('2026-07-24T00:00:00.000Z');
      const previewPrisma = {
        trip: {
          findUnique: async () => ({
            updatedAt: dayDate,
            metadata: { revision: 3 },
            TripDay: [{ id: 'day1', date: dayDate }],
          }),
        },
      };
      const preview = await projectPlanProposalUwcPreview(
        previewPrisma as never,
        arrangeProposal({
          tripId,
          intent: 'REDUCE_INTENSITY',
          changes: [
            {
              operation: 'ADD',
              dayIndex: 1,
              startTime: '15:30',
              endTime: '16:30',
              itemType: 'REST',
              label: '休息 / 降强度',
            },
            {
              operation: 'MOVE',
              itemId: 'i-last',
              dayIndex: 1,
              startTime: '10:00',
              endTime: '15:00',
            },
          ],
        }),
      );
      expect(preview.open).toBe(true);
      if (
        !preview.open ||
        preview.slice !== 'itinerary_same_day_reduce_intensity'
      ) {
        throw new Error('expected REDUCE_INTENSITY open preview');
      }

      let tripMeta: Record<string, unknown> = {
        revision: preview.expectedTripRevision,
      };
      let itemUpdateCount = 0;
      let itemCreateCount = 0;
      const canaryPrisma = {
        $transaction: async <T>(
          fn: (tx: Prisma.TransactionClient) => Promise<T>,
        ) => {
          const tx = {
            trip: {
              findUnique: async () => ({
                id: tripId,
                metadata: tripMeta,
                updatedAt: dayDate,
              }),
              update: async ({
                data,
              }: {
                data: { metadata: Record<string, unknown> };
              }) => {
                tripMeta = { ...data.metadata };
                return { id: tripId };
              },
            },
            itineraryItem: {
              findUnique: async ({ where }: { where: { id: string } }) => {
                if (where.id !== 'i-last') return null;
                return {
                  id: 'i-last',
                  isPaid: false,
                  bookedAt: null,
                  bookingStatus: 'NONE',
                  startTime: dayDate,
                  endTime: dayDate,
                };
              },
              findFirst: async () => ({ order: 1 }),
              update: async () => {
                itemUpdateCount += 1;
                return { id: 'i-last' };
              },
              create: async () => {
                itemCreateCount += 1;
                return { id: 'rest-new' };
              },
            },
          } as unknown as Prisma.TransactionClient;
          return fn(tx);
        },
      };

      const first = await executeItineraryAdjustAuthoritativeCanary({
        prisma: canaryPrisma,
        tripId,
        idempotencyKey: 'idem-mx-arrange-ri-1',
        expectedTripRevision: preview.expectedTripRevision,
        timeUpdates: preview.timeUpdates,
        itemCreates: preview.itemCreates,
        operation: 'same_day_reduce_intensity',
      });
      expect(first.outcome).toBe('APPLIED');
      expect(first.reasonCodes).toContain('SAME_DAY_REDUCE_INTENSITY');
      expect(itemUpdateCount).toBe(1);
      expect(itemCreateCount).toBe(1);

      const second = await executeItineraryAdjustAuthoritativeCanary({
        prisma: canaryPrisma,
        tripId,
        idempotencyKey: 'idem-mx-arrange-ri-1',
        expectedTripRevision: (tripMeta as { revision: number }).revision,
        timeUpdates: preview.timeUpdates,
        itemCreates: preview.itemCreates,
        operation: 'same_day_reduce_intensity',
      });
      expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(itemUpdateCount).toBe(1);
      expect(itemCreateCount).toBe(1);
    });
  });
});
