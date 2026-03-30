import { ActionExecutionService } from './action-execution.service';
import { RequestDeduplicationService } from './request-deduplication.service';
import { ActionRegistryService } from './action-registry.service';
import { TRAVEL_ONTOLOGY_MERGE_POLICY } from '../constants/action-execution.constants';

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

  it('supports preview(action_plan) -> commit(with confirmation_token) flow', async () => {
    dedup.checkGenericDuplicate.mockReturnValue(null);
    registry.has.mockReturnValue(true);
    registry.checkPreconditions.mockReturnValue(true);
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

  it('builds semantic default edits for CANCEL and executes trip.apply_user_edit', async () => {
    dedup.checkGenericDuplicate.mockReturnValue(null);
    const executeMock = jest.fn().mockResolvedValue({ success: true });
    registry.has.mockReturnValue(true);
    registry.checkPreconditions.mockReturnValue(true);
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
      input_schema: {},
      output_schema: {},
      execute: executeMock,
    } as any);

    const commit = await service.commit({
      request_id: 'req-4',
      trip_id: 'trip-4',
      actions: [
        {
          action_id: 'a4',
          action_type: 'CANCEL',
          target_type: 'HOTEL',
          target_ref: 'item_hotel_001',
          risk_level: 'LOW',
          requires_confirmation: false,
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
    registry.checkPreconditions.mockReturnValue(true);
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
      input_schema: {},
      output_schema: {},
      execute: jest.fn(),
    } as any);

    const commit = await service.commit({
      request_id: 'req-5',
      trip_id: 'trip-5',
      actions: [
        {
          action_id: 'a5',
          action_type: 'BOOK',
          target_type: 'ACTIVITY',
          risk_level: 'LOW',
          requires_confirmation: false,
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
    registry.checkPreconditions.mockReturnValue(true);
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
            risk_level: 'LOW',
            requires_confirmation: false,
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
    registry.checkPreconditions.mockReturnValue(true);
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
      input_schema: {},
      output_schema: {},
      execute: executeMock,
    } as any);

    const commit = await service.commit({
      request_id: 'req-pay',
      trip_id: 'trip-pay',
      actions: [
        {
          action_id: 'pay1',
          action_type: 'PAY',
          target_type: 'HOTEL',
          target_ref: 'hotel_it_1',
          risk_level: 'LOW',
          requires_confirmation: false,
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
});
