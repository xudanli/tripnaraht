// scripts/test-memory-simple.ts
/**
 * TripNARA Memory System 简单测试
 * 
 * 直接测试 Prisma Client 和记忆层表
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testMemoryTables() {
  console.log('🧪 Testing TripNARA Memory System Tables...\n');

  try {
    // Generate UUIDs
    const generateUUID = () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };

    const testUserId = generateUUID();
    const testTripId = generateUUID();

    // ========== Test 1: L1 - User Travel Profile ==========
    console.log('Test 1: L1 - User Travel Profile');
    console.log('─────────────────────────────────────────');

    // Create
    const profile = await prisma.userTravelProfile.upsert({
      where: { userId: testUserId },
      create: {
        userId: testUserId,
        pacePreference: 'SLOW',
        altitudeTolerance: 'LOW',
        riskTolerance: 'LOW',
        travelPhilosophy: 'SCENIC',
        preferredRouteTypes: ['HIKING', 'NATURE'],
        confidence: 0.8,
        source: 'explicit',
      },
      update: {
        confidence: 0.9,
      },
    });
    console.log('✅ Created/Updated profile:', {
      userId: profile.userId,
      pacePreference: profile.pacePreference,
      confidence: profile.confidence,
    });

    // Read
    const readProfile = await prisma.userTravelProfile.findUnique({
      where: { userId: testUserId },
    });
    if (readProfile) {
      console.log('✅ Read profile successfully');
    } else {
      throw new Error('Failed to read profile');
    }

    console.log('');

    // ========== Test 2: L2 - Route Direction Decision ==========
    console.log('Test 2: L2 - Route Direction Decision');
    console.log('─────────────────────────────────────────');

    const decision = await prisma.routeDirectionDecision.create({
      data: {
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
        },
        explanation: {
          whySelected: '匹配用户偏好：风景、低海拔、稳定路线',
          whyRejected: [
            { id: 2, reason: '海拔过高' },
            { id: 3, reason: '风险过高' },
          ],
        },
      },
    });
    console.log('✅ Created decision:', {
      id: decision.id,
      selectedId: decision.selectedRouteDirectionId,
      rejectedCount: decision.rejectedRouteDirectionIds.length,
    });

    // Query
    const decisions = await prisma.routeDirectionDecision.findMany({
      where: { userId: testUserId, countryCode: 'IS' },
      take: 10,
    });
    console.log('✅ Queried decisions:', {
      count: decisions.length,
    });

    console.log('');

    // ========== Test 3: L3 - Route Direction Health ==========
    console.log('Test 3: L3 - Route Direction Health');
    console.log('─────────────────────────────────────────');

    // Create/Update
    const health = await prisma.routeDirectionHealth.upsert({
      where: {
        routeDirectionId_countryCode: {
          routeDirectionId: 1,
          countryCode: 'IS',
        },
      },
      create: {
        routeDirectionId: 1,
        countryCode: 'IS',
        totalRuns: 1,
        successRuns: 1,
        failureRuns: 0,
        commonFailureReasons: [],
        commonRepairs: [],
      },
      update: {
        totalRuns: { increment: 1 },
        successRuns: { increment: 1 },
      },
    });
    console.log('✅ Created/Updated health:', {
      routeDirectionId: health.routeDirectionId,
      totalRuns: health.totalRuns,
      successRuns: health.successRuns,
      failureRuns: health.failureRuns,
    });

    // Update with failure
    const health2 = await prisma.routeDirectionHealth.update({
      where: {
        routeDirectionId_countryCode: {
          routeDirectionId: 1,
          countryCode: 'IS',
        },
      },
      data: {
        totalRuns: { increment: 1 },
        failureRuns: { increment: 1 },
        commonFailureReasons: { push: '海拔过高导致高反' },
        commonRepairs: { push: '降低海拔或增加适应日' },
      },
    });
    console.log('✅ Updated health with failure:', {
      totalRuns: health2.totalRuns,
      failureRuns: health2.failureRuns,
      failureReasons: health2.commonFailureReasons,
    });

    console.log('');

    // ========== Test 4: L4 - Trip Outcome Feedback ==========
    console.log('Test 4: L4 - Trip Outcome Feedback');
    console.log('─────────────────────────────────────────');

    const feedback = await prisma.tripOutcomeFeedback.upsert({
      where: { tripId: testTripId },
      create: {
        tripId: testTripId,
        userId: testUserId,
        overallSuccess: true,
        fatigueLevel: 3,
        satisfaction: 4,
        abandoned: false,
        failurePoints: [],
        notes: '整体体验良好，但第3天有些累',
      },
      update: {
        satisfaction: 5,
      },
    });
    console.log('✅ Created/Updated feedback:', {
      tripId: feedback.tripId,
      overallSuccess: feedback.overallSuccess,
      satisfaction: feedback.satisfaction,
      fatigueLevel: feedback.fatigueLevel,
    });

    // Query
    const feedbacks = await prisma.tripOutcomeFeedback.findMany({
      where: { userId: testUserId },
      take: 10,
    });
    console.log('✅ Queried feedbacks:', {
      count: feedbacks.length,
    });

    console.log('');

    // ========== Summary ==========
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ All Tests Passed!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Summary:');
    console.log('  ✅ L1: User Travel Profile - CREATE/READ/UPDATE');
    console.log('  ✅ L2: Route Direction Decision - CREATE/QUERY');
    console.log('  ✅ L3: Route Direction Health - CREATE/UPDATE');
    console.log('  ✅ L4: Trip Outcome Feedback - CREATE/QUERY');
    console.log('');
    console.log('🎉 All memory layer tables are working correctly!');

    // Cleanup (optional)
    console.log('');
    console.log('Cleaning up test data...');
    await prisma.tripOutcomeFeedback.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.routeDirectionDecision.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.userTravelProfile.deleteMany({
      where: { userId: testUserId },
    });
    console.log('✅ Cleanup complete');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testMemoryTables();

