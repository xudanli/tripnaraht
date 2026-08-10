/**
 * UWC-1e fullstack E2E — Web + iOS reference clients → in-process protocol service.
 * Evidence: pages Preview/Confirm only; shell commitGate Apply; locks held.
 */
import { AuthoritativeWriteGatewayService } from './authoritative-write-gateway.service';
import { AuthoritativeWriteHandlerRegistryService } from './corridor-handler.registry';
import { ClientWriteProtocolService } from './client-write-protocol.service';
import { createUwc1eInProcessFetch } from './client-write-protocol.in-process-fetch';
import {
  clearUwc1eSealBagForTests,
  assertCommitTokensUnforged,
} from './client-write-protocol.seal';
import { clearUwc1eProtocolSessionsForTests } from './client-write-protocol.store';
import { updateUwc1eProtocolSession } from './client-write-protocol.store';
import { UWC_1C_OCC_UNLOCKED } from './corridor-write-mode.config';
import { UWC_1D_COMPENSATION_EXEC_AUTHORIZED } from './compensation-auth.gate';
import { createFrontendUwc1eWebClient } from '../../../trips/dto/frontend-uwc-1e-api-client';
import { createFrontendUwc1eIosClient } from '../../../trips/dto/frontend-uwc-1e-ios-api-client';

describe('UWC-1e fullstack E2E (Web/iOS → Preview→Confirm→Apply)', () => {
  const registry = new AuthoritativeWriteHandlerRegistryService();
  const gateway = new AuthoritativeWriteGatewayService(registry);
  const protocol = new ClientWriteProtocolService(gateway, registry);
  const fetchImpl = createUwc1eInProcessFetch(protocol);

  beforeEach(() => {
    clearUwc1eProtocolSessionsForTests();
    clearUwc1eSealBagForTests();
  });

  function web() {
    return createFrontendUwc1eWebClient({
      baseUrl: 'https://e2e.test/api',
      fetchImpl,
    });
  }

  function ios() {
    return createFrontendUwc1eIosClient({
      baseUrl: 'https://e2e.test/api',
      fetchImpl,
    });
  }

  it('holds global OCC + compensation locks', () => {
    expect(UWC_1C_OCC_UNLOCKED).toBe(true);
    expect(UWC_1D_COMPENSATION_EXEC_AUTHORIZED).toBe(true);
    expect(web().policy.autoUndo).toBe(false);
    expect(ios().policy.mixedTargets).toBe(false);
    expect(web().policy.pagesMayCallApply).toBe(false);
  });

  it.each(['web', 'ios'] as const)(
    '%s execution.remind: page preview+confirm → shell commit',
    async (surface) => {
      const client = surface === 'web' ? web() : ios();
      const prev = process.env.UWC_CORRIDOR_MODE_ACTIONS_COMMIT;
      process.env.UWC_CORRIDOR_MODE_ACTIONS_COMMIT = 'AUTHORITATIVE';
      try {
        const preview = await client.previewExecutionRemind({
          tripId: `t-remind-${surface}`,
          expectedResourceVersion: 1,
          requestId: `r-${surface}`,
        });
        expect(preview.ok).toBe(true);
        if (!preview.ok) return;

        // Page cannot "have" apply on pageApi
        expect(
          Object.prototype.hasOwnProperty.call(client.pageApi, 'apply'),
        ).toBe(false);

        const confirmed = await client.pageApi.confirm(preview.handle);
        expect(confirmed.ok).toBe(true);
        if (!confirmed.ok) return;

        const applied = await client.commitGate.commit(confirmed.handle, {
          idempotencyKey: `idem-remind-${surface}`,
        });
        expect(applied.ok).toBe(true);
        if (!applied.ok) return;
        expect(applied.body.stage).toBe('APPLY');
        expect(applied.body.applyPipelineStages).toContain('AUTHORITY');
        expect(applied.body.applyPipelineStages).toContain('OCC');
      } finally {
        if (prev === undefined) delete process.env.UWC_CORRIDOR_MODE_ACTIONS_COMMIT;
        else process.env.UWC_CORRIDOR_MODE_ACTIONS_COMMIT = prev;
      }
    },
  );

  it.each(['web', 'ios'] as const)(
    '%s same-day corridors + UNIFIED PlanVersion-only preview sealed',
    async (surface) => {
      const client = surface === 'web' ? web() : ios();

      const sameDay = await client.previewSameDayTimeAdjust({
        tripId: `t-sd-${surface}`,
        expectedTripRevision: 2,
        timeUpdates: [
          {
            itemId: 'i1',
            startTimeIso: '2026-07-24T10:00:00.000Z',
            endTimeIso: '2026-07-24T11:00:00.000Z',
          },
        ],
      });
      expect(sameDay.ok).toBe(true);
      if (!sameDay.ok) return;
      expect(sameDay.handle.slice).toBe('itinerary_same_day_time_adjust');
      expect(Object.isFrozen(sameDay.handle)).toBe(true);

      const sameDayAdd = await client.previewSameDayAddItem({
        tripId: `t-add-${surface}`,
        expectedTripRevision: 2,
        itemCreates: [
          {
            tripDayId: 'day1',
            placeId: 42,
            startTimeIso: '2026-07-24T10:00:00.000Z',
            endTimeIso: '2026-07-24T11:00:00.000Z',
            clientItemKey: 'add-42',
          },
        ],
      });
      expect(sameDayAdd.ok).toBe(true);
      if (!sameDayAdd.ok) return;
      expect(sameDayAdd.handle.slice).toBe('itinerary_same_day_add_item');

      const fromCandidates = await client.previewSameDayAddFromCandidates({
        tripId: `t-aa-${surface}`,
        expectedTripRevision: 2,
        itemCreates: [
          {
            tripDayId: 'day1',
            placeId: 42,
            startTimeIso: '2026-07-24T10:00:00.000Z',
            endTimeIso: '2026-07-24T11:00:00.000Z',
            clientItemKey: 'cand-1',
          },
        ],
        candidateRemovals: ['cand-1'],
      });
      expect(fromCandidates.ok).toBe(true);
      if (!fromCandidates.ok) return;
      expect(fromCandidates.handle.slice).toBe(
        'itinerary_same_day_add_from_candidates',
      );

      const multiDay = await client.previewMultiDayAddFromCandidates({
        tripId: `t-mdaa-${surface}`,
        expectedTripRevision: 2,
        itemCreates: [
          {
            tripDayId: 'day1',
            placeId: 42,
            startTimeIso: '2026-07-24T10:00:00.000Z',
            endTimeIso: '2026-07-24T11:00:00.000Z',
            clientItemKey: 'cand-1',
          },
          {
            tripDayId: 'day2',
            placeId: 43,
            startTimeIso: '2026-07-25T10:00:00.000Z',
            endTimeIso: '2026-07-25T11:00:00.000Z',
            clientItemKey: 'cand-2',
          },
        ],
        candidateRemovals: ['cand-1', 'cand-2'],
      });
      expect(multiDay.ok).toBe(true);
      if (!multiDay.ok) return;
      expect(multiDay.handle.slice).toBe(
        'itinerary_multi_day_add_from_candidates',
      );

      const sameDayRemove = await client.previewSameDayRemoveItem({
        tripId: `t-rm-${surface}`,
        expectedTripRevision: 2,
        itemRemovals: ['i-rm-1', 'i-rm-2'],
      });
      expect(sameDayRemove.ok).toBe(true);
      if (!sameDayRemove.ok) return;
      expect(sameDayRemove.handle.slice).toBe('itinerary_same_day_remove_item');

      const sameDayReorder = await client.previewSameDayReorderItems({
        tripId: `t-ro-${surface}`,
        expectedTripRevision: 2,
        itemReorders: [
          { itemId: 'i-a', order: 2 },
          { itemId: 'i-b', order: 1 },
        ],
      });
      expect(sameDayReorder.ok).toBe(true);
      if (!sameDayReorder.ok) return;
      expect(sameDayReorder.handle.slice).toBe(
        'itinerary_same_day_reorder_items',
      );

      const moveAndAdd = await client.previewSameDayMoveAndAdd({
        tripId: `t-ma-${surface}`,
        expectedTripRevision: 2,
        timeUpdates: [
          {
            itemId: 'i1',
            startTimeIso: '2026-07-24T09:00:00.000Z',
            endTimeIso: '2026-07-24T10:00:00.000Z',
          },
        ],
        itemCreates: [
          {
            tripDayId: 'day1',
            placeId: 42,
            startTimeIso: '2026-07-24T11:00:00.000Z',
            endTimeIso: '2026-07-24T12:00:00.000Z',
            clientItemKey: 'add-42',
          },
        ],
      });
      expect(moveAndAdd.ok).toBe(true);
      if (!moveAndAdd.ok) return;
      expect(moveAndAdd.handle.slice).toBe('itinerary_same_day_move_and_add');

      const reduceIntensity = await client.previewSameDayReduceIntensity({
        tripId: `t-ri-${surface}`,
        expectedTripRevision: 2,
        timeUpdates: [
          {
            itemId: 'i1',
            startTimeIso: '2026-07-24T10:00:00.000Z',
            endTimeIso: '2026-07-24T15:00:00.000Z',
          },
        ],
        itemCreates: [
          {
            tripDayId: 'day1',
            placeId: null,
            type: 'REST',
            startTimeIso: '2026-07-24T15:30:00.000Z',
            endTimeIso: '2026-07-24T16:30:00.000Z',
            clientItemKey: 'rest-1',
          },
        ],
      });
      expect(reduceIntensity.ok).toBe(true);
      if (!reduceIntensity.ok) return;
      expect(reduceIntensity.handle.slice).toBe(
        'itinerary_same_day_reduce_intensity',
      );

      const unified = await client.previewUnifiedPlanVersionOnly({
        tripId: `t-pv-${surface}`,
        decisionId: 'd1',
        planVersionId: 'pv_new',
        expectedPlanVersionId: 'pv_parent',
      });
      expect(unified.ok).toBe(true);
      if (!unified.ok) return;
      expect(unified.handle.slice).toBe('unified_plan_version_only');
    },
  );

  it('CONFLICT forces re-Preview; page confirm blocked', async () => {
    const client = web();
    const preview = await client.previewExecutionRemind({
      tripId: 't-conflict',
      expectedResourceVersion: 1,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const confirmed = await client.pageApi.confirm(preview.handle);
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;

    updateUwc1eProtocolSession(preview.handle.draftId, {
      state: 'CONFLICT',
      mustRePreview: true,
      bypassForbidden: true,
    });

    const blocked = await client.commitGate.commit(confirmed.handle, {
      idempotencyKey: 'idem-conflict',
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.mustRePreview).toBe(true);
    expect(blocked.bypassForbidden).toBe(true);
  });

  it('rejects forged previewHash / expectedVersion / confirmationToken', async () => {
    const client = ios();
    const preview = await client.previewExecutionRemind({
      tripId: 't-tamper',
      expectedResourceVersion: 1,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const confirmed = await client.pageApi.confirm(preview.handle);
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;

    expect(() =>
      assertCommitTokensUnforged({
        draftId: confirmed.handle.draftId,
        confirmationToken: 'forged-token',
      }),
    ).toThrow(/CONFIRMATION_TOKEN_TAMPER/);

    expect(() =>
      assertCommitTokensUnforged({
        draftId: confirmed.handle.draftId,
        confirmationToken: confirmed.handle.confirmationIdView,
        previewHash: 'forged-hash',
      }),
    ).toThrow(/PREVIEW_HASH_TAMPER/);

    expect(() =>
      assertCommitTokensUnforged({
        draftId: confirmed.handle.draftId,
        confirmationToken: confirmed.handle.confirmationIdView,
        expectedVersion: { kind: 'NO_VERSION_REQUIRED' },
      }),
    ).toThrow(/EXPECTED_VERSION_TAMPER/);
  });

  it('VERIFICATION_REQUIRED / REJECTED cannot bypass via commit retry', async () => {
    const client = web();
    for (const state of ['VERIFICATION_REQUIRED', 'REJECTED'] as const) {
      clearUwc1eProtocolSessionsForTests();
      clearUwc1eSealBagForTests();
      const preview = await client.previewExecutionRemind({
        tripId: `t-${state}`,
        expectedResourceVersion: 1,
      });
      if (!preview.ok) throw new Error('preview');
      const confirmed = await client.pageApi.confirm(preview.handle);
      if (!confirmed.ok) throw new Error('confirm');

      updateUwc1eProtocolSession(preview.handle.draftId, {
        state,
        mustRePreview: true,
        bypassForbidden: true,
      });

      const blocked = await client.commitGate.commit(confirmed.handle, {
        idempotencyKey: `idem-${state}`,
      });
      expect(blocked.ok).toBe(false);
      expect(blocked.bypassForbidden).toBe(true);
      expect(blocked.mustRePreview).toBe(true);
    }
  });
});
