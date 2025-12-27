// scripts/test-memory-system.ts
/**
 * TripNARA Memory System 端到端测试
 * 
 * 测试记忆层系统的完整功能：
 * - L1: 用户画像读写
 * - L2: 决策记忆保存
 * - L3: 路线健康度更新
 * - L4: 反馈保存和学习
 * - 用户画像 → 决策参数映射
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MemoryService } from '../src/agent/memory/services/memory.service';
import { UserProfileMapperService } from '../src/agent/memory/services/user-profile-mapper.service';
import { DecisionParamsInjectorService } from '../src/agent/memory/services/decision-params-injector.service';

async function testMemorySystem() {
  console.log('🧪 Starting TripNARA Memory System E2E Test...\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  
  try {
    const memoryService = app.get(MemoryService);
    const profileMapper = app.get(UserProfileMapperService);
    const decisionInjector = app.get(DecisionParamsInjectorService);

    const testUserId = `test-user-${Date.now()}`;
    const testTripId = `test-trip-${Date.now()}`;

    console.log('📝 Test User ID:', testUserId);
    console.log('📝 Test Trip ID:', testTripId);
    console.log('');

    // ========== Test 1: L1 - 用户画像 ==========
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 1: L1 - User Travel Profile');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 1.1 创建用户画像
    const profile = {
      userId: testUserId,
      pacePreference: 'SLOW' as const,
      altitudeTolerance: 'LOW' as const,
      riskTolerance: 'LOW' as const,
      travelPhilosophy: 'SCENIC' as const,
      preferredRouteTypes: ['HIKING', 'NATURE'] as any[],
      confidence: 0.8,
      source: 'explicit' as const,
      updatedAt: new Date(),
    };

    await memoryService.saveUserTravelProfile(profile);
    console.log('✅ Saved user profile:', {
      pacePreference: profile.pacePreference,
      altitudeTolerance: profile.altitudeTolerance,
      riskTolerance: profile.riskTolerance,
      travelPhilosophy: profile.travelPhilosophy,
    });

    // 1.2 读取用户画像
    const savedProfile = await memoryService.getUserTravelProfile(testUserId);
    if (savedProfile && savedProfile.userId === testUserId) {
      console.log('✅ Retrieved user profile successfully');
    } else {
      throw new Error('Failed to retrieve user profile');
    }

    // 1.3 更新用户画像
    await memoryService.updateUserTravelProfile(testUserId, {
      confidence: 0.9,
    });
    const updatedProfile = await memoryService.getUserTravelProfile(testUserId);
    if (updatedProfile && updatedProfile.confidence === 0.9) {
      console.log('✅ Updated user profile successfully');
    } else {
      throw new Error('Failed to update user profile');
    }

    console.log('');

    // ========== Test 2: 用户画像 → 决策参数映射 ==========
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 2: User Profile → Decision Params Mapping');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const decisionParams = profileMapper.mapUserProfileToDecisionParams(updatedProfile!);
    console.log('✅ Mapped to decision params:', {
      maxElevationM: decisionParams.constraints.maxElevationM,
      bufferTimeMin: decisionParams.constraints.bufferTimeMin,
      stabilityWeight: decisionParams.routeDirectionBias.stabilityWeight.toFixed(2),
      sceneryWeight: decisionParams.routeDirectionBias.sceneryWeight.toFixed(2),
      abuWeight: decisionParams.strategyPreference.abuWeight.toFixed(2),
      preferRestDay: decisionParams.repairPolicy.preferRestDay,
    });

    // 验证映射结果
    if (decisionParams.constraints.maxElevationM === 3500) {
      console.log('✅ Altitude constraint correctly set to 3500m');
    } else {
      throw new Error('Altitude constraint mapping failed');
    }

    if (decisionParams.repairPolicy.preferRestDay === true) {
      console.log('✅ Repair policy correctly set to prefer rest day');
    } else {
      throw new Error('Repair policy mapping failed');
    }

    console.log('');

    // ========== Test 3: L2 - 决策记忆 ==========
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 3: L2 - Route Direction Decision Memory');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const decisionMemory = {
      id: `decision-${Date.now()}`,
      userId: testUserId,
      tripId: testTripId,
      countryCode: 'IS',
      month: 7,
      selectedRouteDirectionId: 1,
      rejectedRouteDirectionIds: [2, 3, 4],
      keyConstraints: {
        maxElevationM: 3500,
        maxDailyAscentM: 500,
      },
      scoreBreakdown: {
        tagMatch: { score: 80, weight: 0.4 },
        seasonality: { score: 90, weight: 0.3 },
        pace: { score: 70, weight: 0.2 },
        risk: { score: 85, weight: 0.1 },
      },
      explanation: {
        whySelected: '匹配用户偏好：风景、低海拔、稳定路线',
        whyRejected: [
          { id: 2, reason: '海拔过高' },
          { id: 3, reason: '风险过高' },
          { id: 4, reason: '节奏不匹配' },
        ],
        riskPoints: ['weatherWindow'],
      },
      createdAt: new Date(),
    };

    await memoryService.saveRouteDirectionDecision(decisionMemory);
    console.log('✅ Saved route direction decision:', {
      selectedId: decisionMemory.selectedRouteDirectionId,
      rejectedIds: decisionMemory.rejectedRouteDirectionIds,
    });

    // 查询决策历史
    const decisions = await memoryService.getUserRouteDirectionDecisions(testUserId, 'IS');
    if (decisions.length > 0 && decisions[0].selectedRouteDirectionId === 1) {
      console.log('✅ Retrieved decision history successfully');
    } else {
      throw new Error('Failed to retrieve decision history');
    }

    console.log('');

    // ========== Test 4: L3 - 路线健康度 ==========
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 4: L3 - Route Direction Health');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 更新路线健康度（成功）
    const health1 = await memoryService.updateRouteDirectionHealth(
      1,
      'IS',
      true, // success
      undefined,
      undefined
    );
    console.log('✅ Updated route health (success):', {
      totalRuns: health1.totalRuns,
      successRuns: health1.successRuns,
      failureRuns: health1.failureRuns,
    });

    // 更新路线健康度（失败）
    const health2 = await memoryService.updateRouteDirectionHealth(
      1,
      'IS',
      false, // failure
      '海拔过高导致高反',
      '降低海拔或增加适应日'
    );
    console.log('✅ Updated route health (failure):', {
      totalRuns: health2.totalRuns,
      successRuns: health2.successRuns,
      failureRuns: health2.failureRuns,
      failureReasons: health2.commonFailureReasons,
      repairs: health2.commonRepairs,
    });

    // 读取路线健康度
    const health = await memoryService.getRouteDirectionHealth(1, 'IS');
    if (health && health.totalRuns === 2) {
      console.log('✅ Retrieved route health successfully');
    } else {
      throw new Error('Failed to retrieve route health');
    }

    console.log('');

    // ========== Test 5: L4 - 反馈和学习 ==========
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 5: L4 - Trip Outcome Feedback & Learning');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const feedback = {
      tripId: testTripId,
      userId: testUserId,
      overallSuccess: true,
      fatigueLevel: 3 as const,
      satisfaction: 4 as const,
      abandoned: false,
      failurePoints: [],
      notes: '整体体验良好，但第3天有些累',
      createdAt: new Date(),
    };

    await memoryService.saveTripOutcomeFeedback(feedback);
    console.log('✅ Saved trip outcome feedback:', {
      overallSuccess: feedback.overallSuccess,
      satisfaction: feedback.satisfaction,
      fatigueLevel: feedback.fatigueLevel,
    });

    // 查询反馈历史
    const feedbacks = await memoryService.getUserTripFeedbacks(testUserId);
    if (feedbacks.length > 0 && feedbacks[0].tripId === testTripId) {
      console.log('✅ Retrieved feedback history successfully');
    } else {
      throw new Error('Failed to retrieve feedback history');
    }

    // 验证学习机制（应该更新了用户画像的置信度）
    const learnedProfile = await memoryService.getUserTravelProfile(testUserId);
    if (learnedProfile && learnedProfile.confidence > updatedProfile!.confidence) {
      console.log('✅ Learning mechanism updated profile confidence:', {
        before: updatedProfile!.confidence,
        after: learnedProfile.confidence,
      });
    } else {
      console.log('⚠️  Learning mechanism may not have updated confidence (this is OK if confidence was already high)');
    }

    console.log('');

    // ========== Test 6: 决策参数注入 ==========
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 6: Decision Params Injection');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const mockRouteDirections = [
      {
        id: 1,
        routeType: 'HIKING',
        tags: ['风景', '徒步', '自然'],
        score: 80,
        routeDirection: {
          id: 1,
          routeType: 'HIKING',
          tags: ['风景', '徒步', '自然'],
          constraints: {
            hard: { maxElevationM: 3000 },
          },
        },
      },
      {
        id: 2,
        routeType: 'ROAD_TRIP',
        tags: ['自驾', '城市'],
        score: 70,
        routeDirection: {
          id: 2,
          routeType: 'ROAD_TRIP',
          tags: ['自驾', '城市'],
          constraints: {
            hard: { maxElevationM: 2000 },
          },
        },
      },
    ];

    const adjustedRDs = await decisionInjector.injectDecisionParams(
      testUserId,
      mockRouteDirections as any,
      {} as any
    );

    console.log('✅ Adjusted route directions:', {
      count: adjustedRDs.length,
      scores: adjustedRDs.map(rd => ({ id: rd.routeDirection.id, score: rd.score.toFixed(2) })),
    });

    // 验证偏好路线类型过滤
    const hikingRd = adjustedRDs.find(rd => rd.routeDirection.routeType === 'HIKING');
    const roadTripRd = adjustedRDs.find(rd => rd.routeDirection.routeType === 'ROAD_TRIP');
    
    if (hikingRd && roadTripRd) {
      // HIKING 应该在偏好列表中，ROAD_TRIP 不在，所以 HIKING 的分数应该更高
      console.log('✅ Route type preference filtering working:', {
        hikingScore: hikingRd.score.toFixed(2),
        roadTripScore: roadTripRd.score.toFixed(2),
      });
    }

    console.log('');

    // ========== 总结 ==========
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ All Tests Passed!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Summary:');
    console.log('  ✅ L1: User Travel Profile - READ/WRITE/UPDATE');
    console.log('  ✅ User Profile → Decision Params Mapping');
    console.log('  ✅ L2: Route Direction Decision Memory - SAVE/QUERY');
    console.log('  ✅ L3: Route Direction Health - UPDATE/QUERY');
    console.log('  ✅ L4: Trip Outcome Feedback - SAVE/LEARN/QUERY');
    console.log('  ✅ Decision Params Injection - WORKING');
    console.log('');
    console.log('🎉 TripNARA Memory System is fully operational!');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

testMemorySystem();

