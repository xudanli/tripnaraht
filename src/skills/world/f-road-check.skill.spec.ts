// src/skills/world/f-road-check.skill.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { FRoadCheckSkill } from './f-road-check.skill';
import { RoadStatusRealtimeService } from './services/road-status-realtime.service';

describe('FRoadCheckSkill', () => {
  let skill: FRoadCheckSkill;

  const mockRoadService = {
    getRoadStatus: jest.fn(),
    checkMultipleRoads: jest.fn(),
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
        FRoadCheckSkill,
        {
          provide: RoadStatusRealtimeService,
          useValue: mockRoadService,
        },
        {
          provide: Logger,
          useValue: mockLogger,
        },
      ],
    }).compile();

    skill = module.get<FRoadCheckSkill>(FRoadCheckSkill);

    jest.clearAllMocks();
  });

  describe('execute - No F-Roads Detected', () => {
    it('should return can_proceed=true when no F-roads in route', async () => {
      // Arrange
      const input = {
        request_id: 'test-001',
        origin: 'Reykjavík, Iceland',
        destination: 'Akureyri, Iceland',
        waypoints: [],
        planned_route_description: 'Drive via Ring Road (Route 1)',
        date_range: {
          start_date: '2026-07-15',
          end_date: '2026-07-18',
        },
      };

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.can_proceed).toBe(true);
      expect(result.roads_found).toHaveLength(0);
      expect(result.blocked_roads).toHaveLength(0);
      expect(result.gate_recommendation).toBe('ALLOW');
      expect(mockRoadService.getRoadStatus).not.toHaveBeenCalled();
    });
  });

  describe('execute - F-Road Open', () => {
    it('should return can_proceed=true when F-road is open', async () => {
      // Arrange
      const input = {
        request_id: 'test-002',
        origin: 'Vík, Iceland',
        destination: 'Landmannalaugar, F208, Iceland',
        waypoints: [],
        planned_route_description: 'Drive to Landmannalaugar via F208',
        date_range: {
          start_date: '2026-07-15',
          end_date: '2026-07-18',
        },
      };

      mockRoadService.getRoadStatus.mockResolvedValue({
        roadId: 'F208',
        roadName: 'F208',
        currentStatus: 'open',
        statusMessage: 'Road is open and passable',
        lastVerifiedAt: new Date(),
        dataSource: 'road.is',
        confidence: 0.9,
        seasonalFallback: false,
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.can_proceed).toBe(true);
      expect(result.roads_found).toContain('F208');
      expect(result.open_roads).toHaveLength(1);
      expect(result.open_roads[0].road).toBe('F208');
      expect(result.blocked_roads).toHaveLength(0);
      expect(result.gate_recommendation).toBe('ALLOW');
      expect(mockLogger.log).toHaveBeenCalledWith('[FRoadCheck] 检测到 1 条 F-road: F208');
    });
  });

  describe('execute - F-Road Closed', () => {
    it('should return can_proceed=false when F-road is closed', async () => {
      // Arrange
      const input = {
        request_id: 'test-003',
        origin: 'Vík, Iceland',
        destination: 'Landmannalaugar, F208, Iceland',
        waypoints: [],
        planned_route_description: 'Drive to Landmannalaugar via F208',
        date_range: {
          start_date: '2026-02-15',
          end_date: '2026-02-18',
        },
      };

      mockRoadService.getRoadStatus.mockResolvedValue({
        roadId: 'F208',
        roadName: 'F208',
        currentStatus: 'closed',
        statusMessage: 'Road is closed for winter',
        lastVerifiedAt: new Date(),
        dataSource: 'static-seasonal',
        confidence: 0.7,
        seasonalFallback: true,
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.can_proceed).toBe(false);
      expect(result.roads_found).toContain('F208');
      expect(result.blocked_roads).toHaveLength(1);
      expect(result.blocked_roads[0].road).toBe('F208');
      expect(result.blocked_roads[0].status).toBe('closed');
      expect(result.blocked_roads[0].verified).toBe(false); // Seasonal fallback
      expect(result.alternatives.length).toBeGreaterThan(0);
      expect(result.gate_recommendation).toBe('BLOCK');
      expect(mockLogger.warn).toHaveBeenCalledWith('[FRoadCheck] ❌ 阻塞: 1 条道路关闭');
    });
  });

  describe('execute - F-Road Restricted', () => {
    it('should return can_proceed=true with warnings when F-road is restricted', async () => {
      // Arrange
      const input = {
        request_id: 'test-004',
        origin: 'Höfn, Iceland',
        destination: 'F985 junction, Iceland',
        waypoints: [],
        planned_route_description: 'Drive via F985',
        date_range: {
          start_date: '2026-06-15',
          end_date: '2026-06-18',
        },
      };

      mockRoadService.getRoadStatus.mockResolvedValue({
        roadId: 'F985',
        roadName: 'F985',
        currentStatus: 'restricted',
        statusMessage: '4WD vehicles only, river crossing required',
        lastVerifiedAt: new Date(),
        dataSource: 'road.is',
        confidence: 0.9,
        seasonalFallback: false,
        hazards: ['river_crossing', '4wd_required'],
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.can_proceed).toBe(true);
      expect(result.restricted_roads).toHaveLength(1);
      expect(result.restricted_roads[0].road).toBe('F985');
      expect(result.restricted_roads[0].restriction_type).toContain('4WD');
      expect(result.gate_recommendation).toBe('NEED_USER_CONFIRM');
    });
  });

  describe('execute - Multiple F-Roads', () => {
    it('should check all F-roads in the route', async () => {
      // Arrange
      const input = {
        request_id: 'test-005',
        origin: 'Selfoss, Iceland',
        destination: 'Askja, Iceland',
        waypoints: ['F208 junction', 'F88 junction'],
        planned_route_description: 'Drive to Askja via F208 and F88',
        date_range: {
          start_date: '2026-07-15',
          end_date: '2026-07-20',
        },
      };

      mockRoadService.checkMultipleRoads.mockResolvedValue([
        {
          roadId: 'F208',
          currentStatus: 'open',
          statusMessage: 'Road is open',
          confidence: 0.9,
        },
        {
          roadId: 'F88',
          currentStatus: 'restricted',
          statusMessage: '4WD required',
          confidence: 0.9,
          hazards: ['4wd_required'],
        },
      ]);

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.roads_found).toContain('F208');
      expect(result.roads_found).toContain('F88');
      expect(result.open_roads).toHaveLength(1);
      expect(result.restricted_roads).toHaveLength(1);
      expect(result.can_proceed).toBe(true);
      expect(result.gate_recommendation).toBe('NEED_USER_CONFIRM');
    });

    it('should block if any F-road is closed', async () => {
      // Arrange
      const input = {
        request_id: 'test-006',
        origin: 'Selfoss, Iceland',
        destination: 'Askja, Iceland',
        waypoints: ['F208 junction', 'F88 junction'],
        planned_route_description: 'Drive to Askja via F208 and F88',
        date_range: {
          start_date: '2026-02-15',
          end_date: '2026-02-20',
        },
      };

      mockRoadService.checkMultipleRoads.mockResolvedValue([
        {
          roadId: 'F208',
          currentStatus: 'open',
          statusMessage: 'Road is open',
          confidence: 0.9,
        },
        {
          roadId: 'F88',
          currentStatus: 'closed',
          statusMessage: 'Road is closed for winter',
          confidence: 0.7,
          seasonalFallback: true,
        },
      ]);

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.can_proceed).toBe(false);
      expect(result.blocked_roads).toHaveLength(1);
      expect(result.blocked_roads[0].road).toBe('F88');
      expect(result.gate_recommendation).toBe('BLOCK');
    });
  });

  describe('execute - Alternatives Generation', () => {
    it('should provide alternatives for blocked F208', async () => {
      // Arrange
      const input = {
        request_id: 'test-007',
        origin: 'Vík, Iceland',
        destination: 'Landmannalaugar, F208, Iceland',
        waypoints: [],
        planned_route_description: 'Drive via F208',
        date_range: {
          start_date: '2026-02-15',
          end_date: '2026-02-18',
        },
      };

      mockRoadService.getRoadStatus.mockResolvedValue({
        roadId: 'F208',
        currentStatus: 'closed',
        statusMessage: 'Closed for winter',
        confidence: 0.7,
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.alternatives).toBeDefined();
      expect(result.alternatives.length).toBeGreaterThan(0);
      expect(result.alternatives.some(alt => alt.alternative_road === 'F225')).toBe(true);
      expect(result.alternatives.some(alt => alt.alternative_road === 'Ring Road')).toBe(true);
    });
  });

  describe('execute - Evidence Chain', () => {
    it('should include complete evidence references', async () => {
      // Arrange
      const input = {
        request_id: 'test-008',
        origin: 'Vík, Iceland',
        destination: 'Landmannalaugar, F208, Iceland',
        waypoints: [],
        planned_route_description: 'Drive via F208',
        date_range: {
          start_date: '2026-07-15',
          end_date: '2026-07-18',
        },
      };

      const verifiedAt = new Date();
      mockRoadService.getRoadStatus.mockResolvedValue({
        roadId: 'F208',
        currentStatus: 'open',
        statusMessage: 'Open',
        lastVerifiedAt: verifiedAt,
        dataSource: 'road.is',
        confidence: 0.9,
        seasonalFallback: false,
      });

      // Act
      const result = await skill.execute(input);

      // Assert
      expect(result.evidence_refs).toBeDefined();
      expect(result.evidence_refs.length).toBeGreaterThan(0);
      expect(result.evidence_refs[0]).toHaveProperty('evidence_id', 'F208');
      expect(result.evidence_refs[0]).toHaveProperty('source', 'road-status-realtime-service');
      expect(result.evidence_refs[0]).toHaveProperty('last_verified_at');
      expect(result.evidence_refs[0]).toHaveProperty('confidence', 0.9);
    });
  });

  describe('execute - F-Road Pattern Detection', () => {
    it('should detect F-roads in various formats', async () => {
      // Arrange
      const testCases = [
        { text: 'Drive via F208', expected: ['F208'] },
        { text: 'F26 and F88 route', expected: ['F26', 'F88'] },
        { text: 'Using F-Road 35 (F35)', expected: ['F35'] },
        { text: 'F225, F208, F210', expected: ['F225', 'F208', 'F210'] },
        { text: 'No F-roads, just Route 1', expected: [] },
      ];

      for (const testCase of testCases) {
        const input = {
          request_id: 'test-pattern',
          origin: 'A',
          destination: 'B',
          waypoints: [],
          planned_route_description: testCase.text,
          date_range: {
            start_date: '2026-07-15',
            end_date: '2026-07-18',
          },
        };

        if (testCase.expected.length > 0) {
          mockRoadService.checkMultipleRoads.mockResolvedValue(
            testCase.expected.map(road => ({
              roadId: road,
              currentStatus: 'open',
              statusMessage: 'Open',
              confidence: 0.9,
            }))
          );
        }

        // Act
        const result = await skill.execute(input);

        // Assert
        expect(result.roads_found).toEqual(testCase.expected);
      }
    });
  });
});
