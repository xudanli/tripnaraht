import {
  ACTIONS_COMMIT_MIXED_TARGETS,
  MIXED_WRITE_UNIFICATION_FORBIDDEN,
  UNIFIED_EXECUTE_MIXED_TARGETS,
  WRITEBACK_CORRIDOR_AUDIT_MATRIX,
} from '../../../agent/contracts/writeback-corridor-audit.matrix';
import { AuthoritativeWriteGatewayService } from './authoritative-write-gateway.service';
import {
  AUTHORITATIVE_WRITE_CONTRACT_VERSION,
  AUTHORITATIVE_WRITE_ERROR_CODES,
  AUTHORITATIVE_WRITE_V1_CORRIDORS,
  CORRIDOR_TO_AUDIT_ROW_ID,
  UWC_V1_FORBIDDEN,
  type AuthoritativeWriteCommand,
} from './authoritative-write.types';
import {
  AUTHORITATIVE_WRITE_TARGET_PROFILES,
  listAuditRowIdsForV1Batch,
} from './write-target.registry';
import { AuthoritativeWriteHandlerRegistryService } from './corridor-handler.registry';
import {
  UWC_1B_WIRE_ORDER,
  UWC_AUTHORITATIVE_HARD_BLOCK_REASON,
  UWC_1C_OCC_UNLOCKED,
  resolveCorridorWriteMode,
} from './corridor-write-mode.config';

function baseCommand(
  overrides: Partial<AuthoritativeWriteCommand> &
    Pick<AuthoritativeWriteCommand, 'corridor' | 'writeTargets' | 'compensationModel'>,
): AuthoritativeWriteCommand {
  return {
    schemaId: 'tripnara.authoritative_write_command@v1',
    contractVersion: AUTHORITATIVE_WRITE_CONTRACT_VERSION,
    authority: {
      verdict: 'ALLOW',
      reasonCodes: [],
      source: 'test',
      decisionId: 'dec_test',
    },
    verification: { kind: 'authorize_record' },
    freshness: {},
    idempotency: { key: 'idem-1', durability: 'durable' },
    audit: {
      tripId: 'trip_1',
      productSurface: 'test',
      requestedAt: '2026-07-24T12:00:00Z',
    },
    payload: {},
    ...overrides,
  };
}

describe('AuthoritativeWriteGateway contract v1', () => {
  const registry = new AuthoritativeWriteHandlerRegistryService();
  const gateway = new AuthoritativeWriteGatewayService(registry);

  it('first-batch corridors match audit matrix row ids', () => {
    expect(listAuditRowIdsForV1Batch().sort()).toEqual(
      Object.values(CORRIDOR_TO_AUDIT_ROW_ID).sort(),
    );
    for (const corridor of AUTHORITATIVE_WRITE_V1_CORRIDORS) {
      const auditId = CORRIDOR_TO_AUDIT_ROW_ID[corridor];
      expect(WRITEBACK_CORRIDOR_AUDIT_MATRIX.some((r) => r.id === auditId)).toBe(
        true,
      );
    }
  });

  it('UNIFIED_EXECUTE / ACTIONS_COMMIT profiles preserve mixedTargets + forbid single-store', () => {
    const unified = AUTHORITATIVE_WRITE_TARGET_PROFILES.UNIFIED_EXECUTE;
    expect(unified.writeTargets.length).toBe(UNIFIED_EXECUTE_MIXED_TARGETS.length);
    expect(unified.notes).toContain(MIXED_WRITE_UNIFICATION_FORBIDDEN);

    const actions = AUTHORITATIVE_WRITE_TARGET_PROFILES.ACTIONS_COMMIT;
    expect(actions.writeTargets.length).toBe(ACTIONS_COMMIT_MIXED_TARGETS.length);
    expect(actions.compensationModel).toBe('stub_no_side_effects');
  });

  it('validate ACCEPT path returns VERIFICATION_REQUIRED awaiting apply', () => {
    const cmd = baseCommand({
      corridor: 'UNIFIED_EXECUTE',
      writeTargets: AUTHORITATIVE_WRITE_TARGET_PROFILES.UNIFIED_EXECUTE.writeTargets,
      compensationModel: 'post_effective_compensating_plan_version',
    });
    const result = gateway.validate(cmd);
    expect(result.outcome).toBe('VERIFICATION_REQUIRED');
    expect(result.reasonCodes).toContain('VALIDATE_OK_AWAITING_APPLY');
    expect(result.errorCode).toBeUndefined();
  });

  it('rejects DENY authority', async () => {
    const cmd = baseCommand({
      corridor: 'ITINERARY_ADJUST',
      writeTargets: AUTHORITATIVE_WRITE_TARGET_PROFILES.ITINERARY_ADJUST.writeTargets,
      compensationModel: 'revision_chain_rollback',
      authority: {
        verdict: 'DENY',
        reasonCodes: ['ADVICE_ONLY'],
        source: 'execution_mode',
      },
      verification: { kind: 'pending_draft' },
    });
    const result = await gateway.apply(cmd);
    expect(result.outcome).toBe('REJECTED');
    expect(result.errorCode).toBe(AUTHORITATIVE_WRITE_ERROR_CODES.AUTHORITY_DENIED);
  });

  it('rejects missing idempotency key', async () => {
    const cmd = baseCommand({
      corridor: 'ACTIONS_COMMIT',
      writeTargets: AUTHORITATIVE_WRITE_TARGET_PROFILES.ACTIONS_COMMIT.writeTargets,
      compensationModel: 'stub_no_side_effects',
      verification: { kind: 'context_signature', token: 'sig' },
      idempotency: { key: '   ', durability: 'in_memory' },
    });
    const result = await gateway.apply(cmd);
    expect(result.errorCode).toBe(
      AUTHORITATIVE_WRITE_ERROR_CODES.IDEMPOTENCY_KEY_MISSING,
    );
  });

  it('apply without registry → HANDLER_NOT_BOUND', async () => {
    const unbound = new AuthoritativeWriteGatewayService(null);
    const cmd = baseCommand({
      corridor: 'UNIFIED_EXECUTE',
      writeTargets: AUTHORITATIVE_WRITE_TARGET_PROFILES.UNIFIED_EXECUTE.writeTargets,
      compensationModel: 'post_effective_compensating_plan_version',
    });
    const result = await unbound.apply(cmd);
    expect(result.outcome).toBe('REJECTED');
    expect(result.errorCode).toBe(AUTHORITATIVE_WRITE_ERROR_CODES.HANDLER_NOT_BOUND);
  });

  it('SHADOW_VALIDATE apply never marks writeTargetsTouched', async () => {
    const cmd = baseCommand({
      corridor: 'UNIFIED_EXECUTE',
      writeTargets: AUTHORITATIVE_WRITE_TARGET_PROFILES.UNIFIED_EXECUTE.writeTargets,
      compensationModel: 'post_effective_compensating_plan_version',
    });
    const result = await gateway.apply(cmd);
    expect(result.reasonCodes).toContain('SHADOW_VALIDATE_NO_WRITE');
    expect(result.writeTargetsTouched).toEqual([]);
    expect(result.corridorResult?.writesPerformed).toBe(false);
  });

  it('documents UWC v1 forbidden capabilities', () => {
    expect(UWC_V1_FORBIDDEN).toEqual(
      expect.arrayContaining([
        'global_travelcontext_ssot',
        'ortools_authoritative_apply',
        'iceland_mobile_writeback_expansion',
        'mixed_write_single_store_unification',
      ]),
    );
  });

  it('wire order is ACTIONS → ADJUST → UNIFIED', () => {
    expect(UWC_1B_WIRE_ORDER).toEqual([
      'ACTIONS_COMMIT',
      'ITINERARY_ADJUST',
      'UNIFIED_EXECUTE',
    ]);
    expect(registry.listBound()).toEqual([...UWC_1B_WIRE_ORDER]);
  });

  it('AUTHORITATIVE env is hard-blocked until UWC-1c', async () => {
    expect(UWC_1C_OCC_UNLOCKED).toBe(false);
    const resolved = resolveCorridorWriteMode('ACTIONS_COMMIT', {
      UWC_CORRIDOR_MODE_ACTIONS_COMMIT: 'AUTHORITATIVE',
    });
    expect(resolved.authoritativeHardBlocked).toBe(true);
    expect(resolved.effective).toBe('DISABLED');
    expect(resolved.blockReason).toBe(UWC_AUTHORITATIVE_HARD_BLOCK_REASON);

    const handler = registry.get('ACTIONS_COMMIT');
    const cmd = handler.buildCommand({
      trip_id: 't1',
      request_id: 'r1',
      context_signature: 'sig',
    });
    await expect(handler.authoritativeApply(cmd)).rejects.toThrow(
      UWC_AUTHORITATIVE_HARD_BLOCK_REASON,
    );
  });
});
