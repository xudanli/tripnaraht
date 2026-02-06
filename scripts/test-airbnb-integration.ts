#!/usr/bin/env node
/**
 * 测试 Airbnb 集成效果
 * 
 * Phase 1 测试场景：
 * 1. AirbnbIntegrationService 关键节点住宿可用性检查
 * 2. AirbnbIntegrationService 路线走廊内住宿搜索
 * 3. AirbnbIntegrationService 住宿位置对路线节奏的影响
 * 4. Abu Strategy 住宿可用性验证集成
 * 5. Dr.Dre Strategy 住宿位置对节奏的影响集成
 * 6. Neptune Strategy 替代住宿搜索集成
 * 
 * Phase 2 测试场景：
 * 7. AirbnbIntegrationService 住宿成本估算
 * 8. AirbnbIntegrationService 用户偏好匹配搜索
 * 9. AirbnbIntegrationService 住宿位置验证
 * 
 * Phase 3 测试场景：
 * 10. AirbnbMonitoringService 监控功能
 * 11. AirbnbMonitoringService 成本检查
 * 12. AirbnbMonitoringService 性能指标
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AirbnbIntegrationService } from '../src/mcp/airbnb-integration.service';
import { AirbnbMonitoringService } from '../src/mcp/airbnb-monitoring.service';
import { AbuStrategy } from '../src/trips/decision/strategies/abu-strategy.service';
import { DrDreStrategy } from '../src/trips/decision/strategies/dr-dre-strategy.service';
import { NeptuneStrategy } from '../src/trips/decision/strategies/neptune-strategy.service';
import { WorldModelContext, RoutePlanDraft } from '../src/trips/decision/shared/world-model.types';

async function testAirbnbIntegration() {
  console.log('\n🧪 开始测试 Airbnb 集成效果...\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  
  try {
    const airbnbIntegration = app.get(AirbnbIntegrationService);
    const airbnbMonitoring = app.get(AirbnbMonitoringService);
    const abuStrategy = app.get(AbuStrategy);
    const drDreStrategy = app.get(DrDreStrategy);
    const neptuneStrategy = app.get(NeptuneStrategy);

    // 测试 1: AirbnbIntegrationService 关键节点住宿可用性检查
    console.log('📋 测试 1: AirbnbIntegrationService 关键节点住宿可用性检查');
    try {
      const availability = await airbnbIntegration.checkCriticalNodeAvailability(
        { lat: 64.1466, lng: -21.9426 }, // 雷克雅未克坐标
        '2026-06-01',
        '2026-06-02',
        2,
      );
      console.log('✅ 关键节点住宿可用性检查结果:', {
        available: availability.available,
        listingsCount: availability.listingsCount,
        listings: availability.listings?.slice(0, 2).map(l => ({
          name: l.name,
          location: l.location,
          distance: l.distanceFromPoint ? `${(l.distanceFromPoint / 1000).toFixed(1)}km` : 'N/A',
        })),
      });
    } catch (error: any) {
      console.log('⚠️  关键节点住宿可用性检查失败:', error.message);
    }

    // 测试 2: AirbnbIntegrationService 路线走廊内住宿搜索
    console.log('\n📋 测试 2: AirbnbIntegrationService 路线走廊内住宿搜索');
    try {
      const corridorAccommodations = await airbnbIntegration.searchAccommodationsInCorridor(
        { lat: 64.1466, lng: -21.9426 }, // 雷克雅未克坐标
        5, // 5km 半径
        '2026-06-01',
        '2026-06-02',
        2,
      );
      console.log('✅ 路线走廊内住宿搜索结果:', {
        available: corridorAccommodations.available,
        listingsCount: corridorAccommodations.listingsCount,
        listings: corridorAccommodations.listings?.slice(0, 3).map(l => ({
          name: l.name,
          distance: l.distanceFromPoint ? `${(l.distanceFromPoint / 1000).toFixed(1)}km` : 'N/A',
        })),
      });
    } catch (error: any) {
      console.log('⚠️  路线走廊内住宿搜索失败:', error.message);
    }

    // 测试 3: AirbnbIntegrationService 住宿位置对路线节奏的影响
    console.log('\n📋 测试 3: AirbnbIntegrationService 住宿位置对路线节奏的影响');
    try {
      const impact = await airbnbIntegration.checkAccommodationImpactOnPace(
        { lat: 64.1466, lng: -21.9426 }, // 路线终点
        '2026-06-01',
        '2026-06-02',
        2,
      );
      console.log('✅ 住宿位置对路线节奏的影响:', {
        distanceToNearest: impact.distanceToNearestAccommodation 
          ? `${(impact.distanceToNearestAccommodation / 1000).toFixed(1)}km` 
          : 'N/A',
        impact: impact.impact,
        nearestAccommodation: impact.nearestAccommodation ? {
          name: impact.nearestAccommodation.name,
          distance: `${(impact.nearestAccommodation.distance / 1000).toFixed(1)}km`,
        } : null,
      });
    } catch (error: any) {
      console.log('⚠️  住宿位置对路线节奏的影响检查失败:', error.message);
    }

    // 测试 4: 创建模拟的 WorldModelContext 和 RoutePlanDraft
    console.log('\n📋 测试 4: 创建模拟数据用于策略测试');
    const mockWorld: WorldModelContext = {
      physical: {
        demEvidence: [
          {
            segmentId: 'test_segment_1',
            elevationProfile: [],
            cumulativeAscent: 0,
            maxSlopePct: 0,
            rollingAscent3Days: 0,
            fatigueIndex: 0,
            violation: 'NONE',
            explanation: '测试数据',
          },
        ],
        roadStates: [],
        hazardZones: [],
        ferryStates: [],
        countryCode: 'IS',
        month: 6,
      },
      human: {
        maxDailyAscentM: 1000,
        rollingAscent3DaysM: 2500,
        maxSlopePct: 15,
        weatherRiskWeight: 0.5,
        bufferDayBias: 'MEDIUM',
        riskTolerance: 'MEDIUM',
        partySize: 2,
      } as any,
      routeDirection: {
        id: 'test_route',
        name: 'Test Route',
        uuid: 'test-route-uuid',
        countryCode: 'IS',
        corridorGeom: null,
        regions: [],
      } as any,
      complianceEvidence: [],
    };

    const mockPlan: RoutePlanDraft = {
      tripId: 'test_trip_airbnb',
      routeDirectionId: 'test-route-uuid',
      segments: [
        {
          segmentId: 'segment_1',
          dayIndex: 0,
          distanceKm: 50,
          ascentM: 500,
          slopePct: 5,
          metadata: {
            startLocation: { lat: 64.1466, lng: -21.9426 },
            endLocation: { lat: 64.2000, lng: -22.0000 },
            date: '2026-06-01',
          },
        },
        {
          segmentId: 'segment_2',
          dayIndex: 1,
          distanceKm: 60,
          ascentM: 600,
          slopePct: 6,
          metadata: {
            startLocation: { lat: 64.2000, lng: -22.0000 },
            endLocation: { lat: 64.2500, lng: -22.1000 },
            date: '2026-06-02',
          },
        },
      ],
    };

    // 测试 5: Abu Strategy 住宿可用性验证集成
    console.log('\n📋 测试 5: Abu Strategy 住宿可用性验证集成');
    try {
      const abuResult = await abuStrategy.evaluate(mockWorld, mockPlan);
      console.log('✅ Abu Strategy 评估结果:', {
        allowed: abuResult.allowed,
        action: abuResult.action,
        logs: abuResult.logs
          .filter(log => log.reasonCodes?.some(code => code.includes('ACCOMMODATION')))
          .map(log => ({
            action: log.action,
            explanation: log.explanation,
            reasonCodes: log.reasonCodes,
          })),
      });
    } catch (error: any) {
      console.log('⚠️  Abu Strategy 评估失败:', error.message);
    }

    // 测试 6: Dr.Dre Strategy 住宿位置对节奏的影响集成
    console.log('\n📋 测试 6: Dr.Dre Strategy 住宿位置对节奏的影响集成');
    try {
      const drDreResult = await drDreStrategy.evaluate(mockWorld, mockPlan);
      console.log('✅ Dr.Dre Strategy 评估结果:', {
        allowed: drDreResult.allowed,
        action: drDreResult.action,
        hasUpdatedPlan: !!drDreResult.updatedPlan,
        logs: drDreResult.logs
          .filter(log => log.explanation?.includes('住宿') || log.explanation?.includes('accommodation'))
          .map(log => ({
            action: log.action,
            explanation: log.explanation,
          })),
      });
    } catch (error: any) {
      console.log('⚠️  Dr.Dre Strategy 评估失败:', error.message);
    }

    // 测试 7: Neptune Strategy 替代住宿搜索集成
    console.log('\n📋 测试 7: Neptune Strategy 替代住宿搜索集成');
    try {
      const neptuneResult = await neptuneStrategy.evaluate(mockWorld, mockPlan);
      console.log('✅ Neptune Strategy 评估结果:', {
        allowed: neptuneResult.allowed,
        action: neptuneResult.action,
        hasUpdatedPlan: !!neptuneResult.updatedPlan,
        logs: neptuneResult.logs
          .filter(log => log.reasonCodes?.some(code => code.includes('AIRBNB')))
          .map(log => ({
            action: log.action,
            explanation: log.explanation,
            reasonCodes: log.reasonCodes,
          })),
      });
    } catch (error: any) {
      console.log('⚠️  Neptune Strategy 评估失败:', error.message);
    }

    // ========== Phase 2 测试 ==========
    console.log('\n\n🎯 ========== Phase 2 测试 ==========\n');

    // 测试 8: AirbnbIntegrationService 住宿成本估算
    console.log('📋 测试 8: AirbnbIntegrationService 住宿成本估算');
    try {
      const costEstimate = await airbnbIntegration.estimateAccommodationCost(mockPlan, mockWorld);
      console.log('✅ 住宿成本估算结果:', {
        totalCost: `$${costEstimate.totalCost.toFixed(2)}`,
        currency: costEstimate.currency,
        costPerNight: `$${costEstimate.costPerNight.toFixed(2)}`,
        nights: costEstimate.nights,
        breakdown: costEstimate.breakdown.map(item => ({
          day: item.dayIndex + 1,
          date: item.date,
          cost: `$${item.cost.toFixed(2)}`,
          accommodation: item.accommodationName || 'N/A',
        })),
      });
    } catch (error: any) {
      console.log('⚠️  住宿成本估算失败:', error.message);
    }

    // 测试 9: AirbnbIntegrationService 用户偏好匹配搜索
    console.log('\n📋 测试 9: AirbnbIntegrationService 用户偏好匹配搜索');
    try {
      const preferenceSearch = await airbnbIntegration.searchAccommodationsWithPreferences(
        { lat: 64.1466, lng: -21.9426 },
        '2026-06-01',
        '2026-06-02',
        2,
        {
          pets: 0,
          accessibility: false,
          kitchen: true,
          wifi: true,
        },
      );
      console.log('✅ 用户偏好匹配搜索结果:', {
        available: preferenceSearch.available,
        listingsCount: preferenceSearch.listingsCount,
        listings: preferenceSearch.listings?.slice(0, 3).map(l => ({
          name: l.name,
          location: l.location,
          price: l.price ? `$${l.price.amount.toFixed(2)}` : 'N/A',
        })),
      });
    } catch (error: any) {
      console.log('⚠️  用户偏好匹配搜索失败:', error.message);
    }

    // 测试 10: AirbnbIntegrationService 住宿位置验证
    console.log('\n📋 测试 10: AirbnbIntegrationService 住宿位置验证');
    try {
      const validation = await airbnbIntegration.validateAccommodationInCorridor(
        { lat: 64.1466, lng: -21.9426 },
        null, // 简化处理：没有 corridorGeom
        5000, // 5km 缓冲区
      );
      console.log('✅ 住宿位置验证结果:', {
        valid: validation.valid,
        distanceToCorridor: validation.distanceToCorridor 
          ? `${(validation.distanceToCorridor / 1000).toFixed(1)}km` 
          : 'N/A',
        explanation: validation.explanation,
      });
    } catch (error: any) {
      console.log('⚠️  住宿位置验证失败:', error.message);
    }

    // ========== Phase 3 测试 ==========
    console.log('\n\n🎯 ========== Phase 3 测试 ==========\n');

    // 测试 11: AirbnbMonitoringService 监控功能
    console.log('📋 测试 11: AirbnbMonitoringService 监控功能');
    try {
      // 等待一下，让之前的调用记录有时间写入
      await new Promise(resolve => setTimeout(resolve, 1000));

      const today = new Date().toISOString().split('T')[0];
      const dailyStats = await airbnbMonitoring.getDailyStats(today);
      console.log('✅ 今日统计:', {
        date: dailyStats?.date || today,
        totalCalls: dailyStats?.totalCalls || 0,
        successfulCalls: dailyStats?.successfulCalls || 0,
        failedCalls: dailyStats?.failedCalls || 0,
        avgResponseTime: dailyStats?.avgResponseTime 
          ? `${dailyStats.avgResponseTime.toFixed(0)}ms` 
          : 'N/A',
        callsByTool: dailyStats?.callsByTool || {},
        estimatedCost: dailyStats?.estimatedCost 
          ? `$${dailyStats.estimatedCost.toFixed(4)}` 
          : '$0.0000',
      });
    } catch (error: any) {
      console.log('⚠️  获取监控统计失败:', error.message);
    }

    // 测试 12: AirbnbMonitoringService 成本检查
    console.log('\n📋 测试 12: AirbnbMonitoringService 成本检查');
    try {
      const costCheck = await airbnbMonitoring.checkCostLimit(1); // $1 每日限制
      console.log('✅ 成本检查结果:', {
        exceeded: costCheck.exceeded,
        currentCost: `$${costCheck.currentCost.toFixed(4)}`,
        limit: `$${costCheck.limit.toFixed(2)}`,
        status: costCheck.exceeded ? '⚠️  超过限制' : '✅ 在限制内',
      });
    } catch (error: any) {
      console.log('⚠️  成本检查失败:', error.message);
    }

    // 测试 13: AirbnbMonitoringService 性能指标
    console.log('\n📋 测试 13: AirbnbMonitoringService 性能指标');
    try {
      const performance = await airbnbMonitoring.getPerformanceMetrics(7); // 最近 7 天
      console.log('✅ 性能指标:', {
        avgResponseTime: performance.avgResponseTime 
          ? `${performance.avgResponseTime.toFixed(0)}ms` 
          : 'N/A',
        successRate: `${(performance.successRate * 100).toFixed(1)}%`,
        totalCalls: performance.totalCalls,
        callsByTool: performance.callsByTool,
      });
    } catch (error: any) {
      console.log('⚠️  获取性能指标失败:', error.message);
    }

    // 测试 14: AirbnbMonitoringService 总成本估算
    console.log('\n📋 测试 14: AirbnbMonitoringService 总成本估算');
    try {
      const totalCost = await airbnbMonitoring.getTotalCostEstimate(30); // 最近 30 天
      console.log('✅ 总成本估算（最近 30 天）:', {
        totalCost: `$${totalCost.toFixed(4)}`,
        avgDailyCost: `$${(totalCost / 30).toFixed(4)}`,
      });
    } catch (error: any) {
      console.log('⚠️  总成本估算失败:', error.message);
    }

    console.log('\n✅ 所有测试完成！\n');
  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  } finally {
    await app.close();
  }
}

testAirbnbIntegration().catch(console.error);
