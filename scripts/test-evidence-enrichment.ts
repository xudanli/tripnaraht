// scripts/test-evidence-enrichment.ts
/**
 * 证据增强功能测试脚本
 * 
 * 测试P0修复：证据时效性、置信度、质量评分
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TestResult {
  testName: string;
  passed: boolean;
  message?: string;
  data?: any;
}

async function main() {
  console.log('========================================');
  console.log('证据增强功能测试');
  console.log('========================================\n');

  const results: TestResult[] = [];

  try {
    // 1. 查找一个包含Place数据的行程
    console.log('=== 查找测试行程 ===');
    const trip = await findTestTrip();
    
    if (!trip) {
      console.log('❌ 未找到包含Place数据的测试行程');
      console.log('提示：请先创建一个包含Place数据的行程');
      return;
    }

    console.log(`✅ 找到测试行程: ${trip.id}`);
    console.log(`   行程名称: ${(trip.metadata as any)?.title || '未命名'}`);
    console.log(`   天数: ${trip.TripDay.length}\n`);

    // 2. 测试证据获取（通过Service层）
    console.log('=== 测试证据增强功能 ===');
    
    // 导入服务（需要初始化NestJS应用）
    const { NestFactory } = await import('@nestjs/core');
    const { AppModule } = await import('../src/app.module');
    const { TripsService } = await import('../src/trips/trips.service');
    
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'],
    });
    const tripsService = app.get(TripsService);
    
    // 获取证据列表
    const evidenceResult = await tripsService.getEvidence(trip.id, {
      limit: 10,
      offset: 0,
    });

    console.log(`✅ 成功获取证据列表`);
    console.log(`   总数量: ${evidenceResult.total}`);
    console.log(`   返回数量: ${evidenceResult.items.length}\n`);

    if (evidenceResult.items.length === 0) {
      console.log('⚠️  警告：证据列表为空');
      console.log('   可能原因：');
      console.log('   1. 行程没有决策日志');
      console.log('   2. Place没有营业时间数据');
      console.log('   3. Place没有评分数据');
      return;
    }

    // 3. 验证证据增强字段
    console.log('=== 验证证据增强字段 ===\n');
    
    let freshnessCount = 0;
    let confidenceCount = 0;
    let qualityScoreCount = 0;
    
    for (const item of evidenceResult.items) {
      console.log(`证据项: ${item.title}`);
      console.log(`  ID: ${item.id}`);
      console.log(`  类型: ${item.type}`);
      console.log(`  来源: ${item.source || '未知'}`);
      
      // 检查freshness字段
      if (item.freshness) {
        freshnessCount++;
        console.log(`  ✅ freshness: ${item.freshness.freshnessStatus}`);
        console.log(`     获取时间: ${item.freshness.fetchedAt}`);
        console.log(`     过期时间: ${item.freshness.expiresAt || '未设置'}`);
      } else {
        console.log(`  ⚠️  freshness: 未设置（可能没有时间戳）`);
      }
      
      // 检查confidence字段
      if (item.confidence) {
        confidenceCount++;
        console.log(`  ✅ confidence: ${item.confidence.level} (${(item.confidence.score * 100).toFixed(0)}%)`);
        console.log(`     因素: ${item.confidence.factors.join(', ')}`);
      } else {
        console.log(`  ❌ confidence: 未设置`);
        results.push({
          testName: `证据项 ${item.id} 的置信度`,
          passed: false,
          message: '置信度字段未设置',
        });
      }
      
      // 检查qualityScore字段
      if (item.qualityScore) {
        qualityScoreCount++;
        console.log(`  ✅ qualityScore: ${item.qualityScore.level} (${(item.qualityScore.overallScore * 100).toFixed(0)}%)`);
        console.log(`     说明: ${item.qualityScore.explanation}`);
        console.log(`     组件:`);
        console.log(`       - 数据源可靠性: ${(item.qualityScore.components.sourceReliability * 100).toFixed(0)}%`);
        console.log(`       - 时效性: ${(item.qualityScore.components.timeliness * 100).toFixed(0)}%`);
        console.log(`       - 完整性: ${(item.qualityScore.components.completeness * 100).toFixed(0)}%`);
        console.log(`       - 多源验证: ${(item.qualityScore.components.multiSourceVerification * 100).toFixed(0)}%`);
      } else {
        console.log(`  ❌ qualityScore: 未设置`);
        results.push({
          testName: `证据项 ${item.id} 的质量评分`,
          passed: false,
          message: '质量评分字段未设置',
        });
      }
      
      console.log('');
    }

    // 4. 统计结果
    console.log('=== 测试统计 ===');
    console.log(`总证据数: ${evidenceResult.items.length}`);
    console.log(`包含freshness: ${freshnessCount} (${(freshnessCount / evidenceResult.items.length * 100).toFixed(0)}%)`);
    console.log(`包含confidence: ${confidenceCount} (${(confidenceCount / evidenceResult.items.length * 100).toFixed(0)}%)`);
    console.log(`包含qualityScore: ${qualityScoreCount} (${(qualityScoreCount / evidenceResult.items.length * 100).toFixed(0)}%)\n`);

    // 5. 验证结果
    const allHaveConfidence = confidenceCount === evidenceResult.items.length;
    const allHaveQualityScore = qualityScoreCount === evidenceResult.items.length;
    
    results.push({
      testName: '所有证据项包含confidence字段',
      passed: allHaveConfidence,
      message: allHaveConfidence 
        ? `✅ 所有 ${evidenceResult.items.length} 个证据项都包含confidence字段`
        : `❌ 只有 ${confidenceCount}/${evidenceResult.items.length} 个证据项包含confidence字段`,
    });

    results.push({
      testName: '所有证据项包含qualityScore字段',
      passed: allHaveQualityScore,
      message: allHaveQualityScore
        ? `✅ 所有 ${evidenceResult.items.length} 个证据项都包含qualityScore字段`
        : `❌ 只有 ${qualityScoreCount}/${evidenceResult.items.length} 个证据项包含qualityScore字段`,
    });

    // 6. 测试不同证据类型的TTL
    console.log('=== 测试不同证据类型的TTL ===\n');
    testEvidenceTypeTTL(evidenceResult.items, results);

    // 7. 输出测试总结
    console.log('========================================');
    console.log('测试总结');
    console.log('========================================');
    
    const passedTests = results.filter(r => r.passed).length;
    const totalTests = results.length;
    
    for (const result of results) {
      console.log(`${result.passed ? '✅' : '❌'} ${result.testName}`);
      if (result.message) {
        console.log(`   ${result.message}`);
      }
    }
    
    console.log(`\n通过: ${passedTests}/${totalTests}`);
    
    if (passedTests === totalTests) {
      console.log('\n🎉 所有测试通过！');
    } else {
      console.log('\n⚠️  部分测试未通过，请检查上述错误');
    }

    await app.close();
  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * 查找测试行程
 */
async function findTestTrip() {
  // 查找包含Place数据的行程
  const trip = await prisma.trip.findFirst({
    where: {
      TripDay: {
        some: {
          ItineraryItem: {
            some: {
              Place: {
                isNot: null,
              },
            },
          },
        },
      },
    },
    include: {
      TripDay: {
        include: {
          ItineraryItem: {
            include: {
              Place: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return trip;
}

/**
 * 测试不同证据类型的TTL
 */
function testEvidenceTypeTTL(items: any[], results: TestResult[]) {
  const ttlMap: Record<string, number> = {
    'weather': 1800,        // 30分钟
    'road_closure': 3600,   // 1小时
    'opening_hours': 86400, // 24小时
    'booking': 3600,        // 1小时
    'other': 86400,         // 24小时
  };

  for (const item of items) {
    if (item.freshness && item.freshness.expiresAt && item.freshness.fetchedAt) {
      const fetchedAt = new Date(item.freshness.fetchedAt);
      const expiresAt = new Date(item.freshness.expiresAt);
      const actualTTL = (expiresAt.getTime() - fetchedAt.getTime()) / 1000;
      const expectedTTL = ttlMap[item.type] || ttlMap['other'];
      
      const ttlDiff = Math.abs(actualTTL - expectedTTL);
      const tolerance = 60; // 允许60秒误差
      
      if (ttlDiff <= tolerance) {
        console.log(`✅ ${item.type}: TTL正确 (${actualTTL}秒 ≈ ${expectedTTL}秒)`);
      } else {
        console.log(`❌ ${item.type}: TTL不正确 (${actualTTL}秒 ≠ ${expectedTTL}秒)`);
        results.push({
          testName: `证据类型 ${item.type} 的TTL`,
          passed: false,
          message: `实际TTL: ${actualTTL}秒，期望TTL: ${expectedTTL}秒`,
        });
      }
    }
  }
  console.log('');
}

// 运行测试
main().catch(console.error);
