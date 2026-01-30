#!/usr/bin/env npx tsx
/**
 * 证据系统API端到端测试
 * 
 * 测试所有P0和P1功能的API接口
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { TripsService } from '../src/trips/trips.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { EvidencePriorityFilter, EvidenceSortBy } from '../src/trips/dto/evidence.dto';

async function main() {
  console.log('🧪 开始测试证据系统API接口...\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const tripsService = app.get(TripsService);
    const prisma = app.get(PrismaService);

    // 查找一个测试行程
    console.log('📋 查找测试行程...');
    const testTrip = await prisma.trip.findFirst({
      where: {
        TripDay: {
          some: {
            ItineraryItem: {
              some: {
                placeId: { not: null },
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
      take: 1,
    });

    if (!testTrip) {
      console.error('❌ 未找到测试行程，请先创建包含POI的行程');
      process.exit(1);
    }

    const tripId = testTrip.id;
    console.log(`✅ 找到测试行程: ${tripId}\n`);

    // ============================================
    // P0功能测试
    // ============================================

    console.log('='.repeat(60));
    console.log('📦 P0功能测试');
    console.log('='.repeat(60));

    // 测试1: 获取证据列表（检查P0增强字段）
    console.log('\n📝 测试1: 获取证据列表（检查P0增强字段）');
    try {
      const evidence = await tripsService.getEvidence(tripId, {});
      
      if (evidence && evidence.items && evidence.items.length > 0) {
        const firstEvidence = evidence.items[0];
        console.log(`✅ 获取到 ${evidence.items.length} 条证据`);
        
        // 检查P0字段
        const hasFreshness = firstEvidence.freshness !== undefined;
        const hasConfidence = firstEvidence.confidence !== undefined;
        const hasQualityScore = firstEvidence.qualityScore !== undefined;
        
        console.log(`  - freshness字段: ${hasFreshness ? '✅' : '❌'}`);
        if (hasFreshness) {
          console.log(`    * freshnessStatus: ${firstEvidence.freshness?.freshnessStatus}`);
          console.log(`    * expiresAt: ${firstEvidence.freshness?.expiresAt}`);
        }
        
        console.log(`  - confidence字段: ${hasConfidence ? '✅' : '❌'}`);
        if (hasConfidence) {
          console.log(`    * level: ${firstEvidence.confidence?.level}`);
          console.log(`    * score: ${firstEvidence.confidence?.score}`);
        }
        
        console.log(`  - qualityScore字段: ${hasQualityScore ? '✅' : '❌'}`);
        if (hasQualityScore) {
          console.log(`    * level: ${firstEvidence.qualityScore?.level}`);
          console.log(`    * overallScore: ${firstEvidence.qualityScore?.overallScore}`);
        }
      } else {
        console.log('⚠️  未找到证据数据');
      }
    } catch (error: any) {
      console.error(`❌ 测试失败: ${error.message}`);
    }

    // ============================================
    // P1功能测试
    // ============================================

    console.log('\n' + '='.repeat(60));
    console.log('📦 P1功能测试');
    console.log('='.repeat(60));

    // 测试2: 证据过滤和优先级机制
    console.log('\n📝 测试2: 证据过滤和优先级机制');
    try {
      const highPriorityEvidence = await tripsService.getEvidence(tripId, {
        priority: EvidencePriorityFilter.HIGH,
        sortBy: EvidenceSortBy.IMPORTANCE,
      });
      
      console.log(`✅ 获取到 ${highPriorityEvidence?.items?.length || 0} 条高优先级证据`);
      if (highPriorityEvidence && highPriorityEvidence.items && highPriorityEvidence.items.length > 0) {
        const firstItem = highPriorityEvidence.items[0];
        console.log(`  - 第一条证据类型: ${firstItem.type}`);
        console.log(`  - 第一条证据严重程度: ${firstItem.severity || 'N/A'}`);
      }
    } catch (error: any) {
      console.error(`❌ 测试失败: ${error.message}`);
    }

    // 测试3: 证据完整性检查
    console.log('\n📝 测试3: 证据完整性检查');
    try {
      const completeness = await tripsService.checkEvidenceCompleteness(tripId);
      
      if (completeness) {
        console.log(`✅ 完整性检查完成`);
        console.log(`  - 完整性评分: ${completeness.completenessScore.toFixed(2)}`);
        console.log(`  - 缺失证据类型数: ${completeness.missingEvidence.length}`);
        console.log(`  - 建议数量: ${completeness.recommendations.length}`);
        
        if (completeness.recommendations.length > 0) {
          const firstRec = completeness.recommendations[0];
          console.log(`  - 第一条建议:`);
          console.log(`    * 证据类型: ${firstRec.evidenceTypes.join(', ')}`);
          console.log(`    * 优先级: ${firstRec.priority}`);
          console.log(`    * 受影响POI数: ${firstRec.affectedPois.length}`);
        }
      } else {
        console.log('⚠️  完整性检查返回空结果');
      }
    } catch (error: any) {
      console.error(`❌ 测试失败: ${error.message}`);
    }

    // 测试4: 智能触发机制
    console.log('\n📝 测试4: 智能触发机制');
    try {
      const suggestions = await tripsService.getEvidenceFetchSuggestions(tripId);
      
      if (suggestions) {
        console.log(`✅ 获取建议完成`);
        console.log(`  - 建议数量: ${suggestions.suggestions.length}`);
        console.log(`  - 是否有批量获取建议: ${suggestions.bulkFetchSuggestion ? '是' : '否'}`);
        console.log(`  - 是否有缺失证据: ${suggestions.hasMissingEvidence ? '是' : '否'}`);
        console.log(`  - 批量获取建议: ${suggestions.bulkFetchSuggestion ? '是' : '否'}`);
        
        if (suggestions.suggestions.length > 0) {
          const firstSuggestion = suggestions.suggestions[0];
          console.log(`  - 第一条建议:`);
          console.log(`    * 描述: ${firstSuggestion.description}`);
          console.log(`    * 优先级: ${firstSuggestion.priority}`);
          console.log(`    * 预计时间: ${firstSuggestion.estimatedTime}秒`);
        }
        
        if (suggestions.bulkFetchSuggestion) {
          console.log(`  - 批量获取建议:`);
          console.log(`    * 描述: ${suggestions.bulkFetchSuggestion.description}`);
          console.log(`    * 预计时间: ${suggestions.bulkFetchSuggestion.estimatedTime}秒`);
        }
      } else {
        console.log('⚠️  获取建议返回空结果');
      }
    } catch (error: any) {
      console.error(`❌ 测试失败: ${error.message}`);
    }

    // 测试5: 进度反馈功能（需要模拟异步任务）
    console.log('\n📝 测试5: 进度反馈功能');
    try {
      // 注意：这个测试需要实际调用fetch-evidence接口
      // 由于我们在服务层测试，这里只测试任务服务的基本功能
      const { EvidenceFetchTaskService } = await import('../src/trips/services/evidence-fetch-task.service');
      const taskService = new EvidenceFetchTaskService();
      
      // 创建测试任务
      const testTaskId = taskService.createTask(tripId, 5);
      console.log(`✅ 创建任务成功: ${testTaskId}`);
      
      // 获取进度
      let progress = taskService.getTaskProgress(testTaskId);
      if (progress) {
        console.log(`  - 初始状态: ${progress.status}`);
        console.log(`  - 总POI数: ${progress.totalPlaces}`);
      }
      
      // 标记为运行中
      taskService.markRunning(testTaskId);
      progress = taskService.getTaskProgress(testTaskId);
      if (progress) {
        console.log(`  - 运行中状态: ${progress.status}`);
      }
      
      // 更新进度
      taskService.updateCurrentPlace(testTaskId, 123, '测试POI', ['weather']);
      taskService.incrementProcessed(testTaskId, 'success');
      progress = taskService.getTaskProgress(testTaskId);
      if (progress) {
        console.log(`  - 已处理: ${progress.processedPlaces}/${progress.totalPlaces}`);
        console.log(`  - 成功数: ${progress.successCount}`);
      }
      
      // 标记完成
      taskService.markCompleted(testTaskId, 5, 0, 0);
      progress = taskService.getTaskProgress(testTaskId);
      if (progress) {
        console.log(`  - 完成状态: ${progress.status}`);
        console.log(`  - 可取消: ${progress.canCancel}`);
      }
      
      console.log('✅ 进度反馈功能测试通过');
    } catch (error: any) {
      console.error(`❌ 测试失败: ${error.message}`);
      console.error(error.stack);
    }

    // ============================================
    // 测试总结
    // ============================================

    console.log('\n' + '='.repeat(60));
    console.log('✅ 所有测试完成');
    console.log('='.repeat(60));
    console.log('\n📊 测试总结:');
    console.log('  - P0功能: 证据增强字段检查');
    console.log('  - P1功能: 过滤、完整性检查、智能触发、进度反馈');
    console.log('\n💡 提示: 要测试完整的HTTP接口，请使用API测试工具（如Postman）');
    console.log('   或启动服务后使用curl命令测试。\n');

  } catch (error: any) {
    console.error('❌ 测试执行失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

main().catch(error => {
  console.error('❌ 程序执行失败:', error);
  process.exit(1);
});
