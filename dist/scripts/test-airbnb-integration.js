#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const airbnb_integration_service_1 = require("../src/mcp/airbnb-integration.service");
const airbnb_monitoring_service_1 = require("../src/mcp/airbnb-monitoring.service");
const abu_strategy_service_1 = require("../src/trips/decision/strategies/abu-strategy.service");
const dr_dre_strategy_service_1 = require("../src/trips/decision/strategies/dr-dre-strategy.service");
const neptune_strategy_service_1 = require("../src/trips/decision/strategies/neptune-strategy.service");
async function testAirbnbIntegration() {
    var _a, _b, _c;
    console.log('\n🧪 开始测试 Airbnb 集成效果...\n');
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    try {
        const airbnbIntegration = app.get(airbnb_integration_service_1.AirbnbIntegrationService);
        const airbnbMonitoring = app.get(airbnb_monitoring_service_1.AirbnbMonitoringService);
        const abuStrategy = app.get(abu_strategy_service_1.AbuStrategy);
        const drDreStrategy = app.get(dr_dre_strategy_service_1.DrDreStrategy);
        const neptuneStrategy = app.get(neptune_strategy_service_1.NeptuneStrategy);
        console.log('📋 测试 1: AirbnbIntegrationService 关键节点住宿可用性检查');
        try {
            const availability = await airbnbIntegration.checkCriticalNodeAvailability({ lat: 64.1466, lng: -21.9426 }, '2026-06-01', '2026-06-02', 2);
            console.log('✅ 关键节点住宿可用性检查结果:', {
                available: availability.available,
                listingsCount: availability.listingsCount,
                listings: (_a = availability.listings) === null || _a === void 0 ? void 0 : _a.slice(0, 2).map(l => ({
                    name: l.name,
                    location: l.location,
                    distance: l.distanceFromPoint ? `${(l.distanceFromPoint / 1000).toFixed(1)}km` : 'N/A',
                })),
            });
        }
        catch (error) {
            console.log('⚠️  关键节点住宿可用性检查失败:', error.message);
        }
        console.log('\n📋 测试 2: AirbnbIntegrationService 路线走廊内住宿搜索');
        try {
            const corridorAccommodations = await airbnbIntegration.searchAccommodationsInCorridor({ lat: 64.1466, lng: -21.9426 }, 5, '2026-06-01', '2026-06-02', 2);
            console.log('✅ 路线走廊内住宿搜索结果:', {
                available: corridorAccommodations.available,
                listingsCount: corridorAccommodations.listingsCount,
                listings: (_b = corridorAccommodations.listings) === null || _b === void 0 ? void 0 : _b.slice(0, 3).map(l => ({
                    name: l.name,
                    distance: l.distanceFromPoint ? `${(l.distanceFromPoint / 1000).toFixed(1)}km` : 'N/A',
                })),
            });
        }
        catch (error) {
            console.log('⚠️  路线走廊内住宿搜索失败:', error.message);
        }
        console.log('\n📋 测试 3: AirbnbIntegrationService 住宿位置对路线节奏的影响');
        try {
            const impact = await airbnbIntegration.checkAccommodationImpactOnPace({ lat: 64.1466, lng: -21.9426 }, '2026-06-01', '2026-06-02', 2);
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
        }
        catch (error) {
            console.log('⚠️  住宿位置对路线节奏的影响检查失败:', error.message);
        }
        console.log('\n📋 测试 4: 创建模拟数据用于策略测试');
        const mockWorld = {
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
            },
            routeDirection: {
                id: 'test_route',
                name: 'Test Route',
                uuid: 'test-route-uuid',
                countryCode: 'IS',
                corridorGeom: null,
                regions: [],
            },
            complianceEvidence: [],
        };
        const mockPlan = {
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
        console.log('\n📋 测试 5: Abu Strategy 住宿可用性验证集成');
        try {
            const abuResult = await abuStrategy.evaluate(mockWorld, mockPlan);
            console.log('✅ Abu Strategy 评估结果:', {
                allowed: abuResult.allowed,
                action: abuResult.action,
                logs: abuResult.logs
                    .filter(log => { var _a; return (_a = log.reasonCodes) === null || _a === void 0 ? void 0 : _a.some(code => code.includes('ACCOMMODATION')); })
                    .map(log => ({
                    action: log.action,
                    explanation: log.explanation,
                    reasonCodes: log.reasonCodes,
                })),
            });
        }
        catch (error) {
            console.log('⚠️  Abu Strategy 评估失败:', error.message);
        }
        console.log('\n📋 测试 6: Dr.Dre Strategy 住宿位置对节奏的影响集成');
        try {
            const drDreResult = await drDreStrategy.evaluate(mockWorld, mockPlan);
            console.log('✅ Dr.Dre Strategy 评估结果:', {
                allowed: drDreResult.allowed,
                action: drDreResult.action,
                hasUpdatedPlan: !!drDreResult.updatedPlan,
                logs: drDreResult.logs
                    .filter(log => { var _a, _b; return ((_a = log.explanation) === null || _a === void 0 ? void 0 : _a.includes('住宿')) || ((_b = log.explanation) === null || _b === void 0 ? void 0 : _b.includes('accommodation')); })
                    .map(log => ({
                    action: log.action,
                    explanation: log.explanation,
                })),
            });
        }
        catch (error) {
            console.log('⚠️  Dr.Dre Strategy 评估失败:', error.message);
        }
        console.log('\n📋 测试 7: Neptune Strategy 替代住宿搜索集成');
        try {
            const neptuneResult = await neptuneStrategy.evaluate(mockWorld, mockPlan);
            console.log('✅ Neptune Strategy 评估结果:', {
                allowed: neptuneResult.allowed,
                action: neptuneResult.action,
                hasUpdatedPlan: !!neptuneResult.updatedPlan,
                logs: neptuneResult.logs
                    .filter(log => { var _a; return (_a = log.reasonCodes) === null || _a === void 0 ? void 0 : _a.some(code => code.includes('AIRBNB')); })
                    .map(log => ({
                    action: log.action,
                    explanation: log.explanation,
                    reasonCodes: log.reasonCodes,
                })),
            });
        }
        catch (error) {
            console.log('⚠️  Neptune Strategy 评估失败:', error.message);
        }
        console.log('\n\n🎯 ========== Phase 2 测试 ==========\n');
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
        }
        catch (error) {
            console.log('⚠️  住宿成本估算失败:', error.message);
        }
        console.log('\n📋 测试 9: AirbnbIntegrationService 用户偏好匹配搜索');
        try {
            const preferenceSearch = await airbnbIntegration.searchAccommodationsWithPreferences({ lat: 64.1466, lng: -21.9426 }, '2026-06-01', '2026-06-02', 2, {
                pets: 0,
                accessibility: false,
                kitchen: true,
                wifi: true,
            });
            console.log('✅ 用户偏好匹配搜索结果:', {
                available: preferenceSearch.available,
                listingsCount: preferenceSearch.listingsCount,
                listings: (_c = preferenceSearch.listings) === null || _c === void 0 ? void 0 : _c.slice(0, 3).map(l => ({
                    name: l.name,
                    location: l.location,
                    price: l.price ? `$${l.price.amount.toFixed(2)}` : 'N/A',
                })),
            });
        }
        catch (error) {
            console.log('⚠️  用户偏好匹配搜索失败:', error.message);
        }
        console.log('\n📋 测试 10: AirbnbIntegrationService 住宿位置验证');
        try {
            const validation = await airbnbIntegration.validateAccommodationInCorridor({ lat: 64.1466, lng: -21.9426 }, null, 5000);
            console.log('✅ 住宿位置验证结果:', {
                valid: validation.valid,
                distanceToCorridor: validation.distanceToCorridor
                    ? `${(validation.distanceToCorridor / 1000).toFixed(1)}km`
                    : 'N/A',
                explanation: validation.explanation,
            });
        }
        catch (error) {
            console.log('⚠️  住宿位置验证失败:', error.message);
        }
        console.log('\n\n🎯 ========== Phase 3 测试 ==========\n');
        console.log('📋 测试 11: AirbnbMonitoringService 监控功能');
        try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const today = new Date().toISOString().split('T')[0];
            const dailyStats = await airbnbMonitoring.getDailyStats(today);
            console.log('✅ 今日统计:', {
                date: (dailyStats === null || dailyStats === void 0 ? void 0 : dailyStats.date) || today,
                totalCalls: (dailyStats === null || dailyStats === void 0 ? void 0 : dailyStats.totalCalls) || 0,
                successfulCalls: (dailyStats === null || dailyStats === void 0 ? void 0 : dailyStats.successfulCalls) || 0,
                failedCalls: (dailyStats === null || dailyStats === void 0 ? void 0 : dailyStats.failedCalls) || 0,
                avgResponseTime: (dailyStats === null || dailyStats === void 0 ? void 0 : dailyStats.avgResponseTime)
                    ? `${dailyStats.avgResponseTime.toFixed(0)}ms`
                    : 'N/A',
                callsByTool: (dailyStats === null || dailyStats === void 0 ? void 0 : dailyStats.callsByTool) || {},
                estimatedCost: (dailyStats === null || dailyStats === void 0 ? void 0 : dailyStats.estimatedCost)
                    ? `$${dailyStats.estimatedCost.toFixed(4)}`
                    : '$0.0000',
            });
        }
        catch (error) {
            console.log('⚠️  获取监控统计失败:', error.message);
        }
        console.log('\n📋 测试 12: AirbnbMonitoringService 成本检查');
        try {
            const costCheck = await airbnbMonitoring.checkCostLimit(1);
            console.log('✅ 成本检查结果:', {
                exceeded: costCheck.exceeded,
                currentCost: `$${costCheck.currentCost.toFixed(4)}`,
                limit: `$${costCheck.limit.toFixed(2)}`,
                status: costCheck.exceeded ? '⚠️  超过限制' : '✅ 在限制内',
            });
        }
        catch (error) {
            console.log('⚠️  成本检查失败:', error.message);
        }
        console.log('\n📋 测试 13: AirbnbMonitoringService 性能指标');
        try {
            const performance = await airbnbMonitoring.getPerformanceMetrics(7);
            console.log('✅ 性能指标:', {
                avgResponseTime: performance.avgResponseTime
                    ? `${performance.avgResponseTime.toFixed(0)}ms`
                    : 'N/A',
                successRate: `${(performance.successRate * 100).toFixed(1)}%`,
                totalCalls: performance.totalCalls,
                callsByTool: performance.callsByTool,
            });
        }
        catch (error) {
            console.log('⚠️  获取性能指标失败:', error.message);
        }
        console.log('\n📋 测试 14: AirbnbMonitoringService 总成本估算');
        try {
            const totalCost = await airbnbMonitoring.getTotalCostEstimate(30);
            console.log('✅ 总成本估算（最近 30 天）:', {
                totalCost: `$${totalCost.toFixed(4)}`,
                avgDailyCost: `$${(totalCost / 30).toFixed(4)}`,
            });
        }
        catch (error) {
            console.log('⚠️  总成本估算失败:', error.message);
        }
        console.log('\n✅ 所有测试完成！\n');
    }
    catch (error) {
        console.error('❌ 测试失败:', error.message);
        console.error(error.stack);
    }
    finally {
        await app.close();
    }
}
testAirbnbIntegration().catch(console.error);
//# sourceMappingURL=test-airbnb-integration.js.map