// src/agent/training/training.integration.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { TrajectoryCollectionService } from './services/trajectory-collection.service';
import { TrajectoryValidatorService } from './services/trajectory-validator.service';
import { RewardSignalExtractorService } from './services/reward-signal-extractor.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GateResult } from '../interfaces/trip-plan.interface';
import { ApprovalStatus } from '@prisma/client';
import { ComplianceResult, ExecutionResult } from './interfaces/trajectory.interface';

/**
 * 集成测试：测试完整的轨迹收集和验证流程
 * 
 * 注意：这些测试需要数据库连接，在实际运行前需要：
 * 1. 运行数据库迁移
 * 2. 配置测试数据库
 * 3. 清理测试数据
 */
describe('TrajectoryCollectionService Integration', () => {
  let collectionService: TrajectoryCollectionService;
  let validatorService: TrajectoryValidatorService;
  let prismaService: PrismaService;
  let module: TestingModule;

  const validGateResult: GateResult = {
    gate_result: 'ALLOW',
    violations: [],
    required_adjustments: [],
    confidence: 0.9,
  };

  const validComplianceResult: ComplianceResult = {
    risk_warnings: [],
    disclaimers: [],
    required_confirmations: [],
  };

  beforeAll(async () => {
    // 注意：实际集成测试需要真实的数据库连接
    // 这里使用 mock，实际应该配置测试数据库
    const mockPrismaService = {
      validatedTrajectory: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const mockRewardExtractorService = {
      extractFromApproval: jest.fn().mockReturnValue([
        { type: 'USER_APPROVAL', value: 1.0, timestamp: '2026-01-20T00:00:00Z' },
      ]),
      extractFromExecution: jest.fn().mockReturnValue([
        { type: 'EXECUTION_SUCCESS', value: 0.8, timestamp: '2026-01-20T00:00:00Z' },
      ]),
      mergeSignals: jest.fn((...arrays) => arrays.flat()),
      calculateTotalReward: jest.fn((signals) =>
        signals.reduce((sum: number, s: any) => sum + s.value, 0),
      ),
    };

    module = await Test.createTestingModule({
      providers: [
        TrajectoryCollectionService,
        TrajectoryValidatorService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: RewardSignalExtractorService,
          useValue: mockRewardExtractorService,
        },
      ],
    }).compile();

    collectionService = module.get<TrajectoryCollectionService>(
      TrajectoryCollectionService,
    );
    validatorService = module.get<TrajectoryValidatorService>(
      TrajectoryValidatorService,
    );
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await module.close();
  });

  describe('完整轨迹收集流程', () => {
    it('应该能够完成从收集到验证的完整流程', async () => {
      const requestId = `req_integration_${Date.now()}`;
      const trajectoryId = `traj_${requestId}_${Date.now()}`;

      // 1. 收集轨迹
      (prismaService.validatedTrajectory.create as jest.Mock).mockResolvedValue({
        id: 'test-id',
        trajectoryId,
        requestId,
        validationStatus: 'VALIDATED',
        validationScore: 0.9,
        validationReasons: ['Gate ALLOW'],
        plan: { request_id: requestId, days: [] },
        decisionTrace: [],
        researchData: {},
        gateResult: validGateResult,
        complianceResult: validComplianceResult,
        totalReward: 0,
        rewardSignals: [],
        userApproval: null,
        executionResult: null,
        modelVersion: 'v1.0',
        countryCode: null,
        timestamp: new Date(),
        usedForTraining: false,
        trainingBatchId: null,
        usedForTrainingCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const collectResult = await collectionService.collectTrajectory({
        requestId,
        plan: { request_id: requestId, days: [] },
        decisionTrace: [],
        researchData: {},
        gateResult: validGateResult,
        complianceResult: validComplianceResult,
      });

      expect(collectResult.trajectoryId).toBeDefined();
      expect(collectResult.status).toBe('VALIDATED');

      // 2. 更新用户审批
      (prismaService.validatedTrajectory.findUnique as jest.Mock).mockResolvedValue({
        trajectoryId,
        requestId,
        gateResult: validGateResult,
        complianceResult: validComplianceResult,
        userApproval: null,
      });

      (prismaService.validatedTrajectory.update as jest.Mock).mockResolvedValue({
        trajectoryId,
        userApproval: ApprovalStatus.APPROVED,
        validationStatus: 'VALIDATED',
        validationScore: 1.0,
      });

      await collectionService.updateTrajectoryWithApproval(
        trajectoryId,
        ApprovalStatus.APPROVED,
      );

      // 3. 更新执行结果
      (prismaService.validatedTrajectory.findUnique as jest.Mock).mockResolvedValue({
        trajectoryId,
        requestId,
        gateResult: validGateResult,
        complianceResult: validComplianceResult,
        userApproval: ApprovalStatus.APPROVED,
      });

      (prismaService.validatedTrajectory.update as jest.Mock).mockResolvedValue({
        trajectoryId,
        executionResult: { success: true },
        validationStatus: 'VALIDATED',
        validationScore: 1.0,
      });

      const executionResult: ExecutionResult = {
        success: true,
      };

      await collectionService.updateTrajectoryWithExecution(
        trajectoryId,
        executionResult,
      );

      // 验证所有步骤都执行成功
      expect(prismaService.validatedTrajectory.create).toHaveBeenCalled();
      expect(prismaService.validatedTrajectory.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('轨迹验证集成', () => {
    it('应该能够验证包含所有信息的轨迹', async () => {
      const validationResult = await validatorService.validateTrajectory(
        validGateResult,
        validComplianceResult,
        ApprovalStatus.APPROVED,
        { success: true },
      );

      expect(validationResult.isValid).toBe(true);
      expect(validationResult.score).toBeGreaterThan(0);
      expect(validationResult.reasons.length).toBeGreaterThan(0);
    });

    it('应该拒绝包含 CRITICAL 风险的轨迹', async () => {
      const criticalComplianceResult: ComplianceResult = {
        risk_warnings: [
          {
            level: 'CRITICAL',
            category: 'SAFETY',
            message: 'Critical safety risk',
            requires_user_confirmation: true,
          },
        ],
        disclaimers: [],
        required_confirmations: [],
      };

      const validationResult = await validatorService.validateTrajectory(
        validGateResult,
        criticalComplianceResult,
        ApprovalStatus.APPROVED,
        { success: true },
      );

      expect(validationResult.isValid).toBe(false);
      expect(validationResult.score).toBe(0);
    });
  });
});
