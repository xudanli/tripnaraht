// src/agent/services/sub-agents/gatekeeper-agent.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ClaudeGatekeeperAgentService } from './gatekeeper-agent.service';
import { FRoadCheckSkill } from '../../../skills/world/f-road-check.skill';
import { WeatherAlertSkill } from '../../../skills/world/weather-alert.skill';
import { AvalancheRiskAssessmentSkill } from '../../../skills/world/avalanche-risk-assessment.skill';
import { SafetravelGetAdvisoriesSkill } from '../../../skills/world/safetravel-get-advisories.skill';
import { PlanGateRunThreeGuardiansSkill } from '../../../skills/plan/gate/plan-gate-run-three-guardians.skill';
import { PlanGatePrecheckSkill } from '../../../skills/plan/gate/plan-gate-precheck.skill';
import { TripPlanRequest, OrchestratorState } from '../../interfaces/trip-plan.interface';
import { AlertSeverity, AlertType } from '../../../iceland-info/dto/safetravel.dto';

describe('ClaudeGatekeeperAgentService', () => {
  let service: ClaudeGatekeeperAgentService;

  const mockFRoadCheck = {
    execute: jest.fn(),
  };

  const mockWeatherAlert = {
    execute: jest.fn(),
  };

  const mockAvalancheRisk = {
    execute: jest.fn(),
  };

  const mockSafetravelGetAdvisories = {
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
          provide: AvalancheRiskAssessmentSkill,
          useValue: mockAvalancheRisk,
        },
        {
          provide: SafetravelGetAdvisoriesSkill,
          useValue: mockSafetravelGetAdvisories,
        },
        {
          provide: Logger,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<ClaudeGatekeeperAgentService>(ClaudeGatekeeperAgentService);

    // service 内部使用 new Logger(...)；这里替换为可断言的 mock
    (service as any).logger = mockLogger as any;

    jest.clearAllMocks();

    mockSafetravelGetAdvisories.execute.mockResolvedValue({
      alerts: [],
      rss_refined: [],
      lastUpdated: new Date().toISOString(),
      source: 'safetravel.is/feed',
      gate_recommendation: 'ALLOW',
      summary: 'SafeTravel RSS：当前无条目（或已全部被关键词过滤）。',
    });
  });

  describe('evaluateGate - Non-Iceland Trip', () => {
    it('should skip Iceland-specific checks for non-Iceland trips', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'test-001',
        origin: 'Paris, France',
        destination: 'London, UK',
        date_range: { start_date: '2026-07-15', end_date: '2026-07-18' } as any,
      };

      const researchData: any = {};
      const context = { current_step: 'GATE_EVAL', request_id: request.request_id } as any as OrchestratorState;

      // Act
      const result = await service.evaluateGate(request, researchData, context);

      // Assert
      expect(result.gate_result).toBe('ALLOW');
      expect(mockFRoadCheck.execute).not.toHaveBeenCalled();
      expect(mockWeatherAlert.execute).not.toHaveBeenCalled();
      expect(mockSafetravelGetAdvisories.execute).not.toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('[GatekeeperAgent] Gate 评估完成: ALLOW'));
    });
  });

  describe('evaluateGate - Iceland Trip with F-Road BLOCK', () => {
    it('should return BLOCK when F-road is closed', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'test-002',
        origin: 'Vík, Iceland',
        destination: 'Landmannalaugar, F208, Iceland',
        date_range: { start_date: '2026-02-15', end_date: '2026-02-18' } as any,
      };

      const researchData: any = {};
      const context = { current_step: 'GATE_EVAL', request_id: request.request_id } as any as OrchestratorState;

      mockFRoadCheck.execute.mockResolvedValue({
        can_proceed: false,
        blocked_roads: [
          {
            roadId: 'F208',
            currentStatus: 'closed',
            reason: 'Typically closed in winter (October-May). Status unverified.',
            unverified: true,
          },
        ],
        alternative_routes: ['F225 (longer but safer)'],
        warnings: [],
        required_actions: [],
        evidence_refs: [
          {
            evidence_id: 'F208',
            source: 'road-status-realtime-service',
            last_verified_at: new Date(),
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
      expect(mockSafetravelGetAdvisories.execute).not.toHaveBeenCalled();
    });
  });

  describe('evaluateGate - Iceland Trip with Weather BLOCK', () => {
    it('should return BLOCK when weather is extreme', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'test-003',
        origin: { lat: 64.1466, lng: -21.9426 }, // Reykjavík
        destination: { lat: 64.75, lng: -18.0 },  // Highlands
        date_range: { start_date: '2026-02-15', end_date: '2026-02-18' } as any,
      };

      const researchData: any = {};
      const context = { current_step: 'GATE_EVAL', request_id: request.request_id } as any as OrchestratorState;

      // F-Road passes (no F-roads detected)
      mockFRoadCheck.execute.mockResolvedValue({
        can_proceed: true,
        blocked_roads: [],
        alternative_routes: [],
        warnings: [],
        required_actions: [],
        evidence_refs: [],
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
      expect(mockSafetravelGetAdvisories.execute).toHaveBeenCalledTimes(1);
      expect(mockWeatherAlert.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('evaluateGate - Iceland Trip SafeTravel RSS BLOCK', () => {
    it('should return BLOCK when SafeTravel reports CRITICAL alerts', async () => {
      const request: TripPlanRequest = {
        request_id: 'test-st-001',
        origin: { lat: 64.1466, lng: -21.9426 },
        destination: { lat: 64.1355, lng: -21.8954 },
        date_range: { start_date: '2026-07-15', end_date: '2026-07-16' } as any,
      };
      const researchData: any = {};
      const context = { current_step: 'GATE_EVAL', request_id: request.request_id } as any as OrchestratorState;

      mockFRoadCheck.execute.mockResolvedValue({
        can_proceed: true,
        roads_found: [],
        blocked_roads: [],
        gate_recommendation: 'ALLOW',
      });

      mockSafetravelGetAdvisories.execute.mockResolvedValue({
        alerts: [
          {
            id: 'rss-1',
            title: 'Volcanic hazard',
            description: '<p>Do not enter area X</p>',
            type: AlertType.GENERAL,
            severity: AlertSeverity.CRITICAL,
            effectiveTime: new Date().toISOString(),
            regions: [],
          },
        ],
        rss_refined: [
          {
            severity: AlertSeverity.CRITICAL,
            title: 'Volcanic hazard',
            body: 'Do not enter area X',
          },
        ],
        lastUpdated: new Date().toISOString(),
        source: 'safetravel.is/feed',
        gate_recommendation: 'BLOCK',
        summary: 'Critical',
      });

      const result = await service.evaluateGate(request, researchData, context);

      expect(result.gate_result).toBe('BLOCK');
      expect(result.violations.some((v) => v.detail.includes('SafeTravel'))).toBe(true);
      expect(mockWeatherAlert.execute).not.toHaveBeenCalled();
      expect(researchData.safetravel_gate_recommendation).toBe('BLOCK');
    });
  });

  describe('evaluateGate - Iceland Trip ALLOW', () => {
    it('should return ALLOW when all checks pass', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'test-004',
        origin: { lat: 64.1466, lng: -21.9426 },
        destination: { lat: 64.1355, lng: -21.8954 },
        date_range: { start_date: '2026-07-15', end_date: '2026-07-16' } as any,
      };

      const researchData: any = {};
      const context = { current_step: 'GATE_EVAL', request_id: request.request_id } as any as OrchestratorState;

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
      expect(mockSafetravelGetAdvisories.execute).toHaveBeenCalledTimes(1);
      expect(mockWeatherAlert.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('evaluateGate - Execution Order', () => {
    it('should execute checks in correct order: Step 0 → 0.45 → 0.5 → …', async () => {
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

      mockSafetravelGetAdvisories.execute.mockImplementation(async () => {
        executionOrder.push('Step 0.45: SafeTravel');
        return {
          alerts: [],
          rss_refined: [],
          lastUpdated: new Date().toISOString(),
          source: 'safetravel.is/feed',
          gate_recommendation: 'ALLOW',
          summary: 'ok',
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
      expect(executionOrder).toEqual(['Step 0: F-Road', 'Step 0.45: SafeTravel', 'Step 0.5: Weather']);
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
      expect(mockSafetravelGetAdvisories.execute).not.toHaveBeenCalled();
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
      expect(mockSafetravelGetAdvisories.execute).toHaveBeenCalledTimes(1);
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

  describe('evaluateGate - Avalanche Risk Integration', () => {
    it('should execute avalanche check for Iceland trips', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'test-avalanche-001',
        origin: { lat: 64.1466, lng: -21.9426 }, // Reykjavík
        destination: { lat: 64.75, lng: -18.0 }, // Highlands
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

      // F-Road passes
      mockFRoadCheck.execute.mockResolvedValue({
        can_proceed: true,
        roads_found: [],
        gate_recommendation: 'ALLOW',
      });

      // Weather passes
      mockWeatherAlert.execute.mockResolvedValue({
        overallRisk: 'safe',
        gateRecommendation: 'ALLOW',
        locationWeather: [],
        adjustments: [],
        evidenceRefs: [],
      });

      // Avalanche passes
      mockAvalancheRisk.execute.mockResolvedValue({
        overallRisk: 'safe',
        gateRecommendation: 'ALLOW',
        hazardZones: [],
        riskAssessment: { totalHazards: 0, hasHighRisk: false, hasMediumRisk: false },
        blockers: [],
        warnings: [],
        adjustments: [],
        summary: 'No avalanche zones detected',
        evidence_refs: [],
      });

      // Act
      const result = await service.evaluateGate(request, researchData, context);

      // Assert
      expect(result.gate_result).toBe('ALLOW');
      expect(mockFRoadCheck.execute).toHaveBeenCalledTimes(1);
      expect(mockSafetravelGetAdvisories.execute).toHaveBeenCalledTimes(1);
      expect(mockWeatherAlert.execute).toHaveBeenCalledTimes(1);
      expect(mockAvalancheRisk.execute).toHaveBeenCalledTimes(1);
    });

    it('should return BLOCK when avalanche risk is extreme', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'test-avalanche-002',
        origin: { lat: 64.1466, lng: -21.9426 },
        destination: { lat: 64.75, lng: -18.0 },
        date_range: {
          start: new Date('2026-01-15'),
          end: new Date('2026-01-18'),
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
        gate_recommendation: 'ALLOW',
      });

      // Weather passes
      mockWeatherAlert.execute.mockResolvedValue({
        overallRisk: 'safe',
        gateRecommendation: 'ALLOW',
        locationWeather: [],
        adjustments: [],
        evidenceRefs: [],
      });

      // Avalanche BLOCKS
      mockAvalancheRisk.execute.mockResolvedValue({
        overallRisk: 'extreme',
        gateRecommendation: 'BLOCK',
        hazardZones: [
          {
            zoneId: 'AVL-IS-HIGH-001',
            level: 'HIGH',
            distance: 200,
            lat: 64.75,
            lng: -18.0,
            description: 'High-risk avalanche zone',
          },
        ],
        riskAssessment: {
          totalHazards: 1,
          hasHighRisk: true,
          hasMediumRisk: false,
        },
        blockers: ['Extreme avalanche risk - travel not recommended'],
        warnings: [],
        adjustments: [],
        summary: 'Extreme avalanche risk detected',
        evidence_refs: [],
      });

      // Act
      const result = await service.evaluateGate(request, researchData, context);

      // Assert
      expect(result.gate_result).toBe('BLOCK');
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations.some(v => v.type === 'SAFETY')).toBe(true);
      expect(result.violations.some(v => v.detail.includes('avalanche'))).toBe(true);
      expect(mockSafetravelGetAdvisories.execute).toHaveBeenCalledTimes(1);
      expect(mockWeatherAlert.execute).toHaveBeenCalledTimes(1);
      expect(mockAvalancheRisk.execute).toHaveBeenCalledTimes(1);
    });

    it('should record ADJUST_REQUIRED in researchData for soft checks', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'test-avalanche-003',
        origin: { lat: 64.1466, lng: -21.9426 },
        destination: { lat: 64.75, lng: -18.0 },
        date_range: {
          start: new Date('2026-03-15'),
          end: new Date('2026-03-18'),
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

      // Avalanche suggests adjustments
      mockAvalancheRisk.execute.mockResolvedValue({
        overallRisk: 'high',
        gateRecommendation: 'ADJUST_REQUIRED',
        hazardZones: [
          {
            zoneId: 'AVL-IS-HIGH-001',
            level: 'HIGH',
            distance: 500,
            lat: 64.75,
            lng: -18.0,
            description: 'High-risk zone',
          },
        ],
        riskAssessment: {
          totalHazards: 1,
          hasHighRisk: true,
          hasMediumRisk: false,
        },
        blockers: [],
        warnings: ['High avalanche risk detected'],
        adjustments: ['Hire local guide', 'Check avalanche forecast'],
        summary: 'High avalanche risk - adjustments required',
        evidence_refs: [],
      });

      // Act
      const result = await service.evaluateGate(request, researchData, context);

      // Assert
      expect(result.gate_result).toBe('ADJUST_REQUIRED'); // Soft check triggers ADJUST_REQUIRED
      expect(researchData['avalanche_risk_result']).toBeDefined();
      expect(researchData['avalanche_gate_recommendation']).toBe('ADJUST_REQUIRED');
      expect(researchData['avalanche_warnings']).toBeDefined();
      expect(researchData['avalanche_adjustments']).toBeDefined();
      expect(mockSafetravelGetAdvisories.execute).toHaveBeenCalledTimes(1);
    });

    it('should reduce confidence when avalanche returns NEED_USER_CONFIRM', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'test-avalanche-004',
        origin: { lat: 64.1466, lng: -21.9426 },
        destination: { lat: 64.75, lng: -18.0 },
        date_range: {
          start: new Date('2026-10-15'),
          end: new Date('2026-10-18'),
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

      // Avalanche needs user confirmation
      mockAvalancheRisk.execute.mockResolvedValue({
        overallRisk: 'medium',
        gateRecommendation: 'NEED_USER_CONFIRM',
        hazardZones: [
          {
            zoneId: 'AVL-IS-MED-001',
            level: 'MEDIUM',
            distance: 800,
            lat: 64.6,
            lng: -18.5,
            description: 'Medium-risk zone',
          },
        ],
        riskAssessment: {
          totalHazards: 1,
          hasHighRisk: false,
          hasMediumRisk: true,
        },
        blockers: [],
        warnings: ['Medium avalanche risk detected'],
        adjustments: ['Consider local guide'],
        summary: 'Medium risk - user confirmation needed',
        evidence_refs: [],
      });

      // Act
      const result = await service.evaluateGate(request, researchData, context);

      // Assert
      expect(result.gate_result).toBe('ALLOW');
      expect(result.confidence).toBeLessThan(0.8); // Confidence reduced
      expect(researchData['avalanche_gate_recommendation']).toBe('NEED_USER_CONFIRM');
      expect(mockSafetravelGetAdvisories.execute).toHaveBeenCalledTimes(1);
    });

    it('should handle avalanche service failure gracefully', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'test-avalanche-005',
        origin: { lat: 64.1466, lng: -21.9426 },
        destination: { lat: 64.75, lng: -18.0 },
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

      // Avalanche service fails
      mockAvalancheRisk.execute.mockRejectedValue(new Error('Avalanche database unavailable'));

      // Act
      const result = await service.evaluateGate(request, researchData, context);

      // Assert
      expect(result.gate_result).toBe('ALLOW'); // Degraded - doesn't block
      expect(researchData['avalanche_check_failed']).toBe(true);
      expect(researchData['avalanche_check_error']).toBe('Avalanche database unavailable');
      expect(mockSafetravelGetAdvisories.execute).toHaveBeenCalledTimes(1);
      // Note: logger is created internally (new Logger()), not injectable, so we can't assert on it
    });

    it('should skip avalanche check for non-Iceland trips', async () => {
      // Arrange
      const request: TripPlanRequest = {
        request_id: 'test-avalanche-006',
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
      expect(mockAvalancheRisk.execute).not.toHaveBeenCalled(); // Skipped
      expect(mockSafetravelGetAdvisories.execute).not.toHaveBeenCalled();
    });
  });
});
