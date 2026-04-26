import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { ActionsController } from './actions.controller';
import { ActionExecutionService } from './services/action-execution.service';
import { FinancialHoldStoreService } from './services/financial-hold-store.service';

describe('ActionsController (integration)', () => {
  let app: INestApplication;
  const mockActionExecutionService = {
    preview: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
  };
  const holdStore = new FinancialHoldStoreService();

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
});
