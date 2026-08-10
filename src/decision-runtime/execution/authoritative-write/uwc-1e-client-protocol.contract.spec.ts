import {
  UWC_1E_OPENAPI_FREEZE,
} from './client-write-protocol.openapi.freeze';
import {
  isUwc1eTransitionAllowed,
  nextUwc1eSessionState,
  UWC_1E_STATE_MACHINE_RULES,
} from './client-write-protocol.state-machine';
import {
  ClientWriteProtocolService,
  uwc1eLocksStillHeld,
} from './client-write-protocol.service';
import { clearUwc1eProtocolSessionsForTests, updateUwc1eProtocolSession } from './client-write-protocol.store';
import {
  UWC_1E_APPLY_PIPELINE_STAGES,
  UWC_1E_CLIENT_OUTCOMES,
  UWC_1E_EXCLUDED_CAPABILITIES,
  UWC_1E_FIRST_BATCH_SLICES,
  UWC_1E_PRODUCT_SURFACES,
  UWC_1E_PROTOCOL_VERSION,
  UWC_1E_SCHEMA_ID,
  UWC_1E_SLICE_TO_CORRIDOR,
} from './client-write-protocol.types';
import { AuthoritativeWriteGatewayService } from './authoritative-write-gateway.service';
import { AuthoritativeWriteHandlerRegistryService } from './corridor-handler.registry';
import { UWC_1C_OCC_SWITCH_AUTHORIZED, UWC_1C_OCC_UNLOCKED } from './corridor-write-mode.config';
import { UWC_1D_COMPENSATION_EXEC_AUTHORIZED } from './compensation-auth.gate';
import {
  UWC_CORRIDOR_AUTHORITATIVE_AUTHORIZED,
} from './corridor-authoritative.gate';
import { UNIFIED_WRITE_PROTOCOL_STAGES } from './authoritative-write.types';

describe('UWC-1e client write protocol', () => {
  const registry = new AuthoritativeWriteHandlerRegistryService();
  const gateway = new AuthoritativeWriteGatewayService(registry);
  const protocol = new ClientWriteProtocolService(gateway, registry);

  beforeEach(() => {
    clearUwc1eProtocolSessionsForTests();
  });

  it('UWC-OCC-UNLOCK-01 + UWC-COMP-UNLOCK-01: OCC and compensation unlocked; exclusions held', async () => {
    expect(uwc1eLocksStillHeld()).toEqual({
      globalOccUnlocked: true,
      compensationExecAuthorized: true,
    });
    expect(UWC_1C_OCC_SWITCH_AUTHORIZED).toBe(true);
    expect(UWC_1C_OCC_UNLOCKED).toBe(true);
    expect(UWC_1D_COMPENSATION_EXEC_AUTHORIZED).toBe(true);
    expect(UWC_CORRIDOR_AUTHORITATIVE_AUTHORIZED.ACTIONS_COMMIT).toBe(true);
    expect(UWC_CORRIDOR_AUTHORITATIVE_AUTHORIZED.ITINERARY_ADJUST).toBe(true);
    expect(UWC_CORRIDOR_AUTHORITATIVE_AUTHORIZED.UNIFIED_EXECUTE).toBe(true);
  });

  it('freezes shared OpenAPI for web and ios (same paths/enums)', async () => {
    expect(UWC_1E_OPENAPI_FREEZE.info.version).toBe(UWC_1E_PROTOCOL_VERSION);
    expect(Object.keys(UWC_1E_OPENAPI_FREEZE.paths)).toEqual([
      '/write/preview',
      '/write/confirm',
      '/write/apply',
    ]);
    expect(UWC_1E_OPENAPI_FREEZE.components.schemas.Uwc1eProductSurface.enum).toEqual(
      [...UWC_1E_PRODUCT_SURFACES],
    );
    expect(UWC_1E_OPENAPI_FREEZE.components.schemas.Uwc1eClientOutcome.enum).toEqual(
      [...UWC_1E_CLIENT_OUTCOMES],
    );
    expect(UWC_1E_OPENAPI_FREEZE.components.schemas.Uwc1eProtocolStage.enum).toEqual(
      [...UNIFIED_WRITE_PROTOCOL_STAGES],
    );
    expect(UWC_1E_OPENAPI_FREEZE.components.schemas.Uwc1eFirstBatchSlice.enum).toEqual(
      [...UWC_1E_FIRST_BATCH_SLICES],
    );
    expect(UWC_1E_OPENAPI_FREEZE['x-uwc-locks']).toEqual({
      globalOccUnlock: true,
      compensationExec: true,
      corridorAuthoritativeExpansion: false,
    });
    expect(UWC_1E_OPENAPI_FREEZE['x-uwc-client-rules'].webIosSameContract).toBe(
      true,
    );
    expect(UWC_1E_OPENAPI_FREEZE.paths['/write/preview'].post['x-uwc-apply-pipeline']).toBe(
      false,
    );
    expect(UWC_1E_OPENAPI_FREEZE.paths['/write/confirm'].post['x-uwc-apply-pipeline']).toBe(
      false,
    );
    expect(UWC_1E_OPENAPI_FREEZE.paths['/write/apply'].post['x-uwc-pipeline-stages']).toEqual(
      [...UWC_1E_APPLY_PIPELINE_STAGES],
    );
  });

  it('state machine: CONFLICT → re-Preview; VERIFICATION/REJECTED cannot APPLY', async () => {
    expect(UWC_1E_STATE_MACHINE_RULES.conflictRequiresRePreview).toBe(true);
    expect(isUwc1eTransitionAllowed('CONFLICT', 'APPLY')).toBe(false);
    expect(isUwc1eTransitionAllowed('CONFLICT', 'PREVIEW')).toBe(true);
    expect(isUwc1eTransitionAllowed('VERIFICATION_REQUIRED', 'APPLY')).toBe(
      false,
    );
    expect(isUwc1eTransitionAllowed('REJECTED', 'APPLY')).toBe(false);
    expect(isUwc1eTransitionAllowed('CONFIRMED', 'APPLY')).toBe(true);
    expect(nextUwc1eSessionState('IDLE', 'PREVIEW')).toBe('DRAFT');
    expect(nextUwc1eSessionState('DRAFT', 'CONFIRM')).toBe('CONFIRMED');
  });

  it('Preview generates draft only; Confirm records only; Apply enters pipeline', async () => {
    const preview = await protocol.preview({
      schemaId: UWC_1E_SCHEMA_ID,
      protocolVersion: UWC_1E_PROTOCOL_VERSION,
      stage: 'PREVIEW',
      productSurface: 'web',
      slice: 'actions_commit',
      tripId: 't-1e',
      intendedMutation: {
        request_id: 'r-1e',
        context_signature: 'sig-1e',
      },
      expectedWriteVersion: {
        kind: 'RESOURCE_VERSION_SET',
        resources: [{ resourceId: 't-1e', expectedVersion: 1 }],
      },
    });
    expect('draft' in preview).toBe(true);
    if (!('draft' in preview)) return;
    expect(preview.sessionState).toBe('DRAFT');
    expect(preview.draft.writesPerformed).toBe(false);
    expect(preview.draft.applyPipelineEntered).toBe(false);
    expect(preview.draft.corridor).toBe(
      UWC_1E_SLICE_TO_CORRIDOR.actions_commit,
    );
    expect(preview.reasonCodes).toContain('PREVIEW_DRAFT_ONLY');

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
    expect(confirm.applyPipelineEntered).toBe(false);
    expect(confirm.writesPerformed).toBe(false);
    expect(confirm.sessionState).toBe('CONFIRMED');

    const prev = process.env.UWC_CORRIDOR_MODE_ACTIONS_COMMIT;
    process.env.UWC_CORRIDOR_MODE_ACTIONS_COMMIT = 'AUTHORITATIVE';
    try {
      const applied = await protocol.apply({
        schemaId: UWC_1E_SCHEMA_ID,
        protocolVersion: UWC_1E_PROTOCOL_VERSION,
        stage: 'APPLY',
        draftId: preview.draft.draftId,
        confirmationId: confirm.confirmationId,
        idempotencyKey: 'idem-1e-actions',
        productSurface: 'web',
      });
      expect('outcome' in applied).toBe(true);
      if (!('outcome' in applied)) return;
      expect(applied.stage).toBe('APPLY');
      expect(applied.applyPipelineStages).toEqual([
        ...UWC_1E_APPLY_PIPELINE_STAGES,
      ]);
      expect(applied.reasonCodes).toContain('APPLY_PIPELINE_ENTERED');
      expect(applied.reasonCodes).toContain('PIPELINE_AUTHORITY');
      expect(applied.reasonCodes).toContain('PIPELINE_OCC');
      expect(['APPLIED', 'IDEMPOTENT_REPLAY', 'CONFLICT', 'REJECTED', 'VERIFICATION_REQUIRED']).toContain(
        applied.outcome,
      );
    } finally {
      if (prev === undefined) delete process.env.UWC_CORRIDOR_MODE_ACTIONS_COMMIT;
      else process.env.UWC_CORRIDOR_MODE_ACTIONS_COMMIT = prev;
    }
  });

  it('ios and web share identical slice → corridor map', async () => {
    for (const surface of UWC_1E_PRODUCT_SURFACES) {
      const out = await protocol.preview({
        schemaId: UWC_1E_SCHEMA_ID,
        protocolVersion: UWC_1E_PROTOCOL_VERSION,
        stage: 'PREVIEW',
        productSurface: surface,
        slice: 'unified_plan_version_only',
        tripId: `t-${surface}`,
        intendedMutation: { planVersionId: 'pv_new', decisionId: 'd1' },
        expectedWriteVersion: {
          kind: 'PLAN_VERSION',
          expectedPlanVersionId: 'pv_parent',
        },
      });
      expect('draft' in out).toBe(true);
      if (!('draft' in out)) return;
      expect(out.draft.corridor).toBe('UNIFIED_EXECUTE');
      expect(out.draft.productSurface).toBe(surface);
    }
  });

  it('rejects excluded capabilities at Preview', async () => {
    for (const cap of UWC_1E_EXCLUDED_CAPABILITIES) {
      const out = await protocol.preview({
        schemaId: UWC_1E_SCHEMA_ID,
        protocolVersion: UWC_1E_PROTOCOL_VERSION,
        stage: 'PREVIEW',
        productSurface: 'ios',
        slice: 'actions_commit',
        tripId: 't-x',
        intendedMutation: { capability: cap },
        expectedWriteVersion: { kind: 'NO_VERSION_REQUIRED' },
      });
      expect(out).toMatchObject({
        outcome: 'REJECTED',
        errorCode: 'EXCLUDED_CAPABILITY',
      });
    }
  });

  it('CONFLICT forces re-Preview; Apply/Confirm blocked', async () => {
    const preview = await protocol.preview({
      schemaId: UWC_1E_SCHEMA_ID,
      protocolVersion: UWC_1E_PROTOCOL_VERSION,
      stage: 'PREVIEW',
      productSurface: 'web',
      slice: 'itinerary_same_day_time_adjust',
      tripId: 't-conflict',
      intendedMutation: { timeUpdates: [] },
      expectedWriteVersion: {
        kind: 'RESOURCE_VERSION_SET',
        resources: [{ resourceId: 't-conflict', expectedVersion: 1 }],
      },
    });
    if (!('draft' in preview)) throw new Error('expected draft');
    const confirm = await protocol.confirm({
      schemaId: UWC_1E_SCHEMA_ID,
      protocolVersion: UWC_1E_PROTOCOL_VERSION,
      stage: 'CONFIRM',
      draftId: preview.draft.draftId,
      explicitConfirm: true,
      productSurface: 'web',
    });
    if (!('confirmationId' in confirm)) throw new Error('expected confirm');

    updateUwc1eProtocolSession(preview.draft.draftId, {
      state: 'CONFLICT',
      mustRePreview: true,
      bypassForbidden: true,
    });

    const blockedApply = await protocol.apply({
      schemaId: UWC_1E_SCHEMA_ID,
      protocolVersion: UWC_1E_PROTOCOL_VERSION,
      stage: 'APPLY',
      draftId: preview.draft.draftId,
      confirmationId: confirm.confirmationId,
      idempotencyKey: 'idem-conflict',
      productSurface: 'web',
    });
    expect(blockedApply).toMatchObject({
      errorCode: 'MUST_REPREVIEW_AFTER_CONFLICT',
      mustRePreview: true,
      bypassForbidden: true,
    });

    const blockedConfirm = await protocol.confirm({
      schemaId: UWC_1E_SCHEMA_ID,
      protocolVersion: UWC_1E_PROTOCOL_VERSION,
      stage: 'CONFIRM',
      draftId: preview.draft.draftId,
      explicitConfirm: true,
      productSurface: 'web',
    });
    expect(blockedConfirm).toMatchObject({
      errorCode: 'MUST_REPREVIEW_AFTER_CONFLICT',
      mustRePreview: true,
    });
  });

  it('VERIFICATION_REQUIRED and REJECTED cannot bypass via Apply retry', async () => {
    for (const state of ['VERIFICATION_REQUIRED', 'REJECTED'] as const) {
      clearUwc1eProtocolSessionsForTests();
      const preview = await protocol.preview({
        schemaId: UWC_1E_SCHEMA_ID,
        protocolVersion: UWC_1E_PROTOCOL_VERSION,
        stage: 'PREVIEW',
        productSurface: 'ios',
        slice: 'actions_commit',
        tripId: `t-${state}`,
        intendedMutation: { request_id: 'r', context_signature: 's' },
        expectedWriteVersion: {
          kind: 'RESOURCE_VERSION_SET',
          resources: [{ resourceId: `t-${state}`, expectedVersion: 1 }],
        },
      });
      if (!('draft' in preview)) throw new Error('expected draft');
      const confirm = await protocol.confirm({
        schemaId: UWC_1E_SCHEMA_ID,
        protocolVersion: UWC_1E_PROTOCOL_VERSION,
        stage: 'CONFIRM',
        draftId: preview.draft.draftId,
        explicitConfirm: true,
        productSurface: 'ios',
      });
      if (!('confirmationId' in confirm)) throw new Error('expected confirm');

      updateUwc1eProtocolSession(preview.draft.draftId, {
        state,
        mustRePreview: true,
        bypassForbidden: true,
      });

      const blocked = await protocol.apply({
        schemaId: UWC_1E_SCHEMA_ID,
        protocolVersion: UWC_1E_PROTOCOL_VERSION,
        stage: 'APPLY',
        draftId: preview.draft.draftId,
        confirmationId: confirm.confirmationId,
        idempotencyKey: `idem-${state}`,
        productSurface: 'ios',
      });
      expect(blocked).toMatchObject({
        errorCode: 'BYPASS_FORBIDDEN',
        mustRePreview: true,
        bypassForbidden: true,
      });
    }
  });

  it('Confirm without explicitConfirm=true is rejected', async () => {
    const preview = await protocol.preview({
      schemaId: UWC_1E_SCHEMA_ID,
      protocolVersion: UWC_1E_PROTOCOL_VERSION,
      stage: 'PREVIEW',
      productSurface: 'web',
      slice: 'actions_commit',
      tripId: 't-exp',
      intendedMutation: {},
      expectedWriteVersion: { kind: 'NO_VERSION_REQUIRED' },
    });
    if (!('draft' in preview)) throw new Error('expected draft');
    const bad = await protocol.confirm({
      schemaId: UWC_1E_SCHEMA_ID,
      protocolVersion: UWC_1E_PROTOCOL_VERSION,
      stage: 'CONFIRM',
      draftId: preview.draft.draftId,
      // @ts-expect-error intentional bypass attempt
      explicitConfirm: false,
      productSurface: 'web',
    });
    expect(bad).toMatchObject({
      errorCode: 'EXPLICIT_CONFIRM_REQUIRED',
    });
  });
});
