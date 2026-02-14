// src/agent/services/sub-agents/gatekeeper-agent.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ClaudeGatekeeperAgentService } from './gatekeeper-agent.service';
import { FRoadCheckSkill } from '../../../skills/world/f-road-check.skill';
import { WeatherAlertSkill } from '../../../skills/world/weather-alert.skill';
import { PlanGateRunThreeGuardiansSkill } from '../../../skills/plan/gate/plan-gate-run-three-guardians.skill';
import { PlanGatePrecheckSkill } from '../../../skills/plan/gate/plan-gate-precheck.skill';
import { TripPlanRequest, OrchestratorState } from '../../interfaces/trip-plan.interface';

describe('ClaudeGatekeeperAgentService', () => {
  let service: ClaudeGatekeeperAgentService;
  let fRoadCheck: FRoadCheckSkill;
  let weatherAlert: WeatherAlertSkill;

  const mockFRoadCheck = {
    execute: jest.fn(),
  };

  const mockWeatherAlert = {
    execute: jest.fn(),
  };

  const mockLogger = {
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaudeGatekeeperAgentService,
        {
          provide: PlanGateRunThreeGuardiansSkill,
          useValue: null,
        },
        {
          provide: PlanGatePrecheckSkill,
          useValue: null,
        },
        {
          provide: FRoadCheckSkill,
          useValue: mockFRoadCheck,
        },
        {
          provide: WeatherAlertSkill,
          useValue: mockWeatherAlert,
        },
        {
          provide: Logger,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<ClaudeGatekeeperAgentService>(ClaudeGatekeeperAgentService);
    fRoadCheck = module.get<FRoadCheckSkill>(FRoadCheckSkill);
    weatherAlert = module.get<WeatherAlertSkill>(WeatherAlertSkill);

    jest.clearAllMocks();
  });

  describe('evaluateGate - Non-Iceland Trip', () => {
    it('should skip Iceland-specific checks for non-Iceland trips', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'test-001',
        origin: 'Paris, France',
        destination: 'London, UK',
        date_range: {
          start: new Date('2026-07-15'),
          end: new Date('2026-07-18'),
        },
      };

      const researchData = {};
      const context: OrchestratorState = {
        current_step: 'GATE_EVAL',
        request_id: request.request_id,
      };

      // Act
      const result = await service.evaluateGate(request, researchData, context);

      // Assert
      expect(result.gate_result).toBe('ALLOW');
      expect(mockFRoadCheck.execute).not.toHaveBeenCalled();
      expect(mockWeatherAlert.execute).not.toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith('[GatekeeperAgent] Gate 评估完成: ALLOW, 置信度: 0.8');
    });
  });

  describe('evaluateGate - Iceland Trip with F-Road BLOCK', () => {
    it('should return BLOCK when F-road is closed', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'test-002',
        origin: 'Vík, Iceland',
        destination: 'Landmannalaugar, F208, Iceland',
        date_range: {
          start: new Date('2026-02-15'),
          end: new Date('2026-02-18'),
        },
      };

      const researchData = {};
      const context: OrchestratorState = {
        current_step: 'GATE_EVAL',
        request_id: request.request_id,
      };

      mockFRoadCheck.execute.mockResolvedValue({
        can_proceed: false,
        roads_found: ['F208'],
        blocked_roads: [
          {
            road: 'F208',
            status: 'closed',
            reason: 'Typically closed in winter (October-May). Status unverified.',
            verified: false,
          },
        ],
        alternatives: [
          { road: 'F208', alternative_road: 'F225', alternative_description: 'F225 (longer but safer)' },
        ],
        gate_recommendation: 'BLOCK',
        evidence_refs: [
          {
            evidence_id: 'F208',
            source: 'road-status-realtime-service',
            last_verified_at: new Date().toISOString(),
            confidence: 0.7,
          },
        ],
      });

      // Act
      const result = await service.evaluateGate(request, researchData, context);

      // Assert
      expect(result.gate_result).toBe('BLOCK');
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].type).toBe('REACHABILITY');
      expect(result.violations[0].severity).toBe('HARD');
      expect(result.violations[0].detail).toContain('F208 is closed');
      expect(result.required_adjustments.length).toBeGreaterThan(0);
      expect(result.confidence).toBe(0.9);
      expect(mockFRoadCheck.execute).toHaveBeenCalledTimes(1);
      expect(mockWeatherAlert.execute).not.toHaveBeenCalled(); // Blocked early
    });
  });

  describe('evaluateGate - Iceland Trip with Weather BLOCK', () => {
    it('should return BLOCK when weather is extreme', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'test-003',
        origin: { lat: 64.1466, lng: -21.9426 }, // Reykjavík
        destination: { lat: 64.75, lng: -18.0 },  // Highlands
        date_range: {
          start: new Date('2026-02-15'),
          end: new Date('2026-02-18'),
        },
      };

      const researchData = {};
      const context: OrchestratorState = {
        current_step: 'GATE_EVAL',
        request_id: request.request_id,
      };

      // F-Road passes (no F-roads detected)
      mockFRoadCheck.execute.mockResolvedValue({
        can_proceed: true,
        roads_found: [],
        blocked_roads: [],
        gate_recommendation: 'ALLOW',
      });

      // Weather blocks
      mockWeatherAlert.execute.mockResolvedValue({
        overallRisk: 'extreme',
        gateRecommendation: 'BLOCK',
        summary: 'Extreme wind conditions detected',
        locationWeather: [
          {
            location: { lat: 64.75, lng: -18.0, name: 'Highlands Center', type: 'end' },
            temperature: -12.6,
            windSpeed: 25.0,
            visibility: 2000,
            risk: 'extreme',
            warnings: ['Extreme wind conditions (25.0 m/s)'],
            blockers: ['Extreme wind conditions (25.0 m/s)', 'Low visibility (<5km): 2km'],
          },
        ],
        adjustments: ['Consider postponing travel until weather improves'],
        evidenceRefs: [
          {
            location: 'Highlands Center',
            source: 'iceland-weather-realtime-service',
            timestamp: new Date(),
            confidence: 0.85,
          },
        ],
      });

      // Act
      const result = await service.evaluateGate(request, researchData, context);

      // Assert
      expect(result.gate_result).toBe('BLOCK');
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations.some(v => v.type === 'SAFETY')).toBe(true);
      expect(result.violations.some(v => v.detail.includes('Extreme wind'))).toBe(true);
      expect(result.required_adjustments.some(adj => adj.action === 'CHANGE_DATES')).toBe(true);
      expect(mockFRoadCheck.execute).toHaveBeenCalledTimes(1);
      expect(mockWeatherAlert.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('evaluateGate - Iceland Trip ALLOW', () => {
    it('should return ALLOW when all checks pass', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'test-004',
        origin: { lat: 64.1466, lng: -21.9426 },
        destination: { lat: 64.1355, lng: -21.8954 },
        date_range: {
          start: new Date('2026-07-15'),
          end: new Date('2026-07-16'),
        },
      };

      const researchData = {};
      const context: OrchestratorState = {
        current_step: 'GATE_EVAL',
        request_id: request.request_id,
      };

      // F-Road passes
      mockFRoadCheck.execute.mockResolvedValue({
        can_proceed: true,
        roads_found: [],
        blocked_roads: [],
        gate_recommendation: 'ALLOW',
      });

      // Weather passes
      mockWeatherAlert.execute.mockResolvedValue({
        overallRisk: 'safe',
        gateRecommendation: 'ALLOW',
        summary: 'Weather conditions are safe',
        locationWeather: [
          {
            location: { lat: 64.1466, lng: -21.9426, name: 'Reykjavík', type: 'start' },
            temperature: 12.0,
            windSpeed: 5.0,
            visibility: 20000,
            risk: 'safe',
            warnings: [],
            blockers: [],
          },
        ],
        adjustments: [],
        evidenceRefs: [],
      });

      // Act
      const result = await service.evaluateGate(request, researchData, context);

      // Assert
      expect(result.gate_result).toBe('ALLOW');
      expect(result.violations).toHaveLength(0);
      expect(result.required_adjustments).toHaveLength(0);
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(mockFRoadCheck.execute).toHaveBeenCalledTimes(1);
      expect(mockWeatherAlert.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('evaluateGate - Execution Order', () => {
    it('should execute checks in correct order: Step 0 → 0.5 → 1 → 4', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'test-005',
        origin: { lat: 64.1466, lng: -21.9426 },
        destination: { lat: 64.1355, lng: -21.8954 },
        date_range: {
          start: new Date('2026-07-15'),
          end: new Date('2026-07-16'),
        },
      };

      const researchData = {};
      const context: OrchestratorState = {
        current_step: 'GATE_EVAL',
        request_id: request.request_id,
      };

      const executionOrder: string[] = [];

      mockFRoadCheck.execute.mockImplementation(async () => {
        executionOrder.push('Step 0: F-Road');
        return {
          can_proceed: true,
          roads_found: [],
          gate_recommendation: 'ALLOW',
        };
      });

      mockWeatherAlert.execute.mockImplementation(async () => {
        executionOrder.push('Step 0.5: Weather');
        return {
          overallRisk: 'safe',
          gateRecommendation: 'ALLOW',
          locationWeather: [],
          adjustments: [],
          evidenceRefs: [],
        };
      });

      // Act
      await service.evaluateGate(request, researchData, context);

      // Assert
      expect(executionOrder).toEqual(['Step 0: F-Road', 'Step 0.5: Weather']);
    });

    it('should skip Step 0.5 if Step 0 blocks', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'test-006',
        origin: 'Vík, Iceland',
        destination: 'Landmannalaugar, F208, Iceland',
        date_range: {
          start: new Date('2026-02-15'),
          end: new Date('2026-02-18'),
        },
      };

      const researchData = {};
      const context: OrchestratorState = {
        current_step: 'GATE_EVAL',
        request_id: request.request_id,
      };

      mockFRoadCheck.execute.mockResolvedValue({
        can_proceed: false,
        roads_found: ['F208'],
        blocked_roads: [{ road: 'F208', status: 'closed', reason: 'Closed' }],
        gate_recommendation: 'BLOCK',
      });

      // Act
      await service.evaluateGate(request, researchData, context);

      // Assert
      expect(mockFRoadCheck.execute).toHaveBeenCalledTimes(1);
      expect(mockWeatherAlert.execute).not.toHaveBeenCalled(); // Skipped due to early block
    });
  });

  describe('evaluateGate - Weather Failure Degradation', () => {
    it('should not block when weather check fails', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'test-007',
        origin: { lat: 64.1466, lng: -21.9426 },
        destination: { lat: 64.1355, lng: -21.8954 },
        date_range: {
          start: new Date('2026-07-15'),
          end: new Date('2026-07-16'),
        },
      };

      const researchData = {};
      const context: OrchestratorState = {
        current_step: 'GATE_EVAL',
        request_id: request.request_id,
      };

      mockFRoadCheck.execute.mockResolvedValue({
        can_proceed: true,
        roads_found: [],
        gate_recommendation: 'ALLOW',
      });

      mockWeatherAlert.execute.mockRejectedValue(new Error('Weather API unavailable'));

      // Act
      const result = await service.evaluateGate(request, researchData, context);

      // Assert
      expect(result.gate_result).toBe('ALLOW'); // Not blocked
      expect(researchData['weather_check_failed']).toBe(true);
      expect(researchData['weather_check_error']).toBe('Weather API unavailable');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[GatekeeperAgent] 天气检查出错 (降级处理)')
      );
    });
  });

  describe('evaluateGate - ResearchData Storage', () => {
    it('should store weather result in researchData for soft checks', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'test-008',
        origin: { lat: 64.1466, lng: -21.9426 },
        destination: { lat: 64.1355, lng: -21.8954 },
        date_range: {
          start: new Date('2026-07-15'),
          end: new Date('2026-07-16'),
        },
      };

      const researchData = {};
      const context: OrchestratorState = {
        current_step: 'GATE_EVAL',
        request_id: request.request_id,
      };

      mockFRoadCheck.execute.mockResolvedValue({
        can_proceed: true,
        roads_found: [],
        gate_recommendation: 'ALLOW',
      });

      const weatherResult = {
        overallRisk: 'moderate',
        gateRecommendation: 'ADJUST_REQUIRED',
        locationWeather: [],
        adjustments: ['Monitor weather closely'],
        evidenceRefs: [],
      };

      mockWeatherAlert.execute.mockResolvedValue(weatherResult);

      // Act
      await service.evaluateGate(request, researchData, context);

      // Assert
      expect(researchData['weather_alert_result']).toEqual(weatherResult);
      expect(researchData['weather_gate_recommendation']).toBe('ADJUST_REQUIRED');
    });
  });

  describe('evaluateGate - Date Range Handling', () => {
    it('should handle {start, end} format', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'test-009',
        origin: { lat: 64.1466, lng: -21.9426 },
        destination: { lat: 64.1355, lng: -21.8954 },
        date_range: {
          start: new Date('2026-07-15'),
          end: new Date('2026-07-18'),
        },
      };

      const researchData = {};
      const context: OrchestratorState = {
        current_step: 'GATE_EVAL',
        request_id: request.request_id,
      };

      mockFRoadCheck.execute.mockResolvedValue({
        can_proceed: true,
        roads_found: [],
        gate_recommendation: 'ALLOW',
      });

      mockWeatherAlert.execute.mockResolvedValue({
        overallRisk: 'safe',
        gateRecommendation: 'ALLOW',
        locationWeather: [],
        adjustments: [],
        evidenceRefs: [],
      });

      // Act
      await service.evaluateGate(request, researchData, context);

      // Assert
      expect(mockWeatherAlert.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          dateRange: {
            start: expect.any(Date),
            end: expect.any(Date),
          },
        })
      );
    });

    it('should handle {start_date, end_date} format', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'test-010',
        origin: { lat: 64.1466, lng: -21.9426 },
        destination: { lat: 64.1355, lng: -21.8954 },
        date_range: {
          start_date: '2026-07-15',
          end_date: '2026-07-18',
        },
      };

      const researchData = {};
      const context: OrchestratorState = {
        current_step: 'GATE_EVAL',
        request_id: request.request_id,
      };

      mockFRoadCheck.execute.mockResolvedValue({
        can_proceed: true,
        roads_found: [],
        gate_recommendation: 'ALLOW',
      });

      mockWeatherAlert.execute.mockResolvedValue({
        overallRisk: 'safe',
        gateRecommendation: 'ALLOW',
        locationWeather: [],
        adjustments: [],
        evidenceRefs: [],
      });

      // Act
      await service.evaluateGate(request, researchData, context);

      // Assert
      expect(mockWeatherAlert.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          dateRange: {
            start: expect.any(Date),
            end: expect.any(Date),
          },
        })
      );
    });
  });
});
