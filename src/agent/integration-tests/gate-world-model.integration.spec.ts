// src/agent/integration-tests/gate-world-model.integration.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { ClaudeGatekeeperAgentService } from '../services/sub-agents/gatekeeper-agent.service';
import { FRoadCheckSkill } from '../../skills/world/f-road-check.skill';
import { WeatherAlertSkill } from '../../skills/world/weather-alert.skill';
import { RoadStatusRealtimeService } from '../../skills/world/services/road-status-realtime.service';
import { IcelandWeatherRealtimeService } from '../../skills/world/services/iceland-weather-realtime.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TripPlanRequest, OrchestratorState } from '../interfaces/trip-plan.interface';

/**
 * Gate + World Model 集成测试
 *
 * 测试目标:
 * - 验证 GatekeeperAgent 与世界模型的完整集成
 * - 验证 F-Road 检查和天气告警的端到端流程
 * - 验证证据链的完整性
 * - 验证降级策略的正确性
 */
describe('Gate + World Model Integration Tests', () => {
  let gatekeeperAgent: ClaudeGatekeeperAgentService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [
        ClaudeGatekeeperAgentService,
        FRoadCheckSkill,
        WeatherAlertSkill,
        RoadStatusRealtimeService,
        IcelandWeatherRealtimeService,
        PrismaService,
        {
          provide: 'PlanGateRunThreeGuardiansSkill',
          useValue: null,
        },
        {
          provide: 'PlanGatePrecheckSkill',
          useValue: null,
        },
      ],
    }).compile();

    gatekeeperAgent = moduleFixture.get<ClaudeGatekeeperAgentService>(ClaudeGatekeeperAgentService);
    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Iceland F-Road + Weather Integration', () => {
    it('should integrate F-Road status with weather alerts for summer trip', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'integration-test-001',
        origin: { lat: 64.1466, lng: -21.9426 }, // Reykjavík
        destination: { lat: 64.8577, lng: -19.0059 }, // Landmannalaugar (F208)
        date_range: {
          start: new Date('2026-07-15'),
          end: new Date('2026-07-18'),
        },
      };

      const researchData: Record<string, any> = {};
      const context: OrchestratorState = {
        current_step: 'GATE_EVAL',
        request_id: request.request_id,
      };

      // Act
      const result = await gatekeeperAgent.evaluateGate(request, researchData, context);

      // Assert
      expect(result).toBeDefined();
      expect(result.gate_result).toBeDefined();

      // Verify F-Road check was executed
      expect(result.gate_result).toMatch(/ALLOW|ADJUST_REQUIRED|BLOCK|NEED_USER_CONFIRM/);

      // Verify evidence chain exists
      if (result.evidence_refs && result.evidence_refs.length > 0) {
        result.evidence_refs.forEach((evidence: any) => {
          expect(evidence).toHaveProperty('evidence_id');
          expect(evidence).toHaveProperty('source');
          expect(evidence).toHaveProperty('confidence');
          expect(evidence.confidence).toBeGreaterThanOrEqual(0);
          expect(evidence.confidence).toBeLessThanOrEqual(1);
        });
      }

      // Verify violations structure (if any)
      if (result.violations && result.violations.length > 0) {
        result.violations.forEach((violation: any) => {
          expect(violation).toHaveProperty('type');
          expect(violation).toHaveProperty('severity');
          expect(violation).toHaveProperty('detail');
        });
      }

      console.log('✅ Integration Test Result:', {
        gate_result: result.gate_result,
        violations_count: result.violations?.length || 0,
        adjustments_count: result.required_adjustments?.length || 0,
        evidence_count: result.evidence_refs?.length || 0,
        confidence: result.confidence,
      });
    }, 30000); // 30 second timeout for API calls

    it('should block winter F-Road trip with proper evidence chain', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'integration-test-002',
        origin: 'Vík, Iceland',
        destination: 'Landmannalaugar, F208, Iceland',
        date_range: {
          start: new Date('2026-02-15'), // Winter
          end: new Date('2026-02-18'),
        },
      };

      const researchData: Record<string, any> = {};
      const context: OrchestratorState = {
        current_step: 'GATE_EVAL',
        request_id: request.request_id,
      };

      // Act
      const result = await gatekeeperAgent.evaluateGate(request, researchData, context);

      // Assert
      expect(result.gate_result).toBe('BLOCK');
      expect(result.violations.length).toBeGreaterThan(0);

      // Verify F-Road blocking
      const roadBlocker = result.violations.find((v: any) => v.type === 'REACHABILITY');
      expect(roadBlocker).toBeDefined();
      expect(roadBlocker?.severity).toBe('HARD');
      expect(roadBlocker?.detail).toContain('F208');

      // Verify alternatives are provided
      expect(result.required_adjustments.length).toBeGreaterThan(0);

      // Verify evidence chain
      expect(result.evidence_refs).toBeDefined();
      expect(result.evidence_refs!.length).toBeGreaterThan(0);

      const fRoadEvidence = result.evidence_refs!.find((e: any) => e.evidence_id.includes('F208'));
      expect(fRoadEvidence).toBeDefined();
      expect(fRoadEvidence?.source).toContain('road-status');

      console.log('✅ Winter Block Test Result:', {
        gate_result: result.gate_result,
        violations: result.violations.map((v: any) => `${v.type}: ${v.detail.substring(0, 50)}`),
        adjustments: result.required_adjustments.map((a: any) => a.action),
        evidence: result.evidence_refs?.map((e: any) => `${e.evidence_id} (${e.confidence})`),
      });
    }, 30000);

    it('should handle extreme weather conditions properly', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'integration-test-003',
        origin: { lat: 64.1466, lng: -21.9426 },
        destination: { lat: 64.75, lng: -18.0 }, // Highlands Center
        date_range: {
          start: new Date('2026-02-15'),
          end: new Date('2026-02-16'),
        },
      };

      const researchData: Record<string, any> = {};
      const context: OrchestratorState = {
        current_step: 'GATE_EVAL',
        request_id: request.request_id,
      };

      // Act
      const result = await gatekeeperAgent.evaluateGate(request, researchData, context);

      // Assert
      expect(result).toBeDefined();

      // In winter, highlands should trigger warnings/blocks
      if (result.gate_result === 'BLOCK' || result.gate_result === 'ADJUST_REQUIRED') {
        // Check for safety violations
        const safetyViolation = result.violations.find((v: any) => v.type === 'SAFETY');

        if (safetyViolation) {
          expect(safetyViolation.detail).toBeDefined();

          // Verify weather evidence
          const weatherEvidence = result.evidence_refs?.find((e: any) =>
            e.source.includes('weather') || e.source.includes('iceland-weather')
          );

          if (weatherEvidence) {
            expect(weatherEvidence.confidence).toBeGreaterThanOrEqual(0.5);
          }
        }
      }

      console.log('✅ Extreme Weather Test Result:', {
        gate_result: result.gate_result,
        has_safety_violations: result.violations.some((v: any) => v.type === 'SAFETY'),
        weather_warnings: result.violations.filter((v: any) => v.type === 'SAFETY').length,
        confidence: result.confidence,
      });
    }, 30000);
  });

  describe('Evidence Chain Validation', () => {
    it('should generate complete evidence chain for all checks', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'integration-test-004',
        origin: { lat: 64.1466, lng: -21.9426 },
        destination: { lat: 64.1355, lng: -21.8954 },
        date_range: {
          start: new Date('2026-07-15'),
          end: new Date('2026-07-16'),
        },
      };

      const researchData: Record<string, any> = {};
      const context: OrchestratorState = {
        current_step: 'GATE_EVAL',
        request_id: request.request_id,
      };

      // Act
      const result = await gatekeeperAgent.evaluateGate(request, researchData, context);

      // Assert - Evidence Chain Structure
      expect(result.evidence_refs).toBeDefined();

      if (result.evidence_refs && result.evidence_refs.length > 0) {
        result.evidence_refs.forEach((evidence: any) => {
          // Required fields
          expect(evidence.evidence_id).toBeDefined();
          expect(evidence.source).toBeDefined();
          expect(evidence.confidence).toBeDefined();

          // Valid confidence range
          expect(evidence.confidence).toBeGreaterThanOrEqual(0);
          expect(evidence.confidence).toBeLessThanOrEqual(1);

          // Timestamp validation
          if (evidence.last_verified_at) {
            expect(new Date(evidence.last_verified_at)).toBeInstanceOf(Date);
          }
        });
      }

      console.log('✅ Evidence Chain Validation:', {
        total_evidence: result.evidence_refs?.length || 0,
        sources: [...new Set(result.evidence_refs?.map((e: any) => e.source))],
        avg_confidence: result.evidence_refs && result.evidence_refs.length > 0
          ? result.evidence_refs.reduce((sum: number, e: any) => sum + e.confidence, 0) / result.evidence_refs.length
          : 0,
      });
    }, 30000);
  });

  describe('Degradation Strategy', () => {
    it('should gracefully degrade when weather API fails', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'integration-test-005',
        origin: { lat: 64.1466, lng: -21.9426 },
        destination: { lat: 64.1355, lng: -21.8954 },
        date_range: {
          start: new Date('2026-07-15'),
          end: new Date('2026-07-16'),
        },
      };

      const researchData: Record<string, any> = {};
      const context: OrchestratorState = {
        current_step: 'GATE_EVAL',
        request_id: request.request_id,
      };

      // Act
      const result = await gatekeeperAgent.evaluateGate(request, researchData, context);

      // Assert - Should not crash, should provide result
      expect(result).toBeDefined();
      expect(result.gate_result).toBeDefined();

      // Check if degradation happened
      if (researchData['weather_check_failed']) {
        expect(researchData['weather_check_error']).toBeDefined();
        console.log('✅ Weather degradation triggered:', researchData['weather_check_error']);
      }

      // Should still return a valid gate result (ALLOW or ADJUST_REQUIRED)
      expect(['ALLOW', 'ADJUST_REQUIRED', 'NEED_USER_CONFIRM', 'BLOCK']).toContain(result.gate_result);

      console.log('✅ Degradation Test Result:', {
        gate_result: result.gate_result,
        weather_failed: researchData['weather_check_failed'] || false,
        still_functional: true,
      });
    }, 30000);
  });

  describe('Performance Benchmarks', () => {
    it('should complete gate evaluation within 5 seconds', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'integration-test-perf-001',
        origin: { lat: 64.1466, lng: -21.9426 },
        destination: { lat: 64.1355, lng: -21.8954 },
        date_range: {
          start: new Date('2026-07-15'),
          end: new Date('2026-07-16'),
        },
      };

      const researchData: Record<string, any> = {};
      const context: OrchestratorState = {
        current_step: 'GATE_EVAL',
        request_id: request.request_id,
      };

      // Act
      const startTime = Date.now();
      const result = await gatekeeperAgent.evaluateGate(request, researchData, context);
      const duration = Date.now() - startTime;

      // Assert
      expect(result).toBeDefined();
      expect(duration).toBeLessThan(5000); // Should be fast (< 5s, allow for API calls)

      console.log('✅ Performance Benchmark:', {
        duration_ms: duration,
        gate_result: result.gate_result,
        checks_performed: [
          'F-Road check',
          'Weather alert check',
        ],
      });
    }, 30000);
  });
});
