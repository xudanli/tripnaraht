/**
 * InformationGainService 单元测试
 * 专利 3.12.2：U'(a) = U(a) + β·InformationGain(a)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { InformationGainService } from './information-gain.service';
import { ProbabilisticWorldModelService } from '../probabilistic/probabilistic-world-model.service';
import type { WorldModelContext } from '../../shared/world-model.types';

function createMockWorldContext(): WorldModelContext {
  return {
    physical: {
      demEvidence: [{ segmentId: 's1', elevationProfile: [0, 100], cumulativeAscent: 100, maxSlopePct: 5, rollingAscent3Days: 200, fatigueIndex: 10, violation: 'NONE', explanation: '' }],
      roadStates: [],
      hazardZones: [],
      ferryStates: [],
      countryCode: 'IS',
      month: 7,
      climateSeasonality: {
        countryCode: 'IS',
        month: 7,
        accessibilityScore: 0.8,
        typicalWeather: { windSpeedMps: 10, precipitationMmPerHour: 2, visibilityMeters: 5000, temperatureCelsius: 15 },
      },
    } as WorldModelContext['physical'],
    human: {
      profileId: 'test',
      maxDailyAscentM: 800,
      rollingAscent3DaysM: 2000,
      maxSlopePct: 15,
      preferredPace: 'MEDIUM',
      riskTolerance: 'MEDIUM',
      highAltitudeExperience: 'BASIC',
      bufferDayBias: 'MEDIUM',
    } as WorldModelContext['human'],
    routeDirection: { id: 'rd1', countryCode: 'IS', name: 'Test', nameCN: '测试', nameEN: 'Test', tags: [], philosophy: '' } as WorldModelContext['routeDirection'],
  };
}

describe('InformationGainService', () => {
  let service: InformationGainService;
  let worldModel: ProbabilisticWorldModelService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InformationGainService, ProbabilisticWorldModelService],
    }).compile();

    service = module.get(InformationGainService);
    worldModel = module.get(ProbabilisticWorldModelService);
  });

  it('应返回 [0,1] 范围内的信息增益', () => {
    expect(worldModel).toBeDefined();
    const ctx = createMockWorldContext();
    const ig = service.computeInformationGain({ candidateId: 'c1', worldContext: ctx });
    expect(ig).toBeGreaterThanOrEqual(0);
    expect(ig).toBeLessThanOrEqual(1);
  });

  it('VARIANCE_REDUCTION 应使用置信区间宽度', () => {
    const ctx = createMockWorldContext();
    const ig = service.computeInformationGain(
      { candidateId: 'c1', worldContext: ctx, confidenceInterval: { lower: 0.3, upper: 0.9 } },
      'VARIANCE_REDUCTION',
    );
    expect(ig).toBeGreaterThanOrEqual(0);
    expect(ig).toBeLessThanOrEqual(1);
  });
});
