// src/agent/validation/trip-plan.schema.spec.ts

/**
 * Zod Schema 单元测试
 *
 * 测试目标：
 * - 验证所有 schema 的正向用例（合法数据）
 * - 验证所有 schema 的反向用例（非法数据）
 * - 确保错误消息清晰且可操作
 */

import {
  validateTripPlanRequest,
  validateGateResult,
  validateEvidenceRef,
  validateItinerary,
  validateDecisionLogEntry,
} from './trip-plan.schema';

describe('TripPlanRequest Schema', () => {
  it('should validate a valid minimal TripPlanRequest', () => {
    const validRequest = {
      request_id: 'test-001',
      origin: 'Reykjavík, Iceland',
      destination: 'Landmannalaugar, Iceland',
    };

    const result = validateTripPlanRequest(validRequest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.request_id).toBe('test-001');
    }
  });

  it('should validate a TripPlanRequest with coordinates', () => {
    const validRequest = {
      request_id: 'test-002',
      origin: { lat: 64.1466, lng: -21.9426 },
      destination: { lat: 64.8577, lng: -19.0059 },
      date_range: {
        start_date: '2026-07-15T00:00:00.000Z',
        end_date: '2026-07-18T00:00:00.000Z',
      },
      mode: 'drive' as const,
      party: {
        count: 2,
        has_children: false,
        fitness_level: 'medium' as const,
      },
    };

    const result = validateTripPlanRequest(validRequest);
    expect(result.success).toBe(true);
  });

  it('should reject invalid latitude', () => {
    const invalidRequest = {
      request_id: 'test-003',
      origin: { lat: 95, lng: -21.9426 }, // Invalid: lat > 90
      destination: 'Landmannalaugar, Iceland',
    };

    const result = validateTripPlanRequest(invalidRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      const errorMessages = result.error.issues.map((e: any) => e.message).join(' ');
      expect(errorMessages).toContain('90');
    }
  });

  it('should reject invalid longitude', () => {
    const invalidRequest = {
      request_id: 'test-004',
      origin: 'Reykjavík, Iceland',
      destination: { lat: 64.8577, lng: 200 }, // Invalid: lng > 180
    };

    const result = validateTripPlanRequest(invalidRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      const errorMessages = result.error.issues.map((e: any) => e.message).join(' ');
      expect(errorMessages).toContain('180');
    }
  });

  it('should reject missing request_id', () => {
    const invalidRequest = {
      origin: 'Reykjavík, Iceland',
      destination: 'Landmannalaugar, Iceland',
    };

    const result = validateTripPlanRequest(invalidRequest);
    expect(result.success).toBe(false);
  });

  it('should reject invalid party count', () => {
    const invalidRequest = {
      request_id: 'test-005',
      origin: 'Reykjavík, Iceland',
      destination: 'Landmannalaugar, Iceland',
      party: {
        count: -1, // Invalid: negative
      },
    };

    const result = validateTripPlanRequest(invalidRequest);
    expect(result.success).toBe(false);
  });

  it('should reject invalid time window format', () => {
    const invalidRequest = {
      request_id: 'test-006',
      origin: 'Reykjavík, Iceland',
      destination: 'Landmannalaugar, Iceland',
      constraints: {
        daily_time_window: {
          start: '9:00', // Invalid: should be HH:mm
          end: '18:00',
        },
      },
    };

    const result = validateTripPlanRequest(invalidRequest);
    expect(result.success).toBe(false);
  });
});

describe('GateResult Schema', () => {
  it('should validate a valid ALLOW GateResult', () => {
    const validResult = {
      gate_result: 'ALLOW',
      violations: [],
      required_adjustments: [],
      confidence: 0.95,
    };

    const result = validateGateResult(validResult);
    expect(result.success).toBe(true);
  });

  it('should validate a BLOCK GateResult with violations', () => {
    const validResult = {
      gate_result: 'BLOCK',
      violations: [
        {
          type: 'REACHABILITY',
          severity: 'HARD',
          detail: 'F208 is closed during winter',
          evidence_refs: ['evidence-001'],
        },
      ],
      required_adjustments: [
        {
          action: 'CHANGE_DATES',
          why: 'F-Road only open in summer',
          alternatives: ['June-September'],
        },
      ],
      confidence: 0.9,
    };

    const result = validateGateResult(validResult);
    expect(result.success).toBe(true);
  });

  it('should reject invalid confidence range', () => {
    const invalidResult = {
      gate_result: 'ALLOW',
      violations: [],
      required_adjustments: [],
      confidence: 1.5, // Invalid: > 1
    };

    const result = validateGateResult(invalidResult);
    expect(result.success).toBe(false);
  });

  it('should reject invalid gate_result status', () => {
    const invalidResult = {
      gate_result: 'MAYBE', // Invalid: not in enum
      violations: [],
      required_adjustments: [],
      confidence: 0.8,
    };

    const result = validateGateResult(invalidResult);
    expect(result.success).toBe(false);
  });
});

describe('EvidenceRef Schema', () => {
  it('should validate a valid EvidenceRef', () => {
    const validEvidence = {
      evidence_id: 'evidence-001',
      source: 'road-status-realtime',
      last_verified_at: '2026-02-15T10:00:00.000Z',
      confidence: 0.9,
    };

    const result = validateEvidenceRef(validEvidence);
    expect(result.success).toBe(true);
  });

  it('should validate EvidenceRef with full fields', () => {
    const validEvidence = {
      evidence_id: 'evidence-002',
      source: 'iceland-weather-realtime',
      source_title: 'Icelandic Meteorological Office',
      source_url: 'https://en.vedur.is',
      publisher: 'IMO',
      published_at: '2026-02-15T09:00:00.000Z',
      retrieved_at: '2026-02-15T10:00:00.000Z',
      last_verified_at: '2026-02-15T10:00:00.000Z',
      data_timestamp: '2026-02-15T09:00:00.000Z',
      excerpt: 'Current weather conditions for highlands',
      relevance: 0.95,
      confidence: 0.9,
      related_decision_ids: ['decision-001'],
      url: 'https://en.vedur.is/weather/forecasts/areas',
      data: { temperature: -5, wind_speed: 15 },
    };

    const result = validateEvidenceRef(validEvidence);
    expect(result.success).toBe(true);
  });

  it('should reject invalid confidence', () => {
    const invalidEvidence = {
      evidence_id: 'evidence-003',
      source: 'test-source',
      last_verified_at: '2026-02-15T10:00:00.000Z',
      confidence: -0.1, // Invalid: < 0
    };

    const result = validateEvidenceRef(invalidEvidence);
    expect(result.success).toBe(false);
  });

  it('should reject invalid URL', () => {
    const invalidEvidence = {
      evidence_id: 'evidence-004',
      source: 'test-source',
      last_verified_at: '2026-02-15T10:00:00.000Z',
      confidence: 0.9,
      url: 'not-a-valid-url', // Invalid: not a URL
    };

    const result = validateEvidenceRef(invalidEvidence);
    expect(result.success).toBe(false);
  });
});

describe('Itinerary Schema', () => {
  it('should validate a valid Itinerary', () => {
    const validItinerary = {
      request_id: 'test-001',
      days: [
        {
          date: '2026-07-15',
          items: [
            {
              id: 'item-001',
              type: 'POI',
              start_window: '10:00',
              end_window: '12:00',
              location_ref: {
                name: 'Gullfoss',
                coordinates: { lat: 64.3271, lng: -20.1211 },
              },
              evidence_refs: ['evidence-001'],
              verified: true,
              verification_status: 'VERIFIED',
            },
          ],
        },
      ],
      metadata: {
        total_days: 1,
        total_cost_estimate: 100,
        robustness_score: 0.9,
      },
    };

    const result = validateItinerary(validItinerary);
    expect(result.success).toBe(true);
  });

  it('should reject invalid date format', () => {
    const invalidItinerary = {
      request_id: 'test-002',
      days: [
        {
          date: '07/15/2026', // Invalid: not YYYY-MM-DD
          items: [],
        },
      ],
    };

    const result = validateItinerary(invalidItinerary);
    expect(result.success).toBe(false);
  });

  it('should reject invalid item type', () => {
    const invalidItinerary = {
      request_id: 'test-003',
      days: [
        {
          date: '2026-07-15',
          items: [
            {
              id: 'item-001',
              type: 'SHOPPING', // Invalid: not in enum
              start_window: '10:00',
              end_window: '12:00',
              location_ref: { name: 'Test' },
              evidence_refs: [],
              verified: false,
            },
          ],
        },
      ],
    };

    const result = validateItinerary(invalidItinerary);
    expect(result.success).toBe(false);
  });
});

describe('DecisionLogEntry Schema', () => {
  it('should validate a valid DecisionLogEntry', () => {
    const validEntry = {
      request_id: 'test-001',
      step: 'GATE_EVAL',
      actor: 'Gatekeeper',
      inputs_summary: 'TripPlanRequest for Iceland F-Road trip',
      outputs_summary: 'BLOCK due to F208 winter closure',
      evidence_refs: ['evidence-001', 'evidence-002'],
      timestamp: '2026-02-15T10:00:00.000Z',
      metadata: {
        duration_ms: 1500,
        tool_calls: 3,
        cost_est_usd: 0.05,
        alternatives_considered: 2,
        guardian: 'ABU',
      },
    };

    const result = validateDecisionLogEntry(validEntry);
    expect(result.success).toBe(true);
  });

  it('should reject invalid step', () => {
    const invalidEntry = {
      request_id: 'test-002',
      step: 'INVALID_STEP', // Invalid: not in enum
      actor: 'Gatekeeper',
      inputs_summary: 'Test',
      outputs_summary: 'Test',
      evidence_refs: [],
      timestamp: '2026-02-15T10:00:00.000Z',
    };

    const result = validateDecisionLogEntry(invalidEntry);
    expect(result.success).toBe(false);
  });

  it('should reject invalid timestamp', () => {
    const invalidEntry = {
      request_id: 'test-003',
      step: 'GATE_EVAL',
      actor: 'Gatekeeper',
      inputs_summary: 'Test',
      outputs_summary: 'Test',
      evidence_refs: [],
      timestamp: '2026-02-15 10:00:00', // Invalid: not ISO 8601
    };

    const result = validateDecisionLogEntry(invalidEntry);
    expect(result.success).toBe(false);
  });

  it('should allow extra metadata fields (passthrough)', () => {
    const validEntry = {
      request_id: 'test-004',
      step: 'GATE_EVAL',
      actor: 'Gatekeeper',
      inputs_summary: 'Test',
      outputs_summary: 'Test',
      evidence_refs: [],
      timestamp: '2026-02-15T10:00:00.000Z',
      metadata: {
        duration_ms: 1500,
        custom_field: 'custom_value', // Extra field should be allowed
      },
    };

    const result = validateDecisionLogEntry(validEntry);
    expect(result.success).toBe(true);
  });
});
