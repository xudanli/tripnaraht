import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AgentOpsAdminController } from './agent-ops-admin.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { SideEffectRuleSyncerService } from '../../agent/services/side-effect-rule-syncer.service';
import { AgentActionLogService } from '../../agent/services/agent-action-log.service';
import { SideEffectRegistryService } from '../../agent/services/side-effect-registry.service';
import { ActionExecutionService } from '../../agent/services/action-execution.service';
import { ActionRegistryService } from '../../agent/services/action-registry.service';
import { FinancialHoldStoreService } from '../../agent/services/financial-hold-store.service';
import { HardTruthRuleResolverService } from '../../agent/services/hard-truth-rule-resolver.service';
import { AdminActivityLogService } from '../services/admin-activity-log.service';
import { AdminQualityMarkService } from '../services/admin-quality-mark.service';
import { AutoDriftSamplerService } from '../services/auto-drift-sampler.service';
import { SagaSideEffectReplayService } from '../services/saga-side-effect-replay.service';
import { AdminStrictAuthGuard } from '../guards/admin-strict-auth.guard';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

describe('AgentOpsAdminController (integration)', () => {
  let app: INestApplication;
  const listPaginated = jest.fn();
  const agentActionLogMock: any = {
    listPaginated,
    isEnabled: jest.fn().mockReturnValue(true),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AgentOpsAdminController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            isDbConnected: jest.fn().mockReturnValue(true),
            decisionRuleConfig: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
        { provide: SideEffectRuleSyncerService, useValue: {} },
        { provide: AgentActionLogService, useValue: agentActionLogMock },
        { provide: SideEffectRegistryService, useValue: {} },
        { provide: ActionExecutionService, useValue: {} },
        { provide: ActionRegistryService, useValue: {} },
        { provide: FinancialHoldStoreService, useValue: {} },
        { provide: HardTruthRuleResolverService, useValue: {} },
        { provide: AdminActivityLogService, useValue: {} },
        { provide: AdminQualityMarkService, useValue: {} },
        { provide: AutoDriftSamplerService, useValue: {} },
        { provide: SagaSideEffectReplayService, useValue: {} },
        { provide: JwtService, useValue: { verify: jest.fn().mockReturnValue({ sub: 'admin-1' }) } },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((k: string) => (k === 'ADMIN_GOD_API_KEY' ? 'test-god-key' : undefined)),
          },
        },
        { provide: AdminStrictAuthGuard, useValue: { canActivate: () => true } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    listPaginated.mockResolvedValue({ rows: [], total: 0 });
  });

  it('applies combined saga log filters and keeps filtered pagination response', async () => {
    listPaginated.mockResolvedValue({
      rows: [
        {
          id: 'log-1',
          createdAt: new Date('2026-01-02T10:00:00.000Z'),
          payload: {
            evidence_requirement_context: {
              required_action_type: 'FINANCIAL_HOLD',
              required_evidence_type: 'EvidenceCard',
              side_effect_kind: 'FINANCIAL_HOLD',
            },
          },
        },
      ],
      total: 1,
    });

    const res = await request(app.getHttpServer())
      .get('/admin/saga/logs')
      .set('x-admin-god-key', 'test-god-key')
      .query({
        status: 'FAILED',
        tripId: 'trip-42',
        hasEvidenceRequirementContext: true,
        hasApplyFailed: true,
        hasCompensationFailed: false,
        minRetryCount: 2,
        take: 20,
        skip: 0,
      })
      .expect(200);

    expect(listPaginated).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        tripId: 'trip-42',
        hasEvidenceRequirementContext: expect.anything(),
        hasApplyFailed: expect.anything(),
        hasCompensationFailed: expect.anything(),
        minRetryCount: 2,
        take: 20,
        skip: 0,
      }),
    );
    expect(res.body.total).toBe(1);
    expect(res.body.rows[0].evidence_requirement_context.required_evidence_type).toBe('EvidenceCard');
  });

  it('returns aggregated saga metrics for filtered sample', async () => {
    listPaginated.mockResolvedValue({
      rows: [
        {
          id: 'log-1',
          createdAt: new Date('2026-01-02T10:00:00.000Z'),
          payload: {
            realized_state: {
              side_effects_ledger: [
                { kind: 'FINANCIAL_HOLD', status: 'APPLY_FAILED', retry_count: 2 },
                { kind: 'FINANCIAL_HOLD', status: 'COMPENSATION_FAILED', retry_count: 3 },
              ],
            },
          },
        },
        {
          id: 'log-2',
          createdAt: new Date('2026-01-03T10:00:00.000Z'),
          payload: {
            realized_state: {
              side_effects_ledger: [
                { kind: 'INVENTORY_LOCK', status: 'MANUAL_INTERVENTION_REQUIRED', retry_count: 0 },
              ],
            },
          },
        },
      ],
      total: 2,
    });

    const res = await request(app.getHttpServer())
      .get('/admin/saga/logs/metrics')
      .set('x-admin-god-key', 'test-god-key')
      .query({
        status: 'FAILED',
        since: '2026-01-01T00:00:00.000Z',
        until: '2026-01-31T23:59:59.000Z',
        take: 100,
        hasApplyFailed: true,
      })
      .expect(200);
    const cachedRes = await request(app.getHttpServer())
      .get('/admin/saga/logs/metrics')
      .set('x-admin-god-key', 'test-god-key')
      .query({
        status: 'FAILED',
        since: '2026-01-01T00:00:00.000Z',
        until: '2026-01-31T23:59:59.000Z',
        take: 100,
        hasApplyFailed: true,
      })
      .expect(200);

    expect(listPaginated).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        createdAtFrom: expect.any(Date),
        createdAtTo: expect.any(Date),
        hasApplyFailed: 'true',
        take: 100,
        skip: 0,
      }),
    );
    expect(res.body.ok).toBe(true);
    expect(res.body.cache_hit).toBe(false);
    expect(res.body.sampled_logs).toBe(2);
    expect(res.body.overview.with_apply_failed_count).toBe(1);
    expect(res.body.retry_distribution['3-5']).toBe(1);
    expect(Array.isArray(res.body.daily_trend)).toBe(true);
    expect(res.body.daily_trend.map((d: any) => d.date)).toEqual(
      expect.arrayContaining(['2026-01-02', '2026-01-03']),
    );
    expect(res.body.filters.retryStrategy).toBeNull();
    expect(res.body.by_strategy_dimension['FINANCIAL_HOLD::none'].compensation_failed).toBe(1);
    expect(res.body.by_side_effect_type.FINANCIAL_HOLD.compensation_failed).toBe(1);
    expect(cachedRes.body.cache_hit).toBe(true);
    expect(listPaginated).toHaveBeenCalledTimes(1);
  });

  it('keeps total=0 with multi-filters and minRetryCount=0', async () => {
    listPaginated.mockResolvedValue({
      rows: [],
      total: 0,
    });

    const res = await request(app.getHttpServer())
      .get('/admin/saga/logs')
      .set('x-admin-god-key', 'test-god-key')
      .query({
        status: 'FAILED',
        tripId: 'trip-empty',
        hasApplyFailed: true,
        hasCompensationFailed: true,
        hasManualInterventionRequired: true,
        minRetryCount: 0,
        take: 20,
        skip: 0,
      })
      .expect(200);

    expect(listPaginated).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        tripId: 'trip-empty',
        hasApplyFailed: expect.anything(),
        hasCompensationFailed: expect.anything(),
        hasManualInterventionRequired: expect.anything(),
        minRetryCount: 0,
        take: 20,
        skip: 0,
      }),
    );
    expect(res.body.total).toBe(0);
    expect(res.body.rows).toEqual([]);
  });
});
