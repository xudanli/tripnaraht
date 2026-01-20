// src/agent/training/services/trajectory-validator.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { TrajectoryValidatorService } from './trajectory-validator.service';
import { GateResult } from '../../interfaces/trip-plan.interface';
import { ApprovalStatus } from '@prisma/client';
import { ComplianceResult, ExecutionResult } from '../interfaces/trajectory.interface';

describe('TrajectoryValidatorService', () => {
  let service: TrajectoryValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TrajectoryValidatorService],
    }).compile();

    service = module.get<TrajectoryValidatorService>(TrajectoryValidatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateTrajectory', () => {
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

    it('should validate trajectory with ALLOW gate result', async () => {
      const result = await service.validateTrajectory(
        validGateResult,
        validComplianceResult,
      );

      expect(result.isValid).toBe(true);
      expect(result.score).toBeGreaterThan(0);
      expect(result.reasons).toBeDefined();
    });

    it('should reject trajectory with BLOCK gate result', async () => {
      const blockGateResult: GateResult = {
        gate_result: 'BLOCK',
        violations: [
          {
            type: 'SAFETY',
            severity: 'HARD',
            detail: 'Critical safety issue',
          },
        ],
        required_adjustments: [],
        confidence: 0.5,
      };

      const result = await service.validateTrajectory(
        blockGateResult,
        validComplianceResult,
      );

      expect(result.isValid).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reasons).toContain('Gate BLOCK');
    });

    it('should reduce score for ADJUST_REQUIRED gate result', async () => {
      const adjustGateResult: GateResult = {
        gate_result: 'ADJUST_REQUIRED',
        violations: [],
        required_adjustments: [
          {
            action: 'REPLACE_POI',
            why: 'POI not accessible',
          },
        ],
        confidence: 0.7,
      };

      const result = await service.validateTrajectory(
        adjustGateResult,
        validComplianceResult,
      );

      expect(result.isValid).toBe(true);
      expect(result.score).toBeLessThan(1.0);
      expect(result.reasons).toContain('Gate ADJUST_REQUIRED');
    });

    it('should reject trajectory with CRITICAL risk warnings', async () => {
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

      const result = await service.validateTrajectory(
        validGateResult,
        criticalComplianceResult,
      );

      expect(result.isValid).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reasons).toContain('CRITICAL risk warnings');
    });

    it('should reject trajectory with REJECTED user approval', async () => {
      const result = await service.validateTrajectory(
        validGateResult,
        validComplianceResult,
        ApprovalStatus.REJECTED,
      );

      expect(result.isValid).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reasons).toContain('User rejected');
    });

    it('should increase score for APPROVED user approval', async () => {
      const result = await service.validateTrajectory(
        validGateResult,
        validComplianceResult,
        ApprovalStatus.APPROVED,
      );

      expect(result.isValid).toBe(true);
      expect(result.score).toBeGreaterThan(0.9); // 因为 APPROVED 会加分（但会被限制在 1.0）
      expect(result.score).toBeLessThanOrEqual(1.0);
      expect(result.reasons).toContain('User approved');
    });

    it('should reject trajectory with failed execution', async () => {
      const failedExecution: ExecutionResult = {
        success: false,
        error: 'Execution failed',
      };

      const result = await service.validateTrajectory(
        validGateResult,
        validComplianceResult,
        undefined,
        failedExecution,
      );

      expect(result.isValid).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reasons).toContain('Execution failed');
    });

    it('should accept trajectory with successful execution', async () => {
      const successExecution: ExecutionResult = {
        success: true,
      };

      const result = await service.validateTrajectory(
        validGateResult,
        validComplianceResult,
        ApprovalStatus.APPROVED,
        successExecution,
      );

      expect(result.isValid).toBe(true);
      expect(result.score).toBeGreaterThan(0.9); // 因为 APPROVED 和 execution 都会加分（但会被限制在 1.0）
      expect(result.score).toBeLessThanOrEqual(1.0);
      expect(result.reasons).toContain('Execution succeeded');
    });

    it('should keep score within 0-1 range', async () => {
      const result = await service.validateTrajectory(
        validGateResult,
        validComplianceResult,
        ApprovalStatus.APPROVED,
        { success: true },
      );

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });
});
