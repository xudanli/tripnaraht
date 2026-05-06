import { ActionExecutionService } from './action-execution.service';
import { RequestDeduplicationService } from './request-deduplication.service';
import { ActionRegistryService } from './action-registry.service';
import { TRAVEL_ONTOLOGY_MERGE_POLICY } from '../constants/action-execution.constants';
import { AGENT_ACTION_LOG_STATUS } from '../constants/agent-action-log.constants';
import { createHash } from 'node:crypto';
import { PhysicalValidatorService } from '../../domain/ontology/validator/physical-validator.service';

const EMPTY_PHYSICAL_SIGNABLE = {
  validator_version: PhysicalValidatorService.VALIDATOR_VERSION,
  rule_bundle_id: PhysicalValidatorService.RULE_BUNDLE_ID,
  violations: [] as Array<{ code: string; severity: 'BLOCK' | 'WARN'; detail: string }>,
  blocking: false,
};

function stableSortObject(x: any): any {
  if (Array.isArray(x)) return x.map(stableSortObject);
  if (!x || typeof x !== 'object') return x;
  const out: Record<string, any> = {};
  for (const k of Object.keys(x).sort()) out[k] = stableSortObject(x[k]);
  return out;
}

function sig(payload: unknown): string {
  const json = JSON.stringify(stableSortObject(payload));
  return `sha256:${createHash('sha256').update(json).digest('hex')}`;
}

/** Matches ActionExecutionService commit recomputation (includes stable physical_validation). */
function sigCommit(payload: Record<string, unknown>): string {
  return sig({
    physical_validation: EMPTY_PHYSICAL_SIGNABLE,
    ...payload,
  });
}

describe('ActionExecutionService', () => {
  let service: ActionExecutionService;
  let dedup: jest.Mocked<Pick<RequestDeduplicationService, 'checkGenericDuplicate' | 'cacheGenericResponse'>>;
  let registry: jest.Mocked<Pick<ActionRegistryService, 'has' | 'get' | 'checkPreconditions'>>;

  beforeEach(() => {
    dedup = {
      checkGenericDuplicate: jest.fn(),
      cacheGenericResponse: jest.fn(),
    };
    registry = {
      has: jest.fn(),
      get: jest.fn(),
      checkPreconditions: jest.fn(),
    };
    service = new ActionExecutionService(
      dedup as unknown as RequestDeduplicationService,
      registry as unknown as ActionRegistryService,
    );
  });

  it('returns PARTIAL when high-risk action requires confirmation token', async () => {
    dedup.checkGenericDuplicate.mockReturnValue(null);
    const response = await service.commit({
      request_id: 'req-1',
      trip_id: 'trip-1',
      actions: [
        {
          action_id: 'a1',
          action_type: 'BOOK',
          target_type: 'FLIGHT',
          risk_level: 'HIGH',
          requires_confirmation: true,
          context_signature: 'sha256:test',
        },
      ],
    });

    expect(response.status).toBe('PARTIAL');
    expect(response.travel_ontology).toBeUndefined();
    expect(response.message).toContain('confirmation_token');
    expect(response.accepted_actions).toHaveLength(0);
    expect(response.blocked_actions).toHaveLength(1);
    expect(response.rejected_reason_codes).toContain('HIGH_RISK_REQUIRES_CONFIRMATION_TOKEN');
    expect(response.blocked_actions?.[0].rejected_reason_code).toBe('HIGH_RISK_REQUIRES_CONFIRMATION_TOKEN');
    expect(response.blocked_actions?.[0].rejected_message).toContain('High-risk');
  });

  it('returns deduplicated response on idempotent hit', async () => {
    dedup.checkGenericDuplicate.mockReturnValue({
      status: 'OK',
      message: 'cached',
      accepted_actions: [],
    });

    const response = await service.commit({
      request_id: 'req-1',
      trip_id: 'trip-1',
      idempotency_key: 'idem-1',
      actions: [],
    });

    expect(response.status).toBe('OK');
    expect(response.message).toContain('deduplicated');
    expect(dedup.cacheGenericResponse).not.toHaveBeenCalled();
  });

  it('blocks financial or booking commit when idempotency_key is missing', async () => {
    dedup.checkGenericDuplicate.mockReturnValue(null);
    registry.has.mockReturnValue(true);
    registry.checkPreconditions.mockReturnValue({ status: 'feasible', findings: [] } as any);
    registry.get.mockReturnValue({
      name: 'trip.apply_user_edit',
      description: 'mock',
      metadata: {
        kind: 'external',
        cost: 'medium',
        side_effect: 'financial',
        preconditions: [],
        idempotent: true,
        cacheable: false,
      },
      side_effect_configs: [{ handlerId: 'side_effect.financial_hold.book_flight_v1', params: { hold_ratio: 1 } }],
      input_schema: {},
      output_schema: {},
      execute: jest.fn().mockResolvedValue({ ok: true }),
    } as any);

    const response = await service.commit({
      request_id: 'req-idem-missing',
      trip_id: 'trip-idem-missing',
      actions: [
        {
          action_id: 'a-idem',
          action_type: 'BOOK',
          target_type: 'FLIGHT',
          risk_level: 'LOW',
          requires_confirmation: false,
          context_signature: 'sha256:test',
        },
      ],
    });

    expect(response.status).toBe('PARTIAL');
    expect(response.rejected_reason_codes).toContain('MISSING_IDEMPOTENCY_KEY');
    expect(response.blocked_actions?.[0].rejected_reason_code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('fails commit when FINANCIAL_HOLD evidence is required by admin config but missing', async () => {
    dedup.checkGenericDuplicate.mockReturnValue(null);
    registry.has.mockReturnValue(true);
    registry.checkPreconditions.mockReturnValue({ status: 'feasible', findings: [] } as any);
    registry.get.mockReturnValue({
      name: 'trip.apply_user_edit',
      description: 'mock',
      metadata: {
        kind: 'external',
        cost: 'medium',
        side_effect: 'financial',
        preconditions: [],
        idempotent: true,
        cacheable: false,
      },
      side_effect_configs: [{ handlerId: 'side_effect.financial_hold.book_flight_v1', params: { hold_ratio: 1 } }],
      input_schema: {},
      output_schema: {},
      execute: jest.fn().mockResolvedValue({ ok: true }),
    } as any);
    const sideEffectRegistry: any = {
      register: jest.fn(),
      previewMany: jest.fn().mockResolvedValue([
        { kind: 'FINANCIAL_HOLD', deltaType: 'FINANCIAL_FLOW', confidence: 0.9, evidenceBundle: { kind: 'side_effect_evidence', message: 'ok', evidence: {} } },
      ]),
      applyMany: jest.fn().mockResolvedValue([
        { kind: 'FINANCIAL_HOLD', state_patch: { side_effects: { financial_holds: [{ hold_id: 'hold-a' }] } } },
      ]),
    };
    const agentActionLog = {
      createInit: jest.fn().mockResolvedValue('log-evidence-1'),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      mergePayload: jest.fn().mockResolvedValue(undefined),
    };
    const prisma: any = {
      isDbConnected: jest.fn().mockReturnValue(true),
      physicalDomainBudget: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      physicalDomainInventoryItem: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      decisionRuleConfig: {
        findMany: jest.fn().mockResolvedValue([
          {
            params: {
              actionType: 'FINANCIAL_HOLD',
              evidenceType: 'EvidenceCard',
              required: true,
            },
          },
        ]),
      },
    };
    service = new ActionExecutionService(
      dedup as unknown as RequestDeduplicationService,
      registry as unknown as ActionRegistryService,
      sideEffectRegistry,
      undefined,
      undefined,
      agentActionLog as any,
      undefined,
      undefined,
      prisma,
    );

    const response = await service.commit({
      request_id: 'req-evidence-missing',
      trip_id: 'trip-evidence-missing',
      idempotency_key: 'idem-evidence',
      actions: [
        {
          action_id: 'a-evidence',
          action_type: 'BOOK',
          target_type: 'FLIGHT',
          action_name: 'trip.apply_user_edit',
          risk_level: 'LOW',
          requires_confirmation: false,
          context_signature: sigCommit({
            action_id: 'a-evidence',
            action_name: 'trip.apply_user_edit',
            action_type: 'BOOK',
            target_type: 'FLIGHT',
            action_input: null,
            side_effects: [
              { kind: 'FINANCIAL_HOLD', deltaType: 'FINANCIAL_FLOW', confidence: 0.9, evidenceBundle: { kind: 'side_effect_evidence', message: 'ok', evidence: {} } },
            ],
            assessment: { status: 'feasible', findings: [], shadow_delta: null },
          }),
        },
      ],
    });

    expect(response.status).toBe('PARTIAL');
    expect(response.rejected_reason_codes).toContain('MISSING_REQUIRED_EVIDENCE');
    expect(response.blocked_actions?.[0].rejected_reason_code).toBe('MISSING_REQUIRED_EVIDENCE');
    expect((response.blocked_actions?.[0] as any)?.evidence_requirement_context).toEqual({
      required_action_type: 'FINANCIAL_HOLD',
      required_evidence_type: 'EvidenceCard',
      side_effect_kind: 'FINANCIAL_HOLD',
    });
    expect(agentActionLog.mergePayload).toHaveBeenCalledWith(
      'log-evidence-1',
      expect.objectContaining({
        evidence_requirement_context: {
          required_action_type: 'FINANCIAL_HOLD',
          required_evidence_type: 'EvidenceCard',
          side_effect_kind: 'FINANCIAL_HOLD',
        },
      }),
    );
  });

  it('applies evidence requirement hot update immediately', async () => {
    dedup.checkGenericDuplicate.mockReturnValue(null);
    registry.has.mockReturnValue(true);
    registry.checkPreconditions.mockReturnValue({ status: 'feasible', findings: [] } as any);
    registry.get.mockReturnValue({
      name: 'trip.apply_user_edit',
      description: 'mock',
      metadata: {
        kind: 'external',
        cost: 'medium',
        side_effect: 'financial',
        preconditions: [],
        idempotent: true,
        cacheable: false,
      },
      side_effect_configs: [{ handlerId: 'side_effect.financial_hold.book_flight_v1', params: { hold_ratio: 1 } }],
      input_schema: {},
      output_schema: {},
      execute: jest.fn().mockResolvedValue({ ok: true }),
    } as any);
    const sideEffectRegistry: any = {
      register: jest.fn(),
      previewMany: jest.fn().mockResolvedValue([
        { kind: 'FINANCIAL_HOLD', deltaType: 'FINANCIAL_FLOW', confidence: 0.9, evidenceBundle: { kind: 'side_effect_evidence', message: 'ok', evidence: {} } },
      ]),
      applyMany: jest.fn().mockResolvedValue([
        { kind: 'FINANCIAL_HOLD', state_patch: { side_effects: { financial_holds: [{ hold_id: 'hold-hot' }] } } },
      ]),
    };
    const prisma: any = {
      isDbConnected: jest.fn().mockReturnValue(true),
      physicalDomainBudget: { findUnique: jest.fn().mockResolvedValue(null) },
      physicalDomainInventoryItem: { findUnique: jest.fn().mockResolvedValue(null) },
      decisionRuleConfig: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              params: {
                actionType: 'FINANCIAL_HOLD',
                evidenceType: 'EvidenceCard',
                required: true,
              },
            },
          ])
          .mockResolvedValueOnce([]),
      },
    };
    service = new ActionExecutionService(
      dedup as unknown as RequestDeduplicationService,
      registry as unknown as ActionRegistryService,
      sideEffectRegistry,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      prisma,
    );

    const actionBase = {
      action_id: 'a-hot',
      action_type: 'BOOK' as const,
      target_type: 'FLIGHT' as const,
      action_name: 'trip.apply_user_edit',
      risk_level: 'LOW' as const,
      requires_confirmation: false,
      context_signature: sigCommit({
        action_id: 'a-hot',
        action_name: 'trip.apply_user_edit',
        action_type: 'BOOK',
        target_type: 'FLIGHT',
        action_input: null,
        side_effects: [
          { kind: 'FINANCIAL_HOLD', deltaType: 'FINANCIAL_FLOW', confidence: 0.9, evidenceBundle: { kind: 'side_effect_evidence', message: 'ok', evidence: {} } },
        ],
        assessment: { status: 'feasible', findings: [], shadow_delta: null },
      }),
    };

    const first = await service.commit({
      request_id: 'req-hot-1',
      trip_id: 'trip-hot',
      idempotency_key: 'idem-hot-1',
      actions: [actionBase],
    });
    expect(first.status).toBe('PARTIAL');
    expect(first.rejected_reason_codes).toContain('MISSING_REQUIRED_EVIDENCE');

    const second = await service.commit({
      request_id: 'req-hot-2',
      trip_id: 'trip-hot',
      idempotency_key: 'idem-hot-2',
      actions: [
        {
          ...actionBase,
          action_id: 'a-hot-2',
          context_signature: sigCommit({
            action_id: 'a-hot-2',
            action_name: 'trip.apply_user_edit',
            action_type: 'BOOK',
            target_type: 'FLIGHT',
            action_input: null,
            side_effects: [
              {
                kind: 'FINANCIAL_HOLD',
                deltaType: 'FINANCIAL_FLOW',
                confidence: 0.9,
                evidenceBundle: { kind: 'side_effect_evidence', message: 'ok', evidence: {} },
              },
            ],
            assessment: { status: 'feasible', findings: [], shadow_delta: null },
          }),
        },
      ],
    });
    expect(second.status).toBe('OK');
  });

  it('loads evidence requirements once per commit request', async () => {
    dedup.checkGenericDuplicate.mockReturnValue(null);
    registry.has.mockReturnValue(true);
    registry.checkPreconditions.mockReturnValue({ status: 'feasible', findings: [] } as any);
    registry.get.mockReturnValue({
      name: 'trip.apply_user_edit',
      description: 'mock',
      metadata: {
        kind: 'external',
        cost: 'medium',
        side_effect: 'financial',
        preconditions: [],
        idempotent: true,
        cacheable: false,
      },
      side_effect_configs: [{ handlerId: 'side_effect.financial_hold.book_flight_v1', params: { hold_ratio: 1 } }],
      input_schema: {},
      output_schema: {},
      execute: jest.fn().mockResolvedValue({ ok: true }),
    } as any);
    const sideEffectRegistry: any = {
      register: jest.fn(),
      previewMany: jest.fn().mockResolvedValue([
        { kind: 'FINANCIAL_HOLD', deltaType: 'FINANCIAL_FLOW', confidence: 0.9, evidenceBundle: { kind: 'side_effect_evidence', message: 'ok', evidence: {} } },
      ]),
      applyMany: jest.fn().mockResolvedValue([
        { kind: 'FINANCIAL_HOLD', state_patch: { side_effects: { financial_holds: [{ hold_id: 'hold-b1' }] } }, evidenceBundle: { kind: 'side_effect_evidence', message: 'ok', evidence: {} } },
      ]),
    };
    const prismaFindMany = jest.fn().mockResolvedValue([
      { params: { actionType: 'FINANCIAL_HOLD', evidenceType: 'EvidenceCard', required: true } },
    ]);
    const prisma: any = {
      isDbConnected: jest.fn().mockReturnValue(true),
      physicalDomainBudget: { findUnique: jest.fn().mockResolvedValue(null) },
      physicalDomainInventoryItem: { findUnique: jest.fn().mockResolvedValue(null) },
      decisionRuleConfig: { findMany: prismaFindMany },
    };
    service = new ActionExecutionService(
      dedup as unknown as RequestDeduplicationService,
      registry as unknown as ActionRegistryService,
      sideEffectRegistry,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      prisma,
    );

    const mkAction = (id: string) => ({
      action_id: id,
      action_type: 'BOOK' as const,
      target_type: 'FLIGHT' as const,
      action_name: 'trip.apply_user_edit',
      risk_level: 'LOW' as const,
      requires_confirmation: false,
      context_signature: sigCommit({
        action_id: id,
        action_name: 'trip.apply_user_edit',
        action_type: 'BOOK',
        target_type: 'FLIGHT',
        action_input: null,
        side_effects: [
          { kind: 'FINANCIAL_HOLD', deltaType: 'FINANCIAL_FLOW', confidence: 0.9, evidenceBundle: { kind: 'side_effect_evidence', message: 'ok', evidence: {} } },
        ],
        assessment: { status: 'feasible', findings: [], shadow_delta: null },
      }),
    });

    const res = await service.commit({
      request_id: 'req-batch-1',
      trip_id: 'trip-batch',
      idempotency_key: 'idem-batch-1',
      actions: [mkAction('b1'), mkAction('b2')],
    });

    expect(res.status).toBe('OK');
    expect(prismaFindMany).toHaveBeenCalledTimes(1);
  });

  it('supports preview(action_plan) -> commit(with confirmation_token) flow', async () => {
    dedup.checkGenericDuplicate.mockReturnValue(null);
    registry.has.mockReturnValue(true);
    registry.checkPreconditions.mockReturnValue({ status: 'feasible', findings: [] } as any);
    registry.get.mockReturnValue({
      name: 'execution.remind',
      description: 'mock',
      metadata: {
        kind: 'internal',
        cost: 'low',
        side_effect: 'none',
        preconditions: [],
        idempotent: true,
        cacheable: false,
      },
      side_effect_configs: [],
      input_schema: {},
      output_schema: {},
      execute: jest.fn().mockResolvedValue({ ok: true }),
    } as any);

    const preview = await service.preview({
      request_id: 'req-2',
      trip_id: 'trip-2',
      execution_mode: 'AUTO',
      action_plan: [
        {
          action_id: 'a1',
          action_type: 'ADJUST',
          target_type: 'ITINERARY',
          action_name: 'execution.handle_change',
          risk_level: 'HIGH',
          requires_confirmation: false,
        },
        {
          action_id: 'a2',
          action_type: 'NOTIFY',
          target_type: 'ITINERARY',
          action_name: 'execution.remind',
          risk_level: 'LOW',
          requires_confirmation: false,
        },
      ],
    });

    expect(preview.status).toBe('OK');
    expect(preview.accepted_actions).toHaveLength(2);
    expect(preview.requires_confirmation_count).toBe(1);
    expect(preview.high_risk_count).toBe(1);
    expect(preview.action_previews).toBeDefined();

    const commit = await service.commit({
      request_id: 'req-2',
      trip_id: 'trip-2',
      idempotency_key: 'idem-2',
      confirmation_token: 'token-allow-high-risk',
      actions: preview.accepted_actions || [],
    });

    expect(commit.status).toBe('OK');
    expect(commit.accepted_actions).toHaveLength(2);
    expect(commit.travel_ontology?.trip_id).toBe('trip-2');
    expect(commit.travel_ontology?.merge_policy).toBe(TRAVEL_ONTOLOGY_MERGE_POLICY);
    expect(commit.travel_ontology?.patch.verbs?.committed).toEqual(['a1', 'a2']);
    expect(dedup.cacheGenericResponse).toHaveBeenCalledTimes(1);
  });

  it('enforces v1.2 tripartite context signature in commit', async () => {
    dedup.checkGenericDuplicate.mockReturnValue(null);
    registry.has.mockReturnValue(true);
    registry.checkPreconditions.mockReturnValue({ status: 'feasible', findings: [] } as any);
    registry.get.mockReturnValue({
      name: 'execution.remind',
      description: 'mock',
      metadata: {
        kind: 'internal',
        cost: 'low',
        side_effect: 'none',
        preconditions: [],
        idempotent: true,
        cacheable: false,
      },
      side_effect_configs: [],
      input_schema: {},
      output_schema: {},
      execute: jest.fn().mockResolvedValue({ ok: true }),
    } as any);

    const preview = await service.preview({
      request_id: 'req-v12',
      trip_id: 'trip-v12',
      execution_mode: 'AUTO',
      actions: [
        {
          action_id: 'a-v12',
          action_type: 'NOTIFY',
          target_type: 'ITINERARY',
          action_name: 'execution.remind',
          risk_level: 'LOW',
          requires_confirmation: false,
          action_input: { message: 'hello', policyVersion: 'policy-lab:v2' },
        },
      ],
    });

    const accepted = preview.accepted_actions?.[0] as any;
    expect(accepted.context_signature_v2).toBeDefined();
    expect(accepted.context_signature_v2.policyVersion).toBe('policy-lab:v2');

    const blocked = await service.commit({
      request_id: 'req-v12',
      trip_id: 'trip-v12',
      actions: [
        {
          ...accepted,
          context_signature_v2: {
            ...accepted.context_signature_v2,
            policyVersion: 'policy-lab:tampered',
          },
        },
      ],
    });

    expect(blocked.status).toBe('PARTIAL');
    expect(blocked.rejected_reason_codes).toContain('ACTION_PREVIEW_SIGNATURE_MISMATCH');
    expect((blocked.blocked_actions?.[0] as any)?.stale_shadow_context?.stale_dimensions).toContain('policyVersion');
  });

  it('returns RESOURCE_STALE_RECOMPUTE when resource snapshot drifted between preview and commit', async () => {
    dedup.checkGenericDuplicate.mockReturnValue(null);
    registry.has.mockReturnValue(true);
    registry.checkPreconditions.mockReturnValue({ status: 'feasible', findings: [] } as any);
    registry.get.mockReturnValue({
      name: 'execution.remind',
      description: 'mock',
      metadata: {
        kind: 'internal',
        cost: 'low',
        side_effect: 'none',
        preconditions: [],
        idempotent: true,
        cacheable: false,
      },
      side_effect_configs: [],
      input_schema: {},
      output_schema: {},
      execute: jest.fn().mockResolvedValue({ ok: true }),
    } as any);
    const inventoryState = { price: 100, availability: 'AVAILABLE' };
    const prisma: any = {
      isDbConnected: jest.fn().mockReturnValue(true),
      physicalDomainBudget: {
        findUnique: jest.fn(async ({ where }: any) => {
          if (where.accountId === 'acct-r') return { accountId: 'acct-r', available: 1000 };
          if (where.accountId === 'default') return { accountId: 'default', available: 3000 };
          return null;
        }),
      },
      physicalDomainInventoryItem: {
        findUnique: jest.fn(async ({ where }: any) => {
          if (where.id !== 'inv-r') return null;
          return { id: 'inv-r', price: inventoryState.price, availability: inventoryState.availability };
        }),
      },
    };
    service = new ActionExecutionService(
      dedup as unknown as RequestDeduplicationService,
      registry as unknown as ActionRegistryService,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      prisma as any,
    );

    const preview = await service.preview({
      request_id: 'req-rs',
      trip_id: 'trip-rs',
      actions: [
        {
          action_id: 'a-rs',
          action_type: 'NOTIFY',
          target_type: 'ITINERARY',
          action_name: 'execution.remind',
          target_ref: 'inv-r',
          risk_level: 'LOW',
          requires_confirmation: false,
          action_input: { accountId: 'acct-r', inventoryId: 'inv-r' },
        },
      ],
    });
    const accepted = preview.accepted_actions?.[0] as any;
    inventoryState.price = 180; // simulate resource drift

    const blocked = await service.commit({
      request_id: 'req-rs',
      trip_id: 'trip-rs',
      actions: [accepted],
    });
    expect(blocked.status).toBe('PARTIAL');
    expect(blocked.rejected_reason_codes).toContain('RESOURCE_STALE_RECOMPUTE');
    expect((blocked.blocked_actions?.[0] as any)?.stale_shadow_context?.stale_dimensions).toContain('resourceHash');
    expect((blocked.blocked_actions?.[0] as any)?.stale_shadow_context?.original_resource_snapshot?.inventoryPrice).toBe(100);
    expect((blocked.blocked_actions?.[0] as any)?.stale_shadow_context?.recomputed_resource_snapshot?.inventoryPrice).toBe(180);
  });

  it('returns PARTIAL with unsupported mapping when action cannot map', async () => {
    dedup.checkGenericDuplicate.mockReturnValue(null);
    const commit = await service.commit({
      request_id: 'req-3',
      trip_id: 'trip-3',
      actions: [
        {
          action_id: 'a3',
          action_type: 'OPTIMIZE',
          target_type: 'FLIGHT',
          risk_level: 'LOW',
          requires_confirmation: false,
          context_signature: 'sha256:test',
        },
      ],
    });
    expect(commit.status).toBe('PARTIAL');
    expect(commit.travel_ontology).toBeUndefined();
    expect(commit.blocked_actions).toHaveLength(1);
    expect(commit.rejected_reason_codes).toContain('UNSUPPORTED_ACTION_MAPPING');
    expect(commit.blocked_actions?.[0].rejected_reason_code).toBe('UNSUPPORTED_ACTION_MAPPING');
    expect(commit.blocked_actions?.[0].rejected_message).toContain('mapping');
  });

  it('writes commit saga ledger INIT → COMMITTED → SIDE_EFFECT_DONE when AgentActionLog is wired', async () => {
    dedup.checkGenericDuplicate.mockReturnValue(null);
    const agentActionLog = {
      createInit: jest.fn().mockResolvedValue('log-row-1'),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };
    service = new ActionExecutionService(
      dedup as unknown as RequestDeduplicationService,
      registry as unknown as ActionRegistryService,
      undefined,
      undefined,
      undefined,
      agentActionLog as any,
    );
    const executeMock = jest.fn().mockResolvedValue({ success: true });
    registry.has.mockReturnValue(true);
    registry.checkPreconditions.mockReturnValue({ status: 'feasible', findings: [] } as any);
    registry.get.mockReturnValue({
      name: 'trip.apply_user_edit',
      description: 'mock',
      metadata: {
        kind: 'internal',
        cost: 'low',
        side_effect: 'writes_db',
        preconditions: [],
        idempotent: false,
        cacheable: false,
      },
      // Ensure auto_heal path enters sideEffectRegistry.applyMany branch.
      side_effect_configs: [{ handlerId: 'side_effect.financial_hold.book_flight_v1', params: { hold_ratio: 1 } }],
      input_schema: {},
      output_schema: {},
      execute: executeMock,
    } as any);

    const commit = await service.commit({
      request_id: 'req-saga',
      trip_id: 'trip-saga',
      idempotency_key: 'idem-saga',
      actions: [
        {
          action_id: 'a-saga',
          action_type: 'CANCEL',
          target_type: 'HOTEL',
          target_ref: 'item_x',
          action_name: 'trip.apply_user_edit',
          risk_level: 'LOW',
          requires_confirmation: false,
          context_signature: sigCommit({
            action_id: 'a-saga',
            action_name: 'trip.apply_user_edit',
            action_type: 'CANCEL',
            target_type: 'HOTEL',
            target_ref: 'item_x',
            action_input: null,
            assessment: { status: 'feasible', findings: [], shadow_delta: null },
          }),
        },
      ],
    });

    expect(commit.status).toBe('OK');
    expect(agentActionLog.createInit).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-saga',
        tripId: 'trip-saga',
        actionId: 'a-saga',
        actionName: 'trip.apply_user_edit',
        idempotencyKey: 'idem-saga',
      }),
    );
    expect(agentActionLog.updateStatus).toHaveBeenCalledWith('log-row-1', AGENT_ACTION_LOG_STATUS.COMMITTED);
    expect(agentActionLog.updateStatus).toHaveBeenCalledWith('log-row-1', AGENT_ACTION_LOG_STATUS.SIDE_EFFECT_DONE);
  });

  it('marks saga FAILED when side effects fail after COMMITTED (payment/network) and does not reach SIDE_EFFECT_DONE', async () => {
    dedup.checkGenericDuplicate.mockReturnValue(null);
    const agentActionLog = {
      createInit: jest.fn().mockResolvedValue('log-row-2'),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };
    const sideEffectRegistry = {
      register: jest.fn(),
      previewMany: jest.fn().mockResolvedValue([]),
      applyMany: jest.fn().mockRejectedValue(new Error('NETWORK_ERROR_PAYMENT')),
    };
    service = new ActionExecutionService(
      dedup as unknown as RequestDeduplicationService,
      registry as unknown as ActionRegistryService,
      sideEffectRegistry as any,
      undefined,
      undefined,
      agentActionLog as any,
    );
    const executeMock = jest.fn().mockResolvedValue({ success: true });
    registry.has.mockReturnValue(true);
    registry.checkPreconditions.mockReturnValue({ status: 'feasible', findings: [] } as any);
    registry.get.mockReturnValue({
      name: 'trip.book_flight',
      description: 'mock',
      metadata: {
        kind: 'internal',
        cost: 'high',
        side_effect: 'writes_db',
        preconditions: [],
        idempotent: false,
        cacheable: false,
      },
      side_effect_configs: [
        { handlerId: 'side_effect.financial_hold.book_flight_v1', params: { hold_ratio: 1 } },
        { handlerId: 'side_effect.payment.capture_v1', params: {} },
      ],
      input_schema: {},
      output_schema: {},
      execute: executeMock,
    } as any);

    const commit = await service.commit({
      request_id: 'req-saga-fail',
      trip_id: 'trip-saga',
      idempotency_key: 'idem-saga-fail',
      actions: [
        {
          action_id: 'a-saga-fail',
          action_type: 'BOOK',
          target_type: 'FLIGHT',
          target_ref: 'item_y',
          action_name: 'trip.book_flight',
          risk_level: 'LOW',
          requires_confirmation: false,
          context_signature: sigCommit({
            action_id: 'a-saga-fail',
            action_name: 'trip.book_flight',
            action_type: 'BOOK',
            target_type: 'FLIGHT',
            target_ref: 'item_y',
            action_input: null,
            assessment: { status: 'feasible', findings: [], shadow_delta: null },
          }),
        },
      ],
    });

    expect(commit.status).toBe('PARTIAL');
    expect(commit.accepted_actions).toHaveLength(0);
    expect(commit.blocked_actions).toHaveLength(1);
    expect(commit.rejected_reason_codes).toContain('ACTION_EXECUTION_FAILED');

    expect(agentActionLog.updateStatus).toHaveBeenCalledWith('log-row-2', AGENT_ACTION_LOG_STATUS.COMMITTED);
    expect(agentActionLog.updateStatus).toHaveBeenCalledWith(
      'log-row-2',
      AGENT_ACTION_LOG_STATUS.FAILED,
      expect.stringContaining('NETWORK_ERROR_PAYMENT'),
    );
    expect(agentActionLog.updateStatus).not.toHaveBeenCalledWith('log-row-2', AGENT_ACTION_LOG_STATUS.SIDE_EFFECT_DONE);
  });

  it('builds semantic default edits for CANCEL and executes trip.apply_user_edit', async () => {
    dedup.checkGenericDuplicate.mockReturnValue(null);
    const executeMock = jest.fn().mockResolvedValue({ success: true });
    registry.has.mockReturnValue(true);
    registry.checkPreconditions.mockReturnValue({ status: 'feasible', findings: [] } as any);
    registry.get.mockReturnValue({
      name: 'trip.apply_user_edit',
      description: 'mock',
      metadata: {
        kind: 'internal',
        cost: 'low',
        side_effect: 'writes_db',
        preconditions: [],
        idempotent: false,
        cacheable: false,
      },
      // Ensure auto_heal path enters sideEffectRegistry.applyMany branch.
      side_effect_configs: [{ handlerId: 'side_effect.financial_hold.book_flight_v1', params: { hold_ratio: 1 } }],
      input_schema: {},
      output_schema: {},
      execute: executeMock,
    } as any);

    const commit = await service.commit({
      request_id: 'req-4',
      trip_id: 'trip-4',
      idempotency_key: 'idem-cancel-4',
      actions: [
        {
          action_id: 'a4',
          action_type: 'CANCEL',
          target_type: 'HOTEL',
          target_ref: 'item_hotel_001',
          action_name: 'trip.apply_user_edit',
          risk_level: 'LOW',
          requires_confirmation: false,
          context_signature: sigCommit({
            action_id: 'a4',
            action_name: 'trip.apply_user_edit',
            action_type: 'CANCEL',
            target_type: 'HOTEL',
            target_ref: 'item_hotel_001',
            action_input: null,
            assessment: { status: 'feasible', findings: [], shadow_delta: null },
          }),
        },
      ],
    });

    expect(commit.status).toBe('OK');
    expect(commit.travel_ontology?.patch.verbs?.committed).toEqual(['a4']);
    expect(executeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        trip_id: 'trip-4',
        edits: [{ type: 'delete', itemId: 'item_hotel_001' }],
      }),
      expect.any(Object),
    );
  });

  it('rejects BOOK add action when required fields are missing', async () => {
    dedup.checkGenericDuplicate.mockReturnValue(null);
    registry.has.mockReturnValue(true);
    registry.checkPreconditions.mockReturnValue({ status: 'feasible', findings: [] } as any);
    registry.get.mockReturnValue({
      name: 'trip.apply_user_edit',
      description: 'mock',
      metadata: {
        kind: 'internal',
        cost: 'low',
        side_effect: 'writes_db',
        preconditions: [],
        idempotent: false,
        cacheable: false,
      },
      side_effect_configs: [],
      input_schema: {},
      output_schema: {},
      execute: jest.fn(),
    } as any);

    const commit = await service.commit({
      request_id: 'req-5',
      trip_id: 'trip-5',
      idempotency_key: 'idem-book-missing-fields',
      actions: [
        {
          action_id: 'a5',
          action_type: 'BOOK',
          target_type: 'ACTIVITY',
          action_name: 'trip.apply_user_edit',
          risk_level: 'LOW',
          requires_confirmation: false,
          context_signature: sigCommit({
            action_id: 'a5',
            action_name: 'trip.apply_user_edit',
            action_type: 'BOOK',
            target_type: 'ACTIVITY',
            target_ref: undefined,
            action_input: null,
            assessment: { status: 'feasible', findings: [], shadow_delta: null },
          }),
        },
      ],
    });

    expect(commit.status).toBe('PARTIAL');
    expect(commit.travel_ontology).toBeUndefined();
    expect(commit.rejected_reason_codes).toContain('BOOK_ADD_MISSING_REQUIRED_FIELDS');
    expect(commit.blocked_actions?.[0].rejected_reason_code).toBe('BOOK_ADD_MISSING_REQUIRED_FIELDS');
    expect(commit.blocked_actions?.[0].rejected_message).toContain('requires');
  });

  it('maps MODIFY and SELECT to ADJUST and executes trip.apply_user_edit for FLIGHT', async () => {
    dedup.checkGenericDuplicate.mockReturnValue(null);
    const executeMock = jest.fn().mockResolvedValue({ success: true });
    registry.has.mockReturnValue(true);
    registry.checkPreconditions.mockReturnValue({ status: 'feasible', findings: [] } as any);
    registry.get.mockReturnValue({
      name: 'trip.apply_user_edit',
      description: 'mock',
      metadata: {
        kind: 'internal',
        cost: 'low',
        side_effect: 'writes_db',
        preconditions: [],
        idempotent: false,
        cacheable: false,
      },
      side_effect_configs: [],
      input_schema: {},
      output_schema: {},
      execute: executeMock,
    } as any);

    for (const action_type of ['MODIFY', 'SELECT'] as const) {
      executeMock.mockClear();
      const commit = await service.commit({
        request_id: 'req-m',
        trip_id: 'trip-m',
        actions: [
          {
            action_id: `a-${action_type}`,
            action_type,
            target_type: 'FLIGHT',
            target_ref: 'seg-1',
            action_name: 'trip.apply_user_edit',
            risk_level: 'LOW',
            requires_confirmation: false,
            context_signature: sigCommit({
              action_id: `a-${action_type}`,
              action_name: 'trip.apply_user_edit',
              action_type,
              target_type: 'FLIGHT',
              target_ref: 'seg-1',
              action_input: null,
              assessment: { status: 'feasible', findings: [], shadow_delta: null },
            }),
          },
        ],
      });
      expect(commit.status).toBe('OK');
      expect(commit.travel_ontology?.patch.verbs?.committed).toEqual([`a-${action_type}`]);
      expect(executeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          edits: [expect.objectContaining({ type: 'update', itemId: 'seg-1' })],
        }),
        expect.any(Object),
      );
    }
  });

  it('executes PAY with default paymentStatus edit', async () => {
    dedup.checkGenericDuplicate.mockReturnValue(null);
    const executeMock = jest.fn().mockResolvedValue({ success: true });
    registry.has.mockReturnValue(true);
    registry.checkPreconditions.mockReturnValue({ status: 'feasible', findings: [] } as any);
    registry.get.mockReturnValue({
      name: 'trip.apply_user_edit',
      description: 'mock',
      metadata: {
        kind: 'internal',
        cost: 'low',
        side_effect: 'writes_db',
        preconditions: [],
        idempotent: false,
        cacheable: false,
      },
      side_effect_configs: [],
      input_schema: {},
      output_schema: {},
      execute: executeMock,
    } as any);

    const commit = await service.commit({
      request_id: 'req-pay',
      trip_id: 'trip-pay',
      idempotency_key: 'idem-pay',
      actions: [
        {
          action_id: 'pay1',
          action_type: 'PAY',
          target_type: 'HOTEL',
          target_ref: 'hotel_it_1',
          action_name: 'trip.apply_user_edit',
          risk_level: 'LOW',
          requires_confirmation: false,
          context_signature: sigCommit({
            action_id: 'pay1',
            action_name: 'trip.apply_user_edit',
            action_type: 'PAY',
            target_type: 'HOTEL',
            target_ref: 'hotel_it_1',
            action_input: null,
            assessment: { status: 'feasible', findings: [], shadow_delta: null },
          }),
        },
      ],
    });

    expect(commit.status).toBe('OK');
    expect(commit.travel_ontology?.patch.verbs?.committed).toEqual(['pay1']);
    expect(executeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        edits: [
          {
            type: 'update',
            itemId: 'hotel_it_1',
            updates: { paymentStatus: 'PAID' },
          },
        ],
      }),
      expect.any(Object),
    );
  });

  it('auto_heal physical drift: contract constraint_hash evolves, healing logs road_closed_v1, realized_state reflects replanned path', async () => {
    dedup.checkGenericDuplicate.mockReturnValue(null);
    let captureCall = 0;
    const contractCapturer = {
      captureFeasibilitySnapshot: jest.fn(async () => {
        captureCall += 1;
        if (captureCall === 2) {
          return {
            feasible: false,
            hard_violation_count: 1,
            violated_rules: [{ rule_id: 'road_closed_v1', severity: 'HARD' as const }],
            facts: [
              {
                rule_id: 'road_closed_v1',
                is_violated: true,
                severity: 'HARD',
                evidence: { segment_id: 'B', type: 'road_state', source: 'EMERGENCY_CONSTRAINT' },
              },
            ],
            evidence_refs: ['ev-1'],
          };
        }
        return {
          feasible: true,
          hard_violation_count: 0,
          violated_rules: [] as { rule_id: string; severity: 'HARD' | 'SOFT' }[],
          facts: [] as any[],
          evidence_refs: [] as string[],
        };
      }),
    };
    const routeAndRun = jest.fn().mockResolvedValue({
      path_segments_after_heal: ['A', 'C'],
      resource_units: 80,
    });
    const moduleRef = { get: jest.fn().mockReturnValue({ routeAndRun }) };
    const mergePayload = jest.fn().mockResolvedValue(undefined);
    const agentActionLog = {
      createInit: jest.fn().mockResolvedValue('log-heal-1'),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      mergePayload,
    };
    const sideEffectRegistry = {
      register: jest.fn(),
      previewMany: jest.fn().mockResolvedValue([]),
      applyMany: jest.fn().mockResolvedValue([
        {
          state_patch: {
            side_effects: {
              financial_holds: [{ hold_id: 'hold_act1', amount: 500, currency: 'USD' }],
            },
          },
        },
      ]),
    };
    const executeMock = jest.fn().mockResolvedValue({ success: true });
    const pre = {
      status: 'feasible' as const,
      findings: [] as any[],
      shadow_delta: {
        resources: { budget: { current: 2500, delta: -500, after: 2000, currency: 'USD' } },
      },
    };
    registry.has.mockReturnValue(true);
    registry.checkPreconditions.mockReturnValue(pre as any);
    registry.get.mockReturnValue({
      name: 'trip.apply_user_edit',
      description: 'mock',
      metadata: {
        kind: 'internal',
        cost: 'low',
        side_effect: 'writes_db',
        preconditions: [],
        idempotent: false,
        cacheable: false,
      },
      side_effect_configs: [{ handlerId: 'side_effect.financial_hold.book_flight_v1', params: { hold_ratio: 1, ttl_seconds: 900 } }],
      input_schema: {},
      output_schema: {},
      execute: executeMock,
    } as any);

    service = new ActionExecutionService(
      dedup as unknown as RequestDeduplicationService,
      registry as unknown as ActionRegistryService,
      sideEffectRegistry as any,
      undefined,
      undefined,
      agentActionLog as any,
      contractCapturer as any,
      moduleRef as any,
    );

    const context_signature = sigCommit({
      action_id: 'act1',
      action_name: 'trip.apply_user_edit',
      action_type: 'BOOK',
      target_type: 'FLIGHT',
      target_ref: 'f1',
      action_input: { amount: 500, currency: 'USD' },
      assessment: { status: 'feasible', findings: [], shadow_delta: pre.shadow_delta },
    });

    const res = await service.commit({
      request_id: 'req-heal-contract',
      trip_id: 'trip-heal',
      idempotency_key: 'idem-heal-contract',
      auto_heal: true,
      actions: [
        {
          action_id: 'act1',
          action_type: 'BOOK',
          target_type: 'FLIGHT',
          target_ref: 'f1',
          action_name: 'trip.apply_user_edit',
          risk_level: 'LOW',
          requires_confirmation: false,
          context_signature,
          action_input: { amount: 500, currency: 'USD' },
        },
      ],
    });

    expect(res.status).toBe('OK');
    expect(contractCapturer.captureFeasibilitySnapshot).toHaveBeenCalled();
    expect(captureCall).toBeGreaterThanOrEqual(3);
    expect(routeAndRun).toHaveBeenCalledWith(
      expect.objectContaining({
        emergency_constraints: expect.objectContaining({
          forbidden_segments: ['B'],
          forced_road_states: { B: 'CLOSED' },
        }),
      }),
    );

    const heal = res.healing as any;
    expect(heal?.triggered).toBe(true);
    expect(heal?.physical_diagnoses?.some((d: any) => d.diagnosis_code === 'road_closed_v1')).toBe(true);
    expect(heal?.preview_constraint_hash).toBeDefined();
    expect(heal?.evolved_decision_contract?.semantic_signature?.constraint_hash).toBeDefined();
    expect(heal.preview_constraint_hash).not.toBe(heal.evolved_decision_contract.semantic_signature.constraint_hash);

    const healingPayload = mergePayload.mock.calls.map((c) => c[1]).find((p: any) => p?.healing?.evolved_decision_contract);
    expect(healingPayload?.healing?.physical_diagnoses?.[0]?.diagnosis_code).toBe('road_closed_v1');
    expect(healingPayload?.healing?.evolved_decision_contract?.semantic_signature?.constraint_hash).toBe(
      heal.evolved_decision_contract.semantic_signature.constraint_hash,
    );

    const realizedPatch = mergePayload.mock.calls.map((c) => c[1]).find((p: any) => p?.realized_state?.route_evolution);
    expect(realizedPatch?.realized_state?.route_evolution?.emergency_segment_closed).toBe('B');
    expect(realizedPatch?.realized_state?.route_evolution?.path_segments_resolved).toEqual(['A', 'C']);
    expect(realizedPatch?.realized_state?.route_evolution?.resource_units).toBe(80);
    expect(realizedPatch?.realized_state?.holds?.[0]?.amount).toBe(500);
  });

  it('auto_heal solar drift: injects hard_deadlines and returns evolved contract + diagnosis', async () => {
    dedup.checkGenericDuplicate.mockReturnValue(null);
    let captureCall = 0;
    const contractCapturer = {
      captureFeasibilitySnapshot: jest.fn(async () => {
        captureCall += 1;
        if (captureCall >= 2) {
          return {
            feasible: false,
            hard_violation_count: 1,
            violated_rules: [{ rule_id: 'solar_safety_v1', severity: 'HARD' as const }],
            facts: [
              {
                rule_id: 'solar_safety_v1',
                is_violated: true,
                severity: 'HARD',
                evidence: {
                  poi_id: 'poi_123',
                  safety_threshold_iso: '2026-06-01T18:30:00.000Z',
                  sunset_time_iso: '2026-06-01T19:00:00.000Z',
                  actual_end_time_iso: '2026-06-01T19:30:00.000Z',
                  type: 'solar_safety',
                },
              },
            ],
            evidence_refs: ['ev-solar-1'],
          };
        }
        return {
          feasible: true,
          hard_violation_count: 0,
          violated_rules: [] as { rule_id: string; severity: 'HARD' | 'SOFT' }[],
          facts: [] as any[],
          evidence_refs: [] as string[],
        };
      }),
    };
    const routeAndRun = jest.fn().mockResolvedValue({
      swapped_plan: [{ from: 'hike', to: 'museum' }],
      resource_units: 55,
      itinerary: {
        request_id: 'req-solar-heal::auto',
        days: [
          {
            date: '2026-06-01',
            items: [
              {
                id: 'item_hike_1',
                type: 'POI',
                start_window: '09:00',
                end_window: '10:30',
                location_ref: { place_id: 'poi_hike_1', name: 'Hike' },
                evidence_refs: [],
                verified: false,
                verification_status: 'ASSUMPTION',
              },
              {
                id: 'item_museum_1',
                type: 'POI',
                start_window: '19:30',
                end_window: '21:00',
                location_ref: { place_id: 'poi_museum_1', name: 'Museum' },
                evidence_refs: [],
                verified: false,
                verification_status: 'ASSUMPTION',
              },
            ],
          },
        ],
      },
    });
    const moduleRef = { get: jest.fn().mockReturnValue({ routeAndRun }) };
    const mergePayload = jest.fn().mockResolvedValue(undefined);
    const agentActionLog = {
      createInit: jest.fn().mockResolvedValue('log-solar-1'),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      mergePayload,
    };
    const sideEffectRegistry = {
      register: jest.fn(),
      previewMany: jest.fn().mockResolvedValue([]),
      applyMany: jest.fn().mockResolvedValue([]),
    };
    const executeMock = jest.fn().mockResolvedValue({ success: true });
    const pre = { status: 'feasible' as const, findings: [] as any[], shadow_delta: null };
    registry.has.mockReturnValue(true);
    registry.checkPreconditions.mockReturnValue(pre as any);
    registry.get.mockReturnValue({
      name: 'trip.apply_user_edit',
      description: 'mock',
      metadata: {
        kind: 'internal',
        cost: 'low',
        side_effect: 'writes_db',
        preconditions: [],
        idempotent: false,
        cacheable: false,
      },
      side_effect_configs: [],
      input_schema: {},
      output_schema: {},
      execute: executeMock,
    } as any);

    service = new ActionExecutionService(
      dedup as unknown as RequestDeduplicationService,
      registry as unknown as ActionRegistryService,
      sideEffectRegistry as any,
      undefined,
      undefined,
      agentActionLog as any,
      contractCapturer as any,
      moduleRef as any,
    );

    const context_signature = sigCommit({
      action_id: 'act_solar',
      action_name: 'trip.apply_user_edit',
      action_type: 'CANCEL',
      target_type: 'HOTEL',
      target_ref: 'hotel_it_1',
      action_input: null,
      assessment: { status: 'feasible', findings: [], shadow_delta: null },
    });

    const res = await service.commit({
      request_id: 'req-solar-heal',
      trip_id: 'trip-solar',
      auto_heal: true,
      actions: [
        {
          action_id: 'act_solar',
          action_type: 'CANCEL',
          target_type: 'HOTEL',
          target_ref: 'hotel_it_1',
          action_name: 'trip.apply_user_edit',
          risk_level: 'LOW',
          requires_confirmation: false,
          context_signature,
        },
      ],
    });

    expect(res.status).toBe('OK');
    expect(contractCapturer.captureFeasibilitySnapshot).toHaveBeenCalled();
    const heal = res.healing as any;
    expect(heal?.triggered).toBe(true);
    expect(heal?.physical_diagnoses?.some((d: any) => d.diagnosis_code === 'solar_safety_v1')).toBe(true);
    expect(routeAndRun).toHaveBeenCalledWith(
      expect.objectContaining({
        emergency_constraints: expect.objectContaining({
          hard_deadlines: { poi_123: '2026-06-01T18:30:00.000Z' },
          reason_code: 'HEALING_SOLAR_VIOLATION',
        }),
      }),
    );
    expect(heal?.preview_constraint_hash).toBeDefined();
    expect(heal?.evolved_decision_contract?.semantic_signature?.constraint_hash).toBeDefined();
    expect(heal.preview_constraint_hash).not.toBe(heal.evolved_decision_contract.semantic_signature.constraint_hash);
    expect(heal?.recomputed_itinerary?.days?.[0]?.items?.[0]?.location_ref?.name).toBe('Hike');
    expect(heal?.recomputed_itinerary?.days?.[0]?.items?.[0]?.start_window).toBe('09:00');
    expect(
      heal?.recomputed_itinerary?.days?.[0]?.items?.some(
        (it: any) => it?.location_ref?.name === 'Museum' && it?.start_window === '19:30',
      ),
    ).toBe(true);
    expect(heal?.legacy_snapshot?.diagnosis_code).toBe('solar_safety_v1');
    expect(heal?.legacy_snapshot?.items?.[0]?.id).toBe('poi_123');
    expect(heal?.legacy_snapshot?.items?.[0]?.original_end).toBe('2026-06-01T19:30:00.000Z');
    expect(heal?.legacy_snapshot?.items?.[0]?.safety_threshold).toBe('2026-06-01T18:30:00.000Z');
  });
});
