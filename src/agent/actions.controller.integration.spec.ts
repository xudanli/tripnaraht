import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { ActionsController } from './actions.controller';
import { ActionExecutionService } from './services/action-execution.service';
import { FinancialHoldStoreService } from './services/financial-hold-store.service';
import { ActionGraphSagaCompilerService } from './services/action-graph-saga-compiler.service';
import { SideEffectRuleSyncerService } from './services/side-effect-rule-syncer.service';

describe('ActionsController (integration)', () => {
  let app: INestApplication;
  const mockActionExecutionService = {
    preview: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    getActionRegistryCatalog: jest.fn().mockReturnValue({
      total: 1,
      actions: [
        {
          name: 'trip.apply_user_edit',
          description: 'apply edits',
          category: 'trip',
          side_effect_handlers: ['side_effect.financial_hold.book_flight_v1'],
          preconditions: ['trip.trip_id'],
        },
      ],
    }),
    simulateActionNameMapping: jest.fn().mockImplementation((input: any) => ({
      action_type: input.action_type,
      normalized_action_type: input.action_type,
      target_type: input.target_type,
      mapped_action_name: 'trip.apply_user_edit',
      exists_in_registry: true,
      source: 'mapping',
    })),
  };
  const mockSideEffectRuleSyncer = {
    listActiveSideEffectRules: jest.fn().mockResolvedValue([
      {
        id: 'r1',
        actionName: 'trip.apply_user_edit',
        handlerId: 'side_effect.financial_hold.book_flight_v1',
        params: {},
        isActive: true,
        updatedAt: new Date(),
      },
    ]),
    getEffectiveRulesForAdmin: jest.fn().mockResolvedValue({
      revision: 1,
      total: 1,
      rows: [
        {
          actionName: 'trip.apply_user_edit',
          handlerId: 'side_effect.financial_hold.book_flight_v1',
          baseParams: {},
          overrideParams: null,
          effectiveParams: {},
          status: 'DEFAULT',
          updatedAt: new Date().toISOString(),
          isActiveInDb: true,
          source: 'code',
        },
      ],
    }),
    upsertRuleExact: jest.fn().mockResolvedValue({
      id: 'r_new',
      actionName: 'trip.apply_user_edit',
      handlerId: 'side_effect.financial_hold.book_flight_v1',
      params: { hold_ratio: 0.5 },
      updatedAt: new Date(),
    }),
  };
  const holdStore = new FinancialHoldStoreService();
  const sagaCompiler = new ActionGraphSagaCompilerService();

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ActionsController],
      providers: [
        {
          provide: ActionExecutionService,
          useValue: mockActionExecutionService,
        },
        {
          provide: FinancialHoldStoreService,
          useValue: holdStore,
        },
        {
          provide: ActionGraphSagaCompilerService,
          useValue: sagaCompiler,
        },
        {
          provide: SideEffectRuleSyncerService,
          useValue: mockSideEffectRuleSyncer,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /agent/actions/decision-rules/side-effect-params/rules/meta returns dropdown dictionary', async () => {
    const res = await request(app.getHttpServer())
      .get('/agent/actions/decision-rules/side-effect-params/rules/meta')
      .expect(200);
    expect(Array.isArray(res.body.action_names)).toBe(true);
    expect(Array.isArray(res.body.handler_ids)).toBe(true);
    expect(res.body.schema_version).toBe('side_effect_rule_meta_v1');
    expect(res.body.action_names.some((x: any) => x.value === 'trip.confirm_booking')).toBe(true);
  });

  it('GET /agent/actions/decision-rules/side-effect-params/rules/schema returns json schema', async () => {
    const res = await request(app.getHttpServer())
      .get('/agent/actions/decision-rules/side-effect-params/rules/schema')
      .query({
        action_name: 'trip.apply_user_edit',
        handler_id: 'side_effect.financial_hold.book_flight_v1',
      })
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.schema?.properties?.hold_ratio?.type).toBe('number');
  });

  it('GET /agent/actions/decision-rules/side-effect-params/rules/schema validates action-handler pair', async () => {
    const res = await request(app.getHttpServer())
      .get('/agent/actions/decision-rules/side-effect-params/rules/schema')
      .query({
        action_name: 'trip.confirm_booking',
        handler_id: 'side_effect.resource_lock.inventory_v1',
      })
      .expect(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('POST /agent/actions/decision-rules/side-effect-params/rules returns structured validation error', async () => {
    const res = await request(app.getHttpServer())
      .post('/agent/actions/decision-rules/side-effect-params/rules')
      .send({
        action_name: 'unknown.action',
        handler_id: 'unsupported.handler',
        params: { hold_ratio: 2 },
      })
      .expect(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error?.details)).toBe(true);
  });

  it('GET /agent/actions/registry returns action catalog', async () => {
    const res = await request(app.getHttpServer()).get('/agent/actions/registry').expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.actions)).toBe(true);
  });

  it('POST /agent/actions/mapping/simulate returns mapping result', async () => {
    const res = await request(app.getHttpServer())
      .post('/agent/actions/mapping/simulate')
      .send({ action_type: 'BOOK', target_type: 'FLIGHT' })
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.mapping.mapped_action_name).toBe('trip.apply_user_edit');
  });

  it('compensation policies CRUD endpoints work', async () => {
    const upsert = await request(app.getHttpServer())
      .post('/agent/actions/compensation-policies')
      .send({
        id: 'cp_001',
        sideEffectType: 'FINANCIAL_HOLD',
        compensationActionType: 'FINANCIAL_REFUND',
        enabled: true,
      })
      .expect(200);
    expect(upsert.body.ok).toBe(true);
    const list = await request(app.getHttpServer()).get('/agent/actions/compensation-policies').expect(200);
    expect(list.body.items.some((x: any) => x.id === 'cp_001')).toBe(true);
    const del = await request(app.getHttpServer()).delete('/agent/actions/compensation-policies/cp_001').expect(200);
    expect(del.body.ok).toBe(true);
  });

  it('compensation policy upsert is idempotent by business pair', async () => {
    await request(app.getHttpServer())
      .post('/agent/actions/compensation-policies')
      .send({
        id: 'cp_pair_001',
        sideEffectType: 'FINANCIAL_HOLD',
        compensationActionType: 'FINANCIAL_REFUND',
        enabled: true,
      })
      .expect(200);
    const second = await request(app.getHttpServer())
      .post('/agent/actions/compensation-policies')
      .send({
        id: 'cp_pair_002',
        sideEffectType: 'FINANCIAL_HOLD',
        compensationActionType: 'FINANCIAL_REFUND',
        enabled: false,
      })
      .expect(200);
    expect(second.body.ok).toBe(true);
    expect(second.body.item.id).toBe('cp_pair_001');
    const list = await request(app.getHttpServer()).get('/agent/actions/compensation-policies').expect(200);
    const pairRows = (list.body.items ?? []).filter(
      (x: any) =>
        x.sideEffectType === 'FINANCIAL_HOLD' && x.compensationActionTypeCanonical === 'FINANCIAL_REFUND',
    );
    expect(pairRows.length).toBe(1);
    expect(pairRows[0].enabled).toBe(false);
  });

  it('compensation policy list supports sideEffectType filter', async () => {
    await request(app.getHttpServer())
      .post('/agent/actions/compensation-policies')
      .send({
        id: 'cp_filter_fin_001',
        sideEffectType: 'FINANCIAL_HOLD',
        compensationActionType: 'FINANCIAL_REFUND',
        enabled: true,
      })
      .expect(200);
    await request(app.getHttpServer())
      .post('/agent/actions/compensation-policies')
      .send({
        id: 'cp_filter_inv_001',
        sideEffectType: 'INVENTORY_LOCK',
        compensationActionType: 'INVENTORY_RELEASE',
        enabled: true,
      })
      .expect(200);

    const onlyFinancial = await request(app.getHttpServer())
      .get('/agent/actions/compensation-policies?sideEffectType=FINANCIAL_HOLD')
      .expect(200);
    expect(
      (onlyFinancial.body.items ?? []).every((x: any) => x.sideEffectType === 'FINANCIAL_HOLD'),
    ).toBe(true);
  });

  it('compensation policy accepts legacy compensationActionType', async () => {
    const upsert = await request(app.getHttpServer())
      .post('/agent/actions/compensation-policies')
      .send({
        id: 'cp_legacy_001',
        sideEffectType: 'INVENTORY_LOCK',
        compensationActionType: 'BOOKING_CANCEL',
        enabled: true,
      })
      .expect(200);
    expect(upsert.body.ok).toBe(true);
    expect(upsert.body.item.compensationActionType).toBe('BOOKING_CANCEL');
    expect(upsert.body.item.compensationActionTypeCanonical).toBe('INVENTORY_RELEASE');
    expect(upsert.body.item.isLegacyNormalized).toBe(true);
    const list = await request(app.getHttpServer()).get('/agent/actions/compensation-policies').expect(200);
    const resolvedId = upsert.body.item.id;
    const found = (list.body.items ?? []).find((x: any) => x.id === resolvedId);
    expect(found?.compensationActionTypeCanonical).toBe('INVENTORY_RELEASE');
    expect(found?.isLegacyNormalized).toBe(true);
  });

  it('compensation policy rejects invalid sideEffectType-compensationActionType pair', async () => {
    const res = await request(app.getHttpServer())
      .post('/agent/actions/compensation-policies')
      .send({
        id: 'cp_invalid_pair_001',
        sideEffectType: 'FINANCIAL_HOLD',
        compensationActionType: 'RESOURCE_RELEASE',
        enabled: true,
      })
      .expect(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    expect(
      (res.body.error?.details ?? []).some((d: any) => d.field === 'compensationActionType'),
    ).toBe(true);
  });

  it('evidence requirements CRUD endpoints work', async () => {
    const upsert = await request(app.getHttpServer())
      .post('/agent/actions/evidence-requirements')
      .send({
        id: 'er_001',
        actionType: 'FINANCIAL_HOLD',
        evidenceType: 'EvidenceCard',
        required: true,
      })
      .expect(200);
    expect(upsert.body.ok).toBe(true);
    const list = await request(app.getHttpServer()).get('/agent/actions/evidence-requirements').expect(200);
    expect(list.body.items.some((x: any) => x.id === 'er_001')).toBe(true);
    const del = await request(app.getHttpServer()).delete('/agent/actions/evidence-requirements/er_001').expect(200);
    expect(del.body.ok).toBe(true);
  });

  it('evidence requirement accepts legacy business actionType', async () => {
    const upsert = await request(app.getHttpServer())
      .post('/agent/actions/evidence-requirements')
      .send({
        id: 'er_legacy_001',
        actionType: 'BOOKING_CANCEL',
        evidenceType: 'EvidenceCard',
        required: true,
      })
      .expect(200);
    expect(upsert.body.ok).toBe(true);
    expect(upsert.body.item.actionType).toBe('BOOKING_CANCEL');
  });

  it('retry policies CRUD endpoints work', async () => {
    const upsert = await request(app.getHttpServer())
      .post('/agent/actions/retry-policies')
      .send({
        id: 'rp_001',
        sideEffectType: 'FINANCIAL_HOLD',
        retryStrategy: 'exponential_backoff',
        maxRetry: 3,
        intervalMs: 2000,
        enabled: true,
      })
      .expect(200);
    expect(upsert.body.ok).toBe(true);
    const list = await request(app.getHttpServer()).get('/agent/actions/retry-policies').expect(200);
    expect(list.body.items.some((x: any) => x.id === 'rp_001')).toBe(true);
    const del = await request(app.getHttpServer()).delete('/agent/actions/retry-policies/rp_001').expect(200);
    expect(del.body.ok).toBe(true);
  });

  it('retry policy rejects invalid retryStrategy', async () => {
    const res = await request(app.getHttpServer())
      .post('/agent/actions/retry-policies')
      .send({
        id: 'rp_invalid_001',
        sideEffectType: 'FINANCIAL_HOLD',
        retryStrategy: 'random_retry',
        maxRetry: 3,
        intervalMs: 2000,
        enabled: true,
      })
      .expect(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    expect((res.body.error?.details ?? []).some((d: any) => d.field === 'retryStrategy')).toBe(true);
  });

  it('manual review queue patch and resolve endpoints work', async () => {
    const list = await request(app.getHttpServer()).get('/agent/actions/manual-review-queue?status=PENDING').expect(200);
    expect(list.body.ok).toBe(true);
    const id = list.body.items[0].queueId;
    const patch = await request(app.getHttpServer())
      .patch(`/agent/actions/manual-review-queue/${id}`)
      .send({ status: 'PROCESSING', comment: '已联系值班', operator: 'admin_01' })
      .expect(200);
    expect(patch.body.ok).toBe(true);
    expect(patch.body.item.status).toBe('PROCESSING');
    const resolve = await request(app.getHttpServer())
      .post(`/agent/actions/manual-review-queue/${id}/resolve`)
      .send({ resolution: '人工确认并转补偿', operator: 'admin_01' })
      .expect(200);
    expect(resolve.body.ok).toBe(true);
  });

  it('POST /agent/actions/commit returns service response', async () => {
    mockActionExecutionService.commit.mockResolvedValue({
      status: 'PARTIAL',
      message: 'High-risk actions require confirmation_token. Commit not executed for those actions.',
      accepted_actions: [],
      blocked_actions: [
        {
          action_id: 'a1',
          action_type: 'BOOK',
          target_type: 'FLIGHT',
          risk_level: 'HIGH',
          requires_confirmation: true,
          rejected_reason_code: 'HIGH_RISK_REQUIRES_CONFIRMATION_TOKEN',
        },
      ],
      rejected_reason_codes: ['HIGH_RISK_REQUIRES_CONFIRMATION_TOKEN'],
    });

    const response = await request(app.getHttpServer())
      .post('/agent/actions/commit')
      .send({
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
      })
      .expect(200);

    expect(response.body.status).toBe('PARTIAL');
    expect(response.body.rejected_reason_codes).toContain('HIGH_RISK_REQUIRES_CONFIRMATION_TOKEN');
    expect(mockActionExecutionService.commit).toHaveBeenCalledTimes(1);
  });

  it('POST /agent/actions/commit preserves evidence requirement context payload', async () => {
    mockActionExecutionService.commit.mockResolvedValue({
      status: 'PARTIAL',
      message: 'Action commit partially executed. Some actions were blocked.',
      accepted_actions: [],
      blocked_actions: [
        {
          action_id: 'a-e1',
          action_type: 'BOOK',
          target_type: 'FLIGHT',
          risk_level: 'LOW',
          requires_confirmation: false,
          rejected_reason_code: 'MISSING_REQUIRED_EVIDENCE',
          evidence_requirement_context: {
            required_action_type: 'FINANCIAL_HOLD',
            required_evidence_type: 'EvidenceCard',
            side_effect_kind: 'FINANCIAL_HOLD',
          },
        },
      ],
      rejected_reason_codes: ['MISSING_REQUIRED_EVIDENCE'],
    });

    const response = await request(app.getHttpServer())
      .post('/agent/actions/commit')
      .send({
        request_id: 'req-evidence-ctx',
        trip_id: 'trip-evidence-ctx',
        actions: [
          {
            action_id: 'a-e1',
            action_type: 'BOOK',
            target_type: 'FLIGHT',
            risk_level: 'LOW',
            requires_confirmation: false,
          },
        ],
      })
      .expect(200);

    expect(response.body.status).toBe('PARTIAL');
    expect(response.body.rejected_reason_codes).toContain('MISSING_REQUIRED_EVIDENCE');
    expect(response.body.blocked_actions?.[0]?.evidence_requirement_context).toEqual({
      required_action_type: 'FINANCIAL_HOLD',
      required_evidence_type: 'EvidenceCard',
      side_effect_kind: 'FINANCIAL_HOLD',
    });
    expect(mockActionExecutionService.commit).toHaveBeenCalledTimes(1);
  });

  it('GET /agent/actions/holds returns active holds with remaining_ms', async () => {
    jest.useFakeTimers();
    const now = new Date('2026-01-01T00:00:00.000Z').getTime();
    jest.setSystemTime(now);
    await holdStore.upsert({
      hold_id: 'hold_a1',
      action_id: 'a1',
      action_name: 'trip.apply_user_edit',
      trip_id: 'trip-1',
      request_id: 'req-1',
      expires_at: new Date(now + 10_000).toISOString(),
    });

    const res = await request(app.getHttpServer()).get('/agent/actions/holds?trip_id=trip-1').expect(200);
    expect(res.body.trip_id).toBe('trip-1');
    expect(Array.isArray(res.body.holds)).toBe(true);
    expect(res.body.holds[0].hold_id).toBe('hold_a1');
    expect(res.body.holds[0].type).toBe('FINANCIAL_HOLD');
    expect(res.body.holds[0].remaining_ms).toBeGreaterThan(0);
    jest.useRealTimers();
  });

  it('POST /agent/actions/holds/expire deletes a hold', async () => {
    jest.useFakeTimers();
    const now = new Date('2026-01-01T00:00:00.000Z').getTime();
    jest.setSystemTime(now);
    await holdStore.upsert({
      hold_id: 'hold_exp_1',
      action_id: 'a1',
      action_name: 'trip.apply_user_edit',
      trip_id: 'trip-1',
      request_id: 'req-1',
      expires_at: new Date(now + 10_000).toISOString(),
    });
    expect(await holdStore.get('hold_exp_1')).toBeTruthy();

    const res = await request(app.getHttpServer())
      .post('/agent/actions/holds/expire')
      .send({ hold_id: 'hold_exp_1' })
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.expired).toBe(true);
    expect(await holdStore.get('hold_exp_1')).toBeUndefined();
    jest.useRealTimers();
  });

  it('POST /agent/actions/holds/refresh-preview calls preview and returns comparison', async () => {
    mockActionExecutionService.preview.mockResolvedValue({
      status: 'OK',
      accepted_actions: [{ action_id: 'a1' }],
      action_previews: [{ action_id: 'a1', status: 'feasible', preconditions: [], context_signature: 'sha256:x' }],
      requires_confirmation_count: 0,
      high_risk_count: 0,
    });

    const res = await request(app.getHttpServer())
      .post('/agent/actions/holds/refresh-preview')
      .send({
        request_id: 'req-1',
        trip_id: 'trip-1',
        execution_mode: 'AUTO',
        action: {
          action_id: 'a1',
          action_type: 'BOOK',
          target_type: 'FLIGHT',
          risk_level: 'LOW',
          requires_confirmation: false,
          preview_snapshot: { shadow_delta: { resources: { budget: { current: 2000, delta: -500, after: 1500, currency: 'USD' } } } },
        },
      })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.preview.status).toBe('OK');
    expect(res.body.comparison.original_snapshot).toBeTruthy();
    expect(res.body.comparison.recomputed_assessment.action_id).toBe('a1');
    expect(mockActionExecutionService.preview).toHaveBeenCalledTimes(1);
    expect(mockActionExecutionService.preview).toHaveBeenCalledWith(
      expect.objectContaining({ execution_mode: 'AUTO' }),
    );
  });

  it('POST /agent/actions/graph/compile returns staged execution plan', async () => {
    const now = new Date().toISOString();
    const res = await request(app.getHttpServer())
      .post('/agent/actions/graph/compile')
      .send({
        graphId: 'graph_001',
        decisionId: 'decision_001',
        createdAt: now,
        contextSignature: {
          signatureId: 'sha256:s1',
          physicalHash: 'sha256:p1',
          resourceHash: 'sha256:r1',
          policyVersion: 'policy-lab:v1',
          generatedAt: now,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
        nodes: [
          {
            nodeId: 'A',
            actionType: 'ROUTE_RECOMPUTE',
            handlerId: 'check.budget',
            input: {},
            riskLevel: 'LOW',
            idempotencyKey: 'idem-a',
          },
          {
            nodeId: 'B',
            actionType: 'BOOKING_HOLD',
            handlerId: 'inventory.lock.hotel',
            input: {},
            riskLevel: 'HIGH',
            idempotencyKey: 'idem-b',
            compensationHandlerId: 'inventory.release.hotel',
          },
          {
            nodeId: 'C',
            actionType: 'BOOKING_COMMIT',
            handlerId: 'booking.commit.hotel',
            input: {},
            riskLevel: 'HIGH',
            idempotencyKey: 'idem-c',
            compensationHandlerId: 'booking.rollback.hotel',
          },
          {
            nodeId: 'D',
            actionType: 'NOTIFICATION_SEND',
            handlerId: 'notify.user',
            input: {},
            riskLevel: 'LOW',
            idempotencyKey: 'idem-d',
            isIrreversible: true,
          },
        ],
        edges: [
          { from: 'A', to: 'B', dependencyType: 'MUST_COMPLETE_BEFORE' },
          { from: 'B', to: 'C', dependencyType: 'MUST_COMPLETE_BEFORE' },
          { from: 'C', to: 'D', dependencyType: 'MUST_COMPLETE_BEFORE' },
        ],
      })
      .expect(200);

    expect(res.body.valid).toBe(true);
    expect(res.body.plan).toBeTruthy();
    expect(Array.isArray(res.body.plan.stages)).toBe(true);
    expect(res.body.plan.stages.map((s: any) => s.stageId)).toEqual(['dry_run', 'lock', 'commit', 'irreversible']);
  });

  it('POST /agent/actions/graph/compile rejects unsupported actionType with structured error', async () => {
    const now = new Date().toISOString();
    const res = await request(app.getHttpServer())
      .post('/agent/actions/graph/compile')
      .send({
        graphId: 'graph_invalid_action_type',
        decisionId: 'decision_invalid_action_type',
        createdAt: now,
        contextSignature: {
          signatureId: 'sha256:s1',
          physicalHash: 'sha256:p1',
          resourceHash: 'sha256:r1',
          policyVersion: 'policy-lab:v1',
          generatedAt: now,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
        nodes: [
          {
            nodeId: 'A',
            actionType: 'CHECK_BUDGET',
            handlerId: 'check.budget',
            input: {},
            riskLevel: 'LOW',
            idempotencyKey: 'idem-a',
          },
        ],
        edges: [],
      })
      .expect(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    expect(
      (res.body.error?.details ?? []).some((d: any) => String(d.field).includes('actionType')),
    ).toBe(true);
  });
});
