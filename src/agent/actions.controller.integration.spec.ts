import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { ActionsController } from './actions.controller';
import { ActionExecutionService } from './services/action-execution.service';

describe('ActionsController (integration)', () => {
  let app: INestApplication;
  const mockActionExecutionService = {
    preview: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ActionsController],
      providers: [
        {
          provide: ActionExecutionService,
          useValue: mockActionExecutionService,
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
});
