import {
  evaluateHallucinationDeliveryGate,
  isHallucinationDeliveryBlocking,
  narrationLikelyContainsFacts,
} from './hallucination-delivery-gate.util';
import type { HallucinationDetectionResult } from '../../interfaces/hallucination-detection.interface';

describe('hallucination-delivery-gate.util', () => {
  it('blocks REMOVE on FACT claims', () => {
    const result: HallucinationDetectionResult = {
      verifiedClaims: [],
      hallucinationRisks: [
        {
          text: '蓝湖海拔必须 900 米',
          type: 'FACT',
          verified: false,
          source: null,
          confidence: 0,
          confidenceLevel: 'NONE',
          isHallucinationRisk: true,
          action: 'REMOVE',
        },
      ],
      userNotification: { hasRisks: true, message: 'risk' },
      cleanedOutput: null,
      statistics: {
        totalClaims: 1,
        verifiedClaims: 0,
        hallucinationRisks: 1,
        removedClaims: 1,
      },
    };
    const gate = evaluateHallucinationDeliveryGate(result);
    expect(gate.verdict).toBe('hard_fact_conflict');
    expect(isHallucinationDeliveryBlocking(gate)).toBe(true);
  });

  it('allows FLAG speculation as soft_ok', () => {
    const result: HallucinationDetectionResult = {
      verifiedClaims: [],
      hallucinationRisks: [
        {
          text: '可能比较拥挤',
          type: 'SPECULATION',
          verified: false,
          source: null,
          confidence: 0.2,
          confidenceLevel: 'LOW',
          isHallucinationRisk: true,
          action: 'FLAG',
        },
      ],
      userNotification: { hasRisks: true, message: 'soft' },
      cleanedOutput: null,
      statistics: {
        totalClaims: 1,
        verifiedClaims: 0,
        hallucinationRisks: 1,
        removedClaims: 0,
      },
    };
    const gate = evaluateHallucinationDeliveryGate(result);
    expect(gate.verdict).toBe('soft_ok');
    expect(isHallucinationDeliveryBlocking(gate)).toBe(false);
  });

  it('detects likely factual narration for fail-closed skip', () => {
    expect(
      narrationLikelyContainsFacts({
        user_friendly_summary: '第 2 天开车 120 km，蓝湖开放时间 09:00。',
        day_by_day_narrative: [],
        highlights: [],
        tips: [],
      }),
    ).toBe(true);
  });
});
