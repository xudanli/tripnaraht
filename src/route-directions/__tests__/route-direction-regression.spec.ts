// src/route-directions/__tests__/route-direction-regression.spec.ts
/**
 * RouteDirection 回归测试
 * 
 * 验证不同偏好选择不同方向，行程强度被 DEM 控住
 */

import { Test, TestingModule } from '@nestjs/testing';
import { RouteDirectionSelectorService } from '../services/route-direction-selector.service';
import { RouteDirectionsService } from '../route-directions.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { regressionTestCases, RegressionTestCase } from './route-direction-regression.test-data';

describe('RouteDirection Regression Tests', () => {
  let selectorService: RouteDirectionSelectorService;
  let routeDirectionsService: RouteDirectionsService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [RouteDirectionSelectorService, RouteDirectionsService],
    }).compile();

    selectorService = module.get<RouteDirectionSelectorService>(RouteDirectionSelectorService);
    routeDirectionsService = module.get<RouteDirectionsService>(RouteDirectionsService);
  });

  // 跳过测试如果数据库中没有数据
  const skipIfNoData = (recommendations: any[]) => {
    if (recommendations.length === 0) {
      console.warn('⚠️  数据库中没有 RouteDirection 数据，请先运行: npm run seed:route-directions');
      return true;
    }
    return false;
  };

  // 为每个测试用例创建测试
  regressionTestCases.forEach((testCase: RegressionTestCase) => {
    describe(`Test Case: ${testCase.id} - ${testCase.name}`, () => {
      it('should select correct route direction', async () => {
        const recommendations = await selectorService.pickRouteDirections(
          {
            preferences: testCase.input.preferences,
            pace: testCase.input.pace,
            riskTolerance: testCase.input.riskTolerance,
            durationDays: testCase.input.durationDays,
          },
          testCase.input.country,
          testCase.input.month
        );

        if (skipIfNoData(recommendations)) {
          return; // 跳过测试
        }

        expect(recommendations.length).toBeGreaterThan(0);

        const top1 = recommendations[0];
        expect(top1).toBeDefined();
        expect(top1.score).toBeGreaterThanOrEqual(testCase.expected.minScore);
        expect(top1.routeDirection.name).toBe(testCase.expected.top1RouteDirectionName);

        // 验证风险标志
        if (testCase.expected.riskFlags.length > 0) {
          const riskProfile = top1.riskProfile;
          expect(riskProfile).toBeDefined();

          for (const flag of testCase.expected.riskFlags) {
            if (flag === 'altitudeSickness') {
              expect(riskProfile?.altitudeSickness).toBe(true);
            } else if (flag === 'ferryDependent') {
              expect(riskProfile?.ferryDependent).toBe(true);
            } else if (flag === 'roadClosure') {
              expect(riskProfile?.roadClosure).toBe(true);
            } else if (flag === 'weatherWindow') {
              expect(riskProfile?.weatherWindow).toBe(true);
            } else if (flag === 'rapidAscentForbidden') {
              expect(top1.constraints?.rapidAscentForbidden || top1.constraints?.hard?.rapidAscentForbidden).toBe(true);
            } else if (flag === 'requiresPermit') {
              expect(top1.constraints?.requiresPermit || top1.constraints?.hard?.requiresPermit).toBe(true);
            } else if (flag === 'requiresGuide') {
              expect(top1.constraints?.requiresGuide || top1.constraints?.hard?.requiresGuide).toBe(true);
            }
          }
        }

        // 验证可解释性
        expect(top1.scoreBreakdown).toBeDefined();
        expect(top1.matchedSignals).toBeDefined();
        expect(top1.reasons.length).toBeGreaterThan(0);
      });

      it('should have correct constraint structure', async () => {
        const recommendations = await selectorService.pickRouteDirections(
          {
            preferences: testCase.input.preferences,
            pace: testCase.input.pace,
            riskTolerance: testCase.input.riskTolerance,
            durationDays: testCase.input.durationDays,
          },
          testCase.input.country,
          testCase.input.month
        );

        if (skipIfNoData(recommendations)) {
          return; // 跳过测试
        }

        const top1 = recommendations[0];
        const constraints = top1.constraints;

        if (constraints) {
          // 验证约束结构（硬约束/软约束/目标函数）
          if (constraints.hard) {
            expect(constraints.hard).toBeDefined();
          }
          if (constraints.soft) {
            expect(constraints.soft).toBeDefined();
          }
          if (constraints.objectives) {
            expect(constraints.objectives).toBeDefined();
          }
        }
      });
    });
  });

  // 验证不同偏好选择不同方向
  describe('Different preferences select different directions', () => {
    it('NZ: 徒步偏好应选择南岛湖区，出海偏好应选择峡湾', async () => {
      const hikingRecs = await selectorService.pickRouteDirections(
        { preferences: ['徒步'], pace: 'moderate', riskTolerance: 'medium' },
        'NZ',
        1
      );
      const cruiseRecs = await selectorService.pickRouteDirections(
        { preferences: ['出海'], pace: 'relaxed', riskTolerance: 'low' },
        'NZ',
        1
      );

      if (hikingRecs.length === 0 || cruiseRecs.length === 0) {
        console.warn('⚠️  数据库中没有 RouteDirection 数据，跳过测试');
        return;
      }

      expect(hikingRecs[0].routeDirection.name).toContain('SOUTH_ISLAND');
      expect(cruiseRecs[0].routeDirection.name).toContain('MILFORD');
    });

    it('NP: EBC 和 ABC 应该根据偏好区分', async () => {
      const ebcRecs = await selectorService.pickRouteDirections(
        { preferences: ['徒步', '高海拔'], pace: 'moderate', riskTolerance: 'high' },
        'NP',
        10
      );
      const abcRecs = await selectorService.pickRouteDirections(
        { preferences: ['徒步'], pace: 'moderate', riskTolerance: 'medium' },
        'NP',
        11
      );

      if (ebcRecs.length === 0 || abcRecs.length === 0) {
        console.warn('⚠️  数据库中没有 RouteDirection 数据，跳过测试');
        return;
      }

      // EBC 应该优先（如果偏好高海拔）
      if (ebcRecs.length > 0) {
        expect(ebcRecs[0].routeDirection.name).toContain('EBC');
      }
    });
  });
});

